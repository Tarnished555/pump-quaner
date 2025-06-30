import { Connection } from '@solana/web3.js';
import { Strategy, StrategyResult } from './strategy.interface';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { KLineService } from '../kline/kline.service';
import { KLineInterval, Trade, KLine } from '../kline/types';
import { REDIS_CONFIG } from '../kline/config';

/**
 * 钱包入场信息
 */
export interface WalletEntryInfo {
  walletAddress: string; // 钱包地址
  entryPrice: number; // 入场价格
  tokenAmount: number; // 代币数量
  timestamp: number; // 交易时间戳
  highestPrice: number; // 记录的最高价格
  trailingStopActive: boolean; // 移动止损是否激活
}

/**
 * 移动止损策略
 * 实现逻辑：
 * 1. 持续跟踪并记录最高价格
 * 2. 当价格超过入场价格的1倍（涨幅100%）时开始生效
 * 3. 当价格从最高点回撤超过30%时，触发卖出信号
 * 支持多钱包交易场景，每个钱包单独跟踪入场价格和最高价格
 */
export class TrailingStopLossStrategy implements Strategy {
  private redisService: RedisKLineService;
  private klineService: KLineService;
  
  // 按代币地址和钱包地址记录入场信息
  // Map<tokenAddress, Map<walletAddress, WalletEntryInfo>>
  private walletEntries: Map<string, Map<string, WalletEntryInfo>> = new Map();
  
  constructor(
    private readonly connection: Connection,
    private readonly activationPercentage: number = 100, // 当价格超过入场价的1倍时开始生效（默认100%）
    private readonly trailingStopPercentage: number = 30, // 从最高点回撤百分比（默认30%）
    private readonly timeframe: KLineInterval = KLineInterval.ONE_MINUTE // 使用的K线时间周期
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
    this.klineService = new KLineService({ host: REDIS_CONFIG.host, port: REDIS_CONFIG.port });
  }
  
  /**
   * 记录代币的买入价格
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址
   * @param entryPrice 买入价格
   * @param tokenAmount 买入数量
   * @param timestamp 交易时间戳
   */
  public setEntryPrice(
    mintAddress: string, 
    walletAddress: string, 
    entryPrice: number, 
    tokenAmount: number, 
    timestamp: number = Date.now()
  ): void {
    // 获取该代币的所有钱包入场信息
    let walletMap = this.walletEntries.get(mintAddress);
    if (!walletMap) {
      walletMap = new Map<string, WalletEntryInfo>();
      this.walletEntries.set(mintAddress, walletMap);
    }
    
    // 设置或更新钱包的入场信息
    walletMap.set(walletAddress, {
      walletAddress,
      entryPrice,
      tokenAmount,
      timestamp,
      highestPrice: entryPrice, // 初始最高价就是入场价
      trailingStopActive: false // 初始状态下移动止损未激活
    });
    
    logger.info({ 
      mint: mintAddress, 
      wallet: walletAddress, 
      entryPrice, 
      tokenAmount 
    }, 'TrailingStopLoss -> Entry price set for wallet');
  }
  
  /**
   * 清除钱包对特定代币的买入价格记录
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址，如果不指定则清除所有钱包的记录
   */
  public clearEntryPrice(mintAddress: string, walletAddress?: string): void {
    if (walletAddress) {
      // 清除指定钱包的记录
      const walletMap = this.walletEntries.get(mintAddress);
      if (walletMap) {
        walletMap.delete(walletAddress);
        logger.info({ mint: mintAddress, wallet: walletAddress }, 'TrailingStopLoss -> Entry price cleared for wallet');
      }
    } else {
      // 清除所有钱包的记录
      this.walletEntries.delete(mintAddress);
      logger.info({ mint: mintAddress }, 'TrailingStopLoss -> Entry price cleared for all wallets');
    }
  }
  
  /**
   * 获取钱包对特定代币的入场信息
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址
   * @returns 入场信息，如果没有记录则返回null
   */
  public getWalletEntryInfo(mintAddress: string, walletAddress: string): WalletEntryInfo | null {
    const walletMap = this.walletEntries.get(mintAddress);
    if (walletMap && walletMap.has(walletAddress)) {
      return walletMap.get(walletAddress)!;
    }
    return null;
  }
  
  /**
   * 获取代币的所有钱包入场信息
   * @param mintAddress 代币铸造地址
   * @returns 所有钱包的入场信息映射，如果没有记录则返回空映射
   */
  public getAllWalletEntries(mintAddress: string): Map<string, WalletEntryInfo> {
    return this.walletEntries.get(mintAddress) || new Map<string, WalletEntryInfo>();
  }
  
  /**
   * 获取代币的平均入场价格（加权平均）
   * @param mintAddress 代币铸造地址
   * @returns 平均入场价格，如果没有记录则返回null
   */
  public getAverageEntryPrice(mintAddress: string): number | null {
    const walletMap = this.walletEntries.get(mintAddress);
    if (!walletMap || walletMap.size === 0) {
      return null;
    }
    
    let totalValue = 0;
    let totalAmount = 0;
    
    for (const entry of walletMap.values()) {
      totalValue += entry.entryPrice * entry.tokenAmount;
      totalAmount += entry.tokenAmount;
    }
    
    return totalAmount > 0 ? totalValue / totalAmount : null;
  }
  
  /**
   * 执行策略检查
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 策略结果
   */
  async execute(mintAddress: string, price?:number,slot?: number): Promise<StrategyResult> {
    try {
      // 获取该代币的钱包入场信息
      const walletEntries = this.getAllWalletEntries(mintAddress);
      if (walletEntries.size === 0) {
        return {
          triggered: false,
          message: 'No entry records for this token'
        };
      }
      
      // 获取最新K线数据
      const klines = await this.klineService.getRecentKLines(mintAddress, this.timeframe);
      if (klines.length === 0) {
        return {
          triggered: false,
          message: 'No K-line data available'
        };
      }
      
      // 获取最新价格
      const latestKline = klines[klines.length - 1];
      const currentPrice = latestKline.close;
      
      // 检查所有钱包
      for (const [wallet, _] of walletEntries.entries()) {
        const result = await this.checkWalletStrategy(mintAddress, wallet, currentPrice);
        if (result.triggered) {
          return result;
        }
      }
      
      // 没有钱包触发移动止损
      const avgEntryPrice = this.getAverageEntryPrice(mintAddress);
      const avgPriceChange = avgEntryPrice ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 : 0;
      
      return {
        triggered: false,
        message: `No trailing stop loss triggered. Average price change: ${avgPriceChange.toFixed(2)}%`
      };
    } catch (error: any) {
      logger.error({ error }, 'TrailingStopLoss -> Error executing strategy');
      return {
        triggered: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
  
  /**
   * 检查特定钱包的移动止损策略
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址
   * @param currentPrice 当前价格
   * @returns 策略结果
   */
  private async checkWalletStrategy(mintAddress: string, walletAddress: string, currentPrice: number): Promise<StrategyResult> {
    const entryInfo = this.getWalletEntryInfo(mintAddress, walletAddress);
    if (!entryInfo) {
      return {
        triggered: false,
        message: `No entry info for wallet ${walletAddress}`
      };
    }
    
    const entryPrice = entryInfo.entryPrice;
  
    // 计算价格变化百分比
    const priceChangePercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // 检查是否需要激活移动止损
    if (!entryInfo.trailingStopActive && priceChangePercentage >= this.activationPercentage) {
      entryInfo.trailingStopActive = true;
      logger.info({ 
        mint: mintAddress, 
        wallet: walletAddress,
        entryPrice, 
        currentPrice
      }, 'TrailingStopLoss -> Trailing stop activated for wallet');
    }
    
    // 更新最高价格记录
    if (currentPrice > entryInfo.highestPrice) {
      entryInfo.highestPrice = currentPrice;
      logger.info({ 
        mint: mintAddress, 
        wallet: walletAddress,
        highestPrice: currentPrice
      }, 'TrailingStopLoss -> Updated highest price');
    }
    
    // 计算从最高价的回撤百分比
    const dropFromHighest = ((entryInfo.highestPrice - currentPrice) / entryInfo.highestPrice) * 100;
    
    logger.info({ 
      mint: mintAddress, 
      wallet: walletAddress,
      entryPrice, 
      currentPrice,
      highestPrice: entryInfo.highestPrice,
      trailingStopActive: entryInfo.trailingStopActive,
      dropFromHighest: dropFromHighest.toFixed(2) + '%'
    }, 'TrailingStopLoss -> Checking trailing stop condition');
    
    // 只有当移动止损激活后，才检查回撤条件
    if (entryInfo.trailingStopActive) {
      // 如果从最高点回撤超过设定的百分比，触发卖出
      if (dropFromHighest >= this.trailingStopPercentage) {
        logger.info({ 
          mint: mintAddress, 
          wallet: walletAddress,
          entryPrice, 
          currentPrice, 
          highestPrice: entryInfo.highestPrice,
          dropFromHighest: dropFromHighest.toFixed(2) + '%'
        }, 'TrailingStopLoss -> Trailing stop triggered for wallet');
        
        // 清除该钱包对该代币的记录
        this.clearEntryPrice(mintAddress, walletAddress);
        
        return {
          triggered: true,
          message: `Trailing stop triggered for wallet ${walletAddress}: Price dropped ${dropFromHighest.toFixed(2)}% from highest`,
          data: {
            action: 'trailing_stop_loss',
            wallet: walletAddress,
            entryPrice,
            currentPrice,
            highestPrice: entryInfo.highestPrice,
            dropFromHighest,
            sellPercentage: 100, // 清仓
            tokenAmount: entryInfo.tokenAmount
          }
        };
      }
    }
    
    // 该钱包没有触发移动止损
    return {
      triggered: false,
      message: `No trailing stop triggered for wallet ${walletAddress}. Price change: ${dropFromHighest.toFixed(2)}%`
    };
  }
}

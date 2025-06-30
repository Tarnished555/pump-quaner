import { Connection } from '@solana/web3.js';
import { Strategy, StrategyResult } from './strategy.interface';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { KLineService } from '../kline/kline.service';
import { KLineInterval, Trade, KLine } from '../kline/types';
import { REDIS_CONFIG } from '../kline/config';
import { TAKE_PROFIT_LEVELS } from '../helpers/constants';

/**
 * 止盈止损级别接口
 */
export interface TakeProfitLevel {
  /** 触发止盈的涨幅百分比 */
  profitPercentage: number;
  /** 卖出的仓位百分比 */
  sellPercentage: number;
}

/**
 * 钱包入场信息
 */
export interface WalletEntryInfo {
  walletAddress: string; // 钱包地址
  entryPrice: number; // 入场价格
  tokenAmount: number; // 代币数量
  timestamp: number; // 交易时间戳
  triggeredLevels: Set<number>; // 该钱包已触发的止盈级别
}

/**
 * 止盈止损策略
 * 实现止损：买入后跌破指定百分比时清仓
 * 实现止盈：在不同涨幅级别卖出部分仓位
 * 支持多钱包交易场景，每个钱包单独跟踪入场价格和止盈止损条件
 */
export class TakeProfitStopLossStrategy implements Strategy {
  private redisService: RedisKLineService;
  private klineService: KLineService;
  
  // 按代币地址和钱包地址记录入场信息
  // Map<tokenAddress, Map<walletAddress, WalletEntryInfo>>
  private walletEntries: Map<string, Map<string, WalletEntryInfo>> = new Map();
  
  constructor(
    private readonly connection: Connection,
    private readonly stopLossPercentage: number = 15,  // 止损百分比
    private readonly takeProfitLevels: TakeProfitLevel[] = TAKE_PROFIT_LEVELS, // 从环境变量中读取止盈级别配置
    private readonly timeframe: KLineInterval = KLineInterval.ONE_MINUTE // 使用的K线时间周期
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
    this.klineService = new KLineService({ host: REDIS_CONFIG.host, port: REDIS_CONFIG.port });
    
    // 确保止盈级别按照涨幅百分比从小到大排序
    this.takeProfitLevels.sort((a, b) => a.profitPercentage - b.profitPercentage);
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
      triggeredLevels: new Set<number>()
    });
    
    logger.info({ 
      mint: mintAddress, 
      wallet: walletAddress, 
      entryPrice, 
      tokenAmount 
    }, 'TakeProfitStopLoss -> Entry price set for wallet');
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
        logger.info({ mint: mintAddress, wallet: walletAddress }, 'TakeProfitStopLoss -> Entry price cleared for wallet');
      }
    } else {
      // 清除所有钱包的记录
      this.walletEntries.delete(mintAddress);
      logger.info({ mint: mintAddress }, 'TakeProfitStopLoss -> Entry price cleared for all wallets');
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
      // 如果没有指定钱包，检查所有钱包
      // 首先检查是否有钱包触发了止盈或止损
      for (const [wallet, _] of walletEntries.entries()) {
        const result = await this.checkWalletStrategy(mintAddress, wallet, currentPrice);
        if (result.triggered) {
          return result;
        }
      }
      
      // 没有钱包触发止盈止损
      const avgEntryPrice = this.getAverageEntryPrice(mintAddress);
      const avgPriceChange = avgEntryPrice ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 : 0;
      
      return {
        triggered: false,
        message: `No take profit or stop loss triggered. Average price change: ${avgPriceChange.toFixed(2)}%`
      };
    } catch (error: any) {
      logger.error({ error }, 'TakeProfitStopLoss -> Error executing strategy');
      return {
        triggered: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
  
  /**
   * 检查特定钱包的止盈止损策略
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
    const priceChangePercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    logger.info({ 
      mint: mintAddress, 
      wallet: walletAddress,
      entryPrice, 
      currentPrice,
      priceChange: priceChangePercentage.toFixed(2) + '%',
      stopLossPercentage: this.stopLossPercentage
    }, 'TakeProfitStopLoss -> Checking wallet strategy');
    
    // 检查止损条件
    if (priceChangePercentage <= -this.stopLossPercentage) {
      logger.info({ 
        mint: mintAddress, 
        wallet: walletAddress,
        entryPrice, 
        currentPrice, 
        priceChangePercentage: priceChangePercentage.toFixed(2) 
      }, 'TakeProfitStopLoss -> Stop loss triggered for wallet');
      
      // 清除该钱包对该代币的记录
      this.clearEntryPrice(mintAddress, walletAddress);
      
      return {
        triggered: true,
        message: `Stop loss triggered for wallet ${walletAddress}: Price dropped ${Math.abs(priceChangePercentage).toFixed(2)}% from entry`,
        data: {
          action: 'stop_loss',
          wallet: walletAddress,
          entryPrice,
          currentPrice,
          priceChangePercentage,
          sellPercentage: 100, // 清仓
          tokenAmount: entryInfo.tokenAmount
        }
      };
    }
    
    // 检查止盈条件
    if (priceChangePercentage > 0) {
      // 获取该钱包已触发的止盈级别
      const triggeredLevelsSet = entryInfo.triggeredLevels;
      
      // 检查每个止盈级别
      for (const level of this.takeProfitLevels) {
        // 如果价格涨幅达到止盈级别，并且该级别尚未触发过
        if (priceChangePercentage >= level.profitPercentage && !triggeredLevelsSet.has(level.profitPercentage)) {
          // 标记该级别已触发
          triggeredLevelsSet.add(level.profitPercentage);
          
          logger.info({ 
            mint: mintAddress, 
            wallet: walletAddress,
            entryPrice, 
            currentPrice, 
            priceChangePercentage: priceChangePercentage.toFixed(2),
            profitLevel: level.profitPercentage,
            sellPercentage: level.sellPercentage
          }, 'TakeProfitStopLoss -> Take profit level triggered for wallet');
          
          return {
            triggered: true,
            message: `Take profit triggered for wallet ${walletAddress}: Price up ${priceChangePercentage.toFixed(2)}%, selling ${level.sellPercentage}% of position`,
            data: {
              action: 'take_profit',
              wallet: walletAddress,
              entryPrice,
              currentPrice,
              priceChangePercentage,
              profitLevel: level.profitPercentage,
              sellPercentage: level.sellPercentage,
              tokenAmount: entryInfo.tokenAmount * (level.sellPercentage / 100)
            }
          };
        }
      }
    }
    
    // 该钱包没有触发止盈止损
    return {
      triggered: false,
      message: `No take profit or stop loss triggered for wallet ${walletAddress}. Price change: ${priceChangePercentage.toFixed(2)}%`
    };
  }
}

import { Connection } from '@solana/web3.js';
import { logger } from '../helpers';
import { TakeProfitStopLossStrategy, TakeProfitLevel } from './take-profit-stop-loss.strategy';
import { TrailingStopLossStrategy } from './trailing-stop-loss.strategy';
import { StrategyResult } from './strategy.interface';
import {
  CHECK_TAKE_PROFIT_STOP_LOSS, STOP_LOSS_PERCENTAGE, TAKE_PROFIT_LEVELS,
  CHECK_TRAILING_STOP_LOSS, TRAILING_STOP_ACTIVATION_PERCENTAGE, TRAILING_STOP_PERCENTAGE
} from '../helpers/constants';
import { KLineInterval } from '../kline/types';

/**
 * 止盈止损管理器
 * 独立于策略管理器，专门用于管理代币的止盈止损
 */
export class TakeProfitStopLossManager {
  private takeProfitStrategy: TakeProfitStopLossStrategy | null = null;
  private trailingStopLossStrategy: TrailingStopLossStrategy | null = null;

  constructor(private readonly connection: Connection) {
    this.initialize();
  }

  /**
   * 初始化止盈止损策略
   */
  private initialize(): void {
    // 初始化止盈止损策略
    if (CHECK_TAKE_PROFIT_STOP_LOSS) {
      // 创建止盈级别数组
      const takeProfitLevels: TakeProfitLevel[] = TAKE_PROFIT_LEVELS;
      
      this.takeProfitStrategy = new TakeProfitStopLossStrategy(
        this.connection,
        STOP_LOSS_PERCENTAGE,
        takeProfitLevels,
        KLineInterval.ONE_SECOND
      );
      
      logger.info({
        stopLossPercentage: STOP_LOSS_PERCENTAGE,
        takeProfitLevels
      }, 'Take profit and stop loss strategy initialized');
    } else {
      logger.info('Take profit and stop loss strategy disabled');
    }
    
    // 初始化移动止损策略
    if (CHECK_TRAILING_STOP_LOSS) {
      this.trailingStopLossStrategy = new TrailingStopLossStrategy(
        this.connection,
        TRAILING_STOP_ACTIVATION_PERCENTAGE,
        TRAILING_STOP_PERCENTAGE,
        KLineInterval.ONE_SECOND
      );
      
      logger.info({
        activationPercentage: TRAILING_STOP_ACTIVATION_PERCENTAGE,
        trailingStopPercentage: TRAILING_STOP_PERCENTAGE
      }, 'Trailing stop loss strategy initialized');
    } else {
      logger.info('Trailing stop loss strategy disabled');
    }
  }

  /**
   * 执行止盈止损和移动止损检查
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 策略结果，如果策略未启用或未触发则返回null
   */
  async execute(mintAddress: string, price?:number,slot?: number): Promise<StrategyResult | null> {
    // 先检查止盈止损策略
    if (this.takeProfitStrategy) {
      try {
        const result = await this.takeProfitStrategy.execute(mintAddress,price, slot);
        if (result.triggered) {
          // TODO: 实现卖出代币的逻辑
          logger.info({ result }, 'Take profit or stop loss triggered');
          return result;
        }
      } catch (error: any) {
        logger.error(
          { error: error?.message || 'Unknown error', mintAddress, wallet: '' },
          'Error executing take profit stop loss strategy'
        );
      }
    }
    
    // 再检查移动止损策略
    if (this.trailingStopLossStrategy) {
      try {
        const result = await this.trailingStopLossStrategy.execute(mintAddress,price, slot);
        if (result.triggered) {
          // TODO: 实现卖出代币的逻辑
          logger.info({ result }, 'Trailing stop loss triggered');
          return result;
        }
      } catch (error: any) {
        logger.error(
          { error: error?.message || 'Unknown error', mintAddress, wallet: '' },
          'Error executing trailing stop loss strategy'
        );
      }
    }

    return null;
  }

  /**
   * 设置代币的买入价格
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
    // 设置止盈止损策略的入场价格
    if (this.takeProfitStrategy) {
      this.takeProfitStrategy.setEntryPrice(mintAddress, walletAddress, entryPrice, tokenAmount, timestamp);
    }
    
    // 设置移动止损策略的入场价格
    if (this.trailingStopLossStrategy) {
      this.trailingStopLossStrategy.setEntryPrice(mintAddress, walletAddress, entryPrice, tokenAmount, timestamp);
    }
  }

  /**
   * 清除钱包对特定代币的买入价格记录
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址，如果不指定则清除所有钱包的记录
   */
  public clearEntryPrice(mintAddress: string, walletAddress?: string): void {
    // 清除止盈止损策略的入场价格记录
    if (this.takeProfitStrategy) {
      this.takeProfitStrategy.clearEntryPrice(mintAddress, walletAddress);
    }
    
    // 清除移动止损策略的入场价格记录
    if (this.trailingStopLossStrategy) {
      this.trailingStopLossStrategy.clearEntryPrice(mintAddress, walletAddress);
    }
  }

  /**
   * 获取钱包对特定代币的入场信息
   * @param mintAddress 代币铸造地址
   * @param walletAddress 钱包地址
   * @returns 入场信息，如果没有记录则返回null
   */
  public getWalletEntryInfo(mintAddress: string, walletAddress: string): any {
    if (this.takeProfitStrategy) {
      return this.takeProfitStrategy.getWalletEntryInfo(mintAddress, walletAddress);
    }
    return null;
  }
  
  /**
   * 获取代币的平均入场价格
   * @param mintAddress 代币铸造地址
   * @returns 平均入场价格，如果没有记录则返回null
   */
  public getAverageEntryPrice(mintAddress: string): number | null {
    if (this.takeProfitStrategy) {
      return this.takeProfitStrategy.getAverageEntryPrice(mintAddress);
    }
    return null;
  }

  /**
   * 检查止盈止损管理器是否启用
   * @returns 是否启用
   */
  public isEnabled(): boolean {
    return this.takeProfitStrategy !== null || this.trailingStopLossStrategy !== null;
  }
  
  /**
   * 检查止盈止损策略是否启用
   * @returns 是否启用
   */
  public isTakeProfitStopLossEnabled(): boolean {
    return this.takeProfitStrategy !== null;
  }
  
  /**
   * 检查移动止损策略是否启用
   * @returns 是否启用
   */
  public isTrailingStopLossEnabled(): boolean {
    return this.trailingStopLossStrategy !== null;
  }
}

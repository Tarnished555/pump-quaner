import { Connection } from '@solana/web3.js';
import { Strategy, StrategyResult } from './strategy.interface';
import { PullbackBuyStrategy } from './pullback-buy.strategy';
import { BreakoutHighStrategy } from './breakout-high.strategy';
import { logger } from '../helpers';
import { 
  UPTREND_KLINES, PULLBACK_PERCENT, MIN_BUY_ORDERS, 
  CHECK_BREAKOUT_PRE_HIGH, LOOKBACK_PERIOD, CONFIRMATION_CANDLES, MIN_VOLUME_FACTOR,
  MIN_SOL_AMOUNT, MAX_SOL_AMOUNT,
  MIN_PULLBACK_PERCENT, CHECK_PULLBACK_BUY
} from '../helpers/constants';
import { KLineInterval } from '../kline/types';

/**
 * 策略管理器
 * 用于管理和执行所有策略
 */
export class StrategyManager {
  private strategies: Strategy[] = [];

  constructor(private readonly connection: Connection) {
    this.initializeStrategies();
  }

  /**
   * 初始化所有策略
   */
  private initializeStrategies(): void {
    // 清空现有策略
    this.strategies = [];

    // 添加回调买入策略
    if (CHECK_PULLBACK_BUY) {
      this.strategies.push(
        new PullbackBuyStrategy(
          this.connection,
          UPTREND_KLINES,
          PULLBACK_PERCENT,
          MIN_BUY_ORDERS,
          MIN_SOL_AMOUNT,
          MAX_SOL_AMOUNT,
          KLineInterval.ONE_SECOND
        )
      );
    }

    // 添加突破前高策略
    if (CHECK_BREAKOUT_PRE_HIGH) {
      this.strategies.push(
        new BreakoutHighStrategy(
          this.connection,
          LOOKBACK_PERIOD,
          CONFIRMATION_CANDLES,
          MIN_VOLUME_FACTOR,
          MIN_PULLBACK_PERCENT,
          KLineInterval.ONE_SECOND
        )
      );
    }

    // 止盈止损策略已移至独立的TakeProfitStopLossManager中管理

    // 在这里添加更多策略...

    logger.info(
      { strategiesCount: this.strategies.length },
      'Strategy Manager initialized'
    );
  }

  /**
   * 执行所有策略
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 所有触发的策略结果
   */
  async executeStrategies(
    mintAddress: string,
    price?:number,
    slot?: number
  ): Promise<StrategyResult[]> {
    const results: StrategyResult[] = [];

    // 执行常规交易策略
    if (this.strategies.length > 0) {
      for (const strategy of this.strategies) {
        try {
          const result = await strategy.execute(mintAddress, slot);
          
          // 只收集触发的策略结果
          if (result.triggered) {
            results.push(result);
          }
        } catch (error: any) {
          logger.error(
            { error: error?.message || 'Unknown error', mintAddress },
            'Error executing strategy'
          );
        }
      }
    }
    
    // 止盈止损策略已移至独立的TakeProfitStopLossManager中管理

    return results;
  }

  /**
   * 获取策略数量
   */
  getStrategiesCount(): number {
    return this.strategies.length;
  }
  
  // 止盈止损相关方法已移至TakeProfitStopLossManager类
}

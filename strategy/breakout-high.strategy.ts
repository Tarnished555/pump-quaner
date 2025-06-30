import { Connection } from '@solana/web3.js';
import { Strategy, StrategyResult } from './strategy.interface';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { KLineService } from '../kline/kline.service';
import { KLineInterval, Trade, KLine } from '../kline/types';
import { REDIS_CONFIG } from '../kline/config';

/**
 * 突破前高买入策略
 * 当价格突破前期高点时触发买入信号
 */
export class BreakoutHighStrategy implements Strategy {
  private redisService: RedisKLineService;
  private klineService: KLineService;
  
  constructor(
    private readonly connection: Connection,
    private readonly lookbackPeriod: number = 24,      // 回溯检查的K线数量
    private readonly confirmationCandles: number = 2,  // 需要确认突破的K线数量
    private readonly minVolumeFactor: number = 1.5,    // 突破成交量相比前期平均成交量的最小倍数
    private readonly minPullbackPercent: number = 5,  // 突破前的最小回调百分比
    private readonly timeframe: KLineInterval = KLineInterval.ONE_SECOND // 使用的K线时间周期
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
    this.klineService = new KLineService({ host: REDIS_CONFIG.host, port: REDIS_CONFIG.port });
  }
  
  /**
   * 执行策略检查
   * @param mintAddress 代币铸造地址
  * @param slot 区块槽位号（可选）
   * @returns 策略结果
   */
  async execute(mintAddress: string, price?:number,slot?: number): Promise<StrategyResult> {
 
    // 此策略不使用钱包地址，只关注代币的价格走势
    try {
      logger.debug({ mint: mintAddress }, 'BreakoutHigh -> Checking for breakout opportunity');
      
      // 1. 获取K线数据
      const klines = await this.klineService.getRecentKLines(mintAddress, this.timeframe);
      
      if (klines.length < this.lookbackPeriod) {
        logger.debug({ mint: mintAddress }, `BreakoutHigh -> Not enough klines: ${klines.length}/${this.lookbackPeriod}`);
        return {
          triggered: false,
          message: `Not enough klines to analyze breakout: ${klines.length}/${this.lookbackPeriod}`
        };
      }
      
      // 按时间排序（从早到晚）
      klines.sort((a, b) => a.timestamp - b.timestamp);
      
      // 2. 找出前期高点
      // 我们将排除最近的confirmationCandles+1个K线，因为我们需要确认突破
      const historyEndIndex = klines.length - (this.confirmationCandles + 1);
      const historyKlines = klines.slice(0, historyEndIndex);
      
      if (historyKlines.length < 5) { // 至少需要5根K线来确定有意义的前高
        logger.debug({ mint: mintAddress }, `BreakoutHigh -> Not enough historical klines: ${historyKlines.length}`);
        return {
          triggered: false,
          message: `Not enough historical klines to determine previous high: ${historyKlines.length}`
        };
      }
      
      // 找出历史K线中的最高价
      const previousHigh = Math.max(...historyKlines.map(k => k.high));
      
      // 找出历史K线的平均成交量
      const averageVolume = historyKlines.reduce((sum, k) => sum + k.volume, 0) / historyKlines.length;
      
      // 3. 检查是否有回调后的突破
      const recentKlines = klines.slice(historyEndIndex, klines.length);
      let breakoutDetected = false;
      let breakoutCandle: KLine | null = null;
      let confirmationCount = 0;
      
      // 检查在历史K线中是否有回调
      // 找出历史K线中的最低价
      const lowestAfterHigh = Math.min(...historyKlines.slice(-5).map(k => k.low)); // 取最近5根历史K线的最低价
      const pullbackPercent = ((previousHigh - lowestAfterHigh) / previousHigh) * 100;
      
      logger.debug({ 
        mint: mintAddress, 
        previousHigh, 
        lowestAfterHigh, 
        pullbackPercent: pullbackPercent.toFixed(2) + '%' 
      }, 'BreakoutHigh -> Checking pullback before breakout');
      
      // 如果回调百分比不足，则不触发突破信号
      if (pullbackPercent < this.minPullbackPercent) {
        logger.debug({ mint: mintAddress }, `BreakoutHigh -> Insufficient pullback before breakout: ${pullbackPercent.toFixed(2)}%/${this.minPullbackPercent}%`);
        return {
          triggered: false,
          message: `Insufficient pullback before breakout: ${pullbackPercent.toFixed(2)}%/${this.minPullbackPercent}%`
        };
      }
      
      // 检查K线是否保持在前高之上（收盘价高于前高）
      for (let i = 0; i < recentKlines.length; i++) {
        // 如果当前K线的收盘价高于前高
        if (recentKlines[i].close > previousHigh) {
          confirmationCount++;
          
          // 记录第一根突破K线
          if (!breakoutCandle) {
            breakoutCandle = recentKlines[i];
          }
        } else {
          // 如果有一根K线收盘价低于前高，重置确认计数
          confirmationCount = 0;
          breakoutDetected = false;
          breakoutCandle = null;
        }
        
        // 如果有足够的确认K线，标记为有效突破
        if (confirmationCount >= this.confirmationCandles) {
          breakoutDetected = true;
          break;
        }
      }
      
      // 如果没有检测到突破，返回失败
      if (!breakoutDetected || !breakoutCandle) {
        logger.debug({ mint: mintAddress }, `BreakoutHigh -> No breakout detected`);
        return {
          triggered: false,
          message: `No breakout above previous high of ${previousHigh}`
        };
      }
      
      // 4. 检查成交量是否足够
      // 突破K线的成交量应该高于平均成交量
      if (breakoutCandle.volume < averageVolume * this.minVolumeFactor) {
        logger.debug({ 
          mint: mintAddress, 
          breakoutVolume: breakoutCandle.volume, 
          requiredVolume: averageVolume * this.minVolumeFactor 
        }, `BreakoutHigh -> Insufficient volume for breakout`);
        
        return {
          triggered: false,
          message: `Insufficient volume for breakout: ${breakoutCandle.volume} < ${(averageVolume * this.minVolumeFactor).toFixed(2)}`
        };
      }
      
      // 5. 获取最新的交易数据，确认是否有持续的买入兴趣
      const recentTrades = await this.redisService.getTokenTrades(mintAddress);
      
      // 获取最后一根K线的开始时间
      const lastKline = klines[klines.length - 1];
      const lastKlineStartTime = lastKline.timestamp;
      
      // 过滤出最后一根K线内的买单
      const recentBuyOrders = recentTrades.filter(trade => 
        trade.timestamp >= lastKlineStartTime && trade.isBuy);
      
      // 所有条件都满足，返回成功
      logger.info({ 
        mint: mintAddress, 
        previousHigh,
        breakoutPrice: breakoutCandle.high,
        confirmationCount,
        buyOrders: recentBuyOrders.length 
      }, 'BreakoutHigh -> Breakout buy opportunity detected');
      
      return {
        triggered: true,
        message: `Breakout buy opportunity detected: Price broke above ${previousHigh} with ${confirmationCount} confirmation candles`,
        data: {
          previousHigh,
          breakoutPrice: breakoutCandle.high,
          confirmationCount,
          buyOrders: recentBuyOrders.length,
          breakoutVolume: breakoutCandle.volume,
          averageVolume
        }
      };
    } catch (error: any) {
      logger.error({ error }, 'BreakoutHigh -> Error executing strategy');
      return {
        triggered: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

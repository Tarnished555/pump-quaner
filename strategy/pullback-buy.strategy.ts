import { Connection } from '@solana/web3.js';
import { Strategy, StrategyResult } from './strategy.interface';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { KLineService } from '../kline/kline.service';
import { KLineInterval, Trade, KLine } from '../kline/types';
import { REDIS_CONFIG } from '../kline/config';
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

/**
 * 
 * 回调买入策略
 */
export class PullbackBuyStrategy implements Strategy {
  private redisService: RedisKLineService;
  private klineService: KLineService;
  
  constructor(
    private readonly connection: Connection,
    private readonly uptrend: number = 3,        //
    private readonly pullbackPercent: number = 10, // 
    private readonly minBuyOrders: number = 1,    //
    private readonly minSolAmount: number = 0.5,  //
    private readonly maxSolAmount: number = 2,   //
    private readonly timeframe: KLineInterval = KLineInterval.ONE_SECOND // 
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
    this.klineService = new KLineService({ host: REDIS_CONFIG.host, port: REDIS_CONFIG.port });
  }
  
  /**
   * 回调买入策略
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 回调买入结果
   */
  async execute(mintAddress: string, price?:number,slot?: number): Promise<StrategyResult> {
 
    // 此策略不使用钱包地址，只关注代币的价格走势
    try {
      logger.debug({ mint: mintAddress }, 'PullbackBuy -> Checking for pullback buy opportunity');
      
      // 1. 获取K线数据
      const klines = await this.klineService.getRecentKLines(mintAddress, this.timeframe);
      logger.debug({ mint: mintAddress, klines: klines }, 'PullbackBuy -> Got klines');
      if (klines.length < this.uptrend + 2) { // 需要至少uptrend+2根K线来分析趋势
        logger.debug({ mint: mintAddress }, `PullbackBuy -> Not enough klines: ${klines.length}`);
        return {
          triggered: false,
          message: `Not enough klines to analyze trend: ${klines.length}`
        };
      }
      
      // 按时间戳排序
      klines.sort((a, b) => a.timestamp - b.timestamp);
      
      // 2. 检测上涨趋势
      let uptrendCount = 0;//连续上涨趋势计数
      let highestPrice = 0;//最高价
      let highestKlineIndex = -1;//最高价K线索引
      
      // 遍历K线数据
      for (let i = 1; i < klines.length; i++) {
        const currentKline = klines[i];
        const previousKline = klines[i-1];
        
        // 判断是否为上涨趋势
        if (currentKline.close > previousKline.close) {
          uptrendCount++;
          
          // 更新最高价
          if (currentKline.high > highestPrice) {
            highestPrice = currentKline.high;
            highestKlineIndex = i;
          }
        } else {
          // 重置上涨计数
          uptrendCount = 0;
        }
        
        // 如果检测到上涨趋势，跳出循环
        if (uptrendCount >= this.uptrend) {
          break;
        }
      }
      
      // 如果没有检测到上涨趋势
      if (uptrendCount < this.uptrend || highestKlineIndex === -1) {
        logger.debug({ mint: mintAddress }, `PullbackBuy -> No uptrend detected: ${uptrendCount}/${this.uptrend}`);
        return {
          triggered: false,
          message: `No uptrend detected: ${uptrendCount}/${this.uptrend}`
        };
      }
      
      // 3. 检测回调 
      // 
      let lowestPrice = highestPrice;
      let pullbackPercentage = 0;
      let pullbackDetected = false;
      
      for (let i = highestKlineIndex + 1; i < klines.length; i++) {
        const currentKline = klines[i];
        
        // 更新最低价
        if (currentKline.low < lowestPrice) {
          lowestPrice = currentKline.low;
          
          // 计算回调百分比
          pullbackPercentage = ((highestPrice - lowestPrice) / highestPrice) * 100;
          
          // 如果回调百分比大于等于阈值
          if (pullbackPercentage >= this.pullbackPercent) {
            pullbackDetected = true;
          }
        }
      }
      
      // 如果没有检测到回调
      if (!pullbackDetected) {
        logger.debug({ mint: mintAddress }, `PullbackBuy -> No sufficient pullback: ${pullbackPercentage.toFixed(2)}%/${this.pullbackPercent}%`);
        return {
          triggered: false,
          message: `No sufficient pullback: ${pullbackPercentage.toFixed(2)}%/${this.pullbackPercent}%`
        };
      }
      // 4. 检测买入订单
      const startTimeRedis = process.hrtime.bigint(); // Start timing
      const recentTrades = await this.redisService.getTokenTrades(mintAddress);
      const endTimeRedis = process.hrtime.bigint(); // End timing
      const durationMicroseconds = Number(endTimeRedis - startTimeRedis) / 1000; // Calculate duration in microseconds
      logger.debug({ mint: mintAddress, duration: `${durationMicroseconds.toFixed(2)} us` }, `getTokenTrades execution time`); // Log duration

      // 获取最后一个K线的开始时间
      const lastKline = klines[klines.length - 1];
      const lastKlineStartTime = lastKline.timestamp;
      
      // TODO 0.5-2sol的买单
      const recentBuyOrders = recentTrades.filter(trade => 
        trade.timestamp >= lastKlineStartTime && trade.isBuy && Number(trade.solAmount) >= this.minSolAmount && Number(trade.solAmount) <= this.maxSolAmount);
      
      // 如果没有检测到符合条件的买入订单
      if (recentBuyOrders.length < this.minBuyOrders) {
        logger.debug({ mint: mintAddress }, `PullbackBuy -> Not enough buy orders: ${recentBuyOrders.length}/${this.minBuyOrders}`);
        return {
          triggered: false,
          message: `Not enough buy orders: ${recentBuyOrders.length}/${this.minBuyOrders}`
        };
      }
      
      // 5. 检测买入订单
      logger.info({ 
        mint: mintAddress, 
        uptrendCount, 
        pullbackPercentage: pullbackPercentage.toFixed(2), 
        buyOrders: recentBuyOrders.length 
      }, 'PullbackBuy -> Pullback buy opportunity detected');
      
      // 当策略触发时，保存交易数据到文件
      try {
        const dataDir = path.join(process.cwd(), 'data');
        // 确保数据目录存在
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(dataDir, `pullback-buy-trades-${mintAddress}-${timestamp}.json`);
        
        // 保存交易数据
        const dataToSave = {
          mintAddress,
          timestamp: new Date().toISOString(),
          strategyParams: {
            uptrend: this.uptrend,
            pullbackPercent: this.pullbackPercent,
            minBuyOrders: this.minBuyOrders,
            minSolAmount: this.minSolAmount,
            maxSolAmount: this.maxSolAmount
          },
          metrics: {
            uptrendCount,
            pullbackPercentage,
            highestPrice,
            lowestPrice,
            buyOrdersCount: recentBuyOrders.length
          },
          klines,
          trades: recentTrades
        };
        
        // Custom replacer function for JSON.stringify to handle BigInt
        const replacer = (key: string, value: any) => {
          if (typeof value === 'bigint') {
            return value.toString(); // Convert BigInt to string
          }
          return value; // Return other values unchanged
        };
        const snapShotJson = JSON.stringify(dataToSave, replacer, 2);
        logger.debug({snapShotJson: snapShotJson }, 'PullbackBuy -> Saving trade data to file');
        fs.writeFileSync(filename, snapShotJson); // Use the replacer
        logger.info({ mint: mintAddress, filename }, 'PullbackBuy -> Saved trade data to file');
      } catch (error) {
        logger.error({ error, mint: mintAddress }, 'PullbackBuy -> Failed to save trade data to file');
      }
      
      return {
        triggered: true,
        message: `Pullback buy opportunity detected: ${uptrendCount} uptrend klines, ${pullbackPercentage.toFixed(2)}% pullback, ${recentBuyOrders.length} buy orders`,
        data: {
          uptrendCount,
          pullbackPercentage,
          buyOrders: recentBuyOrders.length,
          highestPrice,
          lowestPrice
        }
      };
    } catch (error: any) {
      logger.error({ error }, 'PullbackBuy -> Error executing strategy');
      return {
        triggered: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

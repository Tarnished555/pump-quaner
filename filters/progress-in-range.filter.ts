import { Filter, FilterResult } from './pool-filters';
import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { REDIS_CONFIG } from '../kline/config';
import {LAMPORTS_PER_SOL} from "@solana/web3.js";

// 初始真实代币储备常量，用于计算价格进度
const INITIAL_REAL_TOKEN_RESERVES = 793100000000000;

/**
 * 过滤器：检查代币价格进度是否在指定范围内（bonding curve progress）
 */
export class ProgressInRangeFilter implements Filter {
  private redisService: RedisKLineService;
  
  constructor(
    private readonly connection: Connection,
    private readonly maxProgress: number = 40, // 最大进度百分比
    private readonly minProgress: number = 0   // 最小进度百分比
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
  }
  
  /**
   * 执行过滤器检查
   * @param poolKeys 流动性池信息
   * @returns 过滤器结果
   */
  async execute(mintAddress: string,slot?: number): Promise<FilterResult> {
    try {
      logger.debug({ mint: mintAddress }, 'ProgressInRange -> Checking if token progress is within range');
      
      // 获取最近的交易记录
      const recentTrades = await this.redisService.getTokenTrades(mintAddress);
      
      if (recentTrades.length === 0) {
        logger.debug({ mint: mintAddress }, 'ProgressInRange -> No recent trades found');
        return {
          ok: false,
          message: 'No recent trades found to analyze progress'
        };
      }

      // 计算代币进度
      // 这里的进度指的是bonding curve progress
      let progress = 0;
      
      // 获取最新的交易

      const latestTrade = recentTrades[recentTrades.length - 1];
      
      // 检查是否有储备信息
      if (latestTrade.virtualSolReserves !== undefined && 
          latestTrade.virtualTokenReserves !== undefined && 
          latestTrade.realSolReserves !== undefined && 
          latestTrade.realTokenReserves !== undefined) {
        
         // 这个比例可以表示曲线的进度
        let realSolReserves = Number(latestTrade.realSolReserves);
        let realTokenReserves = Number(latestTrade.realTokenReserves);
        //TODO:
        if (realSolReserves > 0) {
          // 计算SOL储备的进度百分比
          progress = ((INITIAL_REAL_TOKEN_RESERVES - realTokenReserves) / INITIAL_REAL_TOKEN_RESERVES) * 100;
          logger.info({ mint: mintAddress, progress }, 'ProgressInRange -> Calculated progress');
      
        }
      } else {
        // 如果没有储备信息，我们可以尝试使用其他方法估算
        // 例如，根据sol净交易量估算
        const totalVolume = recentTrades.reduce((sum, trade) => {
          // 确保我们有tokenAmount字段，并区分买入和卖出交易
          if (trade.solAmount !== undefined) {
            // 买入交易增加总量，卖出交易减少总量
            return trade.isBuy ? sum + Number(trade.solAmount) : sum - Number(trade.solAmount);
          }
          return sum;
        }, 0);
        
        // 假设总量为85*1000000000，计算已交易的百分比
        progress = (totalVolume / (LAMPORTS_PER_SOL * 85)) * 100;
      }
      
      // 确保进度在有效范围内
      progress = Math.max(0, Math.min(100, progress));
      
      // 检查进度是否在指定范围内
      const progressInRange = (progress < this.maxProgress);
      
      logger.info({
        mint: mintAddress,
        progress,
        progressInRange,
        minProgress: this.minProgress,
        maxProgress: this.maxProgress
      }, 'ProgressInRange -> Filter result');
      
      if (!progressInRange) {
        let message = '';
        if (progress < this.minProgress) {
          message = `Progress ${progress.toFixed(2)}% is below minimum ${this.minProgress}%`;
        } else {
          message = `Progress ${progress.toFixed(2)}% exceeds maximum ${this.maxProgress}%`;
        }
        
        return {
          ok: false,
          message
        };
      }
      
      return {
        ok: true,
        message: `Token progress at ${progress.toFixed(2)}% is within range`
      };
    } catch (error: any) {
      logger.error({ error }, 'ProgressInRange -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

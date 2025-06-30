import { Filter, FilterResult } from './pool-filters';
import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../helpers';
import { RedisKLineService } from '../kline/redis.service';
import { REDIS_CONFIG } from '../kline/config';
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * 过滤器：检查代币交易笔数和交易金额
 * 要求：交易笔数不少于20笔，总交易金额不低于5 SOL
 */
export class TradeVolumeFilter implements Filter {
  private redisService: RedisKLineService;
  
  constructor(
    private readonly connection: Connection,
    private readonly minTradeCount: number = 20, // 最小交易笔数
    private readonly minTotalSolVolume: number = 5 // 最小总交易金额（SOL）
  ) {
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
  }
  
  /**
   * 执行过滤器检查
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 过滤器结果
   */
  async execute(mintAddress: string, slot?: number): Promise<FilterResult> {
    try {
      logger.debug({ mint: mintAddress }, 'TradeVolume -> Checking trade count and volume');
      
      // 获取交易记录
      const trades = await this.redisService.getTokenTrades(mintAddress);
      
      // 检查交易笔数
      if (trades.length < this.minTradeCount) {
        logger.debug({ 
          mint: mintAddress, 
          tradeCount: trades.length, 
          minRequired: this.minTradeCount 
        }, 'TradeVolume -> Insufficient trade count');
        
        return {
          ok: false,
          message: `Insufficient trade count: ${trades.length}/${this.minTradeCount}`
        };
      }
      
      // 计算总交易金额（SOL）
      let totalSolVolume = 0;
      for (const trade of trades) {
        if (trade.solAmount !== undefined && trade.isBuy) {
          totalSolVolume += Number(trade.solAmount);
        }
      }
      
      // 检查总交易金额
      if (totalSolVolume < this.minTotalSolVolume*LAMPORTS_PER_SOL) {
        logger.debug({ 
          mint: mintAddress, 
          totalSolVolume, 
          minRequired: this.minTotalSolVolume 
        }, 'TradeVolume -> Insufficient trade volume');
        
        return {
          ok: false,
          message: `Insufficient trade volume: ${totalSolVolume/LAMPORTS_PER_SOL} SOL/${this.minTotalSolVolume} SOL`
        };
      }
      
      logger.info({ 
        mint: mintAddress, 
        tradeCount: trades.length, 
        totalSolVolume 
      }, 'TradeVolume -> Trade count and volume check passed');
      
      return {
        ok: true,
        message: `Trade count and volume check passed: ${trades.length} trades, ${totalSolVolume.toFixed(2)} SOL`
      };
    } catch (error: any) {
      logger.error({ error }, 'TradeVolume -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

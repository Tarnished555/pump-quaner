import { Filter, FilterResult } from './pool-filters';
import { Connection, PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger, RPC_ENDPOINT } from '../helpers';
import { TokenHoldersService } from '../services/token-holders.service';
import { RedisKLineService } from '../kline/redis.service';
import { REDIS_CONFIG } from '../kline/config';

/**
 * u8fc7u6ee4u5668uff1au68c0u67e5u72d9u51fbu8005u662fu5426u5df2u6e05u4ed3uff08u65e9u671fu4ea4u6613u8005u4e0du518du6301u6709u5927u91cfu4ee3u5e01uff09
 */
export class SniperClearedFilter implements Filter {
  private tokenHoldersService: TokenHoldersService;
  private redisService: RedisKLineService;
  
  constructor(
    private readonly connection: Connection
  ) {
    this.tokenHoldersService = new TokenHoldersService(RPC_ENDPOINT);
    this.redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
  }
  
  /**
   * 
   * @param mintAddress 
   * @param slot 
   * @returns 
   */
  async execute(mintAddress: string,slot?: number): Promise<FilterResult> {
    try {
      
      logger.debug({ mint: mintAddress }, 'SniperCleared -> Checking if snipers have cleared positions');
      
      // 1. 获取代币持有人分布
      const holderDistribution = await this.tokenHoldersService.getHolderDistribution(mintAddress);
      
      // 2. 查询交易记录(最早到最新)
      const recentTrades = await this.redisService.getTokenTrades(mintAddress);
      
      if (recentTrades.length === 0) {
        logger.debug({ mint: mintAddress }, 'SniperCleared -> No recent trades found');
        return {
          ok: false,
          message: 'No recent trades found to analyze sniper activity'
        };
      }
      
      // 3. 获取最早的交易记录
      const earliestTrade = recentTrades.reduce((earliest, trade) => 
        trade.timestamp < earliest.timestamp ? trade : earliest, recentTrades[0]);
      
      // 4. 获取与最早的交易相关的钱包
      const relatedWallets = await this.redisService.findRelatedWallets(slot||earliestTrade.slot, mintAddress);
      
      // 5. 检查早期交易者是否仍然持有大量代币
      const snipersStillHolding = holderDistribution.top10Holders.some(holder => 
        relatedWallets.includes(holder.owner));
      
      const sniperCleared = !snipersStillHolding;
      
      logger.info({
        mint: mintAddress,
        sniperCleared,
        earlyWalletsCount: relatedWallets.length
      }, 'SniperCleared -> Filter result');
      
      if (!sniperCleared) {
        return {
          ok: false,
          message: 'Early snipers still holding significant positions'
        };
      }
      
      return {
        ok: true,
        message: 'Early snipers have cleared their positions'
      };
    } catch (error: any) {
      logger.error({ error }, 'SniperCleared -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

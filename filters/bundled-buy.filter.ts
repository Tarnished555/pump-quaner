import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { logger, RPC_ENDPOINT } from '../helpers';
import { TokenHoldersService } from '../services/token-holders.service';
import { RedisKLineService } from '../kline/redis.service';
import { REDIS_CONFIG } from '../kline/config';

/**
 * 
 *  捆绑买入过滤器
 */
export class BundledBuyFilter implements Filter {
  private tokenHoldersService: TokenHoldersService;
  private redisKLineService: RedisKLineService;
  
  constructor(
    private readonly connection: Connection,
    private readonly maxBundledWallets: number = 4, // 
    private readonly slotWindow: number = 1 //
  ) {
    this.tokenHoldersService = new TokenHoldersService(RPC_ENDPOINT);
    this.redisKLineService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);
  }
  
  /**
   * 捆绑买入过滤器 - Filter
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号
   * @returns 过滤结果
   */
  async execute(mintAddress: string, slot?: number): Promise<FilterResult> {
    try {
      logger.debug({ mint: mintAddress }, 'BundledBuy -> Checking if top holders bought in same blocks');
      
      // 持仓分布
      const holderDistribution = await this.tokenHoldersService.getHolderDistribution(mintAddress);
      
      // 10大持仓
      const topHolders = holderDistribution.top10Holders;
      
      if (topHolders.length === 0) {
        logger.debug({ mint: mintAddress }, 'BundledBuy -> No top holders found');
        return { ok: true, message: 'BundledBuy -> No top holders found' };
      }
      
      // 持仓地址
      const holderAddresses = topHolders.map(holder => holder.owner);
      
      // 买入记录
      const allTrades = await this.redisKLineService.getTokenTrades(mintAddress);
      
      if (!allTrades || allTrades.length === 0) {
        logger.debug({ mint: mintAddress }, 'BundledBuy -> No trade records found');
        return { ok: true, message: 'BundledBuy -> No trade records found' };
      }
      
      // 买入地址
      const walletFirstBuySlots = new Map<string, number>();
      
      // 遍历买入记录
      for (const trade of allTrades) {
        if (trade.isBuy && holderAddresses.includes(trade.user) && !walletFirstBuySlots.has(trade.user)) {
          walletFirstBuySlots.set(trade.user, trade.slot);
        }
      }
      
      // 按区块分组
      const slotGroups = new Map<number, string[]>();
      
      // 遍历买入地址
      for (const [wallet, buySlot] of walletFirstBuySlots.entries()) {
        // 是否找到分组
        let foundGroup = false;
        
        for (const [groupSlot, wallets] of slotGroups.entries()) {
          if (Math.abs(groupSlot - buySlot) <= this.slotWindow) {
            wallets.push(wallet);
            foundGroup = true;
            break;
          }
        }
        
        // 未找到分组
        if (!foundGroup) {
          slotGroups.set(buySlot, [wallet]);
        }
      }
      
      // 检测可疑的捆绑买入模式
      for (const [groupSlot, wallets] of slotGroups.entries()) {
        if (wallets.length > this.maxBundledWallets) {
          logger.info({
            mint: mintAddress,
            slot: groupSlot,
            walletCount: wallets.length,
            maxAllowed: this.maxBundledWallets
          }, 'BundledBuy -> Too many wallets bought in same block range');
          
          return {
            ok: false,
            message: `BundledBuy -> ${wallets.length} wallets bought in same block range (around slot ${groupSlot})`
          };
        }
      }
      
      logger.info({ mint: mintAddress }, 'BundledBuy -> No suspicious bundled buying pattern detected');
      return { ok: true, message: 'BundledBuy -> No suspicious bundled buying pattern detected' };
    } catch (error: any) {
      logger.error({ error }, 'BundledBuy -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
}

import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { logger, RPC_ENDPOINT, SOLSCAN_TOKEN } from '../helpers';
import { TokenHoldersService } from '../services/token-holders.service';
import axios from 'axios';

/**
 * 转账活动接口
 */
interface TransferActivity {
  block_id: number;
  trans_id: string;
  block_time: number;
  activity_type: string;
  from_address: string;
  to_address: string;
  token_address: string;
  amount: number;
  flow: string;
  time: string;
}

/**
 * 资金来源过滤器：检查前10大持币钱包的资金来源
 * 如果超过指定数量的钱包资金来自同一地址，则不买入
 */
export class FundSourceFilter implements Filter {
  private tokenHoldersService: TokenHoldersService;
  
  constructor(
    private readonly solscanToken: string='',
    private readonly maxSameSourceWallets: number = 4, // 默认最大同源钱包数量
    private readonly minSolAmount: number = 0.1 // 最小SOL转账金额
  ) {
    this.tokenHoldersService = new TokenHoldersService(RPC_ENDPOINT);
  }
  
  /**
   * 执行过滤器检查 - 符合Filter接口
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号
   * @returns 过滤器结果
   */
  async execute(mintAddress: string, slot?: number): Promise<FilterResult> {
    try {
      logger.debug({ mint: mintAddress }, 'FundSource -> Checking top holders\'s fund source');
      
      // 获取代币持有者分布
      const holderDistribution = await this.tokenHoldersService.getHolderDistribution(mintAddress);
      
      // 获取前10大持有者（不包括流动性池）
      const topHolders = holderDistribution.top10Holders;
      
      if (topHolders.length === 0) {
        logger.debug({ mint: mintAddress }, 'FundSource -> No top holders found');
        return { ok: true, message: 'FundSource -> No top holders found' };
      }
      
      // 收集所有持有者的钱包地址
      const holderAddresses = topHolders.map(holder => holder.owner);
      
      // 检查每个钱包的资金来源
      const sourceMap = new Map<string, string[]>();
      
      for (const address of holderAddresses) {
        // 获取该钱包的SOL转账记录
        const transfers = await this.scanFundSource(address, this.minSolAmount);
        
        // 如果有转账记录，记录资金来源
        if (transfers.length > 0) {
          // 使用最近的一笔转账作为资金来源
          const source = transfers[0].from_address;
          
          if (!sourceMap.has(source)) {
            sourceMap.set(source, []);
          }
          
          sourceMap.get(source)?.push(address);
        }
      }
      
      // 检查是否有超过指定数量的钱包来自同一地址
      for (const [source, addresses] of sourceMap.entries()) {
        if (addresses.length > this.maxSameSourceWallets) {
          logger.info({
            mint: mintAddress,
            source,
            walletCount: addresses.length,
            maxAllowed: this.maxSameSourceWallets
          }, 'FundSource -> Too many wallets from same source');
          
          return {
            ok: false,
            message: `FundSource -> ${addresses.length} wallets funded from same source (${source.substring(0, 8)}...)`
          };
        }
      }
      
      logger.info({ mint: mintAddress }, 'FundSource -> No suspicious funding pattern detected');
      return { ok: true, message: 'FundSource -> No suspicious funding pattern detected' };
    } catch (error: any) {
      logger.error({ error }, 'FundSource -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
  
  /**
   * 扫描资金来源 - 查询转账记录
   * @param toAddress 接收地址
   * @param minAmount 最小金额（SOL）
   * @returns 转账记录列表
   */
  private async scanFundSource(toAddress: string, minAmount: number): Promise<TransferActivity[]> {
    try {
      const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${toAddress}&to=${toAddress}&token=So11111111111111111111111111111111111111111&activity_type[]=ACTIVITY_SPL_TRANSFER&amount[]=${minAmount}&flow=in&page=1&page_size=100&sort_by=block_time&sort_order=desc`;
      
      const response = await axios.get(url, {
        headers: {
          'token': this.solscanToken
        }
      });
      
      if (!response.data.success) {
        logger.error('Failed to fetch transfer data from Solscan');
        return [];
      }
      
      const transfers: TransferActivity[] = [];
      
      for (const activity of response.data.data) {
        if (activity.flow === 'in' && activity.amount >= minAmount * 1e9) {
          transfers.push(activity);
        }
      }
      
      return transfers;
    } catch (error) {
      logger.error({ error }, 'Error scanning fund source');
      return [];
    }
  }
}

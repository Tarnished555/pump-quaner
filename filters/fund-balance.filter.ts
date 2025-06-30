import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { logger, RPC_ENDPOINT, MIN_BALANCE_HOLDERS } from '../helpers';
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
 * 资金余额：检查前10大持币钱包的资金余额
 * 
 */
export class FundBalanceFilter implements Filter {
  private tokenHoldersService: TokenHoldersService;
  
  constructor(
    private readonly solscanToken: string='',
    private readonly minSolAmount: number = 2.0 // 最小钱包余额
  ) {
    this.tokenHoldersService = new TokenHoldersService(RPC_ENDPOINT);
  }
  
  /**
   * 执行账号余额过滤器检查 - 符合Filter接口
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号
   * @returns 过滤器结果
   */
  async execute(mintAddress: string, slot?: number): Promise<FilterResult> {
    try {
      logger.debug({ mint: mintAddress }, 'FundBalance -> Checking top holders\'s fund balance');
      
      // 获取代币持有者分布
      const holderDistribution = await this.tokenHoldersService.getHolderDistribution(mintAddress);
      
      // 获取前10大持有者（不包括流动性池）
      const topHolders = holderDistribution.top10Holders;
      
      if (topHolders.length === 0) {
        logger.debug({ mint: mintAddress }, 'FundBalcne -> No top holders found');
        return { ok: true, message: 'FundBalcne -> No top holders found' };
      }
      
      // 收集所有持有者的钱包地址
      const holderAddresses = topHolders.map(holder => holder.owner);
      
      let matchHolders: string[] = []
      for (const address of holderAddresses) {
        // 获取该钱包的SOL转账记录
        const matchBalance = await this.scanFundBalance(address, this.minSolAmount);
        
          if(matchBalance) {
            matchHolders.push(address)
            
          }
      }
      
      if(matchHolders.length > MIN_BALANCE_HOLDERS) {
        logger.info({ mint: mintAddress }, 'FundBalcne-> No suspicious funding balance pattern detected');
        return { ok: true, message: 'FundBalcne -> No suspicious funding balance pattern detected' };

      }
      
      return { ok: false, message: 'FundBalcne -> suspicious funding balance' };

    } catch (error: any) {
      logger.error({ error }, 'FundBalcne -> Error executing filter');
      return {
        ok: false,
        message: `Error: ${error?.message || 'Unknown error'}`
      };
    }
  }
  
  /**
 * 扫描账户余额 - 查询账户SOL余额
 * @param address 账户地址
 * @param minAmount 最小金额（SOL）
 * @returns 如果账户余额大于等于最小金额，返回包含该账户信息的转账记录列表；否则返回空列表
 */
private async scanFundBalance(address: string, minAmount: number): Promise<boolean> {
  try {
    const url = `https://pro-api.solscan.io/v2.0/account/detail?address=${address}`;
    
    const response = await axios.get(url, {
      headers: {
        'token': this.solscanToken
      }
    });
    
    if (!response.data.success) {
      logger.error('Failed to fetch account balance from Solscan');
      return false;
    }
    
    const accountData = response.data.data;
    // 将lamports转换为SOL（1 SOL = 10^9 lamports）
    const solBalance = accountData.lamports / 1e9;

    return solBalance >= minAmount;
   
  } catch (error) {
    logger.error({ error }, 'Error scanning account balance');
    return false;
  }
}
}

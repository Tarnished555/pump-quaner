import { logger } from '../helpers';
import axios from 'axios';

// 定义代币账户接口
interface TokenAccount {
  address: string;
  mint: string;
  owner: string;
  amount: number;
  delegated_amount: number;
  frozen: boolean;
}

// 定义API响应接口
interface TokenAccountsResponse {
  jsonrpc: string;
  id: string;
  result?: {
    token_accounts: TokenAccount[];
  };
  error?: {
    code: number;
    message: string;
  };
}

// 定义持有者信息接口
export interface TokenHolder {
  owner: string;
  amount: number;
  percentage?: number; // 持有比例
}

/**
 * 代币持有者服务 - 使用Helius API获取代币持有者信息
 */
export class TokenHoldersService {
  private readonly rpcUrl: string;
  private readonly TOTAL_SUPPLY = 1000000000*10**6; // 固定总供应量
  
  /**
   * 构造函数
   * @param rpcUrl RPC服务器URL
   */
  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }
  
  /**
   * 获取代币持有者信息
   * @param mintAddress 代币铸造地址
   * @param limit 每页限制，最大1000
   * @param calculatePercentage 是否计算持有比例
   * @returns 持有者信息数组
   */
  async getTokenHolders(mintAddress: string, limit: number = 1000, calculatePercentage: boolean = true): Promise<TokenHolder[]> {
    try {
      logger.debug({ mintAddress }, 'Fetching token holders');
      
      let page = 1;
      const holders: Map<string, number> = new Map();
      
      // 使用分页获取所有代币账户

        try {
          const response = await axios.post(this.rpcUrl, JSON.stringify({
            jsonrpc: '2.0',
            method: 'getTokenAccounts',
            id: 'pump-quaner',
            params: {
              page,
              limit,
              displayOptions: {},
              mint: mintAddress,
            },
          }), {
            headers: {
              "Content-Type": "application/json",
            },
          });
          
          // 检查HTTP响应状态
          if (response.status !== 200) {
            logger.error(
              { status: response.status, statusText: response.statusText },
              'Error fetching token accounts'
            );
            return [];
          }
          
          const data = response.data as TokenAccountsResponse;
          
          // 检查API错误
          if (data.error) {
            logger.error({ error: data.error }, 'API error when fetching token accounts');
            return [];
          }
          
          // 检查是否还有更多结果
          if (!data.result || data.result.token_accounts.length === 0) {
            logger.debug({ page: page - 1 }, 'No more token accounts');
            return [];
          }
          
         // logger.debug({ page }, 'Processing token accounts');
          logger.debug({ page, tokenAccounts: data.result.token_accounts }, 'Token accounts');
          // 处理代币账户数据
          for (const account of data.result.token_accounts) {
            // 累加持有者的代币数量
            const currentAmount = holders.get(account.owner) || 0;
            holders.set(account.owner, currentAmount + account.amount);
          }
          
 
        } catch (error) {
          // 捕获单次请求的错误，但不中断整个循环
          logger.error({ error, page, mintAddress }, 'Error in API request for page');

        }
      
      logger.debug({ mintAddress, holderCount: holders.size }, 'Fetched token holders');
      // 转换为数组格式，使用固定的总供应量计算比例
      const holderArray: TokenHolder[] = Array.from(holders.entries()).map(([owner, amount]) => ({
        owner,
        amount,
        percentage: calculatePercentage ? (amount / this.TOTAL_SUPPLY) * 100 : undefined,
      }));
      
      // 按持有量排序（从大到小）
      holderArray.sort((a, b) => b.amount - a.amount);
      
      logger.debug(
        { mintAddress, holderCount: holderArray.length, totalSupply: this.TOTAL_SUPPLY },
        'Successfully fetched token holders'
      );
   
      return holderArray;
    } catch (error) {
      logger.error({ error, mintAddress }, 'Error getting token holders');
      return [];
    }
  }
  
  /**
   * 获取代币持有者分布统计
   * @param mintAddress 代币铸造地址
   * @returns 持有者分布统计
   */
  async getHolderDistribution(mintAddress: string): Promise<{
    topHolder: TokenHolder | null;
    top10Holders: TokenHolder[];
    top10Percentage: number;
    totalHolders: number;
  }> {
    const holders = await this.getTokenHolders(mintAddress);
    
    if (holders.length === 0) {
      return {
        topHolder: null,
        top10Holders: [],
        top10Percentage: 0,
        totalHolders: 0,
      };
    }
    
    // 跳过第一个持有者（bonding curve），并处理长度不足10的情况
    const top10Holders = holders.length > 1 ? holders.slice(1, Math.min(11, holders.length)) : [];
    
    // 计算前10大持有者的总持有比例
    const top10Percentage = top10Holders.reduce(
      (sum, holder) => sum + (holder.percentage || 0),
      0
    );
    
    return {
      topHolder: holders[0],
      top10Holders,
      top10Percentage,
      totalHolders: holders.length,
    };
  }
}

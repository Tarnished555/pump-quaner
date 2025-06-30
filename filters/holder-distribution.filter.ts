import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';
import axios from 'axios';
import { SOLSCAN_TOKEN, USE_PROXY, PROXY_URL } from '../helpers';
import fetch from 'node-fetch';
import HttpsProxyAgent from 'https-proxy-agent';

interface TokenHolder {
  address: string;
  amount: string;
  owner: string;
  percentage: number; // Percentage share
}

interface TokenHoldersResponse {
  data: TokenHolder[];
  success: boolean;
}

export class HolderDistributionFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly maxTopHolderShare: number = 10, // Default max share for a single holder: 10%
    private readonly maxTop10HolderShare: number = 30, // Default max share for top 10 holders: 40%
  ) { }

  async execute(mintAddress: string, slot?: number): Promise<FilterResult> {
    try {

      logger.debug({ mint: mintAddress }, 'HolderDistribution -> Checking holder distribution');

      // Call Solscan API to get token holders
      logger.debug({ mint: mintAddress }, 'HolderDistribution -> Calling Solscan API');
      
      try {
        // 准备请求选项
        const requestOptions: any = {
          method: 'get',
          headers: {
            'token': SOLSCAN_TOKEN
          },
          timeout: 10000 // 10 秒超时
        };
        
        // 如果启用了代理，添加代理设置
        if (USE_PROXY) {
          logger.debug({ mint: mintAddress, proxy: PROXY_URL }, 'HolderDistribution -> Using proxy');
          const proxyAgent = new HttpsProxyAgent(PROXY_URL);
          requestOptions.agent = proxyAgent;
        }
        
        const response = await fetch(
          `https://pro-api.solscan.io/v2.0/token/holders?address=${mintAddress}&page=1&page_size=15`, // 只需要前 15 个持有者
          requestOptions
        ).then((res: any) => res.json());
        
        if (!response.data || !response.data.data) {
          logger.debug({ mint: mintAddress }, 'HolderDistribution -> No data returned from API');
          return { ok: false, message: 'HolderDistribution -> No holder data available' };
        }
        
        const _holders = response.data.data || [];
        const holders = _holders.slice(1, 11); // Exclude bonding curve
        
        // Continue with holder analysis
        const topHolder = holders.length > 0 ? holders[0] : { address: '', amount: '0', owner: '', percentage: 0 };
        if (topHolder && topHolder.percentage > this.maxTopHolderShare) {
          return {
            ok: false,
            message: `HolderDistribution -> Top holder has ${topHolder.percentage.toFixed(2)}% which exceeds ${this.maxTopHolderShare}%`
          };
        }
        
        // Calculate total percentage for top 10 holders
        const top10HoldersPercentage = holders.reduce((sum: number, holder: TokenHolder) => sum + holder.percentage, 0);
        if (top10HoldersPercentage > this.maxTop10HolderShare) {
          return {
            ok: false,
            message: `HolderDistribution -> Top 10 holders have ${top10HoldersPercentage.toFixed(2)}% which exceeds ${this.maxTop10HolderShare}%`
          };
        }
        
        return { ok: true, message: 'HolderDistribution -> Holder distribution is healthy' };
      } catch (error) {
        // Try the v2 API endpoint as fallback
        logger.debug({ mint: mintAddress }, 'HolderDistribution -> Falling back to v2 API');
        
        try {
          // 准备请求选项
          const requestOptions: any = {
            method: 'get',
            headers: {
              'token': SOLSCAN_TOKEN
            },
            timeout: 3000 // 3 秒超时
          };
          
          // 如果启用了代理，添加代理设置
          if (USE_PROXY) {
            logger.debug({ mint: mintAddress, proxy: PROXY_URL }, 'HolderDistribution -> Using proxy for fallback API');
            const proxyAgent = new HttpsProxyAgent(PROXY_URL);
            requestOptions.agent = proxyAgent;
          }
          
          const response = await fetch(
            `https://pro-api.solscan.io/v2.0/token/holders?address=${mintAddress}&page=1&page_size=15`,
            requestOptions
          ).then((res: any) => res.json());
          
          if (!response.data || !response.data.data) {
            logger.debug({ mint: mintAddress }, 'HolderDistribution -> No data returned from fallback API');
            return { ok: false, message: 'HolderDistribution -> No holder data available' };
          }
          
          const _holders = response.data.data || [];
          const holders = _holders.slice(1, 11); // Exclude bonding curve
          
          // Continue with holder analysis
          const topHolder = holders.length > 0 ? holders[0] : { address: '', amount: '0', owner: '', percentage: 0 };
          if (topHolder && topHolder.percentage > this.maxTopHolderShare) {
            return {
              ok: false,
              message: `HolderDistribution -> Top holder has ${topHolder.percentage.toFixed(2)}% which exceeds ${this.maxTopHolderShare}%`
            };
          }
          
          // Calculate total percentage for top 10 holders
          const top10HoldersPercentage = holders.reduce((sum: number, holder: TokenHolder) => sum + holder.percentage, 0);
          if (top10HoldersPercentage > this.maxTop10HolderShare) {
            return {
              ok: false,
              message: `HolderDistribution -> Top 10 holders have ${top10HoldersPercentage.toFixed(2)}% which exceeds ${this.maxTop10HolderShare}%`
            };
          }
          
          return { ok: true, message: 'HolderDistribution -> Holder distribution is healthy' };
        } catch (fallbackError) {
          logger.error({ mint: mintAddress, error: fallbackError }, 'HolderDistribution -> Error checking holder distribution with fallback API');
          return { ok: false, message: 'HolderDistribution -> Failed to fetch holder data' };
        }
      }

      // All the necessary logic has been moved into the try/catch blocks above
      // This ensures proper error handling for both API endpoints

      return { ok: true };
    } catch (error) {
      logger.error(
        { mint: mintAddress, error },
        'HolderDistribution -> Error checking holder distribution'
      );

      return {
        ok: false,
        message: `HolderDistribution -> Error checking holder distribution: ${error}`
      };
    }
  }
}

import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';

import { HolderDistributionFilter } from './holder-distribution.filter';
import { DevClearedFilter } from './dev-cleared.filter';
import { SniperClearedFilter } from './sniper-cleared.filter';
import { ProgressInRangeFilter } from './progress-in-range.filter';
import { TradeVolumeFilter } from './trade-volume.filter';
import { FundSourceFilter } from './fund-source.filter';
import { BundledBuyFilter } from './bundled-buy.filter';
import {FundBalanceFilter} from './fund-balance.filter'
import { TokenInfoService } from '../services/token-info.service';
import { 
  SOLSCAN_TOKEN, 
  CHECK_HOLDER_DISTRIBUTION, 
  CHECK_DEV_CLEARED, 
  CHECK_SNIPER_CLEARED, 
  CHECK_TOPHOLDER_BALANCE,
  CHECK_PROGRESS_IN_RANGE, 
  CHECK_TRADE_VOLUME, 
  CHECK_FUND_SOURCE,
  MIN_TRADE_COUNT, 
  MIN_TOTAL_SOL_VOLUME, 
  CHECK_PULLBACK_BUY, 
  UPTREND_KLINES,   
  PULLBACK_PERCENT, 
  MIN_BUY_ORDERS, 
  MIN_BALANCE_SOL_AMOUNT,
  MAX_SINGLE_HOLDER_SHARE, 
  MAX_TOP10_HOLDERS_SHARE, 
  MAX_PROGRESS, 
  MIN_PROGRESS, 
  MAX_SAME_SOURCE_WALLETS,
  MIN_FUND_SOURCE_SOL_AMOUNT,
  CHECK_BUNDLED_BUY,
  MAX_BUNDLED_WALLETS,
  SLOT_WINDOW,
  logger 
} from '../helpers';

export interface Filter {
  execute(mintAddress: string, slot: number): Promise<FilterResult>;
}

export interface FilterResult {
  ok: boolean;
  message?: string;
}

export interface PoolFilterArgs {
  quoteToken: Token;
}

export class PoolFilters {
  private readonly filters: Filter[] = [];

  constructor(
    readonly connection: Connection,
    readonly args: PoolFilterArgs,
    private readonly tokenInfoService?: TokenInfoService
  ) {
    
    // 1. 持有者分布过滤器 - 检查代币持有者分布是否健康
    if (CHECK_HOLDER_DISTRIBUTION) {
      this.filters.push(new HolderDistributionFilter(connection, MAX_SINGLE_HOLDER_SHARE, MAX_TOP10_HOLDERS_SHARE));
    }

    // 2. 开发者清仓过滤器 - 检查是否有大持有者
    if (CHECK_DEV_CLEARED) {
      this.filters.push(new DevClearedFilter(connection, 10, this.tokenInfoService));
    }

    // 3. 狙击者清仓过滤器 - 检查早期交易者是否不再持有大量代币
    if (CHECK_SNIPER_CLEARED) {
      this.filters.push(new SniperClearedFilter(connection));
    }

    // 4. 进度范围过滤器 - 检查代币进度是否在指定范围内
    if (CHECK_PROGRESS_IN_RANGE) {
      this.filters.push(new ProgressInRangeFilter(connection, MAX_PROGRESS, MIN_PROGRESS));
    }

    // 5. 交易量过滤器 - 检查交易笔数和交易金额
    if (CHECK_TRADE_VOLUME) {
      this.filters.push(new TradeVolumeFilter(connection, MIN_TRADE_COUNT, MIN_TOTAL_SOL_VOLUME));
    }


    // 6. 捆绑买入过滤器 - 检查是否存在捆绑买入
    if (CHECK_BUNDLED_BUY) {
      this.filters.push(new BundledBuyFilter(connection, 
        MAX_BUNDLED_WALLETS, 
        SLOT_WINDOW));
    }
    //  7. 资金来源过滤器 - 检查前10大持币钱包的资金来源是否来自同一地址
    if (CHECK_FUND_SOURCE) {
      this.filters.push(new FundSourceFilter(SOLSCAN_TOKEN, MAX_SAME_SOURCE_WALLETS, MIN_FUND_SOURCE_SOL_AMOUNT));
    }

    //8. 钱包余额
     if(CHECK_TOPHOLDER_BALANCE) {
      this.filters.push(new FundBalanceFilter(SOLSCAN_TOKEN, MIN_BALANCE_SOL_AMOUNT));

     }
  }

  public async execute(mintAddress: string, slot?: number): Promise<boolean> {
    if (this.filters.length === 0) {
      return true;
    }

    // 优化执行方式，依次执行每个过滤器，只要有一个过滤器返回false就立即返回false
    for (const filter of this.filters) {
      const filterResult = await filter.execute(mintAddress, slot || 0);
      
      if (!filterResult.ok) {
        // 记录失败的过滤器信息
        logger.info(filterResult.message);
        return false;
      }
    }

    // 所有过滤器都通过
    return true;
  }
}

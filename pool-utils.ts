import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from './helpers';

// PumpSwap 程序 ID
const PUMP_AMM_PROGRAM_ID: PublicKey = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

/**
 * 从池子地址中提取 mint 地址
 * 这是一个备选方案，当从 token account 获取 mint 地址失败时使用
 */
export async function getMintAddressFromPool(connection: Connection, poolAddress: string): Promise<string | null> {
  try {
    // 获取池子账户数据
    const accountInfo = await connection.getAccountInfo(new PublicKey(poolAddress));
    
    if (!accountInfo || !accountInfo.data) {
      logger.error(`Failed to get account info for pool: ${poolAddress}`);
      return null;
    }
    
    // 确保这是一个 PumpSwap 池子账户
    if (!accountInfo.owner.equals(PUMP_AMM_PROGRAM_ID)) {
      logger.error(`Pool ${poolAddress} is not owned by PumpSwap program`);
      return null;
    }
    
    // 直接从池子数据中提取 mint 地址
    // PumpSwap 池子结构中，base_mint 存储在固定偏移量
    // 根据 PumpSwap 程序的数据结构，base_mint 在偏移量 43 处，长度为 32 字节
    if (accountInfo.data.length >= 75) { // 43 + 32 = 75
      // 从数据中提取 base_mint 字段
      const baseMintBytes = accountInfo.data.slice(43, 43 + 32);
      const baseMint = new PublicKey(baseMintBytes);
      const mintAddress = baseMint.toString();
      
      logger.debug(`Successfully extracted mint address ${mintAddress} from pool ${poolAddress}`);
      return mintAddress;
    }
    
    logger.error(`Could not find base_mint in pool data for ${poolAddress}`);
    return null;
  } catch (error: any) {
    logger.error({
      error,
      poolAddress
    }, 'Error extracting mint address from pool');
    return null;
  }
}

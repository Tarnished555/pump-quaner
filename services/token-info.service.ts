import { logger } from '../helpers';
import { PublicKey } from "@solana/web3.js";

// 代币信息在缓存中的默认过期时间（30天）
const TOKEN_INFO_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 代币信息接口 - 包含开发者钱包和绑定曲线信息
 */
export interface TokenInfo {
  mintAddress: string;      // 代币地址 (主键)
  creator: PublicKey;       // 开发者钱包地址
  bondingCurve?: string;    // 绑定曲线地址
  slot?: number;            // 区块槽位号
  symbol?: string;          // 代币符号
  name?: string;            // 代币名称
  decimals?: number;        // 代币精度
  metaUrl?: string;         // 代币元数据URL
  createdAt: number;        // 创建时间戳
  expiresAt?: number;       // 过期时间戳
}

/**
 * 带过期时间的缓存条目
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * 代币信息服务 - 使用内存缓存存储代币相关信息
 */
export class TokenInfoService {
  private tokenInfoCache: Map<string, CacheEntry<TokenInfo>>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly expiryMs: number;

  /**
   * 构造函数
   * @param expiryMs 缓存项过期时间（毫秒），默认24小时
   * @param cleanupIntervalMs 清理间隔（毫秒），默认5分钟
   */
  constructor(expiryMs: number = TOKEN_INFO_EXPIRY_MS, cleanupIntervalMs: number = 5 * 60 * 1000) {
    this.tokenInfoCache = new Map<string, CacheEntry<TokenInfo>>();
    this.expiryMs = expiryMs;
    logger.info(`TokenInfoService初始化，使用内存缓存，过期时间: ${expiryMs / 1000 / 60 / 60}小时`);
    
    // 启动定期清理任务
    this.startCleanupTask(cleanupIntervalMs);
  }

  /**
   * 启动定期清理任务
   * @param intervalMs 清理间隔（毫秒）
   */
  private startCleanupTask(intervalMs: number): void {
    // 清除之前的定时器（如果存在）
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // 设置新的定时器
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, intervalMs);
    
    logger.info(`已启动缓存清理任务，间隔: ${intervalMs / 1000}秒`);
  }
  
  /**
   * 清理过期的缓存条目
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.tokenInfoCache.entries()) {
      if (entry.expiresAt <= now) {
        this.tokenInfoCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`清理了 ${expiredCount} 个过期的代币信息缓存`);
    }
  }

  /**
   * 保存代币信息到内存缓存
   * @param tokenInfo 代币信息
   */
  async saveTokenInfo(tokenInfo: TokenInfo): Promise<void> {
    try {
      // 计算过期时间
      const expiresAt = Date.now() + this.expiryMs;
      
      // 保存到内存缓存
      this.tokenInfoCache.set(tokenInfo.mintAddress, {
        data: {
          ...tokenInfo,
          expiresAt
        },
        expiresAt
      });
      
      logger.debug({ mintAddress: tokenInfo.mintAddress }, '代币信息已保存到内存缓存');
    } catch (error) {
      logger.error({ error, tokenInfo }, '保存代币信息到内存缓存时出错');
    }
  }

  /**
   * 从内存缓存获取代币信息
   * @param mintAddress 代币铸造地址
   * @returns 代币信息，如果不存在则返回null
   */
  async getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
    try {
      const entry = this.tokenInfoCache.get(mintAddress);
      
      if (!entry) {
        return null;
      }
      
      // 检查是否过期
      if (entry.expiresAt <= Date.now()) {
        this.tokenInfoCache.delete(mintAddress);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      logger.error({ error, mintAddress }, '获取代币信息时出错');
      return null;
    }
  }

  
  /**
   * 删除代币信息
   * @param mintAddress 代币铸造地址
   * @returns 是否删除成功
   */
  async deleteTokenInfo(mintAddress: string): Promise<boolean> {
    try {
      const deleted = this.tokenInfoCache.delete(mintAddress);
      logger.debug({ mintAddress, deleted }, '代币信息已删除');
      return deleted;
    } catch (error) {
      logger.error({ error, mintAddress }, '删除代币信息时出错');
      return false;
    }
  }

  /**
   * 清空缓存并停止清理任务
   */
  async close(): Promise<void> {
    // 停止清理任务
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // 清空缓存
    this.tokenInfoCache.clear();
    logger.info('TokenInfoService缓存已清空，清理任务已停止');
  }
}

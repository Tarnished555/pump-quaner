import Redis from 'ioredis';
import { logger } from '../helpers';
import { KLine, Trade ,KLineInterval} from './types';

// 交易数据在Redis中的过期时间（缩短为3天）
const TRADE_DATA_EXPIRY = 60 * 60 * 24 * 3; // 3天过期时间


// 每小时执行一次清理的时间间隔（毫秒）
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时

/**
 * Service for managing K-line data in Redis
 */
export class RedisKLineService {
  private redis: Redis;

  /**
   * 获取Redis客户端实例，用于创建pipeline
   * @returns Redis客户端实例
   */
  getRedisClient(): Redis {
    return this.redis;
  }

  constructor(host: string = 'localhost', port: number = 6379, socketPath: string = '', useSocket: boolean = false) {
    // 根据配置决定使用 Unix socket 还是 TCP 连接
    if (useSocket && socketPath) {
      // 使用 Unix socket 连接
      this.redis = new Redis({ path: socketPath });
      logger.info({ socketPath }, '使用 Unix socket 连接到 Redis 服务器');
    } else {
      // 使用传统的 host:port 连接
      this.redis = new Redis(port, host);
      logger.info({ host, port }, '使用 TCP 连接到 Redis 服务器');
    }
    
    this.redis.on('error', (err) => {
      logger.error({ err }, 'Redis 连接错误');
    });
    this.redis.on('connect', () => {
      if (useSocket && socketPath) {
        logger.info({ socketPath }, '已连接到 Redis 服务器');
      } else {
        logger.info({ host, port }, '已连接到 Redis 服务器');
      }
      
      // 启动定期清理任务
     // this.startCleanupTask();
    });
  }
  
  /**
   * 启动定期清理任务，删除过期的K线和交易数据
   */
  private startCleanupTask() {
    setInterval(async () => {
      try {
        logger.info('开始执行Redis数据清理任务...');
        const startTime = Date.now();
        
        // 获取当前时间戳（毫秒）
        const now = Date.now();
        // 计算3天前的时间戳（毫秒）
        const cutoffTime = now - (TRADE_DATA_EXPIRY * 1000);
        
        // 1. 清理过期的交易数据
        // 使用SCAN命令批量获取keys，避免使用KEYS命令
        let cursor = '0';
        let totalCleaned = 0;
        
        do {
          // 扫描trade:开头的键
          const [nextCursor, keys] = await this.redis.scan(
            cursor, 
            'MATCH', 
            'trade:*', 
            'COUNT', 
            '1000'
          );
          
          cursor = nextCursor;
          
          if (keys.length > 0) {
            // 批量获取这些键的时间戳
            for (const key of keys) {
              try {
                const timestamp = await this.redis.hget(key, 'timestamp');
                if (timestamp && parseInt(timestamp) < cutoffTime / 1000) {
                  // 删除过期的交易数据
                  await this.redis.del(key);
                  totalCleaned++;
                  
                  // 从相关集合中也删除这个键
                  const tokenAddress = await this.redis.hget(key, 'tokenAddress');
                  const userAddress = await this.redis.hget(key, 'user');
                  
                  if (tokenAddress) {
                    await this.redis.srem(`trades:token:${tokenAddress}`, key);
                  }
                  
                  if (userAddress) {
                    await this.redis.srem(`trades:user:${userAddress}`, key);
                  }
                }
              } catch (keyError) {
                logger.error({ error: keyError, key }, '清理单个交易键时出错');
              }
            }
          }
        } while (cursor !== '0');
        
        const endTime = Date.now();
        logger.info({ 
          totalCleaned, 
          timeTaken: `${(endTime - startTime) / 1000}秒` 
        }, 'Redis数据清理任务完成');
      } catch (error) {
        logger.error({ error }, 'Redis数据清理任务失败');
      }
    }, CLEANUP_INTERVAL);
    
    logger.info(`已启动Redis数据清理任务，间隔: ${CLEANUP_INTERVAL / 1000 / 60}分钟`);
  }

    /**
   * Generates a Redis key for a specific token and time interval
   */
    private getSpecialTradeRedisKey(token: string,timestamp: number, interval: string = KLineInterval.ONE_SECOND): string {
      // 使用UTC时区的时间
      const now = new Date(timestamp*1000);
      
      // 为了确保时区一致性，明确使用UTC时间
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      const utcSeconds = now.getUTCSeconds();
      const utcDate = now.getUTCDate();
      
      if(interval==='1s'){
        return `${token}:kline_1s_${utcHours}:${utcMinutes}:${utcSeconds}`;
      }
      // For 15-second intervals
      if (interval === '15s') {
        const secondBucket = Math.floor(utcSeconds / 15) * 15;
        return `${token}:kline_15s_${utcHours}:${utcMinutes}:${secondBucket}`;
      }
      
      // For 1-minute intervals
      if (interval === '1m') {
        return `${token}:kline_${utcHours}:${utcMinutes}`;
      }
      
      // For 5-minute intervals
      if (interval === '5m') {
        const minuteBucket = Math.floor(utcMinutes / 5) * 5;
        return `${token}:kline_5m_${utcHours}:${minuteBucket}`;
      }
      
      // For 15-minute intervals
      if (interval === '15m') {
        const minuteBucket = Math.floor(utcMinutes / 15) * 15;
        return `${token}:kline_15m_${utcHours}:${minuteBucket}`;
      }
      
      // For 1-hour intervals
      if (interval === '1h') {
        return `${token}:kline_1h_${utcHours}`;
      }
      
      // For 4-hour intervals
      if (interval === '4h') {
        const hourBucket = Math.floor(utcHours / 4) * 4;
        return `${token}:kline_4h_${hourBucket}`;
      }
      
      // For 1-day intervals
      if (interval === '1d') {
        return `${token}:kline_1d_${utcDate}`;
      }
      
      // Default to 1-minute if interval is not recognized
      return `${token}:kline_${utcHours}:${utcMinutes}`;
    }
  
  /**
   * Generates a Redis key for a specific token and time interval
   */
  private getRedisKey(token: string, interval: string = KLineInterval.ONE_SECOND): string {
    // 使用UTC时区的时间
    const now = new Date();
    
    // 为了确保时区一致性，明确使用UTC时间
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcSeconds = now.getUTCSeconds();
    const utcDate = now.getUTCDate();
    
    if(interval==='1s'){
      return `${token}:kline_1s_${utcHours}:${utcMinutes}:${utcSeconds}`;
    }
    if(interval==='5s'){
      const _secondBucket =Math.floor(utcSeconds / 5) * 5
      return `${token}:kline_5s_${utcHours}:${utcMinutes}:${_secondBucket}`;
    }
    // For 15-second intervals
    if (interval === '15s') {
      const secondBucket = Math.floor(utcSeconds / 15) * 15;
      return `${token}:kline_15s_${utcHours}:${utcMinutes}:${secondBucket}`;
    }
    
    // For 1-minute intervals
    if (interval === '1m') {
      return `${token}:kline_${utcHours}:${utcMinutes}`;
    }
    
    // For 5-minute intervals
    if (interval === '5m') {
      const minuteBucket = Math.floor(utcMinutes / 5) * 5;
      return `${token}:kline_5m_${utcHours}:${minuteBucket}`;
    }
    
    // For 15-minute intervals
    if (interval === '15m') {
      const minuteBucket = Math.floor(utcMinutes / 15) * 15;
      return `${token}:kline_15m_${utcHours}:${minuteBucket}`;
    }
    
    // For 1-hour intervals
    if (interval === '1h') {
      return `${token}:kline_1h_${utcHours}`;
    }
    
    // For 4-hour intervals
    if (interval === '4h') {
      const hourBucket = Math.floor(utcHours / 4) * 4;
      return `${token}:kline_4h_${hourBucket}`;
    }
    
    // For 1-day intervals
    if (interval === '1d') {
      return `${token}:kline_1d_${utcDate}`;
    }
    
    // Default to 1-minute if interval is not recognized
    return `${token}:kline_${utcHours}:${utcMinutes}`;
  }

  /**
   * Updates the K-line data for a trade
   */
  async updateKLine(trade: Trade, interval: string = KLineInterval.ONE_SECOND): Promise<void> {
    try {
      // 首先保存交易数据以便于量化分析
      
      const key = this.getSpecialTradeRedisKey(trade.tokenAddress, trade.timestamp, interval);
      //logger.debug({ key, trade }, 'Updating K-line data');
      
      // Use pipeline for batch operations
      const pipeline = this.redis.pipeline();
      
      // Check if this is the first trade for this interval
      const exists = await this.redis.exists(key);
      
      if (!exists) {
        // Initialize K-line data for first trade
        pipeline.hset(key, 
          'open', trade.price.toString(),
          'high', trade.price.toString(),
          'low', trade.price.toString(),
          'close', trade.price.toString(),
          'volume', trade.amount.toString(),
          'token_address', trade.tokenAddress,
          'timestamp', trade.timestamp.toString(),
          'platform', trade.platform
        );
        
        // Set expiry for the key (keep data for 24 hours)
        pipeline.expire(key, 86400); // 24 hours in seconds
      } else {
        // Get current high and low values
        const currentData = await this.redis.hmget(key, 'high', 'low');
        const currentHigh = parseFloat(currentData[0] || '0');
        const currentLow = parseFloat(currentData[1] || trade.price.toString());
        
        // Calculate new high and low
        const high = Math.max(trade.price, currentHigh);
        const low = Math.min(trade.price, currentLow);
        
        // Update high, low, close, and volume
        pipeline
          .hset(key, 'high', high.toString())
          .hset(key, 'low', low.toString())
          .hset(key, 'close', trade.price.toString())
          .hincrbyfloat(key, 'volume', Number(trade.amount));
      }
      
      // Execute all commands
      await pipeline.exec();
      
      //logger.debug({ key }, 'K-line data updated successfully');
    } catch (error) {
      logger.error({ error, trade }, 'Error updating K-line data');
    }
  }

  /**
   * Retrieves current K-line data for a specific token and interval
   */
  async getKLine(tokenAddress: string, interval: string = KLineInterval.ONE_SECOND): Promise<KLine | null> {
    try {
      const key = this.getRedisKey(tokenAddress, interval);
      const data = await this.redis.hgetall(key);
      
      if (!data || Object.keys(data).length === 0) {
        return null;
      }
      
      return {
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        close: parseFloat(data.close),
        volume: parseFloat(data.volume),
        timestamp: parseInt(data.timestamp),
        tokenAddress: data.token_address,
        platform: data.platform
      };
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error retrieving K-line data');
      return null;
    }
  }
  
  /**
   * Retrieves all K-line data for a specific token and interval within a time range
   * @param tokenAddress The token address to get K-line data for
   * @param interval The time interval (1m, 5m, 15m, 1h, 4h, 1d)
   * @param startTime The start time in UTC timestamp (milliseconds)
   * @param endTime The end time in UTC timestamp (milliseconds), defaults to current time
   * @returns Array of K-line data points
   */
  async getAllKLines(
    tokenAddress: string, 
    interval: string = '1s',
    startTime?: number,
    endTime: number = Date.now()
  ): Promise<KLine[]> {
    try {
      const result: KLine[] = [];
      const pattern = `${tokenAddress}:kline_${interval}_*`;
      
      // Use a secondary index to track kline keys instead of using KEYS command
      const indexKey = `index:klines:${tokenAddress}:${interval}`;
      let klineKeys: string[] = [];
      
      // Check if we have an index for this token and interval
      const hasIndex = await this.redis.exists(indexKey);
      
      if (hasIndex) {
        // If index exists, use it to get all keys (much more efficient than KEYS)
        klineKeys = await this.redis.smembers(indexKey);
        logger.debug({ tokenAddress, interval, keyCount: klineKeys.length, fromIndex: true }, 'Found K-line keys from index');
      } else {
        // Fall back to SCAN which is more efficient than KEYS for large datasets
        // SCAN is non-blocking and iterates through the keyspace in small chunks
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
          cursor = nextCursor;
          
          if (keys.length > 0) {
            klineKeys.push(...keys);
            
            // Add keys to the index for future use
            if (keys.length > 0) {
              await this.redis.sadd(indexKey, ...keys);
              // Set expiry on the index (same as the data expiry)
              await this.redis.expire(indexKey, TRADE_DATA_EXPIRY);
            }
          }
        } while (cursor !== '0');
        
        logger.debug({ tokenAddress, interval, keyCount: klineKeys.length, fromScan: true }, 'Found K-line keys using SCAN');
      }
      
      // Use pipeline to get data for all keys in a single round trip
      if (klineKeys.length > 0) {
        const pipeline = this.redis.pipeline();
        
        for (const key of klineKeys) {
          pipeline.hgetall(key);
        }
        
        const responses = await pipeline.exec();
        
        if (responses) {
          for (let i = 0; i < responses.length; i++) {
            const [err, data] = responses[i];
            
            if (err) {
              logger.error({ error: err, key: klineKeys[i] }, 'Error retrieving K-line data');
              continue;
            }
            
            // Ensure data is properly typed as a Record<string, string>
            const klineData = data as Record<string, string>;
            
            if (klineData && Object.keys(klineData).length > 0 && klineData.timestamp) {
              const timestamp = parseInt(klineData.timestamp);
              
              // Filter by time range if provided
              if ((startTime === undefined || timestamp >= startTime) && timestamp <= endTime) {
                result.push({
                  open: parseFloat(klineData.open || '0'),
                  high: parseFloat(klineData.high || '0'),
                  low: parseFloat(klineData.low || '0'),
                  close: parseFloat(klineData.close || '0'),
                  volume: parseFloat(klineData.volume || '0'),
                  timestamp: timestamp,
                  tokenAddress: klineData.token_address || tokenAddress,
                  platform: klineData.platform || ''
                });
              }
            }
          }
        }
      }
      
      // Sort by timestamp
      result.sort((a, b) => a.timestamp - b.timestamp);
      
      return result;
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error retrieving all K-line data');
      return [];
    }
  }
  
  /**
   * Saves a trade to Redis for analysis
   * @param trade The trade to save
   */
  async saveTrade(trade: Trade): Promise<void> {
    try {
      // 生成交易数据的键，格式为 trade:{tokenAddress}:{timestamp}:{user}
      const tradeKey = `trade:${trade.tokenAddress}:${trade.timestamp}:${trade.user}`;
      
      // 保存交易数据
      await this.redis.hmset(tradeKey, {
        tokenAddress: trade.tokenAddress,
        price: trade.price.toString(),
        amount: trade.amount.toString(),
        solAmount: trade.solAmount.toString(),
        isBuy: trade.isBuy.toString(),
        user: trade.user,
        timestamp: trade.timestamp.toString(),
        slot: trade.slot.toString(),
        virtualSolReserves: trade.virtualSolReserves.toString(),
        realSolReserves: trade.realSolReserves.toString(),
        virtualTokenReserves: trade.virtualTokenReserves.toString(),
        realTokenReserves: trade.realTokenReserves.toString(),
        platform: trade.platform
      });
      
      // 设置过期时间
      await this.redis.expire(tradeKey, TRADE_DATA_EXPIRY);
      
      // 添加到按slot索引的集合中
      await this.redis.sadd(`trades:slot:${trade.slot}`, tradeKey);
      await this.redis.expire(`trades:slot:${trade.slot}`, TRADE_DATA_EXPIRY);
      
      // 添加到按用户索引的集合中
      await this.redis.sadd(`trades:user:${trade.user}`, tradeKey);
      await this.redis.expire(`trades:user:${trade.user}`, TRADE_DATA_EXPIRY);
      
      // 添加到按代币索引的集合中
      await this.redis.sadd(`trades:token:${trade.tokenAddress}`, tradeKey);
      await this.redis.expire(`trades:token:${trade.tokenAddress}`, TRADE_DATA_EXPIRY);
      
      logger.debug({ tradeKey }, 'Saved trade data to Redis');
    } catch (error) {
      logger.error({ error, trade }, 'Error saving trade data to Redis');
    }
  }

  /**
   * Find wallets that traded in the same or adjacent slots
   * @param slot The slot number to check
   * @param tokenAddress Optional token address to filter by
   * @returns Array of user wallet addresses
   */
  async findRelatedWallets(slot: number, tokenAddress?: string): Promise<string[]> {
    try {
      const wallets = new Set<string>();
      
      // 获取当前区块的交易
      const currentSlotTrades = await this.redis.smembers(`trades:slot:${slot}`);
      // 获取下一个区块的交易
      const nextSlotTrades = await this.redis.smembers(`trades:slot:${slot + 1}`);
      
      // 合并交易列表
      const allTradeKeys = [...currentSlotTrades, ...nextSlotTrades];
      
      // 如果没有交易，返回空数组
      if (allTradeKeys.length === 0) {
        return [];
      }
      
      // 遍历所有交易，提取钱包地址
      for (const tradeKey of allTradeKeys) {
        const tradeData = await this.redis.hgetall(tradeKey);
        
        // 如果指定了代币地址，只处理该代币的交易
        if (tokenAddress && tradeData.tokenAddress !== tokenAddress) {
          continue;
        }
        
        if (tradeData.user) {
          wallets.add(tradeData.user);
        }
      }
      
      return Array.from(wallets);
    } catch (error) {
      logger.error({ error, slot }, 'Error finding related wallets');
      return [];
    }
  }

  /**
   * Get all trades for a specific token
   * @param tokenAddress The token address to get trades for
   * @param startTime Optional start time in UTC timestamp (milliseconds)
   * @param endTime Optional end time in UTC timestamp (milliseconds)
   * @returns Array of trades
   */
  async getTokenTrades(
    tokenAddress: string,
    startTime?: number,
    endTime?: number
  ): Promise<Trade[]> {
    try {
      const tradeKeys = await this.redis.smembers(`trades:token:${tokenAddress}`);
      const trades: Trade[] = [];
      
      for (const key of tradeKeys) {
        const data = await this.redis.hgetall(key);
        if (Object.keys(data).length === 0) continue;
        
        const timestamp = parseInt(data.timestamp);
        
        // 如果指定了时间范围，过滤交易
        if ((startTime === undefined || timestamp >= startTime) && 
(endTime === undefined || timestamp <= endTime)) {
          trades.push({
            tokenAddress: data.tokenAddress,
            price: parseFloat(data.price),
            amount: BigInt(data.amount),
            solAmount: BigInt(data.solAmount),
            isBuy: data.isBuy === 'true',
            user: data.user,
            timestamp: timestamp,
            slot: parseInt(data.slot),
            virtualSolReserves: BigInt(data.virtualSolReserves),
            realSolReserves: BigInt(data.realSolReserves),
            virtualTokenReserves: BigInt(data.virtualTokenReserves),
            realTokenReserves: BigInt(data.realTokenReserves),
            platform: data.platform
          });
        }
      }
      
      // 按时间排序
      trades.sort((a, b) => a.timestamp - b.timestamp);
      
      return trades;
    } catch (error) {
      logger.error({ error, tokenAddress }, 'Error getting token trades');
      return [];
    }
  }

  /**
   * Get all trades for a specific user wallet address
   * @param userAddress The user wallet address to get trades for
   * @returns Array of trades
   */
  async getUserTrades(userAddress: string): Promise<Trade[]> {
    try {
      const userTradeSetKey = `trades:user:${userAddress}`;
      const tradeKeys = await this.redis.smembers(userTradeSetKey);

      if (!tradeKeys || tradeKeys.length === 0) {
        logger.info({ userAddress }, 'No trades found for this user');
        return [];
      }

      logger.debug({ userAddress, count: tradeKeys.length }, 'Found trade keys for user');

      const trades: Trade[] = [];
      for (const tradeKey of tradeKeys) {
        const data = await this.redis.hgetall(tradeKey);

        if (data && Object.keys(data).length > 0) {
          try {
            trades.push({
              tokenAddress: data.tokenAddress,
              price: parseFloat(data.price),
              amount: BigInt(data.amount),
              solAmount: BigInt(data.solAmount),
              isBuy: data.isBuy === 'true',
              user: data.user,
              timestamp: parseInt(data.timestamp),
              slot: parseInt(data.slot),
              virtualSolReserves: BigInt(data.virtualSolReserves),
              realSolReserves: BigInt(data.realSolReserves),
              virtualTokenReserves: BigInt(data.virtualTokenReserves),
              realTokenReserves: BigInt(data.realTokenReserves),
              platform: data.platform
            });
          } catch (parseError) {
             logger.error({ error: parseError, tradeKey, data }, 'Error parsing trade data from Redis hash');
          }
        } else {
           logger.warn({ tradeKey }, 'Trade key found in set but hash data is missing or empty');
        }
      }

      // Sort by timestamp ascending
      trades.sort((a, b) => a.timestamp - b.timestamp);

      logger.info({ userAddress, tradeCount: trades.length }, 'Successfully retrieved user trades');
      return trades;
    } catch (error) {
      logger.error({ error, userAddress }, 'Error retrieving trades for user');
      return [];
    }
  }

  /**
   * Closes the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Redis connection closed');
  }
}

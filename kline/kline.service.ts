import { RedisKLineService } from './redis.service';
import { PostgresKLineService } from './postgres.service';
import { KLine, KLineInterval, Trade } from './types';
import { logger } from '../helpers';

const KLINE_DATA_EXPIRY= 60 * 60 * 4; //4小时
const TRADE_DATA_EXPIRY = 60 * 60 * 4; // 1 days in seconds
/**
 * Main service for managing K-line data across Redis and PostgreSQL
 */
export class KLineService {
  private redisService: RedisKLineService;
  private postgresService: PostgresKLineService | null = null;
  private persistenceEnabled: boolean = false;
  private persistenceInterval: NodeJS.Timeout | null = null;


  constructor(
    redisConfig: { 
      host: string; 
      port: number; 
      path?: string; 
      useSocket?: boolean 
    } = { 
      host: 'localhost', 
      port: 6379, 
      path: '', 
      useSocket: false 
    },
    postgresConfig?: {
      host: string;
      database: string;
      user: string;
      password?: string;
      port?: number;
    }
  ) {
    // Initialize Redis service
    this.redisService = new RedisKLineService(redisConfig.host, redisConfig.port, redisConfig.path, redisConfig.useSocket);
    
    // Initialize PostgreSQL service if config is provided
    if (postgresConfig) {
      this.postgresService = new PostgresKLineService(postgresConfig);
      this.persistenceEnabled = true;
    }
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize PostgreSQL tables if persistence is enabled
      if (this.persistenceEnabled && this.postgresService) {
        await this.postgresService.initializeTables();
        
        // Set up periodic persistence to PostgreSQL
        this.startPersistenceJob();
      }
      
      logger.info('K-line service initialized');
    } catch (error) {
      logger.error({ error }, 'Error initializing K-line service');
      throw error;
    }
  }

  /**
   * Process a trade event and update K-line data using Redis pipeline
   */
  async processTrade(trade: Trade): Promise<void> {
    try {
      // 获取Redis客户端实例以便创建pipeline
      const redis = this.redisService.getRedisClient();
      if (!redis) {
        logger.error('Redis client not available');
        return;
      }
      
      // 创建pipeline以批量执行所有Redis操作
      const pipeline = redis.pipeline();
      
      // 为saveTrade准备pipeline操作
      this.prepareSaveTradePipeline(pipeline, trade);
      
      // 为所有时间间隔的K线数据更新准备pipeline操作
      await Promise.all([
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.ONE_SECOND),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.FIFTEEN_SECONDS),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.ONE_MINUTE),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.FIVE_MINUTES),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.FIFTEEN_MINUTES),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.ONE_HOUR),
        /*  this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.FOUR_HOURS),
        this.prepareUpdateKLinePipeline(pipeline, trade, KLineInterval.ONE_DAY)  */
      ]);
      
      // 执行所有pipeline操作
      await pipeline.exec();
      
      logger.debug({ tokenAddress: trade.tokenAddress, price: trade.price }, 'Trade processed for K-line data using pipeline');
    } catch (error) {
      logger.error({ error, trade }, 'Error processing trade for K-line data');
    }
  }

  /**
   * 为 saveTrade 操作准备 Redis pipeline
   * @param pipeline Redis pipeline实例
   * @param trade 交易数据
   */
  private prepareSaveTradePipeline(pipeline: any, trade: Trade): void {
    try {
      // 生成交易数据的键，格式为 trade:{tokenAddress}:{timestamp}:{user}
      const tradeKey = `trade:${trade.tokenAddress}:${trade.timestamp}:${trade.user}`;
      
      // 使用pipeline保存交易数据
      pipeline.hmset(tradeKey, {
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

      pipeline.expire(tradeKey, TRADE_DATA_EXPIRY);
      
      // 添加到按slot索引的集合中
      pipeline.sadd(`trades:slot:${trade.slot}`, tradeKey);
      pipeline.expire(`trades:slot:${trade.slot}`, TRADE_DATA_EXPIRY);
      
      // 添加到按用户索引的集合中
      pipeline.sadd(`trades:user:${trade.user}`, tradeKey);
      pipeline.expire(`trades:user:${trade.user}`, TRADE_DATA_EXPIRY);
      
      // 添加到按代币索引的集合中
      pipeline.sadd(`trades:token:${trade.tokenAddress}`, tradeKey);
      pipeline.expire(`trades:token:${trade.tokenAddress}`, TRADE_DATA_EXPIRY);
    } catch (error) {
      logger.error({ error, trade }, 'Error preparing save trade pipeline');
    }
  }

  /**
   * 为 updateKLine 操作准备 Redis pipeline
   * @param pipeline Redis pipeline实例
   * @param trade 交易数据
   * @param interval 时间间隔
   */
  private async prepareUpdateKLinePipeline(pipeline: any, trade: Trade, interval: string): Promise<void> {
    try {
      // 获取Redis key
      const key = this.getKLineRedisKey(trade.tokenAddress, trade.timestamp, interval);
      
      // 检查这是否是这个时间间隔的第一笔交易
      const exists = await this.redisService.getRedisClient().exists(key);
      
      if (!exists) {
        // 初始化第一笔交易的K线数据
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
        
        // 设置过期时间 (24小时)
        pipeline.expire(key, KLINE_DATA_EXPIRY);
      } else {
        // 获取当前的high和low值
        const currentData = await this.redisService.getRedisClient().hmget(key, 'high', 'low');
        const currentHigh = parseFloat(currentData[0] || '0');
        const currentLow = parseFloat(currentData[1] || trade.price.toString());
        
        // 计算新的high和low
        const high = Math.max(trade.price, currentHigh);
        const low = Math.min(trade.price, currentLow);
        
        // 更新high, low, close和volume
        pipeline
          .hset(key, 'high', high.toString())
          .hset(key, 'low', low.toString())
          .hset(key, 'close', trade.price.toString())
          .hincrbyfloat(key, 'volume', Number(trade.amount));
      }
    } catch (error) {
      logger.error({ error, trade, interval }, 'Error preparing update K-line pipeline');
    }
  }
  
  /**
   * 获取K线数据的Redis key
   * @param tokenAddress 代币地址
   * @param timestamp 时间戳
   * @param interval 时间间隔
   * @returns Redis key
   */
  private getKLineRedisKey(tokenAddress: string, timestamp: number, interval: string): string {
    // 使用UTC时区的时间
    const now = new Date(timestamp * 1000);
    
    // 为了确保时区一致性，明确使用UTC时间
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcSeconds = now.getUTCSeconds();
    const utcDate = now.getUTCDate();
    
    if (interval === KLineInterval.ONE_SECOND) {
      return `${tokenAddress}:kline_1s_${utcHours}:${utcMinutes}:${utcSeconds}`;
    }

    // For 5-second intervals
    if (interval === KLineInterval.FIVE_SECONDS) {
    const _secondBucket = Math.floor(utcSeconds / 5) * 5;
    return `${tokenAddress}:kline_5s_${utcHours}:${utcMinutes}:${_secondBucket}`;
    }
    // For 15-second intervals
    if (interval === KLineInterval.FIFTEEN_SECONDS) {
      const secondBucket = Math.floor(utcSeconds / 15) * 15;
      return `${tokenAddress}:kline_15s_${utcHours}:${utcMinutes}:${secondBucket}`;
    }
    
    // For 1-minute intervals
    if (interval === KLineInterval.ONE_MINUTE) {
      return `${tokenAddress}:kline_${utcHours}:${utcMinutes}`;
    }
    
    // For 5-minute intervals
    if (interval === KLineInterval.FIVE_MINUTES) {
      const minuteBucket = Math.floor(utcMinutes / 5) * 5;
      return `${tokenAddress}:kline_5m_${utcHours}:${minuteBucket}`;
    }
    
    // For 15-minute intervals
    if (interval === KLineInterval.FIFTEEN_MINUTES) {
      const minuteBucket = Math.floor(utcMinutes / 15) * 15;
      return `${tokenAddress}:kline_15m_${utcHours}:${minuteBucket}`;
    }
    
    // For 1-hour intervals
    if (interval === KLineInterval.ONE_HOUR) {
      return `${tokenAddress}:kline_1h_${utcHours}`;
    }
    
    // For 4-hour intervals
    if (interval === KLineInterval.FOUR_HOURS) {
      const hourBucket = Math.floor(utcHours / 4) * 4;
      return `${tokenAddress}:kline_4h_${hourBucket}`;
    }
    
    // For 1-day intervals
    if (interval === KLineInterval.ONE_DAY) {
      return `${tokenAddress}:kline_1d_${utcDate}`;
    }
    
    // Default to 1-minute if interval is not recognized
    return `${tokenAddress}:kline_${utcHours}:${utcMinutes}`;
  }

  /**
   * Start the periodic persistence job
   */
  private startPersistenceJob(): void {
    if (!this.persistenceEnabled || !this.postgresService) {
      return;
    }
    
    // Run persistence job every minute
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.persistKLines();
      } catch (error) {
        logger.error({ error }, 'Error in K-line persistence job');
      }
    }, 60000); // 1 minute
    
    logger.info('K-line persistence job started');
  }

  /**
   * Persist K-line data from Redis to PostgreSQL
   */
  private async persistKLines(): Promise<void> {
    if (!this.persistenceEnabled || !this.postgresService) {
      return;
    }
    
    try {
      // Get current time to determine which buckets to persist
      const now = new Date();
      const previousMinute = new Date(now.getTime() - 60000);
      
      // TODO: Implement logic to get all tokens that have K-line data in Redis
      // For now, this is a placeholder. In a real implementation, you would
      // need to track which tokens have been processed.
      const activeTokens: string[] = [];
      
      // For each token, persist its K-line data
      for (const token of activeTokens) {
        // Get K-line data for each interval
        const kline1s = await this.redisService.getKLine(token, KLineInterval.ONE_SECOND);
        const kline15s = await this.redisService.getKLine(token, KLineInterval.FIFTEEN_SECONDS);
        const kline1m = await this.redisService.getKLine(token, KLineInterval.ONE_MINUTE);
        const kline5m = await this.redisService.getKLine(token, KLineInterval.FIVE_MINUTES);
        const kline15m = await this.redisService.getKLine(token, KLineInterval.FIFTEEN_MINUTES);
        const kline1h = await this.redisService.getKLine(token, KLineInterval.ONE_HOUR);
        const kline4h = await this.redisService.getKLine(token, KLineInterval.FOUR_HOURS);
        const kline1d = await this.redisService.getKLine(token, KLineInterval.ONE_DAY);
        
        // Persist K-line data if available
        if (kline1s) await this.postgresService.persistKLine(kline1s, KLineInterval.ONE_SECOND);
        if (kline15s) await this.postgresService.persistKLine(kline15s, KLineInterval.FIFTEEN_SECONDS);
        if (kline1m) await this.postgresService.persistKLine(kline1m, KLineInterval.ONE_MINUTE);
        if (kline5m) await this.postgresService.persistKLine(kline5m, KLineInterval.FIVE_MINUTES);
        if (kline15m) await this.postgresService.persistKLine(kline15m, KLineInterval.FIFTEEN_MINUTES);
        if (kline1h) await this.postgresService.persistKLine(kline1h, KLineInterval.ONE_HOUR);
        if (kline4h) await this.postgresService.persistKLine(kline4h, KLineInterval.FOUR_HOURS);
        if (kline1d) await this.postgresService.persistKLine(kline1d, KLineInterval.ONE_DAY);
      }
      
      logger.debug('K-line data persisted to PostgreSQL');
    } catch (error) {
      logger.error({ error }, 'Error persisting K-line data to PostgreSQL');
    }
  }

  /**
   * Query K-line data for a specific token and time range from PostgreSQL
   * Use this for historical data queries
   */
  async queryKLines(
    tokenAddress: string,
    interval: KLineInterval = KLineInterval.ONE_SECOND,
    startTime: number,
    endTime: number = Date.now()
  ): Promise<KLine[]> {
    if (!this.persistenceEnabled || !this.postgresService) {
      logger.warn('PostgreSQL persistence is not enabled, cannot query historical K-line data');
      return [];
    }
    
    try {
      return await this.postgresService.queryKLines(tokenAddress, interval, new Date(startTime), new Date(endTime));
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error querying historical K-line data');
      return [];
    }
  }
  
  /**
   * Get recent K-line data for a specific token and interval from Redis
   * Use this for real-time data queries
   */
  async getRecentKLines(
    tokenAddress: string,
    interval: KLineInterval = KLineInterval.ONE_SECOND,
    startTime?: number,
    endTime: number = Date.now()
  ): Promise<KLine[]> {
    try {
      return await this.redisService.getAllKLines(tokenAddress, interval, startTime, endTime);
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error getting recent K-line data');
      return [];
    }
  }
  
  /**
   * Get all K-line data for a specific token and interval, combining both Redis and PostgreSQL data
   * This provides the most complete dataset but may be slower for large time ranges
   */
  async getAllKLines(
    tokenAddress: string,
    interval: KLineInterval = KLineInterval.ONE_SECOND,
    startTime: number,
    endTime: number = Date.now()
  ): Promise<KLine[]> {
    try {
      // Get data from both sources
      const recentData = await this.getRecentKLines(tokenAddress, interval, startTime, endTime);
      
      // If persistence is enabled, get historical data as well
      let historicalData: KLine[] = [];
      if (this.persistenceEnabled && this.postgresService) {
        historicalData = await this.queryKLines(tokenAddress, interval, startTime, endTime);
      }
      
      // Combine the data, removing duplicates based on timestamp
      const combinedData = [...historicalData];
      const timestamps = new Set(historicalData.map(kline => kline.timestamp));
      
      for (const kline of recentData) {
        if (!timestamps.has(kline.timestamp)) {
          combinedData.push(kline);
        }
      }
      
      // Sort by timestamp
      combinedData.sort((a, b) => a.timestamp - b.timestamp);
      
      return combinedData;
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error getting all K-line data');
      return [];
    }
  }

  /**
   * 获取代币的当前价格
   * @param tokenAddress 代币地址
   * @returns 当前价格，如果无法获取则返回null
   */
  async getCurrentPrice(tokenAddress: string, interval: KLineInterval = KLineInterval.ONE_SECOND): Promise<number | null> {
    try {
      // 尝试从1分钟K线获取最新价格
      const kline = await this.redisService.getKLine(tokenAddress, interval);
      
      if (kline) {
        // 返回收盘价作为当前价格
        return kline.close;
      }
      
      // 如果没有1分钟K线数据，尝试从其他时间周期获取
      const intervals = [
        KLineInterval.FIVE_SECONDS,
        KLineInterval.FIFTEEN_SECONDS,
        KLineInterval.FIVE_MINUTES,
        KLineInterval.FIFTEEN_MINUTES,
        KLineInterval.ONE_HOUR,
      ];
      
      for (const interval of intervals) {
        const kline = await this.redisService.getKLine(tokenAddress, interval);
        if (kline) {
          return kline.close;
        }
      }
      
    
      logger.warn({ tokenAddress }, 'No Current Price data available for token');
      return null;
    } catch (error) {
      logger.error({ error, tokenAddress }, 'Error getting current price for token');
      return null;
    }
  }

  /**
   * Stop the service and close connections
   */
  async stop(): Promise<void> {
    try {
      // Stop persistence job
      if (this.persistenceInterval) {
        clearInterval(this.persistenceInterval);
        this.persistenceInterval = null;
      }
      
      // Close Redis connection
      await this.redisService.close();
      
      // Close PostgreSQL connection if enabled
      if (this.persistenceEnabled && this.postgresService) {
        await this.postgresService.close();
      }
      
      logger.info('K-line service stopped');
    } catch (error) {
      logger.error({ error }, 'Error stopping K-line service');
    }
  }
}

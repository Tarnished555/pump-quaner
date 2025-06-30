import { Pool, PoolClient } from 'pg';
import { logger } from '../helpers';
import { KLine } from './types';

/**
 * Service for persisting K-line data in PostgreSQL
 */
export class PostgresKLineService {
  private pool: Pool;

  constructor(config: {
    host: string;
    database: string;
    user: string;
    password?: string;
    port?: number;
  }) {
    this.pool = new Pool({
      host: config.host,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 5432
    });

    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected PostgreSQL pool error');
    });
  }

  /**
   * Initialize database tables if they don't exist
   */
  async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create tables for different time intervals
      await client.query(`
        CREATE TABLE IF NOT EXISTS kline_15s (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_1m (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_5m (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_15m (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_1h (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_4h (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        CREATE TABLE IF NOT EXISTS kline_1d (
          id SERIAL PRIMARY KEY,
          token_address TEXT NOT NULL,
          bucket TIMESTAMP NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          platform VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(token_address, bucket)
        );
        
        -- Create indexes for faster queries
        CREATE INDEX IF NOT EXISTS idx_kline_15s_token_bucket ON kline_15s(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_1m_token_bucket ON kline_1m(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_5m_token_bucket ON kline_5m(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_15m_token_bucket ON kline_15m(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_1h_token_bucket ON kline_1h(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_4h_token_bucket ON kline_4h(token_address, bucket);
        CREATE INDEX IF NOT EXISTS idx_kline_1d_token_bucket ON kline_1d(token_address, bucket);
      `);
      
      logger.info('K-line database tables initialized');
    } catch (error) {
      logger.error({ error }, 'Error initializing K-line database tables');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Persist a K-line data point to PostgreSQL
   */
  async persistKLine(kline: KLine, interval: string = '1m'): Promise<void> {
    const client = await this.pool.connect();
    try {
      const tableName = `kline_${interval}`;
      
      // Round the timestamp to the appropriate interval bucket
      const bucket = this.getBucketTime(kline.timestamp, interval);
      
      await client.query(
        `INSERT INTO ${tableName} 
         (token_address, bucket, open, high, low, close, volume, platform)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (token_address, bucket) DO UPDATE SET
         high = GREATEST(${tableName}.high, EXCLUDED.high),
         low = LEAST(${tableName}.low, EXCLUDED.low),
         close = EXCLUDED.close,
         volume = ${tableName}.volume + EXCLUDED.volume`,
        [
          kline.tokenAddress,
          new Date(bucket).toISOString(),
          kline.open,
          kline.high,
          kline.low,
          kline.close,
          kline.volume,
          kline.platform
        ]
      );
      
      logger.debug({ tokenAddress: kline.tokenAddress, interval, bucket }, 'K-line data persisted to PostgreSQL');
    } catch (error) {
      logger.error({ error, kline, interval }, 'Error persisting K-line data to PostgreSQL');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate the appropriate time bucket for a given timestamp and interval
   */
  private getBucketTime(timestamp: number, interval: string): Date {
    const date = new Date(timestamp);
    date.setMilliseconds(0);
    
    switch (interval) {
      case '15s':
        // Round to the nearest 15 second interval
        date.setSeconds(Math.floor(date.getSeconds() / 15) * 15);
        break;
      case '1m':
        // Round to the minute
        date.setSeconds(0);
        break;
      case '5m':
        date.setSeconds(0);
        date.setMinutes(Math.floor(date.getMinutes() / 5) * 5);
        break;
      case '15m':
        date.setSeconds(0);
        date.setMinutes(Math.floor(date.getMinutes() / 15) * 15);
        break;
      case '1h':
        date.setSeconds(0);
        date.setMinutes(0);
        break;
      case '4h':
        date.setSeconds(0);
        date.setMinutes(0);
        date.setHours(Math.floor(date.getHours() / 4) * 4);
        break;
      case '1d':
        date.setSeconds(0);
        date.setMinutes(0);
        date.setHours(0);
        break;
      default:
        // Default to 1m if interval not recognized
        date.setSeconds(0);
        break;
    }
    
    return date;
  }

  /**
   * Query K-line data for a specific token and time range
   */
  async queryKLines(
    tokenAddress: string,
    interval: string = '1m',
    startTime: Date,
    endTime: Date = new Date()
  ): Promise<KLine[]> {
    const client = await this.pool.connect();
    try {
      const tableName = `kline_${interval}`;
      
      const result = await client.query(
        `SELECT 
          token_address as "tokenAddress",
          bucket as "timestamp",
          open, high, low, close, volume, platform
         FROM ${tableName}
         WHERE token_address = $1 AND bucket BETWEEN $2 AND $3
         ORDER BY bucket ASC`,
        [tokenAddress, startTime.toISOString(), endTime.toISOString()]
      );
      
      // Convert timestamp from Date to number (milliseconds since epoch)
      // and ensure all numeric fields are properly parsed as numbers
      return result.rows.map(row => ({
        tokenAddress: row.tokenAddress,
        timestamp: new Date(row.timestamp).getTime(),
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume),
        platform: row.platform
      }));
    } catch (error) {
      logger.error({ error, tokenAddress, interval }, 'Error querying K-line data from PostgreSQL');
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL connection pool closed');
  }
}

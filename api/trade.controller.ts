import { Request, Response } from 'express';
import { RedisKLineService } from '../kline/redis.service';
import { logger } from '../helpers';
import { REDIS_CONFIG } from '../kline/config';

// Create Redis service instance (Consider dependency injection for a shared instance later)
const redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);

/**
 * Handler for fetching recent trades for a specific token.
 */
export async function getRecentTrades(req: Request, res: Response) {
  const { walletAddress } = req.params;
  // Fetch last 50 trades by default, allow overriding via query param
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

  logger.info({ walletAddress, limit }, 'Fetching recent trades');

  try {
    // Fetch all trades for the token from Redis service
    let trades = await redisService.getUserTrades(walletAddress);

    // Sort descending by timestamp to get the most recent ones first
    trades.sort((a, b) => b.timestamp - a.timestamp);

    // Apply the limit
    const limitedTrades = trades.slice(0, limit);

    // Convert BigInt fields to strings for JSON serialization
    const tradesForJson = limitedTrades.map(trade => ({
      ...trade,
      amount: trade.amount.toString(),
      solAmount: trade.solAmount.toString(),
      virtualSolReserves: trade.virtualSolReserves.toString(),
      realSolReserves: trade.realSolReserves.toString(),
      virtualTokenReserves: trade.virtualTokenReserves.toString(),
      realTokenReserves: trade.realTokenReserves.toString(),
    }));

    res.json({
      success: true,
      data: tradesForJson, // Send trades with BigInts as strings
      count: tradesForJson.length
    });
  } catch (error) {
    logger.error({ error, walletAddress }, 'Error fetching recent trades');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent trades'
    });
  }
}

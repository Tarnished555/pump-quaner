import { Request, Response } from 'express';
import { RedisKLineService } from '../kline/redis.service';
import { KLineInterval } from '../kline/types';
import { logger } from '../helpers';
import { REDIS_CONFIG } from '../kline/config';

// 创建 Redis 服务实例
const redisService = new RedisKLineService(REDIS_CONFIG.host, REDIS_CONFIG.port, REDIS_CONFIG.path, REDIS_CONFIG.useSocket);

// 定义路由处理函数
export function getAllKLines(req: Request, res: Response) {
  const { tokenAddress } = req.params;
  const interval = req.query.interval as KLineInterval || KLineInterval.ONE_MINUTE;
  const startTime = req.query.startTime ? parseInt(req.query.startTime as string) : undefined;
  const endTime = req.query.endTime ? parseInt(req.query.endTime as string) : Date.now();
  
  logger.info({ tokenAddress, interval, startTime, endTime }, 'Fetching K-line data');
  
  redisService.getAllKLines(tokenAddress, interval, startTime, endTime)
    .then(klines => {
      res.json({
        success: true,
        data: klines,
        count: klines.length
      });
    })
    .catch(error => {
      logger.error({ error }, 'Error fetching K-line data');
      res.status(500).json({
        success: false,
        error: 'Failed to fetch K-line data'
      });
    });
}

export function getCurrentKLine(req: Request, res: Response) {
  const { tokenAddress } = req.params;
  const interval = req.query.interval as KLineInterval || KLineInterval.ONE_MINUTE;
  
  logger.info({ tokenAddress, interval }, 'Fetching current K-line data');
  
  redisService.getKLine(tokenAddress, interval)
    .then(kline => {
      if (!kline) {
        return res.status(404).json({
          success: false,
          error: 'K-line data not found'
        });
      }
      
      res.json({
        success: true,
        data: kline
      });
    })
    .catch(error => {
      logger.error({ error }, 'Error fetching current K-line data');
      res.status(500).json({
        success: false,
        error: 'Failed to fetch current K-line data'
      });
    });
}

// Remove getRecentTrades function as it's moved to trade.controller.ts

import express from 'express';
import cors from 'cors';
import { logger } from '../helpers/logger';
import klineRoutes from './kline.routes';
import tradeRoutes from './trade.routes';
import configRoutes from './config.routes';
import logRoutes from './log.routes';
import portfolioRoutes from './portfolio.routes';

// Express
const app = express();

// 中间件
app.use(cors());
app.use(express.json());


app.use('/api/kline', klineRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/config', configRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/portfolio', portfolioRoutes);

app.use(express.static('public'));

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, 'API error');
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 启动 API 服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`API Server listening on port ${PORT}`);
});

export default app;

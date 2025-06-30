import express from 'express';
import { getAllKLines, getCurrentKLine } from './kline.controller';
import tradeRoutes from './trade.routes';

// Create router instance
const router = express.Router();

// Define routes and associate them with controller handlers
router.get('/:tokenAddress', getAllKLines);
router.get('/:tokenAddress/current', getCurrentKLine);


// Export the router
export default router;

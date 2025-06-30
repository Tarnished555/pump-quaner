import express from 'express';
import { getRecentTrades } from './trade.controller';

// Create router instance
const router = express.Router({ mergeParams: true }); // mergeParams allows accessing :tokenAddress from parent router

// Define trade-specific routes
router.get('/:walletAddress', getRecentTrades);

// Export the router
export default router;

import express from 'express';
import { getAdditionalWallets } from './config.controller';

// Create router instance
const router = express.Router();

// Define config-specific routes
router.get('/additional-wallets', getAdditionalWallets);

// Export the router
export default router;

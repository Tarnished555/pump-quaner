import { Router, Request, Response } from 'express';
import { getPortfolio, sellAssetByMint } from './portfolio.controller';

const router = Router();

router.get('/:walletAddress', getPortfolio);

// Change route to use POST method
router.post('/sell/:mintAddress', sellAssetByMint);

export default router;

import express from 'express';
import { streamLogs } from './log.controller';

const router = express.Router();

// Define SSE route
router.get('/stream', streamLogs);

export default router;

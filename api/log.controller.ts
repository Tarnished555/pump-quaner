import { Request, Response } from 'express';
import { addSseClient, removeSseClient, logger } from '../helpers/logger'; // Corrected path

/**
 * Handler for streaming logs via SSE.
 */
export function streamLogs(req: Request, res: Response) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Send headers immediately

  // Add client to the list
  addSseClient(res);
  logger.info('SSE client connected for logs.');

  // Send a confirmation message (optional)
  res.write('data: { "message": "Connected to log stream" }\n\n');

  // Handle client disconnection
  req.on('close', () => {
    removeSseClient(res);
    logger.info('SSE client disconnected from logs.');
    res.end(); // Ensure the response is properly ended
  });
}

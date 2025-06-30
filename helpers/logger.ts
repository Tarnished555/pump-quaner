import pino from 'pino';
import { Response } from 'express'; // Import Response type
import { LOG_LEVEL } from './constants';
import { Writable } from 'stream'; // Import Writable

// Store connected SSE clients
let sseClients: Response[] = [];

// Function to add a client
export function addSseClient(client: Response) {
  sseClients.push(client);
  console.log(`SSE client connected. Total clients: ${sseClients.length}`);
}

// Function to remove a client
export function removeSseClient(client: Response) {
  sseClients = sseClients.filter(c => c !== client);
  console.log(`SSE client disconnected. Total clients: ${sseClients.length}`);
}

// Custom SSE Writable Stream
const sseStream = new Writable({
  write(chunk, encoding, callback) {
    // Assuming chunk is a buffer, convert to string
    const logMessage = chunk.toString();
    sseClients.forEach(client => {
      try {
        // Format as SSE message: data: {log}\n\n
        client.write(`data: ${JSON.stringify(logMessage)}\n\n`); // Send JSON stringified log
      } catch (error) {
        console.error('Error sending log to SSE client:', error);
        // Optionally remove broken client here
        // removeSseClient(client);
      }
    });
    callback(); // Important: Signal that write is complete
  }
});

// Original transport setup (console and file)
const transport = pino.transport({
  targets: [
    {
      level: LOG_LEVEL,
      target: 'pino-pretty', // Target for console output
      options: { 
        colorize: true, 
        translateTime: 'SYS:standard',
      },
    },
    {
      level: LOG_LEVEL,
      target: 'pino/file',    // Target for file output
      options: { destination: './app.log' },
    },
  ]
});

// Print the actual log level being used for debugging purposes
console.log('Setting up logger with LOG_LEVEL:', LOG_LEVEL);

// Override the transport configuration to ensure debug logs are displayed
const debugTransport = pino.transport({
  targets: [
    {
      level: 'debug', // Explicitly set to debug level
      target: 'pino-pretty', // Target for console output
      options: { 
        colorize: true, 
        translateTime: 'SYS:standard',
      },
    },
    {
      level: 'debug', // Explicitly set to debug level
      target: 'pino/file',    // Target for file output
      options: { destination: './app.log' },
    },
  ]
});

export const logger = pino(
  {
    level: 'debug', // Explicitly set to debug level (numeric value 20)
    timestamp: () => `,"time":"${new Date().toISOString().replace('T', ' ').substring(0, 19)}"`, // Format timestamp as YYYY-MM-DD HH:MM:SS
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      error: pino.stdSerializers.err,
    },
  },
  // Combine original transport with our custom SSE stream
  pino.multistream([
    debugTransport, 
    { stream: sseStream, level: 'debug' }
  ])
);

// K-line data types

/**
 * Represents a trade event from PumpFun
 */
export interface Trade {
  tokenAddress: string;  // Mint address of the token
  price: number;         // Price in quote token
  amount: BigInt;        // Amount of tokens traded
  solAmount: BigInt;     // Amount of SOL traded
  isBuy: boolean;        // Whether the trade was a buy
  timestamp: number;       // Time of the trade
  user: string;          // User address        
  slot: number;  // Blockchain slot

  virtualSolReserves: BigInt; // Virtual SOL reserves
  realSolReserves: BigInt;    // Real SOL reserves
  virtualTokenReserves: BigInt; // Virtual token reserves
  realTokenReserves: BigInt;   // Real token reserves
  platform: string; // Platform pumpfun or pumpswap
}

/**
 * Represents a K-line (candlestick) data point
 */
export interface KLine {
  open: number;      // Opening price for the period
  high: number;      // Highest price during the period
  low: number;       // Lowest price during the period
  close: number;     // Closing price for the period
  volume: number;    // Total trading volume during the period
  timestamp: number;   // Start time of this K-line period
  tokenAddress: string; // The token this K-line represents
  platform: string; // Platform pumpfun or pumpswap
}

/**
 * Supported K-line time intervals
 */
export enum KLineInterval {
  ONE_SECOND = '1s',
  FIVE_SECONDS='5s',
  FIFTEEN_SECONDS = '15s',
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  ONE_DAY = '1d'
}

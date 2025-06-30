import { BuyEvent, SellEvent } from '../types/types';
import { Trade } from './types';
import { logger } from '../helpers';
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Convert a PumpSwap BuyEvent to our internal Trade format
 */
export function convertPumpSwapBuyToTrade(event: BuyEvent, slot: number, mintAddress: string): Trade | null {
  try {
    // Extract values from the BuyEvent
    const tokenAmount = event.base_amount_out;
    const solAmount = event.quote_amount_in;
    
   // For a buy event, we use the ratio of quote_token (SOL) to base_token (the token)
    const price = Number(event.pool_quote_token_reserves) / LAMPORTS_PER_SOL / 
                 (Number(event.pool_base_token_reserves) / 10 ** 6);
    
    return {
      tokenAddress: mintAddress,
      price: price,
      amount: tokenAmount,
      solAmount: solAmount,
      isBuy: true,
      user: event.user.toString(),
      timestamp: event.timestamp,
      slot: slot,
      virtualSolReserves: BigInt(0), // PumpSwap doesn't have virtual reserves concept
      realSolReserves: event.pool_quote_token_reserves,
      virtualTokenReserves: BigInt(0), // PumpSwap doesn't have virtual reserves concept
      realTokenReserves: event.pool_base_token_reserves,
      platform: 'pumpswap'
    };
  } catch (error) {
    logger.error({ error, event }, 'Error converting PumpSwap buy event to Trade');
    return null;
  }
}

/**
 * Convert a PumpSwap SellEvent to our internal Trade format
 */
export function convertPumpSwapSellToTrade(event: SellEvent, slot: number, mintAddress: string): Trade | null {
  try {

    const tokenAmount = event.base_amount_in;
    const solAmount = event.quote_amount_out;
    
    // Calculate price based on the pool reserves
    const price = Number(event.pool_quote_token_reserves) / LAMPORTS_PER_SOL / 
                 (Number(event.pool_base_token_reserves) / 10 ** 6);
    
    return {
      tokenAddress: mintAddress,
      price: price,
      amount: tokenAmount,
      solAmount: solAmount,
      isBuy: false,
      user: event.user.toString(),
      timestamp: event.timestamp,
      slot: slot,
      virtualSolReserves: BigInt(0), // PumpSwap doesn't have virtual reserves concept
      realSolReserves: event.pool_quote_token_reserves,
      virtualTokenReserves: BigInt(0), // PumpSwap doesn't have virtual reserves concept
      realTokenReserves: event.pool_base_token_reserves,
      platform: 'pumpswap'
    };
  } catch (error) {
    logger.error({ error, event }, 'Error converting PumpSwap sell event to Trade');
    return null;
  }
}

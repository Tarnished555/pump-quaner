import { TradeEvent} from '../types/types';
import { Trade } from "./types";
import { logger } from '../helpers';
/**
 * Convert a PumpFun TradeEvent to our internal Trade format
 */
export function convertPumpFunTradeToTrade(event: TradeEvent, slot?: number): Trade | null {
  try {

    const _amount = event.tokenAmount;
    const _solAmount = event.solAmount;
    const _price = event.price;
    return {
      tokenAddress: event.mint.toString(),
      price:_price,
      amount:_amount,
      solAmount:_solAmount,
      isBuy: event.isBuy,
      user: event.user.toString(),
      timestamp: event.timestamp,
      slot: slot || 0,
      virtualSolReserves: event.virtualSolReserves,
      realSolReserves: event.realSolReserves,
      virtualTokenReserves: event.virtualTokenReserves,
      realTokenReserves: event.realTokenReserves,
      platform: 'pumpfun'
    };
  } catch (error) {
    logger.error({ error, event }, 'Error converting PumpFun trade event to Trade');
    return null;
  }
}

import { PublicKey } from '@solana/web3.js';


export type TradeEvent = {
  mint: PublicKey;
  solAmount: bigint;
  tokenAmount: bigint;
  isBuy: boolean;
  user: PublicKey;
  price: number;
  timestamp: number;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
};
// Define event types based on IDL - using snake_case to match Anchor's generated events
export type BuyEvent = {
  timestamp: number;
  base_amount_out: bigint;
  max_quote_amount_in: bigint;
  user_base_token_reserves: bigint;
  user_quote_token_reserves: bigint;
  pool_base_token_reserves: bigint;
  pool_quote_token_reserves: bigint;
  quote_amount_in: bigint;
  quote_amount_in_with_lp_fee: bigint;
  user_quote_amount_in: bigint;
  pool: PublicKey;
  user: PublicKey;
  user_base_token_account: PublicKey;
  user_quote_token_account: PublicKey;
  protocol_fee_recipient: PublicKey;
  protocol_fee_recipient_token_account: PublicKey;
};

export type SellEvent = {
  timestamp: number;
  base_amount_in: bigint;
  min_quote_amount_out: bigint;
  user_base_token_reserves: bigint;
  user_quote_token_reserves: bigint;
  pool_base_token_reserves: bigint;
  pool_quote_token_reserves: bigint;
  quote_amount_out: bigint;
  quote_amount_out_without_lp_fee: bigint;
  user_quote_amount_out: bigint;
  pool: PublicKey;
  user: PublicKey;
  user_base_token_account: PublicKey;
  user_quote_token_account: PublicKey;
  protocol_fee_recipient: PublicKey;
  protocol_fee_recipient_token_account: PublicKey;
};



export interface PumpAmmEventHandlers {
  buyEvent: BuyEvent;
  sellEvent: SellEvent;

}

export type PumpAmmEventType = keyof PumpAmmEventHandlers;
import {
    Commitment,
    Connection,
    Finality,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction, 
    SystemProgram, 
    LAMPORTS_PER_SOL,
    ComputeBudgetProgram,
    TransactionMessage,
    VersionedTransaction
  } from "@solana/web3.js";
import { Program, Provider } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction
} from "@solana/spl-token";
import { PumpAmmIDL, IDL } from "./IDL/index";

import {getBuyTokenAmount, 
  calculateWithSlippageBuy, 
  getPumpSwapPool} from "./pool";


import{ 
   logger,getSPLTokenBalance,
   RPC_ENDPOINT,
   RPC_WEBSOCKET_ENDPOINT,
   COMMITMENT_LEVEL,
   COMPUTE_UNIT_LIMIT,
   COMPUTE_UNIT_PRICE
  } from "./helpers"
import { TokenInfo } from "./types";
const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});
// Define static public keys
const PUMP_AMM_PROGRAM_ID: PublicKey = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM_ID: PublicKey = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL_TOKEN_ACCOUNT: PublicKey = new PublicKey('So11111111111111111111111111111111111111112');
const global = new PublicKey('ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw');
const eventAuthority = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
const feeRecipient = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
const feeRecipientAta = new PublicKey('94qWNrtmfn42h3ZjUZwWvK1MEo9uVmmrBPd2hpNjYDjb');
const BUY_DISCRIMINATOR: Uint8Array = new Uint8Array([102,6,61,18,1,218,235,234]);
const SELL_DISCRIMINATOR: Uint8Array = new Uint8Array([51,230,133,164,1,127,131,173]);

  
export const DEFAULT_DECIMALS = 6;

export class PumpSwapSDK {
  public program: Program<PumpAmmIDL>;
  public connection: Connection;
  constructor(provider: Provider) {
    this.program = new Program<PumpAmmIDL>(IDL as PumpAmmIDL, provider);
    this.connection = this.program.provider.connection;
  }
  public async buy(mint:PublicKey, user:Keypair, solToBuy:number,slippage:number=25){
    const bought_token_amount = await getBuyTokenAmount(BigInt(solToBuy*LAMPORTS_PER_SOL), mint);
    logger.info(
      {
        status:`finding pumpswap pool for ${mint}`
      }
    )
    const pool = await getPumpSwapPool(mint)
    const pumpswap_buy_tx = await this.createBuyInstruction(pool, user.publicKey, mint, bought_token_amount, BigInt(Math.floor(solToBuy*(1+slippage/100)*LAMPORTS_PER_SOL)));
    const ata = getAssociatedTokenAddressSync(mint, user.publicKey);
    const ix_list:any[] =[
        ...[
          ComputeBudgetProgram.setComputeUnitLimit({
            units: COMPUTE_UNIT_LIMIT,
          }),
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: COMPUTE_UNIT_PRICE
          })
        ],

          createAssociatedTokenAccountIdempotentInstruction(
          user.publicKey,
          ata,
          user.publicKey,
          mint
          ),
          pumpswap_buy_tx
      ]

      const latestBlockhash = await connection.getLatestBlockhash();

      const messageV0 = new TransactionMessage({
      payerKey: user.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: ix_list,
    }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([user]);
      return transaction;
  }

  
  
  async createBuyInstruction(
      poolId: PublicKey,
      user: PublicKey,
      mint: PublicKey,
      baseAmountOut: bigint, // Use bigint for u64
      maxQuoteAmountIn: bigint // Use bigint for u64
    ): Promise<TransactionInstruction> {
    
      // Compute associated token account addresses
      const userBaseTokenAccount = await getAssociatedTokenAddress(mint, user);
      const userQuoteTokenAccount = await getAssociatedTokenAddress(WSOL_TOKEN_ACCOUNT, user);
      const poolBaseTokenAccount = await getAssociatedTokenAddress(mint, poolId, true);
    
      const poolQuoteTokenAccount = await getAssociatedTokenAddress(WSOL_TOKEN_ACCOUNT, poolId, true);
    
      // Define the accounts for the instruction
      const accounts = [
        { pubkey: poolId, isSigner: false, isWritable: false }, // pool_id (readonly)
        { pubkey: user, isSigner: true, isWritable: true }, // user (signer)
        { pubkey: global, isSigner: false, isWritable: false }, // global (readonly)
        { pubkey: mint, isSigner: false, isWritable: false }, // mint (readonly)
        { pubkey: WSOL_TOKEN_ACCOUNT, isSigner: false, isWritable: false }, // WSOL_TOKEN_ACCOUNT (readonly)
        { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // user_base_token_account
        { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // user_quote_token_account
        { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // pool_base_token_account
        { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // pool_quote_token_account
        { pubkey: feeRecipient, isSigner: false, isWritable: false }, // fee_recipient (readonly)
        { pubkey: feeRecipientAta, isSigner: false, isWritable: true }, // fee_recipient_ata
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // TOKEN_PROGRAM_ID (readonly)
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // TOKEN_PROGRAM_ID (readonly, duplicated as in Rust)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System Program (readonly)
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // ASSOCIATED_TOKEN_PROGRAM_ID (readonly)
        { pubkey: eventAuthority, isSigner: false, isWritable: false }, // event_authority (readonly)
        { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false }, // PUMP_AMM_PROGRAM_ID (readonly)
      ];
    
      // Pack the instruction data: discriminator (8 bytes) + base_amount_in (8 bytes) + min_quote_amount_out (8 bytes)
      const data = Buffer.alloc(8 + 8 + 8); // 24 bytes total
      data.set(BUY_DISCRIMINATOR, 0); 
      data.writeBigUInt64LE(BigInt(baseAmountOut), 8); // Write base_amount_out as little-endian u64
      data.writeBigUInt64LE(BigInt(maxQuoteAmountIn), 16); // Write max_quote_amount_in as little-endian u64
    
      // Create the transaction instruction
      return new TransactionInstruction({
        keys: accounts,
        programId: PUMP_AMM_PROGRAM_ID,
        data: data,
      });
    }

  async createSellInstruction(
    creator:PublicKey,
    poolId: PublicKey,
    user: PublicKey,
    mint: PublicKey,
    baseAmountIn: bigint, // Use bigint for u64
    minQuoteAmountOut: bigint // Use bigint for u64
  ): Promise<TransactionInstruction> {
    // Compute associated token account addresses
    const userBaseTokenAccount = await getAssociatedTokenAddress(mint, user);
    const userQuoteTokenAccount = await getAssociatedTokenAddress(WSOL_TOKEN_ACCOUNT, user);
    const poolBaseTokenAccount = await getAssociatedTokenAddress(mint, poolId, true);
    const poolQuoteTokenAccount = await getAssociatedTokenAddress(WSOL_TOKEN_ACCOUNT, poolId, true);
    
    // 获取 coinCreatorVaultAuthority 和 coinCreatorVaultAta
  
    
    // 创建 coinCreatorVaultAuthority PDA
    const [coinCreatorVaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator_vault"), creator.toBuffer()],
      PUMP_AMM_PROGRAM_ID
    );
    
    // 获取 coinCreatorVaultAta
    const coinCreatorVaultAta = await getAssociatedTokenAddress(
      WSOL_TOKEN_ACCOUNT, // quoteMint 是 WSOL
      coinCreatorVaultAuthority,
      true
    );
  
    // Define the accounts for the instruction
    const accounts = [
      { pubkey: poolId, isSigner: false, isWritable: false }, // pool
      { pubkey: user, isSigner: true, isWritable: true }, // user (signer)
      { pubkey: global, isSigner: false, isWritable: false }, // globalConfig
      { pubkey: mint, isSigner: false, isWritable: false }, // baseMint
      { pubkey: WSOL_TOKEN_ACCOUNT, isSigner: false, isWritable: false }, // quoteMint
      { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true }, // userBaseTokenAccount
      { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true }, // userQuoteTokenAccount
      { pubkey: poolBaseTokenAccount, isSigner: false, isWritable: true }, // poolBaseTokenAccount
      { pubkey: poolQuoteTokenAccount, isSigner: false, isWritable: true }, // poolQuoteTokenAccount
      { pubkey: feeRecipient, isSigner: false, isWritable: false }, // protocolFeeRecipient
      { pubkey: feeRecipientAta, isSigner: false, isWritable: true }, // protocolFeeRecipientTokenAccount
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // baseTokenProgram
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // quoteTokenProgram
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associatedTokenProgram
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // eventAuthority
      { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false }, // program
      { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true }, // coinCreatorVaultAta
      { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false } // coinCreatorVaultAuthority
    ];

    // Pack the instruction data: discriminator (8 bytes) + base_amount_in (8 bytes) + min_quote_amount_out (8 bytes)
    const data = Buffer.alloc(8 + 8 + 8); // 24 bytes total
    data.set(SELL_DISCRIMINATOR, 0); 
    data.writeBigUInt64LE(BigInt(baseAmountIn), 8); // Write base_amount_in as little-endian u64
    data.writeBigUInt64LE(BigInt(minQuoteAmountOut), 16); // Write min_quote_amount_out as little-endian u64

    // Create the transaction instruction
    return new TransactionInstruction({
      keys: accounts,
      programId: PUMP_AMM_PROGRAM_ID,
      data: data,
    });
  }
}
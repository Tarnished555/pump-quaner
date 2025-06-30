import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
 
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  RawAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Liquidity, LiquidityPoolKeysV4, LiquidityStateV4, Percent, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { MarketCache, PoolCache, SnipeListCache } from './cache';
import { PoolFilters } from './filters';
import { TokenInfoService } from './services/token-info.service';
import { TransactionExecutor } from './transactions';
import { createPoolKeys, logger, NETWORK, sleep } from './helpers';
import { Mutex } from 'async-mutex';
import BN from 'bn.js';
import { WarpTransactionExecutor } from './transactions/warp-transaction-executor';
import { JitoTransactionExecutor } from './transactions/jito-rpc-transaction-executor';

import {pumpSwap, LookupTablesConfig} from "./tokenCreateAndBuy";
import { getLatestSlot, getLatestBlockhash ,COMMITMENT_LEVEL} from "./helpers";
import { PriorityFee, buildVersionedTx,DEFAULT_COMMITMENT } from 'pumpdotfun-sdk';
import { PumpSwapSDK } from './pumpswap';
import { PumpFunSDK } from './pumpfun-sdk';
import {getPumpSwapPool} from './pool';

export interface BotConfig {
  wallet: Keypair; // 主钱包用于支付交易费用
  pumpFunSDK: PumpFunSDK;
  pumpSwapSDK: PumpSwapSDK;
  additionalWallets?: Keypair[]; // 备用钱包列表
  checkRenounced: boolean;
  checkFreezable: boolean;
  checkBurned: boolean;
  quoteToken: Token;
  quoteAmount: TokenAmount;
  quoteAtas: PublicKey[];
  oneTokenAtATime: boolean;
  useSnipeList: boolean;
  autoSell: boolean;
  autoBuyDelay: number;
  autoSellDelay: number;
  maxBuyRetries: number;
  maxSellRetries: number;
  unitLimit: number;
  unitPrice: number;
  takeProfit: number;
  stopLoss: number;
  buySlippage: number;
  buyAmountSol: number;
  jitoTip: string;
  sellSlippage: number;
  priceCheckInterval: number;
  priceCheckDuration: number;
  filterCheckInterval: number;
  filterCheckDuration: number;
  consecutiveMatchCount: number;
  lookupTablesConfig: LookupTablesConfig;
}

export class Bot {
  private readonly poolFilters: PoolFilters;

  // snipe list
  private readonly snipeListCache?: SnipeListCache;

  // one token at the time
  private readonly mutex: Mutex;
  private sellExecutionCount = 0;
  public readonly isWarp: boolean = false;
  public readonly isJito: boolean = false;
  
  // 钱包地址到 Keypair 的映射
  private readonly walletAddressToKeypair: Map<string, Keypair> = new Map();
  
  // 已购买的代币集合
  private readonly purchasedTokens: Set<string> = new Set<string>();

  constructor(
    private readonly pumpFunSDK: PumpFunSDK,
    private readonly pumpSwapSDK: PumpSwapSDK,
    private readonly connection: Connection,
    private readonly marketStorage: MarketCache,
    private readonly poolStorage: PoolCache,
    private readonly txExecutor: TransactionExecutor,
    readonly config: BotConfig,
    private readonly tokenInfoService?: TokenInfoService
  ) {
    this.isWarp = txExecutor instanceof WarpTransactionExecutor;
    this.isJito = txExecutor instanceof JitoTransactionExecutor;

    this.mutex = new Mutex();
    
    // 初始化钱包地址到 Keypair 的映射
    // 添加主钱包
    this.walletAddressToKeypair.set(config.wallet.publicKey.toString(), config.wallet);
    
    // 添加备用钱包（如果有）
    if (config.additionalWallets && config.additionalWallets.length > 0) {
      for (const wallet of config.additionalWallets) {
        this.walletAddressToKeypair.set(wallet.publicKey.toString(), wallet);
      }
    }
    this.poolFilters = new PoolFilters(connection, {
      quoteToken: this.config.quoteToken,
    }, this.tokenInfoService);

  }

  async validate() {
    try {
      for (const quoteAta of this.config.quoteAtas) {
        await getAccount(this.connection, quoteAta, this.connection.commitment);
      }
    } catch (error) {
      logger.error(
        `${this.config.quoteToken.symbol} token account not found in wallet: `,
      );

    }

    return true;
  }

  public async pumpBuy(mintAddress: string) {
    if(this.purchasedTokens.has(mintAddress)){
      logger.info({ mint: mintAddress },`代币已经添加到了购买列表`)
      return

    }
    logger.info({ mint: mintAddress }, `Buying new token...`);
    if (this.config.oneTokenAtATime) {
      if (this.mutex.isLocked()) {
        logger.debug(
          { mint:mintAddress },
          `Skipping buy because one token at a time is turned on and token is already being processed`,
        );
        return;
      }

      await this.mutex.acquire();
    }

    try {

      const match = true//await this.filterMatch(mintAddress);

      if (!match) {
        logger.info({ mint: mintAddress }, `Skipping buy because conditions doesn't match filters`);
        return;
      }
      

      for (let i = 0; i < this.config.maxBuyRetries; i++) {
        try {
          logger.info(
            { mint: mintAddress},
            `Send buy transaction attempt: ${i + 1}/${this.config.maxBuyRetries}`,
          );
          // 使用全局缓存的blockhash变量
          const cachedBlockhash = getLatestBlockhash();
          
          // 如果全局缓存中没有blockhash，则仍然使用实时获取
          const latestBlockhash = cachedBlockhash || await this.connection.getLatestBlockhash();
          const mintPublicKey = new PublicKey(mintAddress); 

 
          const result = await pumpSwap(this.pumpFunSDK, latestBlockhash, this.config.buyAmountSol, Number(this.config.jitoTip), mintPublicKey, this.config.wallet, this.config.additionalWallets || [], this.config.buySlippage, this.config.lookupTablesConfig);

          if (result.confirmed) {
            // TODO: 设置入场价格
            this.purchasedTokens.add(mintAddress);

            logger.info(
              {
                mint: mintAddress,
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}`,
              },
              `Confirmed buy tx`,
            );

            break;
          }

          logger.info(
            {
              mint: mintAddress,
              signature: result.signature,
              error: result.error,
            },
            `Error confirming buy tx`,
          );
        } catch (error) {
          logger.debug({ mint: mintAddress, error }, `Error confirming buy transaction`);
        }
      }
    } catch (error) {
      logger.error({ mint: mintAddress, error }, `Failed to buy token`);
    } finally {
      if (this.config.oneTokenAtATime) {
        this.mutex.release();
      }
    }
  }

  public  async bondingCurveSell(seller: Keypair | string, mint: PublicKey, tokenAmount: bigint, priorityFees?: PriorityFee) {
    try {
      // 如果 user 是字符串，将其转换为 Keypair
      const userKeypair = typeof seller === 'string' ? this.getKeypairByWalletAddress(seller) : seller;
      
      logger.debug({ mint: mint.toString(), tokenAmount: tokenAmount.toString() }, 'Getting sell instructions');
      
      // Get sell instructions from the patched SDK
      let sellTxInstructions = await this.pumpFunSDK.getSellInstructionsByTokenAmount(
        userKeypair.publicKey,
        mint,
        tokenAmount,
        BigInt(this.config.sellSlippage*100),
        COMMITMENT_LEVEL,
      );
      
      // Create a new transaction
      let newTx = new Transaction();

      // Add priority fees if provided
      if (priorityFees) {
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: priorityFees.unitLimit,
        });
    
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFees.unitPrice,
        });
        newTx.add(modifyComputeUnits);
        newTx.add(addPriorityFee);
      }
    
      // Add all instructions from the sell transaction
      if (sellTxInstructions.instructions) {
        for (const instruction of sellTxInstructions.instructions) {
          newTx.add(instruction);
        }
      } else {
        logger.error({ mint: mint.toString() }, 'No sell instructions returned from SDK');
        throw new Error('No sell instructions returned from SDK');
      }
    
      // Build and sign the versioned transaction
      let versionedTx = await buildVersionedTx(this.connection, userKeypair.publicKey, newTx, DEFAULT_COMMITMENT);
      versionedTx.sign([userKeypair]);
      
      // Get the latest blockhash
      let latestBlockhash = getLatestBlockhash();
      
      // If blockhash is null, fetch a new one directly from the connection
      if (!latestBlockhash) {
        latestBlockhash = await this.connection.getLatestBlockhash();
      }
      
      // Execute and confirm the transaction
      return this.txExecutor.executeAndConfirm(versionedTx, this.config.wallet, latestBlockhash);
    } catch (error) {
      logger.error({ mint: mint.toString(), error }, 'Error in bondingCurveSell');
      throw error;
    }
  }
 
  /**
   * 根据钱包地址获取对应的 Keypair
   * @param walletAddress 钱包地址字符串
   * @returns 对应的 Keypair，如果不存在则返回主钱包
   */
  public getKeypairByWalletAddress(walletAddress: string): Keypair {
    // 如果映射中有该钱包地址，返回对应的 Keypair
    if (this.walletAddressToKeypair.has(walletAddress)) {
      return this.walletAddressToKeypair.get(walletAddress)!;
    }
    
    // 如果映射中没有该钱包地址，返回主钱包
    logger.warn(`未找到钱包地址 ${walletAddress} 对应的 Keypair，使用主钱包代替`);
    return this.config.wallet;
  }

  /**
   * 使用 PumpSwap 卖出代币
   * @param mintAddress 代币地址
   * @param tokenAmount 代币数量
   * @param user 可以是 Keypair 或钱包地址字符串
   */
  public async pumpSwapSell(mintAddress: string, tokenAmount: number, user: Keypair | string) {
    // 如果 user 是字符串，将其转换为 Keypair
    const userKeypair = typeof user === 'string' ? this.getKeypairByWalletAddress(user) : user;
    const sell_token_amount = tokenAmount;
    logger.info(
      {
        status:`finding pumpswap pool for ${mintAddress}`,
        userAddress: userKeypair.publicKey.toString()
      }
    )
    const tokenInfo =await this.tokenInfoService?.getTokenInfo(mintAddress)
    if(!tokenInfo){
      return 
    }
    const creator=tokenInfo.creator
    const pool = await getPumpSwapPool(new PublicKey(mintAddress));
    const pumpswap_sell_tx = await this.pumpSwapSDK.createSellInstruction(creator,pool, userKeypair.publicKey, new PublicKey(mintAddress), BigInt(sell_token_amount), BigInt(0));
    const ATA = getAssociatedTokenAddressSync(new PublicKey(mintAddress), userKeypair.publicKey);
    const ix_list:any[] =[
        ...[
          ComputeBudgetProgram.setComputeUnitLimit({
            units: this.config.unitLimit,
          }),
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: this.config.unitPrice
          })
        ],

        createAssociatedTokenAccountIdempotentInstruction(
        userKeypair.publicKey,
        ATA,
        userKeypair.publicKey,
        new PublicKey(mintAddress)
        ),
        pumpswap_sell_tx
      ]

    let latestBlockhash = getLatestBlockhash();
    
    if (!latestBlockhash) {
      latestBlockhash = await this.connection.getLatestBlockhash();
    }
    
    const messageV0 = new TransactionMessage({
      payerKey: userKeypair.publicKey,
      instructions: ix_list,
      recentBlockhash: latestBlockhash.blockhash,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([userKeypair]);
    return this.txExecutor.executeAndConfirm(transaction, this.config.wallet, latestBlockhash);
    
  }
  
  private async filterMatch(mintAddress: string) {
    const shouldBuy = await this.poolFilters.execute(mintAddress,getLatestSlot());
    return shouldBuy;
  }

}
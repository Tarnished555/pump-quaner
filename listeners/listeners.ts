import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';

import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";

import { Connection, PublicKey, LAMPORTS_PER_SOL, BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { CreateEvent, PumpFunSDK } from 'pumpdotfun-sdk';
import { AnchorProvider } from "@coral-xyz/anchor";
import { logger, WSOL_MINT ,updateLatestBlockhash} from '../helpers';
import { YELLOWSTONE_CONFIG } from '../helpers/yellowstone-config';
import { TransactionData ,TokenBalance,TradeEvent} from '../types';
import { createGrpcClient, createSubscribeRequest, createAccountSubscribeRequest,createSubscribeBlockRequest } from '../grpc/client';
import { TokenInfoService } from '../services/token-info.service';
import { PreTradeCache } from '../cache/trade.cache';

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];
  private readonly sdk: PumpFunSDK;
  private yellowstoneClient: Client | null = null;
  private transactionStream: any = null;
  private accountStream: any = null;
  private blockStream: any = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private monitorWallets: string[] = [];
   // Initialize with a no-op function that will be replaced in subscribeWithAccounts
  private sendSubscriptionRequest: (stream: any, request: any, description: string) => Promise<void> = async () => Promise.resolve();



  constructor(private readonly connection: Connection, private readonly provider: AnchorProvider,private readonly tokenInfoService: TokenInfoService,private readonly tradeCache:PreTradeCache) {
    super();
    try {
      this.sdk = new PumpFunSDK(this.provider);
      logger.info('PumpFun SDK initialized successfully');
    } catch (error) {
      logger.error('Error initializing PumpFun SDK:', error);
      throw error;
    }
  }

  public async start(config: {
    walletPublicKeys: PublicKey[];
    quoteToken: Token;
    autoSell: boolean;
    cacheNewMarkets: boolean;
  }) {
    this.yellowstoneClient = createGrpcClient(YELLOWSTONE_CONFIG.endpoint);
    if (config.autoSell) {
      this.monitorWallets = config.walletPublicKeys.map(wallet => wallet.toString());
      config.walletPublicKeys.forEach(walletPublicKey => {this.subscribeToWalletChanges({ walletPublicKey })});
    } 
    const createSubscription = await this.subscribeToCreateEvents();
   // const transactionSubscription = await this.subscribeToTransactions();

    this.subscriptions.push(createSubscription);
   // this.subscriptions.push(transactionSubscription);
    
    // 启动 Yellowstone gRPC 监控
    await this.subscribeWithYellowstone();
    await this.subscribeWithAccounts(config.walletPublicKeys);
  }

  private async subscribeWithAccounts(walletPublicKeys: PublicKey[]) {
  if (!this.yellowstoneClient) {
    logger.error('Yellowstone client not initialized');
    throw new Error('Yellowstone client not initialized');
  }
 
  try {
    // Create a new stream
    const accountsStream = await this.yellowstoneClient.subscribe();
    if (!accountsStream) {
      logger.fatal('Failed to create accounts stream client');
      throw new Error('Failed to create accounts stream client');
    }
    
    // Log the wallets we're monitoring
    for (const walletPk of walletPublicKeys) {
      logger.info(`Starting to monitor wallet address: ${walletPk.toString()}`);
    }
    
   
     // 1. Monitor main wallet accounts
    for (let i = 0; i < walletPublicKeys.length; i++) {
      const walletPk = walletPublicKeys[i];
 
      let tokenAccountRequest=createAccountSubscribeRequest(walletPk.toString())
      
      // Send the subscription request
      await this.sendSubscriptionRequest(accountsStream, tokenAccountRequest, `token accounts for ${walletPk.toString()}`);
      logger.info(`Subscribed to token accounts for wallet: ${walletPk.toString()}`);
    }
    
    // Start ping service to keep connection alive
    this.startPingService(accountsStream);
    
    
    // Process account updates
    accountsStream.on('data', (data: any) => {
      // Check if this is an account update
      const account = data.account;
      if (!account) {
        return;
      }
      
      try {
        // Get account public key
        const userPubkey = bs58.encode(account.account.pubkey);
        logger.info(`Received account update: ${userPubkey}`);
        
        // Get account owner
        const owner = bs58.encode(account.account.owner);
        logger.info(`Account owner: ${owner}`);
        
        // Get account data
        let accountData = account.account.data;
        // Check if data is in the expected format
        if (Array.isArray(accountData) && accountData.length === 2) {
          // This is likely [data, encoding] format
          accountData = accountData[0];
        }
        
        if (!accountData || accountData.length === 0) {
          logger.warn(`Account data is empty: ${userPubkey}`);
          return;
        }
        
        // Get account balance
        const lamports = account.account.lamports;
        const solBalance = lamports / LAMPORTS_PER_SOL;
        logger.info(`Owner: ${owner}, Account address: ${userPubkey}, Balance: ${solBalance} SOL (${lamports} lamports)`);
        
        // Process SPL token accounts
        if (owner === TOKEN_PROGRAM_ID.toString() && accountData.length >= 165) {
          // SPL token account data structure
          const _mint = new PublicKey(accountData.slice(0, 32));
          const _owner = new PublicKey(accountData.slice(32, 64));
          const _amount = this.readUInt64LE(accountData.slice(64, 72));
          logger.info(`Token account info - Mint: ${_mint.toString()}, Owner: ${_owner.toString()}, Balance: ${_amount}`);

          this.emit('wallet_grpc', _owner.toString(), _mint.toString(), _amount);

        }
      } catch (error) {
        logger.error('Error processing account update:', error);
      }
    });
    
    accountsStream.on('error', (error: Error) => {
      logger.error('Error in account stream:', error);
      // Attempt to reconnect
      setTimeout(() => {
        logger.info('Attempting to reconnect account stream...');
        this.subscribeWithAccounts(walletPublicKeys);
      }, 5000);
    });
    
    accountsStream.on('end', () => {
      logger.info('Account stream closed');
    });
    
    // Store the stream client for cleanup
    this.accountStream = accountsStream;
    
    // Define the subscription request helper
    this.sendSubscriptionRequest = async (stream: any, request: any, description: string) => {
      return new Promise<void>((resolve, reject) => {
        stream.write(request, (err: Error | null | undefined) => {
          if (!err) {
            logger.info(`Successfully subscribed to ${description}`);
            resolve();
          } else {
            logger.error(`Failed to subscribe to ${description}:`, err);
            reject(err);
          }
        });
      });
    };
    
  } catch (error) {
    logger.error('Failed to subscribe with accounts:', error);
    throw error;
  }
}

/**
 * Helper method to read a uint64 value from a little-endian buffer
 */
private readUInt64LE(buffer: Uint8Array): number {
  // Create a DataView for reading values from the buffer
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // Read as two 32-bit values and combine them
  const lo = view.getUint32(0, true); // true for little-endian
  const hi = view.getUint32(4, true);
  return lo + hi * 0x100000000;
}

/**
 * Start a ping service to keep the connection alive
 */
private startPingService(streamClient: any) {
  const pingRequest: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.CONFIRMED,
    ping: { id: Date.now() }
  };
  
  const pingInterval = setInterval(async () => {
    if (!streamClient) return;
    
    try {
      await new Promise<void>((resolve, reject) => {
        streamClient.write(pingRequest, (err: Error | null | undefined) => {
          if (err === null || err === undefined) {
            resolve();
          } else {
            reject(err);
          }
        });
      });
      logger.debug('Ping sent to keep connection alive');
    } catch (error) {
      logger.error('Error sending ping:', error);
    }
  }, YELLOWSTONE_CONFIG.pingIntervalMs);
  
  // Store the interval for cleanup
  this.pingInterval = pingInterval;
}

  private async subscribeToWalletChanges(config: { walletPublicKey: PublicKey }) {
    logger.info(`Subscribing to wallet changes for ${config.walletPublicKey.toString()}`);
    return this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (updatedAccountInfo) => {
        this.emit('wallet', updatedAccountInfo);
      },
      this.connection.commitment,
      [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: config.walletPublicKey.toBase58(),
          },
        },
      ],
    );
  }


  private async subscribeToCreateEvents() {
    try {
      const createEvent = this.sdk.addEventListener("createEvent", (event, slot, signature) => {
        this.emit('create', event, slot, signature);
      });
      logger.info("Successfully subscribed to create events, ID:", createEvent);
      return createEvent;
    } catch (error) {
      logger.error('Error subscribing to create events:', error);
      // Return a dummy subscription ID that we can safely try to unsubscribe from later
      return -1;
    }
  }
  /**
   * 订阅区块数据，使用Yellowstone gRPC API
   * 这个方法监控新区块并处理其中的交易
   */
  private async subscribeWithBlock() {
    if (!this.yellowstoneClient) {
      logger.error('Yellowstone client not initialized');
      throw new Error('Yellowstone client not initialized');
    }
    
    try {
      logger.info('初始化区块订阅...');
      
      // 创建区块订阅流
      const blockStream = await this.yellowstoneClient.subscribe();
      if (!blockStream) {
        logger.fatal('Failed to create block stream client');
        throw new Error('Failed to create block stream client');
      }
      
      // 导入并创建区块订阅请求
  
      const blockRequest = createSubscribeBlockRequest();
      
      // 发送订阅请求
      await new Promise<void>((resolve, reject) => {
        blockStream.write(blockRequest, (err: Error | null | undefined) => {
          if (!err) {
            logger.info('成功订阅区块数据流');
            resolve();
          } else {
            logger.error('订阅区块数据流失败:', err);
            reject(err);
          }
        });
      });
      
      // 处理区块数据
      blockStream.on('data', (data: any) => {
        try {
          // 检查是否是区块数据
          
          if (data.block) {
            // 打印data.block的完整JSON结构

            
            const block = data.block;
            const slot = block.slot;
            const blockTime = block.blockTime.timestamp;
            const blockHash = block.blockhash;
            const blockHeight = Number(block.blockHeight.blockHeight)
            
            // 创建一个符合BlockhashWithExpiryBlockHeight类型的对象
            const blockhashWithExpiry: BlockhashWithExpiryBlockHeight = {
              blockhash: blockHash,
              lastValidBlockHeight: blockHeight + 150 // 添加150个区块的缓冲区
            };
            
            // 更新最新的blockhash
            updateLatestBlockhash(blockhashWithExpiry);
            
            logger.debug(`接收到区块数据: 槽位=${slot}, 时间=${new Date(blockTime * 1000).toISOString()}, 哈希=${blockHash}`);

          }
        } catch (dataError) {
          logger.error('处理区块数据时出错:', dataError);
        }
      });
      
      // 处理错误
      blockStream.on('error', (error: Error) => {
        logger.error('区块流错误:', error);
        // 尝试重新连接
        setTimeout(() => {
          logger.info('尝试重新连接区块流...');
          this.subscribeWithBlock();
        }, 5000);
      });
      
      // 处理流结束
      blockStream.on('end', () => {
        logger.info('区块流已关闭');
      });
      
      // 保存流对象以便清理
      this.blockStream = blockStream;
      
      // 启动ping服务保持连接活跃
      this.startPingService(blockStream);
      
      return blockStream;
    } catch (error) {
      logger.error('订阅区块数据失败:', error);
      throw error;
    }
  }
  /**
   * Subscribe to account updates using Yellowstone gRPC API
   * This method monitors wallet accounts for SPL token balance changes
   */
  private async subscribeWithYellowstone() {
    if (!this.yellowstoneClient) {
      logger.error('Yellowstone client not initialized');
      throw new Error('Yellowstone client not initialized');
    }
    this.transactionStream = null;
    try {
      logger.info('Initializing Yellowstone gRPC client...');
 
      // Create the subscription stream
      this.transactionStream = await this.yellowstoneClient.subscribe();
      logger.info(`Successfully subscribed to transaction gRPC stream`);
      
      // Create the subscription request
      const transactionRequest=createSubscribeRequest(['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P']);
      // Send the subscription request
      try {
      await new Promise<void>((resolve, reject) => {
        logger.info('Sending subscription request to transaction gRPC stream');
        if (!this.transactionStream) {
          logger.error('Transaction stream not initialized');
          reject(new Error('Transaction stream not initialized'));
          return;
        }
        this.transactionStream.write(transactionRequest, (err: Error | null | undefined) => {
            if (!err) {
                resolve();
            } else {
                reject(err);
            }
        });
      });
      } catch (error) {
        logger.error('Error sending subscription request:', error);
        throw error;
      }
      logger.info('Successfully subscribed to transaction stream');
      
      // Set up the data handler
      this.transactionStream.on('data', async (data: any) => {
        
      
        if (data.transaction && data.transaction.transaction.meta.logMessages && data.transaction.transaction.meta.logMessages.some((log: string) => log.includes("Program log: Instruction: InitializeMint2"))) {
          try {
            // Parse the transaction
           

            const txnSignature = bs58.encode(data.transaction.transaction.transaction.signatures[0]);
            const accountKeys = data.transaction.transaction.transaction.message.accountKeys.map((ak: Uint8Array) => bs58.encode(ak));
            const slot = data.transaction.slot;
        
            const blockHash =data.transaction.transaction.transaction.message.recentBlockhash
            const blockHeight =slot -21777281
              // 创建一个符合BlockhashWithExpiryBlockHeight类型的对象
            const blockhashWithExpiry: BlockhashWithExpiryBlockHeight = {
              blockhash: bs58.encode(blockHash),
              lastValidBlockHeight: blockHeight + 150 // 添加150个区块的缓冲区
            };
              
              // 更新最新的blockhash
            updateLatestBlockhash(blockhashWithExpiry);
            
            // Extract key accounts
            const signer = accountKeys[0];
            // We'll extract these from the program data instead of assuming positions
            let mintAddress = '';
            let bondingCurve = '';
            
            // Extract program data from logs if available
            let tokenName = '';
            let tokenSymbol = '';
            let tokenUri = '';
            
            // Look for program data in logs
            for (const logMessage of data.transaction.transaction.meta.logMessages) {
              if (logMessage.includes('Program data:')) {
                try {
                  const dataString = logMessage.split('Program data: ')[1];
                  const decoded = Buffer.from(dataString, 'base64');
                  
                  // Skip magic number and version (8 bytes)
                  let offset = 8;
                  
                  // Parse name (string)
                  const nameLength = decoded.readUInt32LE(offset);
                  offset += 4;
                  tokenName = decoded.slice(offset, offset + nameLength).toString();
                  offset += nameLength;
                  
                  // Parse symbol (string)
                  const symbolLength = decoded.readUInt32LE(offset);
                  offset += 4;
                  tokenSymbol = decoded.slice(offset, offset + symbolLength).toString();
                  offset += symbolLength;
                  
                  // Parse URI (string)
                  const uriLength = decoded.readUInt32LE(offset);
                  offset += 4;
                  tokenUri = decoded.slice(offset, offset + uriLength).toString();
                  offset += uriLength;
                  
                  // Extract mint address (pubkey - 32 bytes)
                  if (offset + 32 <= decoded.length) {
                    const mintBytes = decoded.slice(offset, offset + 32);
                    mintAddress = bs58.encode(mintBytes);
                    offset += 32;
                  } else {
                    // Fallback to account keys if program data parsing fails
                    logger.warn('Could not extract mint address from program data, using account keys as fallback');
                    mintAddress = accountKeys.length > 1 ? accountKeys[1] : '';
                  }
                  
                  // Extract bonding curve (pubkey - 32 bytes)
                  if (offset + 32 <= decoded.length) {
                    const bondingCurveBytes = decoded.slice(offset, offset + 32);
                    bondingCurve = bs58.encode(bondingCurveBytes);
                    offset += 32;
                  } else {
                    // Fallback to account keys if program data parsing fails
                    logger.warn('Could not extract bonding curve from program data, using account keys as fallback');
                    bondingCurve = accountKeys.length > 2 ? accountKeys[2] : '';
                  }
                  
                  logger.debug(`Token Name: ${tokenName}`);
                  logger.debug(`Token Symbol: ${tokenSymbol}`);
                  logger.debug(`Token URI: ${tokenUri}`);
                  logger.debug(`Mint Address (from data): ${mintAddress}`);
                  logger.debug(`Bonding Curve (from data): ${bondingCurve}`);
                  logger.debug(`Slot: ${slot}`);
                  logger.debug(`Transaction: https://solscan.io/tx/${txnSignature}`);
                  
                  // Validate that we have the required addresses before creating PublicKeys
                  if (!mintAddress || !bondingCurve || !signer) {
                    logger.error(`Missing required addresses for token creation event: mint=${mintAddress}, bondingCurve=${bondingCurve}, signer=${signer}`);
                    return;
                  }
                    
                    const createEventData: CreateEvent = {
                      name: tokenName,
                      symbol: tokenSymbol,
                      uri: tokenUri,
                      mint: new PublicKey(mintAddress),
                      bondingCurve: new PublicKey(bondingCurve),
                      user: new PublicKey(signer),
                    };
                  
                    this.emit('create', createEventData, slot, txnSignature);
 
                } catch (error) {
                  logger.error('Error parsing program data:', error);
                }
                break;
              }
            }
          } catch (error) {
            logger.error('Error processing InitializeMint2 transaction:', error);
          }
          
          
        }else if (data.transaction && data.transaction.transaction && data.transaction.transaction.meta.logMessages && data.transaction.transaction.meta.logMessages.some((log: string) => log.includes("Program log: Instruction: Buy"))) {
          try {
            // Parse the transaction
            const txnSignature = bs58.encode(data.transaction.transaction.transaction.signatures[0]);
            const accountKeys = data.transaction.transaction.transaction.message.accountKeys.map((ak: Uint8Array) => bs58.encode(ak));
            const slot = data.transaction.slot;
            const signer=accountKeys[0];
            
            const balanceInfo = await this.checkTokenBalances(data);
            if (!balanceInfo || balanceInfo.mint === WSOL_MINT) {
                return null;
            }
            const mint = balanceInfo.mint;
            const tokenInfo = await this.tokenInfoService.getTokenInfo(mint);
            if (!tokenInfo) {
              logger.debug({ mint: mint.toString() }, 'Token info not found, skip this transaction');
              return;
            }
            if (!tokenInfo.bondingCurve) {
                logger.error({ mint: mint.toString() }, 'Bonding curve not found, skip this transaction');
                return;
            }
            logger.debug(`Bonding curve: ${tokenInfo.bondingCurve}`);
            const pumpPriceInfo = this.getPumpSwapInfo(data.transaction, tokenInfo.bondingCurve||'', "post");
            // 增加健壮性，理论上不会进入这里
            if (!pumpPriceInfo) {
                logger.debug(`pumpPriceInfo not found:,${tokenInfo.bondingCurve} --- ${txnSignature}`);
                return;
            }
            const { price, swapSolAmount, tokenChange, progress } = pumpPriceInfo;
            logger.debug(`Mint: ${mint}`);
            logger.debug(`Sol change: ${swapSolAmount}`);
            logger.debug(`Token change: ${tokenChange}`);
            logger.debug(`User: ${signer}`);
            logger.debug(`Slot: ${slot}`);
            logger.debug(`Price: ${price}`);
            logger.debug(`Transaction: https://solscan.io/tx/${txnSignature}`);
            // 创建交易日志数据
            const transactionData: TradeEvent = {
                mint: new PublicKey(mint),
                solAmount: BigInt(Math.ceil(Math.abs(swapSolAmount))),
                tokenAmount: BigInt(Math.ceil(Math.abs(tokenChange))),
                isBuy: true,
                user: new PublicKey(signer),
                price,
                virtualSolReserves: BigInt(0),
                virtualTokenReserves: BigInt(0),
                realSolReserves: BigInt(0),
                realTokenReserves: BigInt(0),
                timestamp: new Date().getTime() // 添加时间戳
            };
           // 确保签名者是字符串类型后再进行比较
           if(this.monitorWallets.includes(signer)) {
             // 如果交易签名者是我们监控的钱包之一
             logger.info(`监控钱包 ${signer} mint: ${mint} ,入场价: ${price}`);
             this.tradeCache.save(mint,price)

           }
            // Emit the transaction event with the parsed data       
            this.emit('transaction', transactionData, slot, txnSignature);

          } catch (error) {
            logger.error('Error processing Yellowstone transaction:', error);
          }
        }
        else if (data.transaction && data.transaction.transaction && data.transaction.transaction.meta.logMessages && data.transaction.transaction.meta.logMessages.some((log: string) => log.includes("Program log: Instruction: Sell"))) {
          try {
            // Parse the transaction
            const txnSignature = bs58.encode(data.transaction.transaction.transaction.signatures[0]);
            const accountKeys = data.transaction.transaction.transaction.message.accountKeys.map((ak: Uint8Array) => bs58.encode(ak));
            const slot = data.transaction.slot;
            const signer=new PublicKey(accountKeys[0]);
            
            const balanceInfo = await this.checkTokenBalances(data);
            if (!balanceInfo || balanceInfo.mint === WSOL_MINT) {
                return null;
            }
            const mint = balanceInfo.mint;
            const tokenInfo = await this.tokenInfoService.getTokenInfo(mint);
            if (!tokenInfo) {
                logger.debug({ mint: mint.toString() }, 'Token info not found, skip this transaction');
                return;
            }
            if (!tokenInfo.bondingCurve) {
                logger.error({ mint: mint.toString() }, 'Bonding curve not found, skip this transaction');
                return;
            }
            logger.debug(`Bonding curve: ${tokenInfo.bondingCurve}`);
            const pumpPriceInfo = this.getPumpSwapInfo(data.transaction, tokenInfo.bondingCurve||'', "post");
            if (!pumpPriceInfo) {
              logger.debug(`pumpPriceInfo not found:,${txnSignature}`);
                return;
            }
            const { price, swapSolAmount, tokenChange, progress } = pumpPriceInfo;
            logger.debug(`Mint: ${mint}`);
            logger.debug(`Sol change: ${swapSolAmount}`);
            logger.debug(`Token change: ${tokenChange}`);
            logger.debug(`User: ${signer}`);
            logger.debug(`Slot: ${slot}`);
            logger.debug(`Price: ${price}`);
            logger.debug(`Transaction: https://solscan.io/tx/${txnSignature}`);
            // 创建交易日志数据
            const transactionData: TradeEvent = {
                mint: new PublicKey(mint),
                solAmount: BigInt(Math.ceil(Math.abs(swapSolAmount))),
                tokenAmount: BigInt(Math.ceil(Math.abs(tokenChange))),
                isBuy: false,
                user: new PublicKey(signer),
                price,
                virtualSolReserves: BigInt(0),
                virtualTokenReserves: BigInt(0),
                realSolReserves: BigInt(0),
                realTokenReserves: BigInt(0),
                timestamp: new Date().getTime() // 添加时间戳
            };
                // Emit the transaction event with the parsed data       
            this.emit('transaction', transactionData, slot, txnSignature);
          } catch (error) {
            logger.error('Error processing Yellowstone transaction:', error);
          }
        }
      });
      
      // Set up error handler
      this.transactionStream.on('error', async (error: any) => {
        
        logger.error('Transaction stream error:', error);
        logger.info('Reconnecting to transaction stream...');
        await this.subscribeWithYellowstone();
        
      });
      
      // Set up ping interval to keep the connection alive
      const pingRequest: SubscribeRequest = {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: undefined,
        ping: { id: 1 },
      };
      
      // Send ping every 5 seconds to keep the connection alive
      this.pingInterval = setInterval(async () => {
        if (!this.transactionStream) return;
        
        try {
          await new Promise<void>((resolve, reject) => {
            if (!this.transactionStream) {
              reject(new Error('Transaction stream not initialized'));
              return;
            }
            
            this.transactionStream.write(pingRequest, (err: Error | null | undefined) => {
              if (err === null || err === undefined) {
                resolve();
              } else {
                reject(err);
              }
            });
          });
        } catch (error) {
          logger.error('Error sending Yellowstone ping:', error);
        }
      }, YELLOWSTONE_CONFIG.pingIntervalMs);
      
      logger.info('Yellowstone gRPC client initialization complete');
    } catch (error) {
      logger.error('Error initializing Yellowstone gRPC client:', error);
    }
  }

  public async stop() {
    // Clean up Yellowstone resources first
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.transactionStream) {
      try {
        this.transactionStream.end();
        logger.info('Transaction stream closed');
      } catch (error) {
        logger.error('Error closing transaction stream:', error);
      }
      this.transactionStream = null;
    }
    
    if (this.yellowstoneClient) {
      try {
        // Close the client if it has a close method
        //this.yellowstoneClient.close();
        logger.info('Yellowstone client closed');
      } catch (error) {
        logger.error('Error closing Yellowstone client:', error);
      }
      this.yellowstoneClient = null;
    }
    
    // Clean up other subscriptions
    for (let i = this.subscriptions.length - 1; i >= 0; --i) {
      const subscription = this.subscriptions[i];
      
      // Skip invalid subscription IDs (like our dummy -1 value)
      if (subscription < 0) {
        this.subscriptions.splice(i, 1);
        continue;
      }
      
      try {
        // Try to remove PumpFun SDK event listener first
        try {
          if (this.sdk) {
            this.sdk.removeEventListener(subscription);
            logger.info(`Successfully removed PumpFun event listener: ${subscription}`);
          }
        } catch (sdkError) {
          logger.error(`Error removing PumpFun event listener: ${subscription}`, sdkError);
          
          // If it's not a PumpFun event listener, try other types
          try {
            // Try as account change listener
            await this.connection.removeAccountChangeListener(subscription);
          } catch (accountError) {
            try {
              // Try as log listener
              await this.connection.removeOnLogsListener(subscription);
            } catch (logError) {
              // If all removal attempts fail, log the error but continue
              logger.error(`Failed to remove subscription: ${subscription}`, logError);
            }
          }
        }
      } catch (error) {
        logger.error(`Unexpected error removing subscription: ${subscription}`, error);
      }
      
      this.subscriptions.splice(i, 1);
    }
  }
  private calculateSolChange(data: TransactionData): number {
    const preBalance = data.transaction.transaction.meta.preBalances[0];
    const postBalance = data.transaction.transaction.meta.postBalances[0];
    return (postBalance - preBalance) ;
}

/**
 * 检查交易中的代币余额变化，并返回相关信息
 * @param data 交易数据
 * @returns 代币变化信息或null
 */



private async checkTokenBalances(data: TransactionData) {
    // 从交易元数据中获取交易前的代币余额
    const preTokenBalances = data.transaction.transaction.meta.preTokenBalances;
    // 从交易元数据中获取交易后的代币余额
    const postTokenBalances = data.transaction.transaction.meta.postTokenBalances;

    // 如果交易后没有代币余额记录，则返回null
    if (postTokenBalances.length === 0) {
        return null;
    }

    // 遍历所有交易后的代币余额
    for (const postBalance of postTokenBalances) {

        // 如果代币是WSOL，则跳过当前循环
        if (postBalance.mint === WSOL_MINT) continue;
        
        // 查找相同所有者和相同代币的交易前余额，如果找不到则默认为0
        const preBalance = preTokenBalances.find(
            (pre: TokenBalance) => pre.owner === postBalance.owner && pre.mint === postBalance.mint
        )?.uiTokenAmount.uiAmount || 0;
        
        // 计算代币余额变化量
        const change = (postBalance.uiTokenAmount.uiAmount - preBalance) * 1e6;
        // 如果代币余额有变化，则返回代币信息和变化量
        if (change !== 0) {
            return {
                owner: postBalance.owner, // 代币所有者地址
                mint: postBalance.mint,  // 代币的铸造地址
                amount: change           // 代币数量变化
            };
        }
    }

    // 如果没有找到相关的代币变化，则返回null
    return null;
}


getPumpSwapInfo(txn: any, bondingCurve: string, type: "pre" | "post") {
    // 获取bondingCurve的token余额
    const tokenBalance = txn?.transaction?.meta?.[type + 'TokenBalances']?.find((o: TokenBalance) => o.owner===bondingCurve);
    if (!tokenBalance) {
        return null;
    }
    logger.debug(`Token balance: ${tokenBalance.uiTokenAmount.uiAmount}`);
    const accountKeys = txn.transaction.transaction.message.accountKeys.map((ak: Uint8Array) => bs58.encode(ak));
    
    
    // 获取bondingCurve的sol余额
    const bondingCurveIdx = accountKeys.indexOf(bondingCurve);
    let preSolBalance = txn.transaction.meta?.preBalances?.[bondingCurveIdx];
    let postSolBalance = txn.transaction.meta?.postBalances?.[bondingCurveIdx];
    const targetSolBalance = txn.transaction.meta?.[type + "Balances"]?.[bondingCurveIdx];
    
    if (postSolBalance===undefined || preSolBalance === undefined) {
      // 打印调试信息
 
      return null;
    }
    //logger.info(`Sol balance: ${preSolBalance} -> ${postSolBalance}`);

    let preTokenBalance = txn.transaction.meta?.preTokenBalances?.find((o: TokenBalance) => o.owner===bondingCurve);
    let postTokenBalance = txn.transaction.meta?.postTokenBalances?.find((o: TokenBalance) => o.owner===bondingCurve);
    if (!preTokenBalance || !postTokenBalance) {

        return null;
    }
    //logger.info(`Token balance: ${preTokenBalance.uiTokenAmount.uiAmount} -> ${postTokenBalance.uiTokenAmount.uiAmount}`);
    const tokenChange = ( preTokenBalance.uiTokenAmount.uiAmount - postTokenBalance.uiTokenAmount.uiAmount ) * 1e6;
    if (tokenChange === 0) {

        return null;
    }
    //logger.info(`Token change: ${tokenChange}`);
    // 通过余额反推虚拟余额，virtualSolReserves(sol余额+30-租金)和virtualTokenReserves(token余额+73000000)
    const price = ((Number(targetSolBalance) / (10 ** 9)) + 30 - 0.00123192) / (tokenBalance.uiTokenAmount.uiAmount + 73000000);
    const swapSolAmount = (Number(postSolBalance) - Number(preSolBalance)) ;
    const progress = Number(postSolBalance) / (10 ** 9) / 85;
    return {price, swapSolAmount, tokenChange, progress};
}
} 


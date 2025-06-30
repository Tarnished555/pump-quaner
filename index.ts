import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { setBot } from './bot-instance'; // Import the setBot function
import { AnchorProvider } from "@coral-xyz/anchor";
import { MarketCache, PoolCache } from './cache';
import { Listeners,PumpAmmListeners } from './listeners';
import { getAccount } from '@solana/spl-token';
import { convertPumpSwapBuyToTrade, convertPumpSwapSellToTrade } from './kline/pumpswap-converter';
import { getMintAddressFromPool } from './pool-utils';
import { Connection, KeyedAccountInfo, Keypair, PublicKey ,NONCE_ACCOUNT_LENGTH} from '@solana/web3.js';
import { StrategyManager } from './strategy/strategy.manager';
import { TakeProfitStopLossManager } from './strategy/take-profit-stop-loss.manager';
import './api';
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { AccountLayout, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Bot, BotConfig } from './bot';
import { DefaultTransactionExecutor, TransactionExecutor } from './transactions';
import {
  getToken,
  logger,
  COMMITMENT_LEVEL,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  PRE_LOAD_EXISTING_MARKETS,
  LOG_LEVEL,
  // QUOTE_MINT,
  QUOTE_MINT,
  QUOTE_AMOUNT,
 
  USE_SNIPE_LIST,
  ONE_TOKEN_AT_A_TIME,
  AUTO_SELL_DELAY,
  MAX_SELL_RETRIES,
  AUTO_SELL,
  MAX_BUY_RETRIES,
  AUTO_BUY_DELAY,
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE,
  CACHE_NEW_MARKETS,
  TAKE_PROFIT,
  STOP_LOSS,
  BUY_SLIPPAGE,
  SELL_SLIPPAGE,
  PRICE_CHECK_DURATION,
  PRICE_CHECK_INTERVAL,
  SNIPE_LIST_REFRESH_INTERVAL,
  TRANSACTION_EXECUTOR,
  CUSTOM_FEE,
  FILTER_CHECK_INTERVAL,
  FILTER_CHECK_DURATION,
  CONSECUTIVE_FILTER_MATCHES,
  BUY_AMOUNT_SOL,
  JITO_TIP,
  LOOKUP_TABLES_ENABLED,
  DEFAULT_DECIMALS,
  SIMULATION_MODE,
  setGlobalAdditionalWallets

} from './helpers';
import { version } from './package.json';
import { WarpTransactionExecutor } from './transactions/warp-transaction-executor';
import { JitoTransactionExecutor } from './transactions/jito-rpc-transaction-executor';
import { CreateEvent } from "./pumpfun-sdk";
import { PriorityFee } from './pumpfun-sdk';
import { KLineService, convertPumpFunTradeToTrade, KLineInterval } from './kline';
import { KLINE_ENABLED, KLINE_PERSISTENCE_ENABLED, REDIS_CONFIG, POSTGRES_CONFIG } from './kline/config';
import { TokenHoldersService } from './services/token-holders.service';
import { TokenInfoService } from './services/token-info.service';
import { initWalletNames, initLookupTableConfig } from './tokenCreateAndBuy';
import { getSPLTokenBalance } from './helpers/token';
import {PumpFunSDK} from "./pumpfun-sdk";
import {PumpSwapSDK} from './pumpswap';
import {BuyEvent, SellEvent, TradeEvent} from './types/types';
import { updateLatestSlot, getLatestSlot, startBlockhashUpdateTask } from './helpers';
import { PreTradeCache } from "./cache/trade.cache";



const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});
const nodeWallet = new NodeWallet(new Keypair()); //note this is not used
const provider = new AnchorProvider(connection, nodeWallet, {
  commitment: "processed",
});


// 添加 WebSocket 连接错误的事件监听器
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('EPROTO') && err.message.includes('SSL')) {
    logger.error('WebSocket SSL/TLS error occurred. This might be due to network issues or certificate problems.');
    logger.error(err);

  } else {
    logger.error('Network Uncaught exception:', err);
  }
});

function printDetails(wallet: Keypair, quoteToken: Token, bot: Bot) {
  logger.info(`  
      -:++++++=++++=:++++=++++= .++++++++++- =+++++:        
       -:++++-:=++=:++++=:-+++++:+++++====--:::::::        
        ::=+-:::==:=+++=::-:--::::::::::---------::.        
         Beyondpump Bot                                


          Version: ${version}                                          
  `);

  const botConfig = bot.config;

  logger.info('------- CONFIGURATION START -------');
  logger.info(`Wallet: ${wallet.publicKey.toString()}`);

  logger.info('- Bot -');

  logger.info(
    `Using ${TRANSACTION_EXECUTOR} executer: ${bot.isWarp || bot.isJito || (TRANSACTION_EXECUTOR === 'default' ? true : false)}`,
  );
  if (bot.isWarp || bot.isJito) {
    logger.info(`${TRANSACTION_EXECUTOR} fee: ${CUSTOM_FEE}`);
  } else {
    logger.info(`Compute Unit limit: ${botConfig.unitLimit}`);
    logger.info(`Compute Unit price (micro lamports): ${botConfig.unitPrice}`);
  }

  logger.info(`Single token at the time: ${botConfig.oneTokenAtATime}`);
  logger.info(`Pre load existing markets: ${PRE_LOAD_EXISTING_MARKETS}`);
  logger.info(`Cache new markets: ${CACHE_NEW_MARKETS}`);
  logger.info(`Log level: ${LOG_LEVEL}`);

  logger.info('- Buy -');
  logger.info(`Buy amount: ${botConfig.quoteAmount.toFixed()} ${botConfig.quoteToken.name}`);
  logger.info(`Auto buy delay: ${botConfig.autoBuyDelay} ms`);
  logger.info(`Max buy retries: ${botConfig.maxBuyRetries}`);
  logger.info(`Buy amount (${quoteToken.symbol}): ${botConfig.quoteAmount.toFixed()}`);
  logger.info(`Buy slippage: ${botConfig.buySlippage}%`);

  logger.info('- Sell -');
  logger.info(`Auto sell: ${AUTO_SELL}`);
  logger.info(`Auto sell delay: ${botConfig.autoSellDelay} ms`);
  logger.info(`Max sell retries: ${botConfig.maxSellRetries}`);
  logger.info(`Sell slippage: ${botConfig.sellSlippage}%`);
  logger.info(`Price check interval: ${botConfig.priceCheckInterval} ms`);
  logger.info(`Price check duration: ${botConfig.priceCheckDuration} ms`);
  logger.info(`Take profit: ${botConfig.takeProfit}%`);
  logger.info(`Stop loss: ${botConfig.stopLoss}%`);

  logger.info('- Snipe list -');
  logger.info(`Snipe list: ${botConfig.useSnipeList}`);
  logger.info(`Snipe list refresh interval: ${SNIPE_LIST_REFRESH_INTERVAL} ms`);

  if (botConfig.useSnipeList) {
    logger.info('- Filters -');
    logger.info(`Filters are disabled when snipe list is on`);
  } else {
    logger.info('- Filters -');
    logger.info(`Filter check interval: ${botConfig.filterCheckInterval} ms`);
    logger.info(`Filter check duration: ${botConfig.filterCheckDuration} ms`);
    logger.info(`Consecutive filter matches: ${botConfig.consecutiveMatchCount}`);

  }

  logger.info('------- CONFIGURATION END -------');

  logger.info('Bot is running! Press CTRL + C to stop it.');
}

const runListener = async () => {
  logger.level = LOG_LEVEL;
  logger.info('Bot is starting...');

  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache();
  const tradeCache = new PreTradeCache()
  let txExecutor: TransactionExecutor;

  switch (TRANSACTION_EXECUTOR) {
    case '0slot': {
      txExecutor = new WarpTransactionExecutor(CUSTOM_FEE);
      break;
    }
    case 'jito': {
      txExecutor = new JitoTransactionExecutor(JITO_TIP, connection);
      break;
    }
    default: {
      txExecutor = new DefaultTransactionExecutor(connection);
      break;
    }
  }

  // 获取钱包（单个或多个）
  const walletNames = await initWalletNames();
  let lookupTablesConfig: any;
  if(LOOKUP_TABLES_ENABLED) {
    lookupTablesConfig = await initLookupTableConfig(connection, walletNames);
  }
  const quoteToken = getToken(QUOTE_MINT);
  
  // 初始化TokenInfoService用于存储代币信息
  const tokenInfoService = new TokenInfoService();
  
  // 创建主钱包和备用钱包列表
  let primaryWallet: Keypair;
  let additionalWallets: Keypair[] = [];
  
  if (Array.isArray(walletNames)) {
    // 如果有多个钱包，第一个作为主钱包，其余作为备用钱包
    [primaryWallet, ...additionalWallets] = walletNames;
    setGlobalAdditionalWallets(additionalWallets);
    logger.info(`检测到${walletNames.length}个钱包，支付tip小费钱包: ${primaryWallet.publicKey.toString()}`);
    
    // 记录交易钱包地址
    additionalWallets.forEach((wallet, index) => {
      logger.info(`交易钱包 ${index + 1}: ${wallet.publicKey.toString()}`);
    });
  } else {
    // 如果只有一个钱包
    primaryWallet = walletNames[0];
    logger.info(`使用单个钱包: ${primaryWallet.publicKey.toString()}`);
  }
  
  // 初始化 bot
  logger.info(`mint: ${quoteToken.mint}`)
  const quoteAtas = additionalWallets.map(wallet => getAssociatedTokenAddressSync(quoteToken.mint, wallet.publicKey));
  const botConfig = <BotConfig>{
    wallet: primaryWallet, // 使用主钱包作为默认钱包
    additionalWallets, // 添加备用钱包列表
    quoteAtas:quoteAtas,
    quoteToken,
    quoteAmount: new TokenAmount(quoteToken, QUOTE_AMOUNT, false),
    oneTokenAtATime: ONE_TOKEN_AT_A_TIME,
    useSnipeList: USE_SNIPE_LIST,
    autoSell: AUTO_SELL,
    autoSellDelay: AUTO_SELL_DELAY,
    maxSellRetries: MAX_SELL_RETRIES,
    autoBuyDelay: AUTO_BUY_DELAY,
    maxBuyRetries: MAX_BUY_RETRIES,
    unitLimit: COMPUTE_UNIT_LIMIT,
    unitPrice: COMPUTE_UNIT_PRICE,
    takeProfit: TAKE_PROFIT,
    stopLoss: STOP_LOSS,
    buySlippage: BUY_SLIPPAGE,
    buyAmountSol: BUY_AMOUNT_SOL,
    jitoTip: JITO_TIP,
    sellSlippage: SELL_SLIPPAGE,
    priceCheckInterval: PRICE_CHECK_INTERVAL,
    priceCheckDuration: PRICE_CHECK_DURATION,
    filterCheckInterval: FILTER_CHECK_INTERVAL,
    filterCheckDuration: FILTER_CHECK_DURATION,
    consecutiveMatchCount: CONSECUTIVE_FILTER_MATCHES,
    lookupTablesConfig:lookupTablesConfig
  };
  const pumpFunSDK = new PumpFunSDK(provider);
  const pumpSwapSDK = new PumpSwapSDK(provider);
  const bot = new Bot(pumpFunSDK,pumpSwapSDK,connection, marketCache, poolCache, txExecutor, botConfig, tokenInfoService);
  setBot(bot); // Share the bot instance through the bot-instance module
  const valid = await bot.validate();

  if (!valid) {
    logger.info('Bot is exiting...');
    process.exit(1);
  } 

  if (PRE_LOAD_EXISTING_MARKETS) {
    await marketCache.init({ quoteToken });
  }

  const runTimestamp = Math.floor(new Date().getTime() / 1000);

  // 创建一个缓存来存储 pool 到 mint 的映射
  const poolToMintCache = new Map<string, string>();
  
  // 创建一个 Set 用于跟踪已处理的钱包和 mint 组合
  const processedWalletMintPairs = new Set<string>();

  // Initialize K-line service if enabled
  let klineService: KLineService | null = null;
  if (KLINE_ENABLED) {
    logger.info('Initializing K-line service');
    
    // Create K-line service with Redis and optional PostgreSQL
    if (KLINE_PERSISTENCE_ENABLED) {
      klineService = new KLineService(REDIS_CONFIG, POSTGRES_CONFIG);
    } else {
      klineService = new KLineService(REDIS_CONFIG);
    }
    
    // Initialize the service
    await klineService.initialize();
    logger.info('K-line service initialized successfully');
  }
    // 初始化策略管理器
    const strategyManager = new StrategyManager(connection);
    logger.info(`Strategy manager initialized with ${strategyManager.getStrategiesCount()} strategies`);
  
    // 初始化止盈止损管理器
    const takeProfitStopLossManager = new TakeProfitStopLossManager(connection);
    logger.info(`Take profit and stop loss manager initialized and ${takeProfitStopLossManager.isEnabled() ? 'enabled' : 'disabled'}`);
  // Initialize PumpAmmListeners after klineService is fully initialized
  const pumpamm_listener = new PumpAmmListeners(connection, provider);
  await pumpamm_listener.start();
  
  // Register event handlers after klineService is initialized
  pumpamm_listener.on("amm_transaction_buy", async (event:BuyEvent, slot:number, signature:string) => {
    // 检查是否为买入事件（通过查看是否有 base_amount_out 字段）
    
    try {
      // 更新全局最新slot变量，供其它模块使用
      updateLatestSlot(slot);

      const pool = event.pool.toString();
      let mintAddress: string;
      
      // 检查缓存中是否已有该 pool 的 mint 地址
      if (poolToMintCache.has(pool)) {
        mintAddress = poolToMintCache.get(pool)!;
        logger.debug(`Using cached mint address for pool: ${pool} -> ${mintAddress}`);
      } else {
        // 优先从池子地址提取 mint 地址
        logger.debug(`Fetching mint address for pool: ${pool}`);
        try {
          // 首先尝试从池子中获取 mint 地址
          logger.debug(`Attempting to extract mint address from pool: ${pool}`);
          const poolMintAddress = await getMintAddressFromPool(connection, pool);
          
          if (poolMintAddress) {
            mintAddress = poolMintAddress;
            poolToMintCache.set(pool, mintAddress);
            logger.debug(`Successfully extracted mint address from pool: ${pool} -> ${mintAddress}`);
          } else {
            // 如果从池子获取失败，尝试从 token account 获取
            logger.debug(`Failed to get mint from pool, trying token account: ${event.user_base_token_account}`);
            const tokenAccount = await getAccount(connection, event.user_base_token_account);
            mintAddress = tokenAccount.mint.toString();
            poolToMintCache.set(pool, mintAddress);
            logger.debug(`Added new mint address to cache from token account: ${pool} -> ${mintAddress}`);
          }
        } catch (error: any) {
          // 记录错误
          logger.error({
            error,
            pool,
            user_base_token_account: event.user_base_token_account,
            signature
          }, 'Failed to get mint address from both pool and token account');
          throw new Error(`Failed to get mint address from both pool and token account: ${error.message || 'Unknown error'}`);
        }
      }
      
      logger.debug(`\n=== Buy Event (Signature: ${signature}) ===`);
      logger.debug(`Amounts: ${event.base_amount_out} base out, ${event.quote_amount_in} quote in`);
     
      logger.debug("Timestamp:", new Date(event.timestamp * 1000));

      // 转换为 Trade 格式并处理 K-line 数据
      if (KLINE_ENABLED && klineService) {
        const trade = convertPumpSwapBuyToTrade(event, slot, mintAddress);
        if (trade) {
          await klineService.processTrade(trade);
          logger.debug(`K-line data processed for token ${mintAddress} at price ${trade.price}`);
   
          // 执行止盈止损策略（卖出策略）
          try {
            
            // 执行止盈止损策略（卖出信号）
            const tpslResult = await takeProfitStopLossManager.execute(mintAddress, getLatestSlot());
            if (tpslResult && tpslResult.triggered) {
              const { action, wallet, sellPercentage, currentPrice, tokenAmount } = tpslResult.data;
              
              // 这里可以添加卖出代币的逻辑
              logger.info({ 
                mintAddress, 
                action, 
                sellPercentage, 
                currentPrice 
              }, `${action === 'take_profit' ? '止盈' : '止损'}信号触发，准备卖出${sellPercentage}%仓位`);
              
              // 实现内盘卖出代币的逻辑
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                // 止损时应该清仓，获取钱包实际持有的代币数量
                try {
                  // 获取实际代币数量
                  const allTokenAmount = await getSPLTokenBalance(
                    connection, 
                    new PublicKey(mintAddress), 
                    new PublicKey(wallet)
                  );
                  
                  logger.info({ 
                    mint: mintAddress, 
                    wallet: wallet, 
                    tokenAmount: allTokenAmount 
                  }, '获取到钱包实际代币数量，准备清仓');
                  
                  if (allTokenAmount && allTokenAmount > 0) {
                    await bot.pumpSwapSell(mintAddress, allTokenAmount*10**DEFAULT_DECIMALS, wallet);
                  } else {
                    logger.warn({ mint: mintAddress, wallet: wallet }, '没有可卖出的代币数量');
                  }
                } catch (error) {
                  logger.error({ error, mint: mintAddress }, '获取代币数量或清仓失败');
                }
              } else {
                // 止盈时按照策略卖出指定比例
                await bot.pumpSwapSell(mintAddress, Number(Math.floor(tokenAmount)), wallet);
              }

              // 如果是止损（清仓），清除入场价格记录
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                takeProfitStopLossManager.clearEntryPrice(mintAddress);
                logger.info({ mint: mintAddress }, '止损后清除入场价格记录');
              }
            }
          } catch (error) {
            logger.error({ error, mint: mintAddress }, '执行策略时出错');
          }
        }
      }
    } catch (error) {
      logger.error({
        error,
        event_type: 'buy',
        pool: event.pool.toString(),
        user: event.user.toString(),
        signature
      }, "Error processing buy event");
      
      // 即使出错，也尝试记录基本事件信息用于调试
      logger.debug(`Buy Event (Signature: ${signature}) - Error processing, but base info: ${event.base_amount_out} base out, ${event.quote_amount_in} quote in`);
    }
  })


  pumpamm_listener.on("amm_transaction_sell",async (event:SellEvent, slot:number, signature:string) => {
    // 检查是否为卖出事件
    
    try {
      // 更新全局slot变量，供其它模块使用
      updateLatestSlot(slot);

      const pool = event.pool.toString();
      let mintAddress: string;
      
      // 检查缓存中是否已有该pool的mint地址
      if (poolToMintCache.has(pool)) {
        mintAddress = poolToMintCache.get(pool)!;
        logger.debug(`Using cached mint address for pool: ${pool} -> ${mintAddress}`);
      } else {
        // 优先从池子地址提取 mint 地址
        logger.debug(`Fetching mint address for pool: ${pool}`);
        try {
          // 首先尝试从池子中获取 mint 地址
          logger.debug(`Attempting to extract mint address from pool: ${pool}`);
          const poolMintAddress = await getMintAddressFromPool(connection, pool);
          
          if (poolMintAddress) {
            mintAddress = poolMintAddress;
            poolToMintCache.set(pool, mintAddress);
            logger.debug(`Successfully extracted mint address from pool: ${pool} -> ${mintAddress}`);
          } else {
            // 如果从池子获取失败，尝试从 token account 获取
            logger.debug(`Failed to get mint from pool, trying token account: ${event.user_base_token_account}`);
            const tokenAccount = await getAccount(connection, event.user_base_token_account);
            mintAddress = tokenAccount.mint.toString();
            poolToMintCache.set(pool, mintAddress);
            logger.debug(`Added new mint address to cache from token account: ${pool} -> ${mintAddress}`);
          }
        } catch (error: any) {
          // 记录错误
          logger.error({
            error,
            pool,
            user_base_token_account: event.user_base_token_account,
            signature
          }, 'Failed to get mint address from both pool and token account');
          throw new Error(`Failed to get mint address from both pool and token account: ${error.message || 'Unknown error'}`);
        }
      }
      
      logger.debug(`\n=== Sell Event (Signature: ${signature}) ===`);

      logger.debug(`Amounts: ${event.base_amount_in} base in, ${event.quote_amount_out} quote out`);
     
      logger.debug("Timestamp:", new Date(event.timestamp * 1000));

      // 转换为Trade 格式并处理 K-line 数据
      if (KLINE_ENABLED && klineService) {
        const trade = convertPumpSwapSellToTrade(event, slot, mintAddress);
        if (trade) {
          await klineService.processTrade(trade);
          logger.debug(`K-line data processed for token ${mintAddress} at price ${trade.price}`);
          
          // 仅执行止盈止损策略（卖出策略）
          try {
            // 执行止盈止损策略（卖出信号）
            const tpslResult = await takeProfitStopLossManager.execute(mintAddress, getLatestSlot());
            if (tpslResult && tpslResult.triggered) {
              const { action, wallet, sellPercentage, currentPrice, tokenAmount } = tpslResult.data;
              
              // 这里可以添加卖出代币的逻辑
              logger.info({ 
                mintAddress, 
                action, 
                sellPercentage, 
                currentPrice 
              }, `${action === 'take_profit' ? '止盈' : '止损'}信号触发，准备卖出${sellPercentage}%仓位`);
              
              // 实现内盘卖出代币的逻辑
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                // 止损时应该清仓，获取钱包实际持有的代币数量
                try {
                  // 获取实际代币数量
                  const allTokenAmount = await getSPLTokenBalance(
                    connection, 
                    new PublicKey(mintAddress), 
                    new PublicKey(wallet)
                  );
                  
                  logger.info({ 
                    mint: mintAddress, 
                    wallet: wallet, 
                    tokenAmount: allTokenAmount 
                  }, '获取到钱包实际代币数量，准备清仓');
                  
                  if (allTokenAmount && allTokenAmount > 0) {
                    await bot.pumpSwapSell(mintAddress, Number(allTokenAmount*10**DEFAULT_DECIMALS), wallet);
                  } else {
                    logger.warn({ mint: mintAddress, wallet: wallet }, '没有可卖出的代币数量');
                  }
                } catch (error) {
                  logger.error({ error, mint: mintAddress }, '获取代币数量或清仓失败');
                }
              } else {
                // 止盈时按照策略卖出指定比例
                await bot.pumpSwapSell(mintAddress, Number(Math.floor(tokenAmount)), wallet);
              }

              // 如果是止损（清仓），清除入场价格记录
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                takeProfitStopLossManager.clearEntryPrice(mintAddress);
                logger.info({ mint: mintAddress }, '止损后清除入场价格记录');
              }
            }
          } catch (error) {
            logger.error({ error, mint: mintAddress }, '执行策略时出错');
          }
        }
      }
    } catch (error) {
      logger.error({
        error,
        event_type: 'sell',
        pool: event.pool.toString(),
        user: event.user.toString(),
        signature
      }, "Error processing sell event");
      
      // 即使出错，也尝试记录基本事件信息用于调试
      logger.info(`Sell Event (Signature: ${signature}) - Error processing, but base info: ${event.base_amount_in} base in, ${event.quote_amount_out} quote out`);
    }
  })

  const listeners = new Listeners(connection, provider, tokenInfoService,tradeCache);
  await listeners.start({
      walletPublicKeys: additionalWallets.map(w => w.publicKey),
      quoteToken,
      autoSell: AUTO_SELL,
      cacheNewMarkets: CACHE_NEW_MARKETS,
    }); 

  listeners.on('market', (updatedAccountInfo: KeyedAccountInfo) => {
    const marketState = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
    marketCache.save(updatedAccountInfo.accountId.toString(), marketState);
  });

  listeners.on('pool', async (updatedAccountInfo: KeyedAccountInfo) => {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const exists = await poolCache.get(poolState.baseMint.toString());

    if (!exists && poolOpenTime > runTimestamp) {
      poolCache.save(updatedAccountInfo.accountId.toString(), poolState);
      //TODO: don't buy coin now
    }
  });

  listeners.on('wallet', async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);
    const walletAddress = accountData.owner.toString();
    const mintAddress = accountData.mint.toString();
    const tokenAmount = Number(accountData.amount);
    
    // 创建唯一标识符，用于跟踪已处理的钱包和 mint 组合
    const walletMintPair = `${walletAddress}:${mintAddress}`;
    
    // 检查是否已经处理过这个组合
    if (processedWalletMintPairs.has(walletMintPair)) {
      logger.debug(`Skipping already processed wallet-mint pair: ${walletMintPair}`);
      return;
    }
    
    logger.info(`钱包更新,进入卖出策略逻辑 ${walletAddress} ${mintAddress} ${tokenAmount}`);

    if (mintAddress === quoteToken.mint.toString()) {
      return;
    }
    
    //记录钱包的 mint入场价格和交易数量
    if (KLINE_ENABLED && klineService) {
      try {

        let entryPrice =await tradeCache.get(mintAddress)
        if(!entryPrice){
          entryPrice = await klineService.getCurrentPrice(mintAddress, KLineInterval.ONE_SECOND)||0;
        
        }
        
        // 确保价格不为null才进行后续操作
        if (entryPrice !== null && tokenAmount>0 && entryPrice>0) {
          const timestamp = Date.now(); // 使用当前时间戳，因为trade变量不存在
          
          takeProfitStopLossManager.setEntryPrice(
            mintAddress, 
            walletAddress, 
            entryPrice, 
            tokenAmount, 
            timestamp
          );
          
          // 将此组合添加到已处理集合中
          processedWalletMintPairs.add(walletMintPair);
          
          logger.info({ 
            mint: mintAddress, 
            wallet: walletAddress, 
            entryPrice: entryPrice, 
            amount: tokenAmount 
          }, 'Entry price recorded for wallet from account update');
        }
      } catch (error) {
        logger.error({ error, mint: mintAddress }, 'Error getting current price for token');
      }
    }

  });

  
  listeners.on('wallet_grpc', async (owner: string, mint: string, amount: number) => {
    const walletAddress = owner;
    const mintAddress = mint;
    const tokenAmount = amount;
    
    // 创建唯一标识符，用于跟踪已处理的钱包和 mint 组合
    const walletMintPair = `${walletAddress}:${mintAddress}`;
    
    // 检查是否已经处理过这个组合
    if (processedWalletMintPairs.has(walletMintPair)) {
      logger.debug(`Skipping already processed wallet-mint pair: ${walletMintPair}`);
      return;
    }
    
    logger.info(`钱包更新,进入卖出策略逻辑 ${walletAddress} ${mintAddress} ${tokenAmount}`);

    if (mintAddress === quoteToken.mint.toString()) {
      return;
    }
    
    //记录钱包的 mint入场价格和交易数量
    if (KLINE_ENABLED && klineService) {
      try {
        let entryPrice =await tradeCache.get(mintAddress)
        if(!entryPrice){
          entryPrice = await klineService.getCurrentPrice(mintAddress, KLineInterval.ONE_SECOND)||0;
        
        }
        
        // 确保价格不为null才进行后续操作
        if (entryPrice !== null && tokenAmount>0 && entryPrice>0) {
          const timestamp = Date.now(); // 使用当前时间戳，因为trade变量不存在
          
          takeProfitStopLossManager.setEntryPrice(
            mintAddress, 
            walletAddress, 
            entryPrice, 
            tokenAmount, 
            timestamp
          );
          
          // 将此组合添加到已处理集合中
          processedWalletMintPairs.add(walletMintPair);
          
          logger.info({ 
            mint: mintAddress, 
            wallet: walletAddress, 
            entryPrice: entryPrice, 
            amount: tokenAmount 
          }, 'Entry price recorded for wallet from account update');
        }
      } catch (error) {
        logger.error({ error, mint: mintAddress }, 'Error getting current price for token');
      }
    }

  });

   // 处理来自 PumpFun 的创建事件
  listeners.on('create', async (createEvent: CreateEvent, slot: number, signature: string) => {
    logger.debug({ mint: createEvent.mint}, 'Detected PumpFun create event');
    logger.debug({ slot, signature }, 'Create event details');

    try {
      // TODO: 
      const creator = createEvent.user;
      const mintAddress = createEvent.mint.toString();
      const bondingCurve = createEvent.bondingCurve.toString();
      const symbol = createEvent.symbol;
      const name =createEvent.name
      const uri =createEvent.uri
      
      await tokenInfoService.saveTokenInfo({
        mintAddress,
        creator,
        bondingCurve,
        slot,
        symbol,
        name,
        metaUrl: uri,
        createdAt: Date.now()
      });
      
     logger.debug({ 
        mint: mintAddress,
        bondingCurve: bondingCurve,
        creator: creator,
        slot: slot,
        createdAt: Date.now()
      }, 'create mint');
    } catch (error) {
      logger.error({ error, mint: createEvent.mint.toString() }, 'Failed to save token info');
    }
    
  });
  // 处理来自 PumpFun 的交易事件
  listeners.on('transaction', async (transaction: TradeEvent, slot: number, signature: string) => {
    logger.debug({ mint: transaction.mint}, 'Detected PumpFun transaction');

    
    // 更新全局slot变量，供其它模块使用
    updateLatestSlot(slot);
    const tokenInfo = await tokenInfoService.getTokenInfo(transaction.mint.toString());
    if (!tokenInfo) {
      logger.debug({ mint: transaction.mint.toString() }, 'Token info not found, skip this transaction');
      return;
    }
    logger.debug({ mint: transaction.mint.toString(), tokenInfo: tokenInfo}, 'Token info found');

    
    // 如果启用了K线功能，处理交易数据
    if (KLINE_ENABLED && klineService) {
      try {
        // 将 PumpFun 交易事件转换为我们内部的 Trade 格式
        const trade = convertPumpFunTradeToTrade(transaction, slot);
        logger.debug({ trade ,slot, signature }, 'Trade details');
        if (trade) {
          // 处理交易以更新K线数据
          await klineService.processTrade(trade)
            .then(() => logger.debug({ mint: trade.tokenAddress }, 'Trade processed for K-line data'))
            .catch(error => logger.error({ error, mint: trade.tokenAddress }, 'Error processing trade for K-line data'));
          
          // 执行常规交易策略
          const mintAddress = trade.tokenAddress;
          try {
 
            
            // 执行常规策略（买入信号）
            const strategyResults = await strategyManager.executeStrategies(mintAddress,trade.price, slot);
            
            if (strategyResults.length > 0) {
              for (const result of strategyResults) {
                // 常规买入策略触发
                logger.info({ 
                  mint: mintAddress, 
                  strategy: result.message
                }, 'Strategy triggered buy signal');
                
                // 触发买入操作
                if (result.triggered) {
                  // 检查代币是否已经购买过
                    // 执行买入操作
                    bot.pumpBuy(mintAddress);
              
                }

              }
            }
            
            // 执行止盈止损策略（卖出信号）
            const tpslResult = await takeProfitStopLossManager.execute(mintAddress,trade.price, slot);
            if (tpslResult && tpslResult.triggered) {
              const { action,wallet, sellPercentage, currentPrice, tokenAmount } = tpslResult.data;
              
              // 这里可以添加卖出代币的逻辑
              logger.info({ 
                mintAddress, 
                action, 
                sellPercentage, 
                currentPrice 
              }, `${action === 'take_profit' ? '止盈' : '止损'}信号触发，准备卖出${sellPercentage}%仓位`);
              
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                // 止损时应该清仓，获取钱包实际持有的代币数量
                try {
   
                  // 获取实际代币数量
                  const allTokenAmount = await getSPLTokenBalance(
                    connection, 
                    new PublicKey(mintAddress), 
                    new PublicKey(wallet)
                  );
                  
                  logger.info({ 
                    mint: mintAddress, 
                    wallet: wallet, 
                    tokenAmount: allTokenAmount 
                  }, '获取到钱包实际代币数量，准备清仓');
                  
                  if (allTokenAmount && allTokenAmount > 0) {
                    await bot.bondingCurveSell(wallet, new PublicKey(mintAddress), BigInt(allTokenAmount*10**DEFAULT_DECIMALS), {
                      unitLimit: COMPUTE_UNIT_LIMIT,
                      unitPrice: COMPUTE_UNIT_PRICE
                    });
                  } else {
                    logger.warn({ mint: mintAddress, wallet: wallet }, '没有可卖出的代币数量');
                  }
                } catch (error) {
                  logger.error({ error, mint: mintAddress }, '获取代币数量或清仓失败');
                }
              }else{
                // TODO: 实现内盘卖出代币的逻辑
                await bot.bondingCurveSell(wallet, new PublicKey(mintAddress), BigInt(Math.floor(tokenAmount)), {
                  unitLimit: COMPUTE_UNIT_LIMIT,
                  unitPrice: COMPUTE_UNIT_PRICE
                });
              }


              // 如果是止损（清仓），清除入场价格记录
              if (action === 'stop_loss' || action === 'trailing_stop_loss') {
                takeProfitStopLossManager.clearEntryPrice(mintAddress);
                logger.info({ mint: mintAddress }, 'Cleared entry price after stop loss');
              }
            }
          } catch (error) {
            logger.error({ error, mint: mintAddress }, 'Error executing strategies');
          }
        }
      } catch (error) {
        logger.error({ error, mint: transaction.mint }, 'Error processing transaction for K-line data');
      }
    }
  });

  printDetails(primaryWallet, quoteToken, bot);

  const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3000;

  // 在 SIGINT 信号时停止机器人、监听器、K 线服务和 API 服务器
  process.on('SIGINT', async () => {
    logger.info('Stopping bot...');

    await listeners.stop();
    
    // Stop K-line service if enabled
    if (KLINE_ENABLED && klineService) {
      logger.info('Stopping K-line service...');
      await klineService.stop();
      logger.info('K-line service stopped');
    }
    

    
    logger.info('Strategy manager stopped');
    logger.info('Bot stopped');
    process.exit(0);
  });
};

runListener();

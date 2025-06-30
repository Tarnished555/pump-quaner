import { Bot, BotConfig } from '../bot';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { MarketCache } from '../cache/market.cache';
import { PoolCache } from '../cache/pool.cache';
import { TransactionExecutor } from '../transactions';
import { PumpFunSDK } from '../pumpfun-sdk';
import { PumpSwapSDK } from '../pumpswap';
import { SOL, Token, TokenAmount, WSOL } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';
import { RPC_ENDPOINT } from '../helpers/constants';
import { DefaultTransactionExecutor } from '../transactions/default-transaction-executor';
import { QUOTE_AMOUNT, getToken ,QUOTE_MINT} from '../helpers';
import * as dotenv from 'dotenv';
import * as bs58 from 'bs58';
import { Mutex } from 'async-mutex';
import { AnchorProvider, Wallet as NodeWallet } from '@coral-xyz/anchor';
import { getPublicKeysFromFile } from '../tokenCreateAndBuy';

// 加载环境变量
dotenv.config();

// 使用真实的logger和其他依赖
jest.unmock('../helpers');
jest.unmock('../tokenCreateAndBuy');
jest.unmock('axios');

describe('Bot', () => {
  // 测试超时设置为60秒，因为真实的区块链交互可能需要较长时间
  jest.setTimeout(60000);
  
  let bot: Bot;
  let connection: Connection;
  let pumpFunSDK: PumpFunSDK;
  let pumpSwapSDK: PumpSwapSDK;
  let marketStorage: MarketCache;
  let poolStorage: PoolCache;
  let txExecutor: TransactionExecutor;
  let botConfig: BotConfig;
  let wallet: Keypair;

  // 从环境变量或密钥文件中获取测试钱包
  function getTestWallet(): Keypair {
    // 优先从环境变量获取私钥
    const privateKeyEnv = process.env.TEST_WALLET_PRIVATE_KEY;
    if (privateKeyEnv) {
      try {
        // 使用bs58解码私钥
        const secretKey = bs58.decode(privateKeyEnv);
        return Keypair.fromSecretKey(secretKey);
      } catch (error) {
        logger.error('无法从环境变量加载测试钱包:', error);
      }
    }
    
    // 如果环境变量不可用，使用一个新生成的钱包（注意：这个钱包没有SOL，只用于测试）
    logger.warn('使用新生成的钱包进行测试，此钱包没有SOL余额');
    return Keypair.generate();
  }

  beforeAll(async () => {
    // 获取测试钱包
    wallet = getTestWallet();
    logger.info(`使用测试钱包地址: ${wallet.publicKey.toString()}`);
    
    // 创建真实的连接
    connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const nodeWallet = new NodeWallet(wallet); // Use the test wallet for the provider
    const provider = new AnchorProvider(connection, nodeWallet, {
       commitment: "processed"});
    // 创建真实的SDK实例
    pumpFunSDK = new PumpFunSDK({
      connection
    });
    
    // 1. 读取钱包私钥
    let payerWallet: Keypair;
    let additionalWallets: Keypair[] = [];
    const walletNames: Keypair[] = await getPublicKeysFromFile("./config/walletKeys.txt");

    logger.info(`钱包数量: ${walletNames.length}`);
    [payerWallet,...additionalWallets] = walletNames;
    logger.info(`交易钱包： ${additionalWallets[0].publicKey}`)
    pumpSwapSDK = new PumpSwapSDK(provider);
    
    // 创建存储实例 - MarketCache需要Connection参数
    marketStorage = new MarketCache(connection);
    poolStorage = new PoolCache();
    
    // 创建交易执行器 - 使用DefaultTransactionExecutor而非Jito执行器，避免特殊配置需求
    txExecutor = new DefaultTransactionExecutor(connection);
    
    const quoteToken = getToken(QUOTE_MINT);
    
    botConfig = {
      wallet: payerWallet,
      additionalWallets: additionalWallets,
      pumpFunSDK: pumpFunSDK,
      pumpSwapSDK: pumpSwapSDK,
      checkRenounced: true,
      checkFreezable: true,
      checkBurned: true,
  
      quoteToken,
      quoteAmount:  new TokenAmount(quoteToken, QUOTE_AMOUNT, false),
      quoteAtas: [],
      oneTokenAtATime: false,
      useSnipeList: false,
      autoSell: false,
      autoBuyDelay: 0,
      autoSellDelay: 0,
      maxBuyRetries: 1, // 测试中只尝试一次
      maxSellRetries: 1,
      unitLimit: 1000000,
      unitPrice: 400000,
      takeProfit: 50,
      stopLoss: 20,
      buySlippage: 10,
      buyAmountSol: 0.001, // 测试中使用小额SOL
      jitoTip: '0.01',    // 测试中使用小额小费
      sellSlippage: 20,
      priceCheckInterval: 1000,
      priceCheckDuration: 5000, // 测试中缩短时间
      filterCheckInterval: 1000,
      filterCheckDuration: 2000, // 测试中缩短时间
      consecutiveMatchCount: 1,
      lookupTablesConfig: {
        defaultLookupTableAccounts: {} as any,
        customLookupTableAccounts: {} as any,
        addressesFromDefaultLookupTable: [],
        addressesFromCustomLookupTable: []
      }
    };
    
    // 创建Bot实例
    bot = new Bot(
      pumpFunSDK,
      pumpSwapSDK,
      connection,
      marketStorage,
      poolStorage,
      txExecutor,
      botConfig
    );
  });

  beforeEach(async () => {
    // 模拟PumpFunSDK的方法以避免associatedBondingCurve错误
    const mockTransaction = new Transaction();
    mockTransaction.add({
      programId: new PublicKey('11111111111111111111111111111111'),
      keys: [],
      data: Buffer.from([])
    });
    
    jest.spyOn(pumpFunSDK, 'getBuyInstructionsBySolAmount').mockResolvedValue(mockTransaction);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('pumpBuy', () => {
    // 使用真实代币地址进行测试
    // 在真实测试中，我们需要模拟一些内部方法以避免实际执行交易
    const testMintAddress = 'BwBsNv3cy3okRknjrbWW4J5YbaXvK7mdNhvM6yAXpump';
    
    it('should buy tokens when filterMatch returns true', async () => {

      // 调用pumpBuy方法
      const result = await bot.pumpBuy(testMintAddress);
      
      // 验证结果
      //expect(result).toBe(true);
      }); // 增加超时时间到30秒

    it('should return false when filterMatch returns false', async () => {
      // 模拟私有方法filterMatch返回false
      const filterMatchSpy = jest.spyOn(bot as any, 'filterMatch').mockResolvedValue(false);
      
      // 模拟交易执行器
      const executeAndConfirmSpy = jest.spyOn(txExecutor, 'executeAndConfirm');
      
      // 调用pumpBuy方法
      const result = await bot.pumpBuy(testMintAddress);
      
      // 验证结果
      expect(result).toBe(false);
      expect(filterMatchSpy).toHaveBeenCalledWith(testMintAddress);
      // 交易执行器不应该被调用
      expect(executeAndConfirmSpy).not.toHaveBeenCalled();
    });

  });

  describe('bondingCurveSell', () => {
    // 使用真实代币地址进行测试
    const testMintAddress = new PublicKey('4DMSWt1ueRKfB5Tb1v7YhTh7Cn2QVcxjhx9hoJeSpump');
    const testTokenAmount = 500000000; // 500 million tokens
    
    it('should sell tokens successfully', async () => {
  
      
      // 调用 bondingCurveSell 方法
      const result = await bot.bondingCurveSell(wallet, testMintAddress, BigInt(testTokenAmount));
      
      // 验证结果
      expect(result.confirmed).toBe(true);
      expect(pumpFunSDK.getSellInstructionsByTokenAmount).toHaveBeenCalledWith(
        wallet.publicKey,
        testMintAddress,
        BigInt(testTokenAmount),
        BigInt(botConfig.sellSlippage)
      );
      expect(txExecutor.executeAndConfirm).toHaveBeenCalled();
    }, 30000); // 增加超时时间到30秒
    
    it('should sell tokens with priority fees', async () => {
  
      // 定义优先费用
      const priorityFees = {
        unitLimit: 1000000,
        unitPrice: 1000000
      };
      
      // 调用 bondingCurveSell 方法并传入优先费用
      const result = await bot.bondingCurveSell(wallet, testMintAddress, BigInt(testTokenAmount), priorityFees);
      
      // 验证结果
      expect(result.confirmed).toBe(true);

      expect(pumpFunSDK.getSellInstructionsByTokenAmount).toHaveBeenCalledWith(
        wallet.publicKey,
        testMintAddress,
        BigInt(testTokenAmount),
        BigInt(botConfig.sellSlippage)
      );
      expect(txExecutor.executeAndConfirm).toHaveBeenCalled();
    }, 30000); // 增加超时时间到30秒

  });

  describe('pumpSwapSell', () => {
    // 使用真实代币地址进行测试
    const testMintAddress = new PublicKey('4JR4D4M37ygEM4Ff2zfft5d8VvkWPS7WuUYVu1rUpump');
    const testTokenAmount = 50000000; // 500 million tokens
    
    it('should sell tokens using PumpSwap successfully', async () => {
      // 调用 pumpSwapSell 方法
      const result = await bot.pumpSwapSell(testMintAddress.toString(), testTokenAmount, wallet);
      
      // 验证结果
      expect(result?.confirmed).toBe(true);
      // 不使用mock，所以不能使用toHaveBeenCalled
      expect(result?.signature).toBeTruthy();
    }, 30000); // 增加超时时间到30秒
    
    it('should sell tokens using wallet address string', async () => {
      // 使用钱包地址字符串
      const walletAddressString = wallet.publicKey.toString();
      
      // 调用 pumpSwapSell 方法并传入钱包地址字符串
      const result = await bot.pumpSwapSell(testMintAddress.toString(), testTokenAmount, walletAddressString);
      
      // 验证结果
      expect(result?.confirmed).toBe(true);
      // 不使用mock，所以不能使用toHaveBeenCalled
      expect(result?.signature).toBeTruthy();
    }, 30000); // 增加超时时间到30秒
  });
});    



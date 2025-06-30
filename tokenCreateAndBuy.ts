import { PublicKey, Connection, Keypair, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram, SystemProgram, VersionedTransaction, TransactionMessage, AddressLookupTableAccount, BlockhashWithExpiryBlockHeight } from "@solana/web3.js";
import axios from "axios";
import fs from 'fs';

import {  createAddressLookupTable, extendAddressLookupTable } from "./utils/addressLookupTable";
import { PumpFunSDK } from "./pumpfun-sdk"
import bs58 from "bs58";
import {logger} from "./helpers";
import { TokenInfo } from "./services/token-info.service";



interface JitoResponse {
  data: any;
}

interface LookupTableResult {
  lookupTableAddress: PublicKey;
  signature: string;
}


// Configuration and initialization parameters
interface GlobalLookupTableConfig {
  defaultLookup: PublicKey;
  lookupTableAddress: PublicKey;
}

export interface LookupTablesConfig {
  defaultLookupTableAccounts: AddressLookupTableAccount;
  customLookupTableAccounts: AddressLookupTableAccount;
  addressesFromDefaultLookupTable: PublicKey[];
  addressesFromCustomLookupTable: PublicKey[];
}



// 从加密文件中读取钱包私钥
export async function getPublicKeysFromFile(filePath: string, password?: string): Promise<Keypair[]> {
  try {
    let fileContent: string;
    const encryptedFilePath = filePath.replace('.txt', '.encrypted');
    
    logger.debug(`检查加密文件: ${encryptedFilePath}`);
    logger.debug(`检查原始文件: ${filePath}`);
    
    // 检查是否存在加密文件
    if (fs.existsSync(encryptedFilePath) && password) {
      logger.info('找到加密文件，尝试解密...');
      try {
        // 直接使用内部函数解密，避免动态导入问题
        const encryptedContent = await fs.promises.readFile(encryptedFilePath, 'utf8');
        logger.info(`加密文件内容长度: ${encryptedContent.length}`);
        
        const parts = encryptedContent.split(':');
        logger.info(`加密文件分割后的部分数: ${parts.length}`);
        
        if (parts.length !== 2) {
          throw new Error(`加密文件格式不正确: 应为 'iv:data' 格式，实际分割后有 ${parts.length} 部分`);
        }
        
        const [ivHex, encryptedData] = parts;
        logger.info(`IV长度: ${ivHex.length}, 加密数据长度: ${encryptedData.length}`);
        
        if (!ivHex || !encryptedData) {
          throw new Error('加密文件格式不正确: IV或加密数据为空');
        }
        
        // 使用与加密脚本相同的解密方式
        const crypto = require('crypto');
        logger.info(`使用密码长度: ${password.length}`);
        
        // 创建密钥（使用SHA-256哈希密码生成32字节密钥）
        const key = crypto.createHash('sha256').update(password).digest();
        logger.info(`生成的密钥长度: ${key.length}`);
        
        // 从十六进制字符串转换回IV
        try {
          const iv = Buffer.from(ivHex, 'hex');
          logger.info(`IV buffer长度: ${iv.length}`);
          
          if (iv.length !== 16) {
            throw new Error(`IV长度不正确: ${iv.length} 字节, 应为16字节`);
          }
          
          // 创建解密器
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
          
          // 解密数据
          let decrypted;
          try {
            decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            logger.info(`解密后的数据长度: ${decrypted.length}`);
            
            fileContent = decrypted;
            logger.info('成功解密钱包私钥文件');
          } catch (finalError: any) {
            logger.error('解密数据失败:', finalError);
            throw new Error(`解密数据失败: ${finalError.message || '未知错误'}，请检查密码是否正确`);
          }
        } catch (ivError: any) {
          logger.error('创建IV失败:', ivError);
          throw new Error(`创建IV失败: ${ivError.message || '未知错误'}`);
        }
      } catch (decryptError: any) {
        logger.error('解密失败:', decryptError);
        throw new Error(`解密失败: ${decryptError.message || '未知错误'}`);
      }
    } else if (fs.existsSync(filePath)) {
      // 如果没有加密文件但有明文文件，直接读取
      fileContent = await fs.promises.readFile(filePath, 'utf8');
      logger.warn('使用未加密的钱包私钥文件，建议使用加密文件以提高安全性');
    } else {
      throw new Error(`找不到钱包私钥文件: ${filePath} 或 ${encryptedFilePath}`);
    }
    
    const lines: string[] = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const wallets: Keypair[] = [];

    for (const line of lines) {
      try {
        const secretKey = bs58.decode(line);
        const keypair = Keypair.fromSecretKey(secretKey);
        wallets.push(keypair);
      } catch (err) {
        logger.error(`无法解析私钥: ${line.substring(0, 10)}...`, err);
      }
    }

    return wallets;
  } catch (err) {
    logger.error("读取钱包密钥文件失败:", err);
    throw err; // 抛出错误以便上层处理
  }
}

function getRandomInRange(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 初始化配置
async function initializeConfig(connection: Connection, payer: Keypair): Promise<GlobalLookupTableConfig> {

  // 默认地址查表地址，不可去掉
  const defaultLookupPublicKey: string = "8GG7J73ZUgTiv8SKBjqCjQbiaJXZKuNbjm1uhK3p3Zim";
  const defaultLookup: PublicKey = new PublicKey(defaultLookupPublicKey);

   // 创建地址查找表
  const lookupTableResult = await createAddressLookupTable(connection, payer);
  if (!lookupTableResult) {
    throw new Error("创建地址查找表失败");
  }
  const { lookupTableAddress, signature } = lookupTableResult;
  logger.info("地址查表地址", lookupTableAddress.toBase58());
  logger.info("交易签名", signature);

  return {
    defaultLookup,
    lookupTableAddress,
   };
}
// 设置查找表
async function setupLookupTables(connection: Connection, config: GlobalLookupTableConfig, payer: Keypair, walletNames: Keypair[]): Promise<LookupTablesConfig> {
  const { defaultLookup, lookupTableAddress } = config;
  
  // 提取钱包公钥添加到地址查表地址中
  const walletPublicKeys: PublicKey[] = walletNames.map(wallet => {
    if (wallet.publicKey) {
      return new PublicKey(wallet.publicKey);
    } else {
      throw new Error(`钱包缺少公钥字段: ${JSON.stringify(wallet)}`);
    }
  });

  // 添加地址到地址查表
  const extend = await extendAddressLookupTable(connection, payer, lookupTableAddress, walletPublicKeys);
  if (!extend) {
    throw new Error("扩展地址查找表失败");
  }
  logger.info("交易签名", extend);

  // 获取默认查找表账户
  const lookupTableAccountInfo = await connection.getAddressLookupTable(defaultLookup);
  if (!lookupTableAccountInfo.value) {
    throw new Error("没有找到有效的默认查找表账户，停止操作。");
  }
  const defaultLookupTableAccounts = lookupTableAccountInfo.value;

  const addressesFromDefaultLookupTable: PublicKey[] = defaultLookupTableAccounts.state.addresses;
  if (addressesFromDefaultLookupTable.length === 0) {
    throw new Error("默认查找表中没有有效的地址，停止操作。");
  }

  const customLookupTableAccountInfo = await connection.getAddressLookupTable(lookupTableAddress);
  if (!customLookupTableAccountInfo.value) {
    throw new Error("没有找到有效的自定义查找表账户，停止操作。");
  }
  const customLookupTableAccounts = customLookupTableAccountInfo.value;
  
  const addressesFromCustomLookupTable: PublicKey[] = customLookupTableAccounts.state.addresses;
  if (addressesFromCustomLookupTable.length === 0) {
    throw new Error("自定义查找表中没有有效的地址，停止操作。");
  }

  return {
    defaultLookupTableAccounts,
    customLookupTableAccounts,
    addressesFromDefaultLookupTable,
    addressesFromCustomLookupTable
  };
}

// 创建Jito交易
async function createJitoTransaction( payer: Keypair , latestBlockhash: BlockhashWithExpiryBlockHeight, jitoTip: number): Promise<VersionedTransaction> {

  let jitoTx: Transaction = new Transaction();
  
  // 选择Jito小费钱包
  const jitoTipAccounts: string[] = [
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  ];

  const randomIndex: number = Math.floor(Math.random() * jitoTipAccounts.length);
  const randomJitoTipAccount: string = jitoTipAccounts[randomIndex];
  logger.info("随机选择的小费钱包地址:", {randomJitoTipAccount});

  // 创建转账指令
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: payer.publicKey,             // 支付tip小费的钱包地址
    toPubkey: new PublicKey(randomJitoTipAccount),  // 收小费的钱包地址
    lamports: jitoTip * LAMPORTS_PER_SOL,            // 给小费的金额
  });

  jitoTx.add(transferInstruction);

  // 构建消息并创建交易
  const messageJito = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: jitoTx.instructions,
  }).compileToV0Message();

  const transactionJito = new VersionedTransaction(messageJito);

  // 签名v0交易
  transactionJito.sign([payer]);
  
  return transactionJito;
}

// 创建钱包批次交易
async function createWalletChunkTransactions(
  sdk: PumpFunSDK,
  buyAmountSol: bigint,
  mint: PublicKey,
  walletChunks: Keypair[],
  buySlippage: number,
  latestBlockhash: BlockhashWithExpiryBlockHeight,
  lookupTablesConfig?: LookupTablesConfig,

): Promise<VersionedTransaction[]> {
 

  
  const allTransactions: VersionedTransaction[] = [];
  
  for (let chunkIndex = 0; chunkIndex < walletChunks.length; chunkIndex++) {
    const keypair = walletChunks[chunkIndex];
    logger.info(`处理第 ${chunkIndex + 1} 个钱包`);
    let chunkTx: Transaction = new Transaction();

      
      ///////////////// 动态滑点修改: 移除随机买入金额,改用动态滑点 /////////////////
      // 根据批次和位置计算动态滑点
      const dynamicSlippage: bigint = calculateDynamicSlippage(chunkIndex, buySlippage);
      ///////////////////////////////////////////////////////////////////////////

      // Use the correct types for the SDK function
      const instruction = await sdk.getBuyInstructionsBySolAmount(
        keypair.publicKey,
        mint,
        buyAmountSol,
        dynamicSlippage,
        'confirmed'
      );
      
      instruction.instructions.forEach((instruction) => {
        chunkTx.add(instruction);
      });
    

    // 添加计算单元和优先费用指令
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 });
    chunkTx.add(modifyComputeUnits, addPriorityFee);

    //TODO 创建交易消息
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: chunkTx.instructions,
    }).compileToV0Message([]);
 
    const transactionV0 = new VersionedTransaction(message);
    const serializedMsg = transactionV0.serialize();
    logger.info(`交易大小:${serializedMsg.length}`);

    if (serializedMsg.length > 1232) {
      logger.info("交易过大");
    }

    // 签名交易
    transactionV0.sign([keypair]);
    allTransactions.push(transactionV0);
  }
  
  return allTransactions;
}

// Define the return type for Jito transaction submission
interface JitoTransactionResult {
  success: boolean;
  data?: any;
  error?: Error;
  timeTaken?: number;
  transactionCount: number;
  signatures: string[];
}

// 发送交易到Jito
async function sendTransactionsToJito(jitoTransaction: VersionedTransaction, walletTransactions: VersionedTransaction[]): Promise<JitoTransactionResult> {
  const base58Transaction: string = bs58.encode(jitoTransaction.serialize());
  const signatures: string[] = [bs58.encode(jitoTransaction.signatures[0])];
  
  const jitoTransactions: string[] = [base58Transaction];
  for (const tx of walletTransactions) {
    const serializedTransaction: string = bs58.encode(tx.serialize());
    jitoTransactions.push(serializedTransaction);
    
    // Collect all transaction signatures
    if (tx.signatures[0]) {
      signatures.push(bs58.encode(tx.signatures[0]));
    }
  }

  logger.info(`完成创建的交易批次开始提交到Jito: ${walletTransactions.length}`);

  try {
    const url: string = "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles";
    const data = {
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [jitoTransactions]
    };
    const headers = {
      'Content-Type': 'application/json'
    };
    
    const startTime: number = Date.now();
    try {
      const response = await axios.post(url, data, { headers });
      
      // Properly log the response data
      logger.info(`Jito交易提交结果: ${JSON.stringify(response.data, null, 2)}`);
      
      // Check if the response indicates success
      if (!response.data || !response.data.result) {
        logger.error(`提交失败: 无效的响应数据: ${JSON.stringify(response.data)}`);
        return {
          success: false,
          error: new Error("Invalid response data from Jito"),
          transactionCount: jitoTransactions.length,
          signatures
        };
      }
      
      const txn_sig = response.data.result;
      logger.info(`Jito交易签名: ${txn_sig}`);
      const endTime: number = Date.now();
      const timeTaken: number = endTime - startTime;
      logger.info(`提交耗时: ${timeTaken} ms`);
      
      // Add the signature to our list
      signatures.push(txn_sig);
      
      // Return success result with transaction data
      return {
        success: true,
        data: response.data,
        timeTaken,
        transactionCount: jitoTransactions.length,
        signatures
      };
    } catch (innerError) {
      logger.error(`Jito API调用失败: ${innerError}`);
      return {
        success: false,
        error: innerError instanceof Error ? innerError : new Error(String(innerError)),
        transactionCount: jitoTransactions.length,
        signatures
      };
    }
  } catch (error) {
    logger.error(`提交失败: ${error}`);
    
    // Return error result
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      transactionCount: jitoTransactions.length,
      signatures
    };
  }
}

// 初始化钱包私钥
export async function initWalletNames(): Promise<Keypair[]> {
  try {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // 提示用户输入密码
    const password = await new Promise<string>((resolve) => {
      rl.question('请输入钱包私钥解密密码: ', (answer: string) => {
        // 隐藏输入的密码，不在控制台显示
        process.stdout.write('\u001B[1A'); // 向上移动一行
        process.stdout.write('请输入钱包私钥解密密码: ********\n'); // 覆盖输入的密码
        resolve(answer);
      });
    });
    
    rl.close();
    
    // 读取并解密钱包私钥
    const walletNames: Keypair[] = await getPublicKeysFromFile("./config/walletKeys.txt", password);
    logger.info(`钱包数量: ${walletNames.length}`);
    return walletNames;
  } catch (error) {
    logger.error("初始化钱包时发生错误:", error);
    throw error;
  }
}

// 初始化查找表配置
export async function initLookupTableConfig(connection: Connection, walletNames: Keypair[]): Promise<LookupTablesConfig> {
  try {
    // 初始化配置
    const payer: Keypair = walletNames[0];
    const config = await initializeConfig(connection, payer);

    // 设置查找表
    const lookupTablesConfig = await setupLookupTables(connection, config, payer, walletNames);
    return lookupTablesConfig;
  } catch (error) {
    logger.error("初始化查找表配置时发生错误:", error);
    throw error;
  }
}

// 原始初始化方法（保留向后兼容性）
export async function init(connection: Connection): Promise<{walletNames: Keypair[], lookupTablesConfig: LookupTablesConfig}> {
  try {
    // 1. 初始化钱包
    const walletNames = await initWalletNames();
    
    // 2. 初始化查找表配置
    const lookupTablesConfig = await initLookupTableConfig(connection, walletNames);
    
    return {walletNames, lookupTablesConfig};
  } catch (error) {
    logger.error("执行过程中发生错误:", error);
    throw error; // Re-throw the error so the caller knows something went wrong
  }
};

// 
interface PumpSwapResult {
  confirmed: boolean;
  signature?: string;
  error?: Error;
}

export async function pumpSwap(sdk: PumpFunSDK,latestBlockhash: BlockhashWithExpiryBlockHeight, buyAmountSol: number, jitoTip: number, mint: PublicKey,payer: Keypair, walletNames: Keypair[], buySlippage: number,lookupTablesConfig: LookupTablesConfig): Promise<PumpSwapResult> {
  try {
    logger.info(`获取区块哈希: ${latestBlockhash.blockhash}`);
    
    // 6. 创建Jito交易
    const jitoTransaction = await createJitoTransaction(payer, latestBlockhash, jitoTip);
    
    const buyAmountSolLamports = BigInt(buyAmountSol * LAMPORTS_PER_SOL);
    
    // 7. 创建多钱包捆绑交易指令
    const walletTransactions = await createWalletChunkTransactions(
      sdk,
      buyAmountSolLamports,
      mint,
      walletNames,
      buySlippage,
      latestBlockhash,
      lookupTablesConfig
    );
    
    // 8. 发送交易到Jito
    const jitoResult = await sendTransactionsToJito(jitoTransaction, walletTransactions);
    
    logger.info("交易上链处理完成");
    
    // Return success result based on Jito transaction result
    if (jitoResult.success) {
      return {
        confirmed: true,
        signature: jitoResult.signatures[0] // Use the first signature from the result
      };
    } else {
      // If Jito submission failed but didn't throw an error
      return {
        confirmed: false,
        error: jitoResult.error || new Error("Jito transaction submission failed")
      };
    }
  } catch (error) {
    logger.error("执行交易过程中发生错误:", error);
    
    // Return error result
    return {
      confirmed: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
///////////////// 动态滑点修改: 更新滑点百分比 /////////////////
export function calculateDynamicSlippage(chunkIndex: number, buySlippage: number): bigint {
  // 基础滑点 1000%
  const baseSlippage: bigint = BigInt(10000);
  // 每批次增加 100% 的滑点
  const chunkSlippage: bigint = BigInt(chunkIndex * buySlippage*100);

  return baseSlippage + chunkSlippage;
}

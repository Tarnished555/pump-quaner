import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../helpers/logger';
import { encryptWalletKeysFile } from '../helpers/encryption';

/**
 * 钱包私钥加密工具
 * 用于将明文钱包私钥文件加密为安全格式
 */
async function main() {
  try {
    // 检查命令行参数
    if (process.argv.length < 3) {
      console.log('使用方法: ts-node encrypt-wallet-keys.ts <密码>');
      console.log('示例: ts-node encrypt-wallet-keys.ts mySecurePassword');
      process.exit(1);
    }

    // 获取密码参数
    const password = process.argv[2];
    
    // 设置文件路径
    const inputFilePath = path.resolve(__dirname, '../config/walletKeys.txt');
    const outputFilePath = path.resolve(__dirname, '../config/walletKeys.encrypted');
    
    // 检查输入文件是否存在
    if (!fs.existsSync(inputFilePath)) {
      console.error(`错误: 找不到钱包私钥文件 ${inputFilePath}`);
      process.exit(1);
    }
    
    // 加密文件
    await encryptWalletKeysFile(inputFilePath, outputFilePath, password);
    
    console.log('✅ 钱包私钥文件加密成功!');
    console.log(`📁 加密文件已保存到: ${outputFilePath}`);
    console.log('🔒 请妥善保管您的加密密码，忘记密码将无法恢复私钥!');
    console.log('💡 建议在确认加密文件可以正常使用后，删除明文私钥文件以提高安全性。');
    
  } catch (error) {
    console.error('加密钱包私钥文件时发生错误:', error);
    process.exit(1);
  }
}

// 执行主函数
main();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 加密字符串
 * @param {string} text 要加密的文本
 * @param {string} password 加密密码
 * @returns {string} 加密后的文本（格式：iv:加密数据）
 */
function encrypt(text, password) {
  try {
    // 创建密钥（使用SHA-256哈希密码生成32字节密钥）
    const key = crypto.createHash('sha256').update(password).digest();
    // 创建随机初始化向量
    const iv = crypto.randomBytes(16);
    // 创建加密器
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    // 加密数据
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // 返回格式：iv:加密数据
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('加密失败:', error);
    throw new Error('加密失败');
  }
}

/**
 * 加密钱包私钥文件
 * @param {string} inputFilePath 输入文件路径（明文私钥）
 * @param {string} outputFilePath 输出文件路径（加密私钥）
 * @param {string} password 加密密码
 */
async function encryptWalletKeysFile(inputFilePath, outputFilePath, password) {
  try {
    // 读取明文私钥文件
    const fileContent = fs.readFileSync(inputFilePath, 'utf8');
    // 加密内容
    const encryptedContent = encrypt(fileContent, password);
    // 写入加密文件
    fs.writeFileSync(outputFilePath, encryptedContent, 'utf8');
    console.log(`钱包私钥已加密并保存到 ${outputFilePath}`);
  } catch (error) {
    console.error('加密钱包私钥文件失败:', error);
    throw error;
  }
}

/**
 * 钱包私钥加密工具
 * 用于将明文钱包私钥文件加密为安全格式
 */
async function main() {
  try {
    // 检查命令行参数
    if (process.argv.length < 3) {
      console.log('使用方法: node encrypt-wallet-keys.js <密码>');
      console.log('示例: node encrypt-wallet-keys.js mySecurePassword');
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

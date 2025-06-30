import * as crypto from 'crypto';
import * as fs from 'fs';
import { logger } from '../helpers/logger';

/**
 * 加密字符串
 * @param text 要加密的文本
 * @param password 加密密码
 * @returns 加密后的文本（格式：iv:加密数据）
 */
export function encrypt(text: string, password: string): string {
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
    logger.error('加密失败:', error);
    throw new Error('加密失败');
  }
}

/**
 * 解密字符串
 * @param encryptedText 加密的文本（格式：iv:加密数据）
 * @param password 解密密码
 * @returns 解密后的文本
 */
export function decrypt(encryptedText: string, password: string): string {
  try {
    // 分离IV和加密数据
    const [ivHex, encryptedData] = encryptedText.split(':');
    if (!ivHex || !encryptedData) {
      throw new Error('加密文本格式不正确');
    }
    
    // 创建密钥（使用SHA-256哈希密码生成32字节密钥）
    const key = crypto.createHash('sha256').update(password).digest();
    // 从十六进制字符串转换回IV
    const iv = Buffer.from(ivHex, 'hex');
    // 创建解密器
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    // 解密数据
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('解密失败:', error);
    throw new Error('解密失败，请检查密码是否正确');
  }
}

/**
 * 加密钱包私钥文件
 * @param inputFilePath 输入文件路径（明文私钥）
 * @param outputFilePath 输出文件路径（加密私钥）
 * @param password 加密密码
 */
export async function encryptWalletKeysFile(inputFilePath: string, outputFilePath: string, password: string): Promise<void> {
  try {
    // 读取明文私钥文件
    const fileContent = await fs.promises.readFile(inputFilePath, 'utf8');
    // 加密内容
    const encryptedContent = encrypt(fileContent, password);
    // 写入加密文件
    await fs.promises.writeFile(outputFilePath, encryptedContent, 'utf8');
    logger.info(`钱包私钥已加密并保存到 ${outputFilePath}`);
  } catch (error) {
    logger.error('加密钱包私钥文件失败:', error);
    throw error;
  }
}

/**
 * 解密钱包私钥文件
 * @param encryptedFilePath 加密文件路径
 * @param password 解密密码
 * @returns 解密后的文件内容
 */
export async function decryptWalletKeysFile(encryptedFilePath: string, password: string): Promise<string> {
  try {
    // 读取加密文件
    const encryptedContent = await fs.promises.readFile(encryptedFilePath, 'utf8');
    // 解密内容
    const decryptedContent = decrypt(encryptedContent, password);
    return decryptedContent;
  } catch (error) {
    logger.error('解密钱包私钥文件失败:', error);
    throw error;
  }
}

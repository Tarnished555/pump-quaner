import { Request, Response } from 'express';
// Import the function that reads wallets from the file
import { getGlobalAdditionalWallets } from '../helpers'; 
import { logger } from '../helpers';

/**
 * Handler for fetching the public keys of configured additional wallets.
 */
export async function getAdditionalWallets(req: Request, res: Response) {
  logger.info('Fetching additional wallets configuration (public keys only)');
  
  // 设置缓存控制头，防止浏览器缓存此API响应
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  try {
    // Load the keypairs from the file
    const walletKeypairs = getGlobalAdditionalWallets();
    logger.info(`Global additional wallets count: ${walletKeypairs ? walletKeypairs.length : 0}`);

    // Separate primary and additional, then get public keys
    if (Array.isArray(walletKeypairs) && walletKeypairs.length > 0) {
      // Extract public keys (addresses) from all keypairs
      // Note: The frontend will get the full list including the 'primary' one.
      // The distinction between primary/additional is mostly for backend bot logic.
      // 详细记录每个钱包的公钥
      logger.info('钱包公钥详情:');
      walletKeypairs.forEach((kp, index) => {
        logger.info(`钱包 ${index}: ${kp.publicKey.toString()}`);
      });
      
      const walletAddresses = walletKeypairs.map(kp => kp.publicKey.toString());
      logger.info(`Loaded wallet addresses: [${walletAddresses.join(', ')}]`);
      
      // 添加时间戳以确保每次响应都不同
      res.json({
        success: true,
        data: walletAddresses, // Send only public keys
        timestamp: Date.now() // 添加时间戳确保响应唯一性
      });
    } else {
      logger.warn('No wallets found or loaded from walletKeys.txt');
      res.json({ 
        success: true, 
        data: [], 
        timestamp: Date.now() // 添加时间戳确保响应唯一性
      }); // Return empty array if none found
    }
  } catch (error) {
    logger.error({ error }, 'Error fetching additional wallets configuration');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch additional wallets configuration'
    });
  }
}

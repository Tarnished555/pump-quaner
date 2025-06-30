import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';

/**
 * 从私钥字符串创建钱包
 * @param wallet 私钥字符串
 * @returns Keypair 实例
 */
export function getWalletFromString(wallet: string): Keypair {
  // most likely someone pasted the private key in binary format
  if (wallet.startsWith('[')) {
    const raw = new Uint8Array(JSON.parse(wallet))
    return Keypair.fromSecretKey(raw);
  }

  // most likely someone pasted mnemonic
  if (wallet.split(' ').length > 1) {
    const seed = mnemonicToSeedSync(wallet, '');
    const path = `m/44'/501'/0'/0'`; // we assume it's first path
    return Keypair.fromSeed(derivePath(path, seed.toString('hex')).key);
  }

  // most likely someone pasted base58 encoded private key
  return Keypair.fromSecretKey(bs58.decode(wallet));
}

/**
 * 获取单个钱包或多个钱包
 * @param privateKeyStr 单个私钥字符串或以逗号分隔的多个私钥字符串
 * @returns 单个钱包时返回Keypair，多个钱包时返回Keypair数组
 */
export function getWallet(privateKeyStr: string): Keypair | Keypair[] {
  // 检查是否有逗号，表示多个钱包
  if (privateKeyStr.includes(',')) {
    const privateKeys = privateKeyStr.split(',').map(key => key.trim()).filter(key => key.length > 0);
    return privateKeys.map(key => getWalletFromString(key));
  }
  
  // 单个钱包情况
  return getWalletFromString(privateKeyStr.trim());
}

export function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}


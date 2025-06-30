import { Connection } from '@solana/web3.js';

/**
 * 策略结果接口
 */
export interface StrategyResult {
  /** 策略是否触发 */
  triggered: boolean;
  /** 策略结果消息 */
  message: string;
  /** 可选的额外数据 */
  data?: any;
}

/**
 * 策略接口
 */
export interface Strategy {
  /**
   * 执行策略检查
   * @param mintAddress 代币铸造地址
   * @param slot 区块槽位号（可选）
   * @returns 策略结果
   */
  execute(mintAddress: string, price?:number,slot?:number): Promise<StrategyResult>;
}

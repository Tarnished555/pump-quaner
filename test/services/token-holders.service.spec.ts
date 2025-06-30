import { TokenHoldersService, TokenHolder } from '../../services/token-holders.service';
import { logger } from '../../helpers';
import { RPC_ENDPOINT } from '../../helpers/constants';

// 使用真实的logger而不是mock的版本
jest.unmock('../../helpers');
jest.unmock('../../services/token-holders.service');
// 不再模拟axios
jest.unmock('axios');

describe('TokenHoldersService', () => {
  let service: TokenHoldersService;
  
  // 使用应用中配置的真实RPC URL
  beforeEach(() => {
    service = new TokenHoldersService(RPC_ENDPOINT);
  });
  
  // 测试超时设置为30秒，因为真实的API调用可能需要更长时间
  jest.setTimeout(250000);

  describe('getTokenHolders', () => {
    // 使用真实的PumpFun代币地址
    const realMintAddress = '7ZRgHFqwdzvqhfmg19rSQBD6CZe5iEDkuZoaNUhpump';

    it('should return real token holders from the Solana network', async () => {
      // 使用真实的API调用获取数据
      const result = await service.getTokenHolders(realMintAddress, 30, false);
      const topHolders = result.slice(0, 15);
      // 输出数据以便于调试
      logger.debug('Token holders:', {holders: topHolders});
      if (result.length > 0) {
        logger.debug('Top holder:', {holder: topHolders[0]});
      }
      
      // 断言检查真实数据
      expect(result.length).toBeGreaterThan(20);
      expect(result[0]).toHaveProperty('owner');
      expect(result[0]).toHaveProperty('amount');
      expect(result[0]).toHaveProperty('percentage');
      
      // 检查数据是否按持有量排序（从大到小）
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].amount).toBeGreaterThanOrEqual(result[i + 1].amount);
      }
    });
  });

  describe('getHolderDistribution', () => {
    // 使用真实的PumpFun代币地址
    const realMintAddress = '7ZRgHFqwdzvqhfmg19rSQBD6CZe5iEDkuZoaNUhpump';

    it('should return holder distribution statistics from the Solana network', async () => {
      // 使用真实的API调用获取数据
      const distribution = await service.getHolderDistribution(realMintAddress);
      
      // 输出数据以便于调试
      logger.info('Holder distribution:', {
        totalHolders: distribution.totalHolders,
        topHolderPercentage: distribution.topHolder?.percentage,
        top10Percentage: distribution.top10Percentage
      });
      
      // 断言检查真实数据
      expect(distribution.totalHolders).toBeGreaterThan(0);
      expect(distribution.topHolder).not.toBeNull();
      expect(distribution.top10Holders.length).toBeGreaterThan(0);
      expect(distribution.top10Percentage).toBeGreaterThan(0);
    });
  });
});

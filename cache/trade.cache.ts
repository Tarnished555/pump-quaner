
import { logger } from '../helpers';

export class PreTradeCache {
  private readonly keys: Map<string,number> = new Map<
    string,
     number 
  >();

  public save(baseMint: string, entryPrice: number) {
    if (!this.keys.has(baseMint)) {
      logger.trace(`Caching entry price for mint: ${baseMint}`);
      this.keys.set(baseMint, entryPrice);
    }
  }

  public async get(mint: string): Promise<number> {
    return this.keys.get(mint)!;
  }
}

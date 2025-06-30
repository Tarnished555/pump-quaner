import { CommitmentLevel } from '@triton-one/yellowstone-grpc';

export interface SubscribeRequest {
    accounts: Record<string, never>;
    slots: Record<string, never>;
    transactions: {
        tx: {
            vote: boolean;
            failed: boolean;
            signature: undefined;
            accountInclude: string[];
            accountExclude: string[];
            accountRequired: string[];
        }
    };
    blocks: Record<string, never>;
    blocksMeta: Record<string, never>;
    entry: Record<string, never>;
    commitment: CommitmentLevel;
    accountsDataSlice: never[];
    ping: undefined;
} 
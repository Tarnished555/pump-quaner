import Client, { CommitmentLevel, SubscribeRequest,SubscribeRequest_AccountsEntry } from '@triton-one/yellowstone-grpc';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export function createGrpcClient(endpoint: string, options?: string) {
    return new Client(
        endpoint,
        undefined,
        {
           "grpc.max_receive_message_length": 128 * 1024 * 1024,
        }   
    );
}
export function createSubscribeBlockRequest(){
    let blockRequest: SubscribeRequest = {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {
            block: {
                accountInclude: [],
                includeTransactions: false,
                includeAccounts: false,
                includeEntries: false,
            }
        },
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: CommitmentLevel.CONFIRMED,
        ping: undefined,
    };
    return blockRequest;
}
export function createSubscribeRequest(addresses: string[]) {
    let subscribeRequest: SubscribeRequest={
        accounts: {},
        slots: {},
        transactions: {
            tx: {
                vote: false,
                failed: false,
                signature: undefined,
                accountInclude: addresses,
                accountExclude: [],
                accountRequired: [],
            }
        },
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        commitment: CommitmentLevel.CONFIRMED,
        accountsDataSlice: [],
        ping: undefined,
    };
    return subscribeRequest;
} 
export function createAccountSubscribeRequest(monitorAddresses: string) {
      
     // Create datasize filter - SPL token accounts have a standard size of 165 bytes
          const datasizeFilter = {
            filter: {
              datasize: 165
            }
          };
          
          // Create memcmp filter - check if the owner at offset 32 is our wallet
          const memcmpFilter = {
            filter: {
              memcmp: {
                offset: 32,
                data: {
                  base58: monitorAddresses
                }
              }
            }
          };
          
          // Create subscription request for token accounts
          const tokenAccountRequest = {
            accounts: {
              accounts: {
                owner: [TOKEN_PROGRAM_ID.toString], // Only monitor accounts owned by Token Program
                filters: [datasizeFilter, memcmpFilter]
              }
            },
            slots: {},
            transactions: {},
            transactionsStatus: {},
            blocks: {},
            blocksMeta: {},
            entry: {},
            commitment: CommitmentLevel.CONFIRMED,
            accountsDataSlice: [],
            ping: undefined,
          };

         return tokenAccountRequest;
} 
export function createPingRequest(count: number){
        return {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: undefined,
        ping: { id: count },
    };
}

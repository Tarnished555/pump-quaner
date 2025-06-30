import { PublicKey } from "@solana/web3.js";

export interface TokenAmount {
    uiAmount: number;
    decimals: number;
    amount: string;
    uiAmountString: string;
}

export interface TokenBalance {
    accountIndex: number;
    mint: string;
    uiTokenAmount: TokenAmount;
    owner: string;
    programId: string;
}

export interface TransactionData {
    transaction: {
        slot: number;
        transaction: {
            signature: Uint8Array;
            transaction: {
                message: {
                    accountKeys: Uint8Array[];
                    instructions: {
                        programId: string;
                        accounts: number[];
                        data: string;
                    }[];
                };
            };
            meta: {
                innerInstructions: {
                    instructions: {
                        programId: string;
                        accounts: number[];
                        data: string;
                    }[];
                }[];
                preBalances: number[];
                postBalances: number[];
                preTokenBalances: TokenBalance[];
                postTokenBalances: TokenBalance[];
            };
        };
    };
}

export interface TokenInfo {
    mint: string;
    amount: number;
} 


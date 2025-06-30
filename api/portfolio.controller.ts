import { Request, Response, RequestHandler } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../helpers/logger';
import { RPC_ENDPOINT, SOLSCAN_TOKEN, COMMITMENT_LEVEL, COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE } from '../helpers/constants'; 
import { TokenInfoService } from '../services/token-info.service';
import { getSPLTokenBalance } from '../helpers/token';

import { getBot } from '../bot-instance'; // Import the shared bot instance getter
import { DEFAULT_DECIMALS } from '../helpers/constants';

import axios from 'axios'; 

interface TokenAccountInfo {
  mint: string;
  amount: string; // Keep as string to avoid precision issues
  decimals: number;
  // Optional: Add symbol, name, image if you fetch token metadata later
  symbol?: string;
}

interface PortfolioData {
  solBalance: number;
  tokens: TokenAccountInfo[];
}
const connection = new Connection(RPC_ENDPOINT, COMMITMENT_LEVEL)   ;
// 初始化TokenInfoService用于存储代币信息
const tokenInfoService = new TokenInfoService();
// Consider caching token metadata (symbol, decimals) if fetching repeatedly
export const tokenMetadataCache = new Map<string, { decimals: number; symbol?: string; name?: string; image?: string, createdAt?: number }>();

export async function getTokenMetadata(mint: PublicKey): Promise<{ decimals: number; symbol?: string; name?: string; image?: string, createdAt?: number }> {
    const mintAddressStr = mint.toBase58();
    if (tokenMetadataCache.has(mintAddressStr)) {
        return tokenMetadataCache.get(mintAddressStr)!;
    }

    let metadata: { decimals: number; symbol?: string; name?: string; image?: string, createdAt?: number,creator?:string } | null = null;
    let serviceInfo = await tokenInfoService.getTokenInfo(mintAddressStr);

    // Use service info if complete
    if (serviceInfo && serviceInfo.symbol && serviceInfo.name) {
        metadata = {
            decimals: serviceInfo.decimals ?? 6, // Default decimals if missing
            symbol: serviceInfo.symbol,
            name: serviceInfo.name,
            image: serviceInfo.metaUrl,
            createdAt: serviceInfo.createdAt
        };
    } else {
        // Otherwise, try Solscan API
        logger.info({ mint: mintAddressStr }, 'Token info not found locally or incomplete, trying Solscan API...');
        try {
            const solscanUrl = `https://pro-api.solscan.io/v2.0/token/meta?address=${mintAddressStr}`;
            const response = await axios.get(solscanUrl, {
                headers: { 'Token': SOLSCAN_TOKEN } // Assuming header name is 'Token'
            });
            logger.debug({ mint: mintAddressStr, response }, 'Solscan API response');
            if (response.data && response.data.success ) {
                const solscanData = response.data.data;
                 logger.debug({ mint: mintAddressStr, solscanData }, 'Successfully fetched data from Solscan');
                metadata = {
                    creator:solscanData.creator??'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
                    decimals: solscanData.decimals ?? 6,
                    symbol: solscanData.symbol ?? '',
                    name: solscanData.name ?? '',
                    image: solscanData.icon ?? '',
                    createdAt: solscanData.created_time ?? Date.now()
                };
                // Optionally save back to local service
                await tokenInfoService.saveTokenInfo({
                  mintAddress: mintAddressStr,
                  creator: new PublicKey(metadata?.creator || 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'),
                  symbol: metadata.symbol,
                  name: metadata.name,
                  metaUrl: metadata.image,
                  decimals: metadata.decimals,
                  createdAt: metadata.createdAt ?? Date.now() // Or use data from serviceInfo if available?
                });
            } else {
                 logger.warn({ mint: mintAddressStr, responseData: response.data }, 'Solscan API did not return successful data');
            }
        } catch (error: any) {
            logger.warn({ mint: mintAddressStr, error: error.message || error }, 'Failed to fetch token metadata from Solscan API');
        }

        // If Solscan failed or didn't return data, use fallback
        if (!metadata) {
             logger.info({ mint: mintAddressStr }, 'Solscan failed, using fallback/service data.');
            metadata = {
                decimals: serviceInfo?.decimals ?? 6, // Use service decimals if available, else 6
                symbol: serviceInfo?.symbol ?? '',
                name: serviceInfo?.name ?? '',
                image: serviceInfo?.metaUrl ?? '',
                createdAt: serviceInfo?.createdAt ?? Date.now()
            };
        }
    }

    tokenMetadataCache.set(mintAddressStr, metadata);
    // console.log('*** CONSOLE LOG - Final Metadata:', metadata);
    return metadata;
}

export const getPortfolio = async (req: Request, res: Response): Promise<void> => {
  const { walletAddress } = req.params;

  if (!walletAddress) {
    res.status(400).json({ success: false, message: 'Wallet address is required' });
    return;
  }

  try {
    const publicKey = new PublicKey(walletAddress);
    // Assume HELIUS_RPC_URL is available in process.env or a globally accessible config object
    const rpcUrl = RPC_ENDPOINT; // Try common env var names
    if (!rpcUrl) {
        logger.error('RPC_URL  environment variable not set.');
        res.status(500).json({ success: false, message: 'Server configuration error: RPC URL missing.' });
        return;
    }
    const connection = new Connection(rpcUrl, 'confirmed');

    // 1. Get SOL Balance
    const solBalanceLamports = await connection.getBalance(publicKey);
    const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

    // 2. Get Token Accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );

    const tokens: TokenAccountInfo[] = [];
    if (tokenAccounts.value) {
        const metadataPromises = tokenAccounts.value.map(async ({ account }) => {
            const accountInfo = account.data.parsed.info;
            const amount = accountInfo.tokenAmount.uiAmountString;

            if (parseFloat(amount) > 0) {
                const mintAddress = accountInfo.mint;
                const mintPublicKey = new PublicKey(mintAddress);
                const { decimals, symbol, name, image, createdAt } = await getTokenMetadata(mintPublicKey);
                return {
                    mint: mintAddress,
                    amount: accountInfo.tokenAmount.amount, // Store raw amount as string
                    decimals: decimals,
                    symbol: symbol,
                    name: name,
                    image: image,
                    createdAt: createdAt
                };
            }
            return null; // Return null for tokens with zero balance
        });

        // Wait for all metadata fetches and filter out nulls (zero balance tokens)
        const resolvedTokens = (await Promise.all(metadataPromises)).filter(token => token !== null) as TokenAccountInfo[];
        tokens.push(...resolvedTokens);
    }

    const portfolioData: PortfolioData = {
      solBalance,
      tokens, // This now potentially includes symbols
    };

    res.status(200).json({ success: true, data: portfolioData });

  } catch (error: any) {
    logger.error({ err: error, walletAddress }, 'Failed to fetch portfolio');
    if (error.message?.includes('Invalid public key')) {
        res.status(400).json({ success: false, message: 'Invalid wallet address format' });
    } else {
        res.status(500).json({ success: false, message: 'Internal server error while fetching portfolio' });
    }
  }
};


export const sellAssetByMint=async (req: Request, res: Response): Promise<void> => { 
    const { mintAddress } = req.params;
    const { tradingWalletAddress, sellPercentage } = req.body;

  
    logger.info({ mintAddress, sellPercentage }, `Received request to sell asset`);

  
    if (!mintAddress || typeof mintAddress !== 'string') {
         res.status(400).json({ success: false, message: 'Valid mint address parameter is required.' });
    }
    // 止损时应该清仓，获取钱包实际持有的代币数量
    try {

        // 获取实际代币数量
        const allTokenAmount = await getSPLTokenBalance(
            connection, 
            new PublicKey(mintAddress), 
            new PublicKey(tradingWalletAddress)
        );
        
        logger.info({ 
            mint: mintAddress, 
            wallet: tradingWalletAddress, 
            tokenAmount: allTokenAmount 
        }, '获取到钱包实际代币数量，网页端人工清仓');
        
        if (allTokenAmount && allTokenAmount > 0) {
            const bot = getBot(); // Get the shared bot instance
            await bot.bondingCurveSell(tradingWalletAddress, new PublicKey(mintAddress), BigInt(allTokenAmount*10**DEFAULT_DECIMALS), {
                unitLimit: COMPUTE_UNIT_LIMIT,
                unitPrice: COMPUTE_UNIT_PRICE
            });

        } else {
            logger.warn({ mint: mintAddress, wallet: tradingWalletAddress }, '没有可卖出的代币数量');
        }
        res.status(200).json({ success: true, message: 'Successfully sold asset' });

        } catch (error: any) {
            logger.error({ mintAddress, tradingWalletAddress, error: error.message || error }, 'Error occurred during sell asset request');
            // Avoid leaking detailed internal errors to the client unless necessary
            const clientMessage = error.isClientSafe ? error.message : 'Failed to process sell request due to an internal error.'; 
            res.status(500).json({ success: false, message: clientMessage });
        }
    
};

import { Connection, PublicKey, Context } from '@solana/web3.js';
import { AnchorProvider, Program, Idl, EventParser, BN } from "@coral-xyz/anchor";
import { PumpAmmIDL, IDL } from "../IDL";
import { RPC_ENDPOINT } from '../helpers';
import { EventEmitter } from 'events';
import { logger } from '../helpers';
import { BuyEvent, SellEvent,  PumpAmmEventHandlers, PumpAmmEventType } from '../types/types';

// Helper functions to process events
function toBuyEvent(event: any): BuyEvent {

  return {
    timestamp: Number(event.timestamp),
    base_amount_out: BigInt(event.baseAmountOut),
    max_quote_amount_in: BigInt(event.maxQuoteAmountIn),
    user_base_token_reserves: BigInt(event.userBaseTokenReserves),
    user_quote_token_reserves: BigInt(event.userQuoteTokenReserves),
    pool_base_token_reserves: BigInt(event.poolBaseTokenReserves),
    pool_quote_token_reserves: BigInt(event.poolQuoteTokenReserves),
    quote_amount_in: BigInt(event.quoteAmountIn),
    quote_amount_in_with_lp_fee: BigInt(event.quoteAmountInWithLpFee),
    user_quote_amount_in: BigInt(event.userQuoteAmountIn),
    pool: new PublicKey(event.pool),
    user: new PublicKey(event.user),
    user_base_token_account: new PublicKey(event.userBaseTokenAccount),
    user_quote_token_account: new PublicKey(event.userQuoteTokenAccount),
    protocol_fee_recipient: new PublicKey(event.protocolFeeRecipient),
    protocol_fee_recipient_token_account: new PublicKey(event.protocolFeeRecipientTokenAccount)
  };
}

function toSellEvent(event: any): SellEvent {
  return {
    timestamp: Number(event.timestamp),
    base_amount_in: BigInt(event.baseAmountIn),
    min_quote_amount_out: BigInt(event.minQuoteAmountOut),
    user_base_token_reserves: BigInt(event.userBaseTokenReserves),
    user_quote_token_reserves: BigInt(event.userQuoteTokenReserves),
    pool_base_token_reserves: BigInt(event.poolBaseTokenReserves),
    pool_quote_token_reserves: BigInt(event.poolQuoteTokenReserves),
    quote_amount_out: BigInt(event.quoteAmountOut),
    quote_amount_out_without_lp_fee: BigInt(event.quoteAmountOutWithoutLpFee),
    user_quote_amount_out: BigInt(event.userQuoteAmountOut),
    pool: new PublicKey(event.pool),
    user: new PublicKey(event.user),
    user_base_token_account: new PublicKey(event.userBaseTokenAccount),
    user_quote_token_account: new PublicKey(event.userQuoteTokenAccount),
    protocol_fee_recipient: new PublicKey(event.protocolFeeRecipient),
    protocol_fee_recipient_token_account: new PublicKey(event.protocolFeeRecipientTokenAccount)
  };
}



// Extended Context type to include signature property
interface LogContext extends Context {
  signature?: string;
}

export class PumpAmmListeners extends EventEmitter {
  private subscriptions: number[] = [];
  private readonly program: Program<PumpAmmIDL>;
  
  constructor(private readonly connection: Connection, private readonly provider: AnchorProvider) {
    super();
    try {
      this.program = new Program<PumpAmmIDL>(IDL as PumpAmmIDL, this.provider);
      logger.info('PumpAmm program initialized successfully');
    } catch (error) {
      logger.error('Error initializing PumpAmm program:', error);
      throw error;
    }
  }

  public async start() {
 
    const buyEventId = await this.setAmmListener("buyEvent", (event, slot, signature) => {
      this.emit('amm_transaction_buy', event, slot, signature);
    });
    this.subscriptions.push(buyEventId);
    
    const sellEventId = await this.setAmmListener("sellEvent", (event, slot, signature) => {
  
      this.emit('amm_transaction_sell', event, slot, signature);
    });
    this.subscriptions.push(sellEventId);
      
  }

  public stop() {
    logger.info("Stopping PumpSwap event listeners...");
    this.subscriptions.forEach(id => {
      this.program.removeEventListener(id);
    });
    this.subscriptions = [];
    logger.info("PumpSwap event listeners stopped");
  }
 //EVENTS
 private async setAmmListener<T extends PumpAmmEventType>(
               eventType: T,
               callback: (
                 event: PumpAmmEventHandlers[T],
                 slot: number,
                 signature: string
               ) => void
             ) {

               return this.program.addEventListener(
                 eventType ,
                 (event: any, slot: number, signature: string) => {
                   let processedEvent;
                   switch (eventType) {
                     case "buyEvent":
                       processedEvent = toBuyEvent(event as BuyEvent);
                       callback(
                         processedEvent as PumpAmmEventHandlers[T],
                         slot,
                         signature
                       );
                       break;
                     case "sellEvent":
                       processedEvent = toSellEvent(event as SellEvent);
                       callback(
                         processedEvent as PumpAmmEventHandlers[T],
                         slot,
                         signature
                       );
                       break;
                     default:
                       logger.error("Unhandled event type:", eventType);
                   }
                 }
               );
             }
           
             removeEventListener(eventId: number) {
               this.program.removeEventListener(eventId);
             }


  public async listenToInstructions() {
    logger.info("Setting up PumpSwap instruction listener...");
    
    // Subscribe to program account changes
    const logSubscription = this.connection.onLogs(
      this.program.programId,
      (logs, context: LogContext) => {
        try {
          // Skip if no instructions
          if (!logs.logs || logs.logs.length === 0) return;
          
          // Extract transaction data
          const txId = context.signature;
          if (!txId) return;
          
          // Process the transaction
          this.connection.getTransaction(txId, { commitment: 'confirmed' }).then(tx => {
            if (!tx || !tx.transaction || !tx.transaction.message) return;
            
            // Get instructions for the PumpSwap program
            const instructions = tx.transaction.message.instructions.filter(ix => {
              // Get the program ID for this instruction
              const programIdIndex = ix.programIdIndex;
              const programId = tx.transaction.message.accountKeys[programIdIndex];
              return programId.equals(this.program.programId);
            });
            
            if (instructions.length === 0) return;
            
            // Process each instruction
            instructions.forEach(ix => {
              // Get instruction data
              const ixData = Buffer.from(ix.data, 'base64');
              if (ixData.length < 8) return;
              
              const discriminator = ixData.slice(0, 8);
              
              // Match discriminator to instruction
              const ixName = (IDL.instructions as any).find(
                (ix: any) => ix.discriminator.join(',') === Array.from(discriminator).join(',')
              )?.name;
              
              if (ixName) {
                logger.info(`\nPumpAmm Instruction: ${ixName}`);
                logger.info("Transaction:", context.signature);
                logger.info("Slot:", context.slot);
                
                // Emit the instruction event
                this.emit('instruction', { name: ixName, signature: context.signature, slot: context.slot });
              }
            });
          });
        } catch (error) {
          logger.error("Error processing log:", error);
        }
      },
      'confirmed'
    );
    
    this.subscriptions.push(logSubscription);
    logger.info("PumpAmm instruction listener is active");
  }
}

// Example usage:
// Create a connection and provider
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const provider = new AnchorProvider(connection, {} as any, {}); // Empty wallet since we're just listening

// Create and start the listeners
const pumpAmmListeners = new PumpAmmListeners(connection, provider);

async function main() {
  await pumpAmmListeners.start();
  
  // Keep the process running
  process.on('SIGINT', () => {
    console.log('Stopping listeners...');
    pumpAmmListeners.stop();
    process.exit();
  });
}

// Start listening for events
main()
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

// Example event handling
pumpAmmListeners.on('buy', ({ event, slot, signature }) => {
  // Process buy event - additional custom logic can be added here
  // For example, update a database, trigger notifications, etc.
  console.log(`Processing buy event at slot ${slot} with signature ${signature}`);
});

pumpAmmListeners.on('sell', ({ event, slot, signature }) => {
  // Process sell event
  console.log(`Processing sell event at slot ${slot} with signature ${signature}`);
});
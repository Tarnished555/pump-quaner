import { Bot } from './bot';

// This file provides a singleton instance of Bot that can be shared across the application

// Define a variable to hold the Bot instance
let botInstance: Bot | null = null;

// Function to set the Bot instance (called from index.ts)
export function setBot(bot: Bot): void {
  botInstance = bot;
}

// Function to get the Bot instance (used by controllers)
export function getBot(): Bot {
  if (!botInstance) {
    throw new Error('Bot instance has not been initialized. Make sure setBot() is called in index.ts before using getBot()');
  }
  return botInstance;
}

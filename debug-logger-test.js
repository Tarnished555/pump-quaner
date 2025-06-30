// Simple direct Pino logger test
const pino = require('pino');

// Create a basic logger with debug level
const logger = pino({
  level: 'debug',  // Set level explicitly to debug
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Test all log levels
console.log('Testing all log levels:');
logger.trace('This is a TRACE message');
logger.debug('This is a DEBUG message');
logger.info('This is an INFO message');
logger.warn('This is a WARN message');
logger.error('This is an ERROR message');
logger.fatal('This is a FATAL message');

// Print the logger's configuration
console.log('\nLogger configuration:');
console.log('Logger level:', logger.level);
console.log('Logger levelVal:', logger.levelVal);
console.log('Logger levels:', JSON.stringify(logger.levels, null, 2));

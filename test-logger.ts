// Simple test script to verify logger functionality
import { logger } from './helpers/logger';

logger.debug('This is a test debug message');
logger.info('This is a test info message');
logger.warn('This is a test warning message');
logger.error('This is a test error message');

console.log('Direct console.log message');

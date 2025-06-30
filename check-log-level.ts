// Check what LOG_LEVEL is being used
import dotenv from 'dotenv';
import { LOG_LEVEL } from './helpers/constants';

dotenv.config();

console.log('LOG_LEVEL from env:', process.env.LOG_LEVEL);
console.log('LOG_LEVEL from constants:', LOG_LEVEL);
console.log('LOG_LEVEL type:', typeof LOG_LEVEL);

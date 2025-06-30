# K-line Service for PumpFun Transaction Monitoring

This module provides real-time K-line (candlestick) data processing for PumpFun transactions. It captures trade events, processes them into K-line data points, and optionally persists them to PostgreSQL for historical analysis.

## Features

- Real-time processing of PumpFun trade events
- Multiple time interval support (1m, 5m, 15m, 1h, 4h, 1d)
- In-memory storage with Redis for fast access
- Optional persistent storage with PostgreSQL
- Automatic data aggregation and persistence

## Configuration

Add the following to your `.env` file:

```
# K-line Service
KLINE_ENABLED=true
KLINE_PERSISTENCE_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
POSTGRES_HOST=localhost
POSTGRES_DB=trading
POSTGRES_USER=postgres
POSTGRES_PASSWORD=
POSTGRES_PORT=5432
```

## Database Setup

If you enable PostgreSQL persistence, the service will automatically create the necessary tables on startup. Make sure your PostgreSQL user has the appropriate permissions to create tables.

## Usage

The K-line service is automatically integrated with the PumpFun transaction listener. When a trade event is detected, it will be processed and stored according to your configuration.

### Querying K-line Data

You can query historical K-line data using the `queryKLines` method:

```typescript
const klineService = new KLineService(REDIS_CONFIG, POSTGRES_CONFIG);
await klineService.initialize();

// Query 1-hour K-line data for a token over the past day
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const klines = await klineService.queryKLines(
  'tokenMintAddress',
  KLineInterval.ONE_HOUR,
  oneDayAgo
);

console.log(klines);
```

## Architecture

The K-line service consists of several components:

1. **KLineService**: Main service that coordinates data processing and storage
2. **RedisKLineService**: Handles in-memory storage of K-line data
3. **PostgresKLineService**: Handles persistent storage of K-line data
4. **Trade Converter**: Converts PumpFun trade events to the internal Trade format

## Dependencies

- Redis: For in-memory storage
- PostgreSQL: For persistent storage (optional)
- ioredis: Node.js Redis client
- pg: Node.js PostgreSQL client

export default () => ({
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '7d',
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL,
    rpcUrlFallback: process.env.SOLANA_RPC_URL_FALLBACK,
    network: process.env.SOLANA_NETWORK || 'devnet',
    programId: process.env.PROGRAM_ID,
    rewardTokenMint: process.env.REWARD_TOKEN_MINT,
    adminPrivateKey: process.env.ADMIN_PRIVATE_KEY,
  },
  transaction: {
    confirmationTimeout: parseInt(process.env.TX_CONFIRMATION_TIMEOUT || '60000', 10),
    maxRetries: parseInt(process.env.TX_MAX_RETRIES || '3', 10),
  },
  staking: {
    weeklyEmissionRate: parseInt(process.env.WEEKLY_EMISSION_RATE || '21', 10),
    emissionPrecision: parseInt(process.env.EMISSION_PRECISION || '10000', 10),
    cooldownPeriod: parseInt(process.env.COOLDOWN_PERIOD || '604800', 10),
    vestingPeriod: parseInt(process.env.VESTING_PERIOD || '31536000', 10),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

import { PrismaService } from '../src/prisma/prisma.service';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://stakinguser:stakingpass@localhost:5432/solana_staking_test';
});

// Clean database before each test
export async function cleanDatabase(prisma: PrismaService) {
  // Delete in order to respect foreign key constraints
  const deletionOrder = [
    'idempotencyRecord',
    'complianceStatus',
    'event',
    'rewardNft', // Depends on StakePosition
    'stakePosition', // Depends on User and StakingTier
    'stakingTier',
    'session', // Depends on User
    'user',
    'programState',
  ];

  for (const modelName of deletionOrder) {
    try {
      await (prisma as any)[modelName].deleteMany();
    } catch (error) {
      // Table might not exist or be empty, continue
      console.log(`Warning: Could not clean ${modelName}:`, error.message);
    }
  }
}

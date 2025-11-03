import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDatabase() {
  console.log('🌱 Seeding database...');

  try {
    // Create program state
    const programState = await prisma.programState.upsert({
      where: { programId: '3Li2pDFFDmzrtw7zJpGDmaYFoRvje8xQ7pvt1vkTzLRg' },
      create: {
        programId: '3Li2pDFFDmzrtw7zJpGDmaYFoRvje8xQ7pvt1vkTzLRg',
        rewardTokenMint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        isPaused: false,
        currentEpoch: BigInt(1),
        currentEpochStartTs: BigInt(Math.floor(Date.now() / 1000)),
        currentWeeklyEmission: BigInt(1000000000),
        totalStaked: BigInt(0),
        totalRewardPool: BigInt(1000000000000),
        totalStakingPower: BigInt(0),
      },
      update: {},
    });

    console.log('✅ Program state created/updated');

    // Create staking tiers
    const tiers = [
      {
        tierId: 1,
        multiplier: BigInt(10000), // 1x (100%)
        minMonths: 1,
        maxMonths: 3,
        isActive: true,
      },
      {
        tierId: 2,
        multiplier: BigInt(12000), // 1.2x (120%)
        minMonths: 3,
        maxMonths: 6,
        isActive: true,
      },
      {
        tierId: 3,
        multiplier: BigInt(15000), // 1.5x (150%)
        minMonths: 6,
        maxMonths: 12,
        isActive: true,
      },
      {
        tierId: 4,
        multiplier: BigInt(20000), // 2x (200%)
        minMonths: 12,
        maxMonths: 24,
        isActive: true,
      },
    ];

    for (const tierData of tiers) {
      await prisma.stakingTier.upsert({
        where: { tierId: tierData.tierId },
        create: tierData,
        update: tierData,
      });
    }

    console.log(`✅ ${tiers.length} staking tiers created`);

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • Program State: ${programState.programId}`);
    console.log(`   • Reward Pool: ${programState.totalRewardPool.toString()} tokens`);
    console.log(`   • Staking Tiers: ${tiers.length} tiers`);
    console.log(`   • Is Paused: ${programState.isPaused}`);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();


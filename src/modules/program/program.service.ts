import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { ProgramError } from '@common/errors/program.error';
import * as bs58 from 'bs58';

interface StakePositionData {
  owner: PublicKey;
  amount: anchor.BN;
  tierId: number;
  baseMultiplier: anchor.BN;
  powerMultiplier: anchor.BN;
  stakingPower: anchor.BN;
  durationMonths: number;
  isLocked: boolean;
  startTimestamp: anchor.BN;
  unlockTimestamp: anchor.BN;
  lastRewardTimestamp: anchor.BN;
  accumulatedRewards: anchor.BN;
  isActive: boolean;
  cooldownEnd: anchor.BN;
  pendingPrincipal: anchor.BN;
}

interface RewardNftData {
  owner: PublicKey;
  rewardAmount: anchor.BN;
  vestTimestamp: anchor.BN;
  nftAsset: PublicKey;
  isActive: boolean;
}

interface ProgramStateData {
  admin: PublicKey;
  rewardTokenMint: PublicKey;
  protocolTreasury: PublicKey;
  referralPool: PublicKey;
  cashbackPool: PublicKey;
  currentEpoch: anchor.BN;
  totalStaked: anchor.BN;
  totalStakingPower: anchor.BN;
  rewardPool: anchor.BN;
  isPaused: boolean;
  lastEpochTimestamp: anchor.BN;
}

interface StakingTierData {
  tierId: number;
  multiplier: anchor.BN;
  minDurationMonths: number;
  maxDurationMonths: number;
  isActive: boolean;
}

@Injectable()
export class ProgramService implements OnModuleInit {
  private readonly logger = new Logger(ProgramService.name);
  private program: Program;
  private provider: AnchorProvider;
  private connection: Connection;
  private programId: PublicKey;
  private adminKeypair: Keypair | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      await this.initializeProgram();
      this.logger.log('Program service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize program service', error);
      throw new ProgramError('Program initialization failed');
    }
  }

  private async initializeProgram() {
    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    const programIdStr = this.configService.get<string>('solana.programId');
    const adminPrivateKey = this.configService.get<string>('solana.adminPrivateKey');

    if (!rpcUrl || !programIdStr) {
      throw new Error('Solana RPC URL and Program ID must be configured');
    }

    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    this.programId = new PublicKey(programIdStr);

    if (adminPrivateKey) {
      try {
        const secretKey = bs58.decode(adminPrivateKey);
        this.adminKeypair = Keypair.fromSecretKey(secretKey);
        this.logger.log(`Admin wallet: ${this.adminKeypair.publicKey.toString()}`);
      } catch (error) {
        this.logger.warn('Admin private key invalid, some operations will not be available');
      }
    }

    const dummyWallet = {
      publicKey: this.adminKeypair?.publicKey || Keypair.generate().publicKey,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    };

    this.provider = new AnchorProvider(this.connection, dummyWallet as any, {
      commitment: 'confirmed',
    });

    this.program = new Program(
      { version: '0.1.0', name: 'staking_rewards_contract', instructions: [] } as any,
      this.programId,
      this.provider,
    );
  }

  findProgramStatePda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('program_state')], this.programId);
  }

  findProgramVaultPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('program_vault')], this.programId);
  }

  findStakingTierPda(tierId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('staking_tier'), Buffer.from([tierId])],
      this.programId,
    );
  }

  findStakePositionPda(owner: PublicKey, positionSeed: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stake_position'), owner.toBuffer(), positionSeed.toArrayLike(Buffer, 'le', 8)],
      this.programId,
    );
  }

  findRewardNftPda(owner: PublicKey, nftSeed: anchor.BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reward_nft'), owner.toBuffer(), nftSeed.toArrayLike(Buffer, 'le', 8)],
      this.programId,
    );
  }

  findKycRegistryPda(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('kyc_registry'), user.toBuffer()],
      this.programId,
    );
  }

  findUserWhitelistPda(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user_whitelist'), user.toBuffer()],
      this.programId,
    );
  }

  async getProgramState(): Promise<ProgramStateData | null> {
    try {
      const [programStatePda] = this.findProgramStatePda();
      const accountInfo = await this.connection.getAccountInfo(programStatePda);

      if (!accountInfo) {
        return null;
      }

      return null;
    } catch (error) {
      this.logger.error('Error fetching program state', error);
      throw new ProgramError('Failed to fetch program state');
    }
  }

  async getStakePosition(
    owner: PublicKey,
    positionSeed: anchor.BN,
  ): Promise<StakePositionData | null> {
    try {
      const [stakePositionPda] = this.findStakePositionPda(owner, positionSeed);
      const accountInfo = await this.connection.getAccountInfo(stakePositionPda);

      if (!accountInfo) {
        return null;
      }

      return null;
    } catch (error) {
      this.logger.error('Error fetching stake position', error);
      throw new ProgramError('Failed to fetch stake position');
    }
  }

  async getStakingTier(tierId: number): Promise<StakingTierData | null> {
    try {
      const [tierPda] = this.findStakingTierPda(tierId);
      const accountInfo = await this.connection.getAccountInfo(tierPda);

      if (!accountInfo) {
        return null;
      }

      return null;
    } catch (error) {
      this.logger.error('Error fetching staking tier', error);
      throw new ProgramError('Failed to fetch staking tier');
    }
  }

  async getRewardNft(owner: PublicKey, nftSeed: anchor.BN): Promise<RewardNftData | null> {
    try {
      const [rewardNftPda] = this.findRewardNftPda(owner, nftSeed);
      const accountInfo = await this.connection.getAccountInfo(rewardNftPda);

      if (!accountInfo) {
        return null;
      }

      return null;
    } catch (error) {
      this.logger.error('Error fetching reward NFT', error);
      throw new ProgramError('Failed to fetch reward NFT');
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getAdminKeypair(): Keypair | null {
    return this.adminKeypair;
  }

  async confirmTransaction(signature: string, maxRetries = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const { value } = await this.connection.confirmTransaction(signature, 'confirmed');

        if (value.err) {
          this.logger.error(`Transaction failed: ${signature}`, value.err);
          return false;
        }

        return true;
      } catch (error) {
        this.logger.warn(`Confirmation attempt ${i + 1} failed for ${signature}`);

        if (i === maxRetries - 1) {
          throw new ProgramError('Transaction confirmation timeout');
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return false;
  }

  async simulateTransaction(transaction: Transaction): Promise<void> {
    try {
      const result = await this.connection.simulateTransaction(transaction);

      if (result.value.err) {
        this.logger.error('Transaction simulation failed', result.value.err);
        throw new ProgramError('Transaction simulation failed');
      }
    } catch (error) {
      this.logger.error('Error simulating transaction', error);
      throw new ProgramError('Transaction simulation error');
    }
  }

  convertToPublicKey(address: string): PublicKey {
    try {
      return new PublicKey(address);
    } catch (error) {
      throw new ProgramError('Invalid public key format');
    }
  }

  generatePositionSeed(): anchor.BN {
    return new anchor.BN(Date.now());
  }

  generateNftSeed(): anchor.BN {
    return new anchor.BN(Date.now());
  }
}

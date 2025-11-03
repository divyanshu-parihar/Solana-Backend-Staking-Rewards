import { Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

export class TestHelpers {
  static generateTestWallet() {
    const keypair = Keypair.generate();
    return {
      keypair,
      publicKey: keypair.publicKey.toString(),
      secretKey: bs58.encode(keypair.secretKey),
    };
  }

  static signMessage(message: string, keypair: Keypair): string {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    return bs58.encode(signature);
  }

  static async authenticateWallet(app: any, wallet: { keypair: Keypair; publicKey: string }) {
    // Get nonce
    const nonceResponse = await app
      .post('/api/v1/auth/nonce')
      .send({ wallet: wallet.publicKey })
      .expect(200);

    const { nonce } = nonceResponse.body;

    // Sign nonce
    const signature = TestHelpers.signMessage(nonce, wallet.keypair);

    // Verify and get token
    const verifyResponse = await app
      .post('/api/v1/auth/verify')
      .send({
        wallet: wallet.publicKey,
        signature,
        message: nonce,
      })
      .expect(200);

    return verifyResponse.body.accessToken;
  }

  static createMockProgramState() {
    return {
      programId: Keypair.generate().publicKey.toString(),
      rewardTokenMint: Keypair.generate().publicKey.toString(),
      isPaused: false,
      currentEpoch: BigInt(0),
      totalStaked: BigInt(0),
      totalRewardPool: BigInt(1000000000000), // 1000 tokens
      totalStakingPower: BigInt(0),
    };
  }

  static createMockStakingTier(tierId: number = 1) {
    return {
      tierId,
      multiplier: BigInt(150),
      minMonths: 1,
      maxMonths: 60, // Allow up to 60 months for testing
      isActive: true,
    };
  }
}

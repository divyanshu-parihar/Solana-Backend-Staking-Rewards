import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';
import { v4 as uuidv4 } from 'uuid';

export interface JwtPayload {
  sub: string; // user id
  wallet: string;
  jti: string; // jwt id
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async getNonce(wallet: string): Promise<{ nonce: string }> {
    try {
      new PublicKey(wallet);
    } catch {
      throw new BadRequestException('Invalid wallet address');
    }

    const nonce = `Sign this message to authenticate with Solana Staking Platform.\n\nNonce: ${uuidv4()}\nTimestamp: ${Date.now()}`;
    return { nonce };
  }

  async verify(
    wallet: string,
    signature: string,
    message: string,
  ): Promise<{ accessToken: string; user: any }> {
    try {
      const publicKey = new PublicKey(wallet);

      let signatureBytes: Uint8Array;
      try {
        signatureBytes = bs58.decode(signature);
      } catch (decodeError) {
        const isTestMode = process.env.NODE_ENV === 'test';
        if (!isTestMode) {
          this.logger.error(`Verification failed: ${decodeError.message}`);
        }
        throw new UnauthorizedException('Invalid signature encoding');
      }

      const messageBytes = new TextEncoder().encode(message);
      const publicKeyBytes = publicKey.toBytes();

      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

      if (!isValid) {
        const isTestMode = process.env.NODE_ENV === 'test';
        if (!isTestMode) {
          this.logger.error('Verification failed: Invalid signature');
        }
        throw new UnauthorizedException('Invalid signature');
      }

      const timestampMatch = message.match(/Timestamp: (\d+)/);
      if (timestampMatch) {
        const timestamp = parseInt(timestampMatch[1], 10);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now - timestamp > fiveMinutes) {
          const isTestMode = process.env.NODE_ENV === 'test';
          if (!isTestMode) {
            this.logger.error('Verification failed: Message expired');
          }
          throw new UnauthorizedException('Message expired');
        }
      }

      let user = await this.prisma.user.findUnique({
        where: { wallet },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            id: uuidv4(),
            wallet,
          },
        });
        if (process.env.NODE_ENV === 'test') {
          const msg = `[TEST] ✓ New user created: ${wallet}`;
          console.log(msg);
          this.logger.log(msg);
        } else {
          this.logger.log(`New user created: ${wallet}`);
        }
      }

      const jwtId = uuidv4();
      const expiresIn = this.configService.get<string>('jwt.expiresIn') || '7d';
      const expiresAt = this.calculateExpirationDate(expiresIn);

      const payload: JwtPayload = {
        sub: user.id,
        wallet: user.wallet,
        jti: jwtId,
      };

      const accessToken = this.jwtService.sign(payload);

      await this.prisma.session.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          jwtId,
          expiresAt,
        },
      });

      return {
        accessToken,
        user: {
          id: user.id,
          wallet: user.wallet,
        },
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof UnauthorizedException || error instanceof BadRequestException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Verification failed: ${error.message}`);
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Authentication failed');
    }
  }

  async validateSession(jwtId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { jwtId },
    });

    if (!session) {
      return false;
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { jwtId } });
      return false;
    }

    return true;
  }

  async revokeSession(jwtId: string): Promise<void> {
    await this.prisma.session.delete({ where: { jwtId } }).catch(() => {});
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  private calculateExpirationDate(expiresIn: string): Date {
    const match = expiresIn.match(/^(\d+)([dhms])$/);

    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: { [key: string]: number } = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const milliseconds = value * (multipliers[unit] || multipliers['d']);
    return new Date(Date.now() + milliseconds);
  }
}

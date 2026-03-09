import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { GoogleAuthUser } from './auth.types';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  private readonly REVOKE_PENDING_TTL = 86400; // 24h

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueAppTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync({ ...payload }, {
      secret: this.configService.get<string>('auth.jwtSecret') ?? 'dev-secret',
      expiresIn: (this.configService.get<string>('auth.jwtAccessExpiresIn') ?? '15m') as any,
    });

    const refreshToken = await this.jwtService.signAsync({ ...payload }, {
      secret: this.configService.get<string>('auth.jwtSecret') ?? 'dev-secret',
      expiresIn: (this.configService.get<string>('auth.jwtRefreshExpiresIn') ?? '7d') as any,
    });

    user.appRefreshTokenHash = this.hashToken(refreshToken);
    await this.userRepository.save(user);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.configService.get<string>('auth.jwtAccessExpiresIn') ?? '15m',
    };
  }

  async handleGoogleLogin(googleUser: GoogleAuthUser) {
    let user = await this.userRepository.findOne({
      where: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    });

    if (!user) {
      user = this.userRepository.create({
        googleId: googleUser.googleId,
        email: googleUser.email,
      });
    }

    user.googleId = googleUser.googleId;
    user.email = googleUser.email;
    user.displayName = googleUser.displayName ?? user.displayName;
    user.firstName = googleUser.firstName ?? user.firstName;
    user.lastName = googleUser.lastName ?? user.lastName;
    user.picture = googleUser.picture ?? user.picture;
    user.accessToken = googleUser.accessToken;
    user.refreshToken = googleUser.refreshToken ?? user.refreshToken;
    user.scope = googleUser.scope ?? user.scope;
    user.tokenUpdatedAt = new Date();
    user.rawProfile = googleUser.rawProfile ?? user.rawProfile;

    const saved = await this.userRepository.save(user);
    const appTokens = await this.issueAppTokens(saved);

    return {
      user_id: saved.id,
      google_id: saved.googleId,
      email: saved.email,
      display_name: saved.displayName,
      app_tokens: appTokens,
      token_saved: {
        access_token: !!saved.accessToken,
        refresh_token: !!saved.refreshToken,
        updated_at: saved.tokenUpdatedAt?.toISOString() ?? null,
      },
    };
  }

  async getUserStorageStatus(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    return {
      user_id: user.id,
      google_id: user.googleId,
      email: user.email,
      display_name: user.displayName,
      picture: user.picture,
      token_saved: {
        access_token: !!user.accessToken,
        refresh_token: !!user.refreshToken,
        updated_at: user.tokenUpdatedAt?.toISOString() ?? null,
      },
      app_token_saved: {
        refresh_token_hash: !!user.appRefreshTokenHash,
      },
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }

  async refreshAppToken(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.appRefreshTokenHash) {
      return null;
    }

    try {
      await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('auth.jwtSecret') ?? 'dev-secret',
      });
    } catch {
      return null;
    }

    const incomingHash = this.hashToken(refreshToken);
    if (incomingHash !== user.appRefreshTokenHash) {
      return null;
    }

    const tokens = await this.issueAppTokens(user);
    return {
      user_id: user.id,
      email: user.email,
      app_tokens: tokens,
    };
  }

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    return {
      user_id: user.id,
      google_id: user.googleId,
      email: user.email,
      display_name: user.displayName,
      first_name: user.firstName,
      last_name: user.lastName,
      picture: user.picture,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  }

  private async revokeGoogleToken(accessToken?: string | null): Promise<boolean> {
    if (!accessToken) {
      return false;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token: accessToken }).toString(),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async enqueueRevokeRetry(userId: string, token?: string | null) {
    if (!token) {
      return;
    }

    await this.redisService.set(
      RedisKeys.authRevokePending(userId),
      {
        userId,
        accessToken: token,
        queuedAt: new Date().toISOString(),
      },
      this.REVOKE_PENDING_TTL,
    );
  }

  async logout(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const accessToken = user.accessToken;
    const revoked = await this.revokeGoogleToken(accessToken);
    if (!revoked) {
      await this.enqueueRevokeRetry(userId, accessToken);
    }

    user.accessToken = null;
    user.refreshToken = null;
    user.scope = null;
    user.appRefreshTokenHash = null;
    user.tokenUpdatedAt = new Date();

    await this.userRepository.save(user);

    return {
      message: 'logout success',
      user_id: user.id,
      revoked,
      revoke_retry_queued: !revoked && !!accessToken,
      token_saved: {
        access_token: false,
        refresh_token: false,
        updated_at: user.tokenUpdatedAt.toISOString(),
      },
    };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const accessToken = user.accessToken;
    const revoked = await this.revokeGoogleToken(accessToken);
    if (!revoked) {
      await this.enqueueRevokeRetry(userId, accessToken);
    }

    await this.userRepository.delete({ id: userId });

    return {
      message: 'user deleted',
      user_id: userId,
      revoked,
      revoke_retry_queued: !revoked && !!accessToken,
      deleted: true,
    };
  }

  async retryPendingRevoke(userId: string) {
    const pending = await this.redisService.get<{ accessToken: string }>(RedisKeys.authRevokePending(userId));
    if (!pending?.accessToken) {
      return {
        user_id: userId,
        has_pending: false,
        retried: false,
      };
    }

    const revoked = await this.revokeGoogleToken(pending.accessToken);

    if (revoked) {
      await this.redisService.del(RedisKeys.authRevokePending(userId));
    }

    return {
      user_id: userId,
      has_pending: true,
      retried: true,
      revoked,
      pending_kept: !revoked,
    };
  }
}

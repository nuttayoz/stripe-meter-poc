import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type RefreshToken, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthJwtPayload } from './types/auth-jwt-payload.type';

type AuthUserResponse = {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    await this.persistRefreshToken(
      user.id,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      ...tokens,
      user: this.toAuthUser(user),
    };
  }

  async refresh(rawRefreshToken?: string) {
    const refreshToken = rawRefreshToken?.trim();
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const storedToken = await this.findMatchingRefreshToken(
      user.id,
      refreshToken,
    );

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    await this.persistRefreshToken(
      user.id,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      ...tokens,
      user: this.toAuthUser(user),
    };
  }

  async logout(rawRefreshToken?: string) {
    const refreshToken = rawRefreshToken?.trim();
    if (!refreshToken) {
      return { success: true };
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      const storedToken = await this.findMatchingRefreshToken(
        payload.sub,
        refreshToken,
      );

      if (storedToken) {
        await this.prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      user: this.toAuthUser(user),
    };
  }

  async verifyAccessToken(rawAccessToken?: string) {
    const accessToken = rawAccessToken?.trim();
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      return await this.jwtService.verifyAsync<AuthJwtPayload>(accessToken, {
        secret:
          this.configService.get<string>('JWT_ACCESS_SECRET') ??
          'dev_access_secret',
      });
    } catch {
      throw new UnauthorizedException('Access token is invalid');
    }
  }

  getRefreshCookieName() {
    return (
      this.configService.get<string>('JWT_REFRESH_COOKIE_NAME') ??
      'refresh_token'
    );
  }

  getRefreshCookieOptions(): CookieOptions {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: this.parseDurationMs(
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      ),
    };
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: AuthJwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    };

    const accessDurationMs = this.parseDurationMs(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    );
    const refreshDurationMs = this.parseDurationMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    const accessToken = await this.jwtService.signAsync(payload, {
      secret:
        this.configService.get<string>('JWT_ACCESS_SECRET') ??
        'dev_access_secret',
      expiresIn: Math.floor(accessDurationMs / 1000),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ??
        'dev_refresh_secret',
      expiresIn: Math.floor(refreshDurationMs / 1000),
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: new Date(Date.now() + refreshDurationMs),
    };
  }

  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
  ) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  private async verifyRefreshToken(token: string) {
    try {
      return await this.jwtService.verifyAsync<AuthJwtPayload>(token, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ??
          'dev_refresh_secret',
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid');
    }
  }

  private async findMatchingRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<RefreshToken | null> {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    for (const token of activeTokens) {
      const isMatch = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isMatch) {
        return token;
      }
    }

    return null;
  }

  private parseDurationMs(value: string) {
    const match = value.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return amount;
      case 's':
        return amount * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private toAuthUser(user: User): AuthUserResponse {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    };
  }
}

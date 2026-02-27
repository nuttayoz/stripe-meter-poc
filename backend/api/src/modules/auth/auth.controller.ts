import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './guards/access-token.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    response.cookie(
      this.authService.getRefreshCookieName(),
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      dto.refreshToken ?? this.getRefreshTokenFromCookie(request);

    const result = await this.authService.refresh(refreshToken);

    response.cookie(
      this.authService.getRefreshCookieName(),
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      dto.refreshToken ?? this.getRefreshTokenFromCookie(request);

    await this.authService.logout(refreshToken);

    response.clearCookie(
      this.authService.getRefreshCookieName(),
      this.authService.getRefreshCookieOptions(),
    );

    return { success: true };
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return await this.authService.getMe(request.authUser.sub);
  }

  private getRefreshTokenFromCookie(request: Request) {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[this.authService.getRefreshCookieName()];
  }
}

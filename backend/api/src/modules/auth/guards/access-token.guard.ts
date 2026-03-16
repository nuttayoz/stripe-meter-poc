import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import type { AuthJwtPayload } from '../types/auth-jwt-payload.type';

export type AuthenticatedRequest = Request & {
  authUser: AuthJwtPayload;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const accessToken = this.extractBearerToken(request);
    const payload = await this.authService.verifyAccessToken(accessToken);

    (request as AuthenticatedRequest).authUser = payload;
    return true;
  }

  private extractBearerToken(request: Request) {
    const authorizationHeader = request.headers.authorization;
    if (!authorizationHeader) {
      return undefined;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
  }
}

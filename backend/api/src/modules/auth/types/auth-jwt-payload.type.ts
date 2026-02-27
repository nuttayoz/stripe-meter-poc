import { UserRole } from '@prisma/client';

export type AuthJwtPayload = {
  sub: string;
  email: string;
  orgId: string;
  role: UserRole;
};

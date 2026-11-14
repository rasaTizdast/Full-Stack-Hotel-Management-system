import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { hashCredential } from './credential-hash';
import { STAFF_SESSION_TTL_SECONDS } from './staff-auth.cookies';
import type { PublicStaff } from './staff-auth.types';

export interface StaffLoginResult {
  staff: PublicStaff;
  sessionToken: string;
  csrfToken: string;
}

@Injectable()
export class StaffAuthService {
  private readonly dummyPasswordHash = argon2.hash(randomBytes(32).toString('hex'), {
    type: argon2.argon2id,
  });

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<StaffLoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.staffUser.findUnique({ where: { email: normalizedEmail } });
    const encodedPassword = user?.passwordHash ?? (await this.dummyPasswordHash);

    let passwordMatches: boolean;
    try {
      passwordMatches = await argon2.verify(encodedPassword, password);
    } catch {
      passwordMatches = false;
    }

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + STAFF_SESSION_TTL_SECONDS * 1000);

    await this.prisma.staffSession.create({
      data: {
        staffUserId: user.id,
        tokenHash: hashCredential(sessionToken),
        csrfTokenHash: hashCredential(csrfToken),
        expiresAt,
      },
    });

    return {
      staff: this.toPublicStaff(user),
      sessionToken,
      csrfToken,
    };
  }

  async rotateCsrfToken(sessionId: string): Promise<string> {
    const csrfToken = randomBytes(32).toString('base64url');
    await this.prisma.staffSession.update({
      where: { id: sessionId },
      data: { csrfTokenHash: hashCredential(csrfToken) },
    });
    return csrfToken;
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.staffSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  toPublicStaff(user: {
    username: string;
    email: string;
    role: 'ADMIN' | 'RECEPTIONIST';
  }): PublicStaff {
    return {
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }
}

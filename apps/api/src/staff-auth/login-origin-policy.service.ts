import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class LoginOriginPolicyService {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService) {
    this.allowedOrigin = new URL(config.getOrThrow<string>('WEB_ORIGIN')).origin;
  }

  assertSameOrigin(request: Pick<Request, 'get'>): void {
    const origin = request.get('origin')?.trim();
    const referer = request.get('referer')?.trim();
    const candidates = [origin, referer].filter((value): value is string => Boolean(value));

    if (candidates.length === 0) {
      throw new ForbiddenException('A same-origin request is required.');
    }

    try {
      if (candidates.some((candidate) => new URL(candidate).origin !== this.allowedOrigin)) {
        throw new ForbiddenException('A same-origin request is required.');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('A same-origin request is required.');
    }
  }
}

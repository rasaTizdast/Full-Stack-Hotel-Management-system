import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStaffAccountDto } from './dto/create-staff-account.dto';
import { ChangeStaffRoleDto } from './dto/change-staff-role.dto';
import { DeactivateStaffAccountDto } from './dto/deactivate-staff-account.dto';
import { StaffAccountsQueryDto } from './dto/staff-accounts-query.dto';
import type { StaffAccountDto, StaffAccountListDto } from './dto/staff-account.dto';

const staffAccountSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

type StaffAccountRecord = Prisma.StaffUserGetPayload<{ select: typeof staffAccountSelect }>;

const LAST_ACTIVE_ADMIN = {
  code: 'LAST_ACTIVE_ADMIN',
  message: 'At least one active administrator account must remain.',
};

function toAccountDto(account: StaffAccountRecord): StaffAccountDto {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
    isActive: account.isActive,
    mustChangePassword: account.mustChangePassword,
    createdAt: account.createdAt.toISOString(),
  };
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 500) {
    throw new BadRequestException({
      code: 'AUDIT_REASON_REQUIRED',
      message: 'A non-empty reason of at most 500 characters is required.',
    });
  }
  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class StaffAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StaffAccountsQueryDto): Promise<StaffAccountListDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const [accounts, total] = await this.prisma.$transaction([
      this.prisma.staffUser.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: staffAccountSelect,
      }),
      this.prisma.staffUser.count(),
    ]);

    return { items: accounts.map(toAccountDto), page, pageSize, total };
  }

  async create(actorId: string, dto: CreateStaffAccountDto): Promise<StaffAccountDto> {
    const username = normalizeIdentity(dto.username);
    const email = normalizeIdentity(dto.email);
    if (!username || !email) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR' });
    }
    const passwordHash = await argon2.hash(dto.initialPassword, { type: argon2.argon2id });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockAdminMutation(transaction, actorId);
        const account = await transaction.staffUser.create({
          data: {
            username,
            email,
            passwordHash,
            role: dto.role,
            isActive: true,
            mustChangePassword: true,
          },
          select: staffAccountSelect,
        });
        await this.audit.record(transaction, {
          actorStaffUserId: actorId,
          eventName: 'STAFF_ACCOUNT_CREATED',
          targetType: 'STAFF_ACCOUNT',
          targetId: account.id,
          after: { role: account.role, isActive: account.isActive, mustChangePassword: true },
        });
        return toAccountDto(account);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'STAFF_ACCOUNT_EXISTS',
          message: 'The username or email is already in use.',
        });
      }
      throw error;
    }
  }

  async changeRole(
    actorId: string,
    staffUserId: string,
    dto: ChangeStaffRoleDto,
  ): Promise<StaffAccountDto> {
    const reason = normalizeReason(dto.reason);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAdminMutation(transaction, actorId);
      const current = await transaction.staffUser.findUnique({
        where: { id: staffUserId },
        select: { id: true, role: true, isActive: true },
      });
      if (!current) throw this.accountNotFound();

      if (current.role === 'ADMIN' && current.isActive && dto.role !== 'ADMIN') {
        await this.requireAnotherActiveAdmin(transaction);
      }
      if (current.role === dto.role) {
        const unchanged = await transaction.staffUser.findUniqueOrThrow({
          where: { id: staffUserId },
          select: staffAccountSelect,
        });
        return toAccountDto(unchanged);
      }

      const updated = await transaction.staffUser.update({
        where: { id: staffUserId },
        data: { role: dto.role },
        select: staffAccountSelect,
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actorId,
        eventName: 'STAFF_ROLE_CHANGED',
        targetType: 'STAFF_ACCOUNT',
        targetId: updated.id,
        reason,
        before: { role: current.role },
        after: { role: updated.role },
      });
      return toAccountDto(updated);
    });
  }

  async deactivate(
    actorId: string,
    staffUserId: string,
    dto: DeactivateStaffAccountDto,
  ): Promise<StaffAccountDto> {
    const reason = normalizeReason(dto.reason);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAdminMutation(transaction, actorId);
      const current = await transaction.staffUser.findUnique({
        where: { id: staffUserId },
        select: { id: true, role: true, isActive: true },
      });
      if (!current) throw this.accountNotFound();
      if (current.role === 'ADMIN' && current.isActive) {
        await this.requireAnotherActiveAdmin(transaction);
      }
      if (!current.isActive) {
        const unchanged = await transaction.staffUser.findUniqueOrThrow({
          where: { id: staffUserId },
          select: staffAccountSelect,
        });
        return toAccountDto(unchanged);
      }

      const updated = await transaction.staffUser.update({
        where: { id: staffUserId },
        data: { isActive: false },
        select: staffAccountSelect,
      });
      await transaction.staffSession.updateMany({
        where: { staffUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(transaction, {
        actorStaffUserId: actorId,
        eventName: 'STAFF_ACCOUNT_DEACTIVATED',
        targetType: 'STAFF_ACCOUNT',
        targetId: updated.id,
        reason,
        before: { isActive: true },
        after: { isActive: false },
      });
      return toAccountDto(updated);
    });
  }

  private async lockAdminMutation(
    transaction: Prisma.TransactionClient,
    actorId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT 1 AS "locked" FROM (SELECT pg_advisory_xact_lock(772003, 1)) AS "advisory_lock"`;
    const actors = await transaction.$queryRaw<Array<{ role: string; isActive: boolean }>>`
      SELECT "role"::text AS "role", "is_active" AS "isActive"
      FROM "staff_users"
      WHERE "id" = ${actorId}::uuid
      FOR UPDATE
    `;
    if (!actors[0]?.isActive || actors[0].role !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }
  }

  private async requireAnotherActiveAdmin(transaction: Prisma.TransactionClient): Promise<void> {
    const counts = await transaction.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS "count"
      FROM "staff_users"
      WHERE "role" = 'ADMIN'::staff_role AND "is_active" = true
    `;
    if ((counts[0]?.count ?? 0) <= 1) throw new ConflictException(LAST_ACTIVE_ADMIN);
  }

  private accountNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'STAFF_ACCOUNT_NOT_FOUND',
      message: 'The staff account was not found.',
    });
  }
}

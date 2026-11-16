import type { Prisma } from '../generated/prisma/client';
import { AuditService } from './audit.service';
import type { AuditEventInput, AuditSnapshot } from './audit.types';

describe('AuditService', () => {
  const auditEvent = { create: jest.fn().mockResolvedValue(undefined) };
  const transaction = { auditEvent } as unknown as Prisma.TransactionClient;
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService();
  });

  it('rejects snapshot fields outside the operational audit allowlist', async () => {
    const event: AuditEventInput = {
      actorStaffUserId: 'staff-id',
      eventName: 'STAFF_ROLE_CHANGED',
      targetType: 'STAFF_ACCOUNT',
      targetId: 'account-id',
      after: { firstName: 'Fictional Guest' } as unknown as AuditSnapshot,
    };

    await expect(service.record(transaction, event)).rejects.toThrow(
      'Audit snapshots may contain only allowlisted operational fields.',
    );
    expect(auditEvent.create).not.toHaveBeenCalled();
  });

  it('writes an allowlisted minimal snapshot through the supplied transaction client', async () => {
    const event: AuditEventInput = {
      actorStaffUserId: 'staff-id',
      eventName: 'STAFF_ROLE_CHANGED',
      targetType: 'STAFF_ACCOUNT',
      targetId: 'account-id',
      reason: 'Role responsibilities changed.',
      before: { role: 'RECEPTIONIST' },
      after: { role: 'MANAGER' },
    };

    await service.record(transaction, event);

    expect(auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorStaffUserId: 'staff-id',
        eventName: 'STAFF_ROLE_CHANGED',
        targetType: 'STAFF_ACCOUNT',
        targetId: 'account-id',
        reason: 'Role responsibilities changed.',
        before: { role: 'RECEPTIONIST' },
        after: { role: 'MANAGER' },
      },
    });
  });
});

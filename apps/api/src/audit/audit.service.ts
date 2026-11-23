import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { AuditEventInput, AuditSafeField, AuditSnapshot } from './audit.types';

const ALLOWED_AUDIT_FIELDS = new Set<AuditSafeField>([
  'role',
  'isActive',
  'mustChangePassword',
  'roomNumber',
  'floor',
  'housekeepingStatus',
  'taskType',
  'priority',
  'assignedToStaffUserId',
  'completionOutcome',
  'discrepancyType',
  'expectedOccupied',
  'observedOccupied',
  'isGenerated',
  'status',
  'nightlyPriceToman',
  'checkIn',
  'checkOut',
  'roomQuantity',
  'roomId',
  'effectiveDate',
  'businessDate',
  'maintenanceCategory',
  'blockKind',
  'startDate',
  'endDate',
  'expectedDate',
  'folioId',
  'serviceItemId',
  'amountToman',
  'direction',
  'entryKind',
  'serviceDate',
  'correctsEntryId',
  'serviceName',
  'serviceCategory',
  'currentPriceToman',
]);

function assertSafeSnapshot(snapshot: AuditSnapshot | undefined): void {
  if (!snapshot) return;
  for (const key of Object.keys(snapshot)) {
    if (!ALLOWED_AUDIT_FIELDS.has(key as AuditSafeField)) {
      throw new Error('Audit snapshots may contain only allowlisted operational fields.');
    }
  }
}

@Injectable()
export class AuditService {
  async record(transaction: Prisma.TransactionClient, event: AuditEventInput): Promise<void> {
    assertSafeSnapshot(event.before);
    assertSafeSnapshot(event.after);
    await transaction.auditEvent.create({
      data: {
        actorStaffUserId: event.actorStaffUserId,
        eventName: event.eventName,
        targetType: event.targetType,
        targetId: event.targetId,
        reason: event.reason,
        before: event.before,
        after: event.after,
      },
    });
  }
}

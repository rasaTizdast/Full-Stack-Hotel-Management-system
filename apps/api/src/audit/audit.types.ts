export type AuditSafeField =
  | 'role'
  | 'isActive'
  | 'mustChangePassword'
  | 'roomNumber'
  | 'floor'
  | 'housekeepingStatus'
  | 'taskType'
  | 'priority'
  | 'assignedToStaffUserId'
  | 'completionOutcome'
  | 'discrepancyType'
  | 'expectedOccupied'
  | 'observedOccupied'
  | 'isGenerated'
  | 'status'
  | 'nightlyPriceToman'
  | 'checkIn'
  | 'checkOut'
  | 'actualDepartureDate'
  | 'roomQuantity'
  | 'roomId'
  | 'effectiveDate'
  | 'businessDate'
  | 'nextBusinessDate'
  | 'roomNightCount'
  | 'warningCount'
  | 'maintenanceCategory'
  | 'blockKind'
  | 'startDate'
  | 'endDate'
  | 'expectedDate'
  | 'folioId'
  | 'serviceItemId'
  | 'amountToman'
  | 'direction'
  | 'entryKind'
  | 'serviceDate'
  | 'correctsEntryId'
  | 'serviceName'
  | 'serviceCategory'
  | 'currentPriceToman'
  | 'paymentMethod';

export type AuditSnapshot = Partial<Record<AuditSafeField, string | number | boolean | null>>;

export interface AuditEventInput {
  actorStaffUserId: string;
  eventName: string;
  targetType: string;
  targetId: string;
  reason?: string;
  before?: AuditSnapshot;
  after?: AuditSnapshot;
}

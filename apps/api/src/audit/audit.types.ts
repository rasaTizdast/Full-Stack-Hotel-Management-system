export type AuditSafeField =
  | 'role'
  | 'isActive'
  | 'mustChangePassword'
  | 'roomNumber'
  | 'floor'
  | 'housekeepingStatus'
  | 'isGenerated'
  | 'status'
  | 'nightlyPriceToman';

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

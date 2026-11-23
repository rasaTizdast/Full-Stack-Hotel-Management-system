import { requestStaffApi } from './staff-api';

export type MaintenanceCategory =
  'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'APPLIANCE' | 'STRUCTURAL' | 'SAFETY' | 'OTHER';
export type MaintenancePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type MaintenanceRequestStatus = 'OPEN' | 'RESOLVED';
export type StaffRoomBlockKind = 'OUT_OF_ORDER' | 'CAPACITY_CLOSED';
export type StaffRoomBlockStatus = 'ACTIVE' | 'RESTORED' | 'EXPIRED';

export interface MaintenanceIdentity {
  id: string;
  username: string;
}

export interface MaintenanceRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeName: string;
}

export interface StaffMaintenanceRequest {
  id: string;
  room: MaintenanceRoom;
  category: MaintenanceCategory;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceRequestStatus;
  expectedDate: string;
  openedAt: string;
  assignedAt: string | null;
  assignee: MaintenanceIdentity | null;
  createdBy: MaintenanceIdentity;
  resolvedAt: string | null;
  resolvedBy: MaintenanceIdentity | null;
  resolutionNote: string | null;
}

export interface StaffRoomBlock {
  id: string;
  room: MaintenanceRoom;
  startDate: string;
  expectedReturnDate: string;
  kind: StaffRoomBlockKind;
  reason: string;
  status: StaffRoomBlockStatus;
  createdBy: MaintenanceIdentity | null;
  createdAt: string;
}

export interface StaffMaintenanceList<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface StaffMaintenanceRequestQuery {
  page?: number;
  pageSize?: number;
  roomId?: string;
  floor?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceRequestStatus;
  assigneeStaffUserId?: string;
  expectedDate?: string;
}

export interface StaffRoomBlockQuery {
  page?: number;
  pageSize?: number;
  roomId?: string;
  floor?: string;
  kind?: StaffRoomBlockKind;
  status?: StaffRoomBlockStatus;
  activeOn?: string;
  expectedReturnDate?: string;
  reason?: string;
}

export interface CreateStaffMaintenanceRequest {
  roomId: string;
  category: MaintenanceCategory;
  description: string;
  priority?: MaintenancePriority;
  expectedDate: string;
}

export interface CreateStaffRoomBlock {
  roomId: string;
  startDate: string;
  endDate: string;
  kind: StaffRoomBlockKind;
  reason: string;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

function jsonMutation<T>(method: string, body: unknown, csrfToken: string): Promise<T> {
  return requestStaffApi<T>('maintenance/requests', {
    method,
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });
}

export function getStaffMaintenanceRequests(
  query: StaffMaintenanceRequestQuery = {},
): Promise<StaffMaintenanceList<StaffMaintenanceRequest>> {
  return requestStaffApi<StaffMaintenanceList<StaffMaintenanceRequest>>(
    `maintenance/requests${queryString(query)}`,
  );
}

export function createStaffMaintenanceRequest(
  input: CreateStaffMaintenanceRequest,
  csrfToken: string,
): Promise<StaffMaintenanceRequest> {
  return jsonMutation('POST', input, csrfToken);
}

export function assignStaffMaintenanceRequest(
  requestId: string,
  input: { assigneeStaffUserId: string },
  csrfToken: string,
): Promise<StaffMaintenanceRequest> {
  return requestStaffApi(`maintenance/requests/${encodeURIComponent(requestId)}/assignment`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function resolveStaffMaintenanceRequest(
  requestId: string,
  input: { resolutionNote: string },
  csrfToken: string,
): Promise<StaffMaintenanceRequest> {
  return requestStaffApi(`maintenance/requests/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function getStaffRoomBlocks(
  query: StaffRoomBlockQuery = {},
): Promise<StaffMaintenanceList<StaffRoomBlock>> {
  return requestStaffApi<StaffMaintenanceList<StaffRoomBlock>>(
    `maintenance/blocks${queryString(query)}`,
  );
}

export function createStaffRoomBlock(
  input: CreateStaffRoomBlock,
  csrfToken: string,
): Promise<StaffRoomBlock> {
  return requestStaffApi('maintenance/blocks', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function restoreStaffRoomBlock(
  blockId: string,
  input: { reason: string },
  csrfToken: string,
): Promise<StaffRoomBlock> {
  return requestStaffApi(`maintenance/blocks/${encodeURIComponent(blockId)}/restore`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function getStaffMaintenanceAssignees(): Promise<{ items: MaintenanceIdentity[] }> {
  return requestStaffApi('maintenance/assignees');
}

export function getStaffMaintenanceRooms(): Promise<{ items: MaintenanceRoom[] }> {
  return requestStaffApi('maintenance/rooms');
}

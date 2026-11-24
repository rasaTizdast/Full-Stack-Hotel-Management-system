import { requestStaffApi } from './staff-api';

export type HousekeepingTaskType =
  'DEPARTURE_CLEAN' | 'STAYOVER_CLEAN' | 'INSPECTION' | 'GUEST_REQUEST' | 'RE_CLEAN';
export type HousekeepingTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type HousekeepingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type HousekeepingOutcome = 'DONE' | 'NEEDS_REWORK';
export type HousekeepingCondition = 'DIRTY' | 'CLEAN' | 'INSPECTED';
export type OccupancyDiscrepancyKind = 'SLEEP' | 'SKIP';
export type HousekeepingDiscrepancyStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface HousekeepingAssignee {
  id: string;
  username: string;
}

export interface HousekeepingAssigneeList {
  items: HousekeepingAssignee[];
}

export interface HousekeepingTaskRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  housekeepingStatus: HousekeepingCondition;
  occupancy: 'VACANT' | 'OCCUPIED';
}

export interface HousekeepingTaskActions {
  canAssign: boolean;
  canStart: boolean;
  canComplete: boolean;
  canCancel: boolean;
}

export interface HousekeepingTask {
  id: string;
  room: HousekeepingTaskRoom;
  arrivalDue: boolean;
  departureDue: boolean;
  isOverdue: boolean;
  dueDate: string;
  taskType: HousekeepingTaskType;
  status: HousekeepingTaskStatus;
  priority: HousekeepingPriority;
  completionOutcome: HousekeepingOutcome | null;
  completionReason: string | null;
  note: string | null;
  assignee: HousekeepingAssignee | null;
  allowedActions: HousekeepingTaskActions;
}

export interface HousekeepingDiscrepancy {
  id: string;
  roomId: string;
  roomNumber: string;
  floor: string | null;
  businessDate: string;
  kind: OccupancyDiscrepancyKind;
  expectedOccupied: boolean;
  observedOccupied: boolean;
  status: HousekeepingDiscrepancyStatus;
  note: string | null;
  reportedAt: string;
  reportedBy: HousekeepingAssignee;
  resolvedBy: HousekeepingAssignee | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

export interface HousekeepingRoomOption {
  id: string;
  roomNumber: string;
  floor: string | null;
  housekeepingStatus: HousekeepingCondition;
  occupancy: 'VACANT' | 'OCCUPIED';
  dueArrival: boolean;
  dueDeparture: boolean;
}

export interface HousekeepingPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface HousekeepingList<T> {
  businessDate: string;
  items: T[];
  pagination: HousekeepingPagination;
}

export interface HousekeepingListQuery {
  businessDate?: string;
  dueDate?: string;
  page?: number;
  pageSize?: number;
  roomId?: string;
  floor?: string;
  taskType?: HousekeepingTaskType;
  assigneeStaffUserId?: string;
  status?: HousekeepingTaskStatus;
  priority?: HousekeepingPriority;
}

export interface HousekeepingDiscrepancyQuery {
  businessDate?: string;
  page?: number;
  pageSize?: number;
  roomId?: string;
  status?: HousekeepingDiscrepancyStatus;
}

export interface HousekeepingRoomQuery {
  businessDate?: string;
  page?: number;
  pageSize?: number;
  floor?: string;
}

export interface CreateHousekeepingTaskInput {
  roomId: string;
  taskType: HousekeepingTaskType;
  businessDate: string;
  priority?: HousekeepingPriority;
  note?: string;
}

export interface AssignHousekeepingTaskInput {
  assigneeStaffUserId: string;
  priority?: HousekeepingPriority;
}

export interface CompleteHousekeepingTaskInput {
  outcome: HousekeepingOutcome;
  reason?: string;
}

export interface ReasonInput {
  reason: string;
}

export interface ReportHousekeepingDiscrepancyInput {
  businessDate: string;
  observedOccupied: boolean;
  note: string;
}

function buildQuery(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function csrfHeaders(csrfToken: string) {
  return { 'X-CSRF-Token': csrfToken };
}

export function getStaffHousekeepingTasks(
  query: HousekeepingListQuery = {},
): Promise<HousekeepingList<HousekeepingTask>> {
  return requestStaffApi(`housekeeping/tasks${buildQuery(query)}`);
}

export function createStaffHousekeepingTask(
  input: CreateHousekeepingTaskInput,
  csrfToken: string,
): Promise<HousekeepingTask> {
  return requestStaffApi('housekeeping/tasks', {
    method: 'POST',
    headers: csrfHeaders(csrfToken),
    body: JSON.stringify(input),
  });
}

export function assignStaffHousekeepingTask(
  taskId: string,
  input: AssignHousekeepingTaskInput,
  csrfToken: string,
): Promise<HousekeepingTask> {
  return requestStaffApi(`housekeeping/tasks/${encodeURIComponent(taskId)}/assignment`, {
    method: 'PATCH',
    headers: csrfHeaders(csrfToken),
    body: JSON.stringify(input),
  });
}

export function startStaffHousekeepingTask(
  taskId: string,
  csrfToken: string,
): Promise<HousekeepingTask> {
  return requestStaffApi(`housekeeping/tasks/${encodeURIComponent(taskId)}/start`, {
    method: 'POST',
    headers: csrfHeaders(csrfToken),
  });
}

export function completeStaffHousekeepingTask(
  taskId: string,
  input: CompleteHousekeepingTaskInput,
  csrfToken: string,
): Promise<HousekeepingTask> {
  return requestStaffApi(`housekeeping/tasks/${encodeURIComponent(taskId)}/complete`, {
    method: 'POST',
    headers: csrfHeaders(csrfToken),
    body: JSON.stringify(input),
  });
}

export function cancelStaffHousekeepingTask(
  taskId: string,
  input: ReasonInput,
  csrfToken: string,
): Promise<HousekeepingTask> {
  return requestStaffApi(`housekeeping/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: 'POST',
    headers: csrfHeaders(csrfToken),
    body: JSON.stringify(input),
  });
}

export function getStaffHousekeepingDiscrepancies(
  query: HousekeepingDiscrepancyQuery = {},
): Promise<HousekeepingList<HousekeepingDiscrepancy>> {
  return requestStaffApi(`housekeeping/discrepancies${buildQuery(query)}`);
}

export function getStaffHousekeepingRooms(
  query: HousekeepingRoomQuery = {},
): Promise<HousekeepingList<HousekeepingRoomOption>> {
  return requestStaffApi(`housekeeping/rooms${buildQuery(query)}`);
}

export function getStaffHousekeepingAssignees(): Promise<HousekeepingAssigneeList> {
  return requestStaffApi('housekeeping/assignees');
}

export function reportStaffRoomDiscrepancy(
  roomId: string,
  input: ReportHousekeepingDiscrepancyInput,
  csrfToken: string,
): Promise<HousekeepingDiscrepancy> {
  return requestStaffApi(`housekeeping/rooms/${encodeURIComponent(roomId)}/discrepancies`, {
    method: 'POST',
    headers: csrfHeaders(csrfToken),
    body: JSON.stringify(input),
  });
}

export function resolveStaffHousekeepingDiscrepancy(
  discrepancyId: string,
  csrfToken: string,
): Promise<HousekeepingDiscrepancy> {
  return requestStaffApi(
    `housekeeping/discrepancies/${encodeURIComponent(discrepancyId)}/resolve`,
    {
      method: 'POST',
      headers: csrfHeaders(csrfToken),
    },
  );
}

export function dismissStaffHousekeepingDiscrepancy(
  discrepancyId: string,
  input: ReasonInput,
  csrfToken: string,
): Promise<HousekeepingDiscrepancy> {
  return requestStaffApi(
    `housekeeping/discrepancies/${encodeURIComponent(discrepancyId)}/dismiss`,
    {
      method: 'POST',
      headers: csrfHeaders(csrfToken),
      body: JSON.stringify(input),
    },
  );
}

export type HousekeepingTaskType =
  'DEPARTURE_CLEAN' | 'STAYOVER_CLEAN' | 'INSPECTION' | 'GUEST_REQUEST' | 'RE_CLEAN';
export type HousekeepingTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type HousekeepingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type HousekeepingCompletionOutcome = 'DONE' | 'NEEDS_REWORK';
export type HousekeepingCondition = 'DIRTY' | 'CLEAN' | 'INSPECTED';

export type HousekeepingActor = {
  id: string;
  role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'CASHIER';
};

export type HousekeepingTaskState = {
  status: HousekeepingTaskStatus;
  assignedToStaffUserId: string | null;
};

export class HousekeepingRuleError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'HousekeepingRuleError';
  }
}

type TaskAction = 'start' | 'complete';

function assertTaskActionPermission(task: HousekeepingTaskState, actor: HousekeepingActor): void {
  if (actor.role === 'ADMIN' || actor.role === 'MANAGER') return;
  if (actor.role === 'HOUSEKEEPER' && task.assignedToStaffUserId === actor.id) return;
  if (actor.role === 'HOUSEKEEPER') throw new HousekeepingRuleError('TASK_NOT_ASSIGNED');
  throw new HousekeepingRuleError('TASK_ACTION_FORBIDDEN');
}

function assertTaskState(
  task: HousekeepingTaskState,
  action: TaskAction,
): 'START' | 'COMPLETE' | 'NO_OP' {
  if (action === 'start') {
    if (task.status === 'IN_PROGRESS') return 'NO_OP';
    if (task.status === 'OPEN') return 'START';
    throw new HousekeepingRuleError('TASK_STATUS_CONFLICT');
  }

  if (task.status === 'COMPLETED') return 'NO_OP';
  if (task.status === 'IN_PROGRESS') return 'COMPLETE';
  throw new HousekeepingRuleError('TASK_STATUS_CONFLICT');
}

export function assertTaskCanBeStarted(
  task: HousekeepingTaskState,
  actor: HousekeepingActor,
): 'START' | 'NO_OP' {
  assertTaskActionPermission(task, actor);
  return assertTaskState(task, 'start') as 'START' | 'NO_OP';
}

export function assertTaskCanBeCompleted(
  task: HousekeepingTaskState,
  actor: HousekeepingActor,
): 'COMPLETE' | 'NO_OP' {
  assertTaskActionPermission(task, actor);
  return assertTaskState(task, 'complete') as 'COMPLETE' | 'NO_OP';
}

export function assertTaskCanBeCancelled(
  task: HousekeepingTaskState,
  actor: HousekeepingActor,
  reason: string,
): 'CANCEL' | 'NO_OP' {
  if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
    throw new HousekeepingRuleError('TASK_ACTION_FORBIDDEN');
  }
  if (!reason.trim()) throw new HousekeepingRuleError('TASK_CANCELLATION_REASON_REQUIRED');
  if (task.status === 'CANCELLED') return 'NO_OP';
  if (task.status === 'OPEN' || task.status === 'IN_PROGRESS') return 'CANCEL';
  throw new HousekeepingRuleError('TASK_STATUS_CONFLICT');
}

export function resolveTaskCompletion(input: {
  taskType: HousekeepingTaskType;
  outcome: HousekeepingCompletionOutcome;
  reason?: string;
  roomHousekeepingStatus: HousekeepingCondition;
}): {
  nextHousekeepingStatus: HousekeepingCondition | null;
  followUpTaskType: HousekeepingTaskType | null;
} {
  if (input.outcome === 'NEEDS_REWORK') {
    if (input.taskType !== 'INSPECTION') {
      throw new HousekeepingRuleError('NEEDS_REWORK_INSPECTION_ONLY');
    }
    if (!input.reason?.trim()) {
      throw new HousekeepingRuleError('INSPECTION_REWORK_REASON_REQUIRED');
    }
    return { nextHousekeepingStatus: 'DIRTY', followUpTaskType: 'RE_CLEAN' };
  }

  if (input.taskType === 'INSPECTION') {
    if (input.roomHousekeepingStatus === 'DIRTY') {
      throw new HousekeepingRuleError('ROOM_NOT_CLEAN');
    }
    return { nextHousekeepingStatus: 'INSPECTED', followUpTaskType: null };
  }
  if (
    input.taskType === 'DEPARTURE_CLEAN' ||
    input.taskType === 'STAYOVER_CLEAN' ||
    input.taskType === 'RE_CLEAN'
  ) {
    return { nextHousekeepingStatus: 'CLEAN', followUpTaskType: null };
  }
  return { nextHousekeepingStatus: null, followUpTaskType: null };
}

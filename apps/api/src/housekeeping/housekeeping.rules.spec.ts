import {
  assertTaskCanBeCancelled,
  assertTaskCanBeCompleted,
  assertTaskCanBeStarted,
  HousekeepingRuleError,
  resolveTaskCompletion,
} from './housekeeping.rules';

function expectRuleCode(action: () => unknown, expectedCode: string): void {
  try {
    action();
  } catch (error) {
    if (!(error instanceof HousekeepingRuleError)) throw error;
    expect(error.code).toBe(expectedCode);
    return;
  }
  throw new Error(`Expected housekeeping rule ${expectedCode} to be thrown.`);
}

describe('housekeeping task lifecycle rules', () => {
  const housekeeper = { id: 'housekeeper-1', role: 'HOUSEKEEPER' as const };
  const manager = { id: 'manager-1', role: 'MANAGER' as const };

  it('starts an open task assigned to the actor and treats a repeated start as a no-op', () => {
    const task = { status: 'OPEN' as const, assignedToStaffUserId: housekeeper.id };

    expect(assertTaskCanBeStarted(task, housekeeper)).toBe('START');
    expect(assertTaskCanBeStarted({ ...task, status: 'IN_PROGRESS' }, housekeeper)).toBe('NO_OP');
  });

  it('does not let a housekeeper start work assigned to someone else', () => {
    expectRuleCode(
      () =>
        assertTaskCanBeStarted(
          { status: 'OPEN', assignedToStaffUserId: 'housekeeper-2' },
          housekeeper,
        ),
      'TASK_NOT_ASSIGNED',
    );
  });

  it('allows a manager to start an unassigned task but rejects skipping the in-progress state', () => {
    expect(assertTaskCanBeStarted({ status: 'OPEN', assignedToStaffUserId: null }, manager)).toBe(
      'START',
    );
    expectRuleCode(
      () => assertTaskCanBeCompleted({ status: 'OPEN', assignedToStaffUserId: null }, manager),
      'TASK_STATUS_CONFLICT',
    );
  });

  it('requires the assigned housekeeper to complete an in-progress task', () => {
    const task = { status: 'IN_PROGRESS' as const, assignedToStaffUserId: housekeeper.id };

    expect(assertTaskCanBeCompleted(task, housekeeper)).toBe('COMPLETE');
    expectRuleCode(
      () =>
        assertTaskCanBeCompleted({ ...task, assignedToStaffUserId: 'housekeeper-2' }, housekeeper),
      'TASK_NOT_ASSIGNED',
    );
  });

  it('returns the stored completion path for a completed task without another transition', () => {
    expect(
      assertTaskCanBeCompleted(
        { status: 'COMPLETED', assignedToStaffUserId: housekeeper.id },
        housekeeper,
      ),
    ).toBe('NO_OP');
  });

  it('allows managers to cancel open or active work but requires a reason', () => {
    expect(
      assertTaskCanBeCancelled(
        { status: 'OPEN', assignedToStaffUserId: null },
        manager,
        'Duplicate task',
      ),
    ).toBe('CANCEL');
    expectRuleCode(
      () =>
        assertTaskCanBeCancelled({ status: 'OPEN', assignedToStaffUserId: null }, manager, '   '),
      'TASK_CANCELLATION_REASON_REQUIRED',
    );
    expectRuleCode(
      () =>
        assertTaskCanBeCancelled(
          { status: 'OPEN', assignedToStaffUserId: null },
          housekeeper,
          'Duplicate task',
        ),
      'TASK_ACTION_FORBIDDEN',
    );
  });

  it('maps completed cleaning and passing inspection to condition only', () => {
    expect(
      resolveTaskCompletion({
        taskType: 'DEPARTURE_CLEAN',
        outcome: 'DONE',
        roomHousekeepingStatus: 'DIRTY',
      }),
    ).toEqual({ nextHousekeepingStatus: 'CLEAN', followUpTaskType: null });
    expect(
      resolveTaskCompletion({
        taskType: 'INSPECTION',
        outcome: 'DONE',
        roomHousekeepingStatus: 'CLEAN',
      }),
    ).toEqual({ nextHousekeepingStatus: 'INSPECTED', followUpTaskType: null });
  });

  it('requires clean condition for inspection and makes failed inspection re-clean explicit', () => {
    expectRuleCode(
      () =>
        resolveTaskCompletion({
          taskType: 'INSPECTION',
          outcome: 'DONE',
          roomHousekeepingStatus: 'DIRTY',
        }),
      'ROOM_NOT_CLEAN',
    );

    expect(
      resolveTaskCompletion({
        taskType: 'INSPECTION',
        outcome: 'NEEDS_REWORK',
        reason: 'Dust remains in the room.',
        roomHousekeepingStatus: 'CLEAN',
      }),
    ).toEqual({ nextHousekeepingStatus: 'DIRTY', followUpTaskType: 'RE_CLEAN' });
    expectRuleCode(
      () =>
        resolveTaskCompletion({
          taskType: 'INSPECTION',
          outcome: 'NEEDS_REWORK',
          roomHousekeepingStatus: 'CLEAN',
        }),
      'INSPECTION_REWORK_REASON_REQUIRED',
    );
  });

  it('does not change condition for guest requests or accept inspection-only outcomes elsewhere', () => {
    expect(
      resolveTaskCompletion({
        taskType: 'GUEST_REQUEST',
        outcome: 'DONE',
        roomHousekeepingStatus: 'DIRTY',
      }),
    ).toEqual({ nextHousekeepingStatus: null, followUpTaskType: null });
    expectRuleCode(
      () =>
        resolveTaskCompletion({
          taskType: 'STAYOVER_CLEAN',
          outcome: 'NEEDS_REWORK',
          reason: 'Not applicable',
          roomHousekeepingStatus: 'DIRTY',
        }),
      'NEEDS_REWORK_INSPECTION_ONLY',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { sortHousekeepingTasksByUrgency } from './housekeeping-copy';

describe('sortHousekeepingTasksByUrgency', () => {
  it('puts arrival readiness first, overdue departure cleans next, then sorts remaining work by due date and priority', () => {
    const tasks = [
      {
        id: 'later-high',
        taskType: 'GUEST_REQUEST' as const,
        priority: 'HIGH' as const,
        arrivalDue: false,
        departureDue: false,
        isOverdue: false,
        dueDate: '2026-11-20',
      },
      {
        id: 'overdue-departure',
        taskType: 'DEPARTURE_CLEAN' as const,
        priority: 'LOW' as const,
        arrivalDue: false,
        departureDue: true,
        isOverdue: true,
        dueDate: '2026-11-15',
      },
      {
        id: 'arrival',
        taskType: 'INSPECTION' as const,
        priority: 'NORMAL' as const,
        arrivalDue: true,
        departureDue: false,
        isOverdue: false,
        dueDate: '2026-11-17',
      },
      {
        id: 'early-high',
        taskType: 'STAYOVER_CLEAN' as const,
        priority: 'HIGH' as const,
        arrivalDue: false,
        departureDue: false,
        isOverdue: false,
        dueDate: '2026-11-18',
      },
      {
        id: 'overdue-stayover',
        taskType: 'STAYOVER_CLEAN' as const,
        priority: 'URGENT' as const,
        arrivalDue: false,
        departureDue: false,
        isOverdue: true,
        dueDate: '2026-11-16',
      },
    ];

    expect(sortHousekeepingTasksByUrgency(tasks).map((task) => task.id)).toEqual([
      'arrival',
      'overdue-departure',
      'overdue-stayover',
      'early-high',
      'later-high',
    ]);
  });
});

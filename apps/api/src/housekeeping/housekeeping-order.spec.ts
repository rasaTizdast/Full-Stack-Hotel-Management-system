import { orderHousekeepingQueue } from './housekeeping-order';

describe('housekeeping queue ordering', () => {
  it('puts arrival readiness before overdue departure cleans and routine work', () => {
    const queue = orderHousekeepingQueue([
      {
        id: 'routine',
        arrivalDue: false,
        departureDue: false,
        isOverdue: false,
        taskType: 'STAYOVER_CLEAN',
        priority: 'URGENT',
        dueDate: '2026-11-17',
      },
      {
        id: 'overdue',
        arrivalDue: false,
        departureDue: true,
        isOverdue: true,
        taskType: 'DEPARTURE_CLEAN',
        priority: 'LOW',
        dueDate: '2026-11-16',
      },
      {
        id: 'arrival',
        arrivalDue: true,
        departureDue: false,
        isOverdue: false,
        taskType: 'INSPECTION',
        priority: 'NORMAL',
        dueDate: '2026-11-17',
      },
    ]);

    expect(queue.map(({ id }) => id)).toEqual(['arrival', 'overdue', 'routine']);
  });

  it('orders other due work by urgency, due date, and stable id', () => {
    const queue = orderHousekeepingQueue([
      {
        id: 'later',
        arrivalDue: false,
        departureDue: false,
        isOverdue: false,
        taskType: 'GUEST_REQUEST',
        priority: 'HIGH',
        dueDate: '2026-11-17',
      },
      {
        id: 'earlier-z',
        arrivalDue: false,
        departureDue: false,
        isOverdue: true,
        taskType: 'INSPECTION',
        priority: 'NORMAL',
        dueDate: '2026-11-16',
      },
      {
        id: 'earlier-a',
        arrivalDue: false,
        departureDue: false,
        isOverdue: true,
        taskType: 'INSPECTION',
        priority: 'NORMAL',
        dueDate: '2026-11-16',
      },
    ]);

    expect(queue.map(({ id }) => id)).toEqual(['later', 'earlier-a', 'earlier-z']);
  });
});

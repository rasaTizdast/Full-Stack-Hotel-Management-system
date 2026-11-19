import type { HousekeepingPriority, HousekeepingTaskType } from './housekeeping.rules';

export interface HousekeepingQueueOrderItem {
  id: string;
  arrivalDue: boolean;
  departureDue: boolean;
  isOverdue: boolean;
  taskType: HousekeepingTaskType;
  priority: HousekeepingPriority;
  dueDate: string;
}

const priorityRank: Record<HousekeepingPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

function queueRank(item: HousekeepingQueueOrderItem): number {
  if (item.arrivalDue) return 0;
  if (item.isOverdue && item.departureDue && item.taskType === 'DEPARTURE_CLEAN') return 1;
  return 2;
}

export function orderHousekeepingQueue<T extends HousekeepingQueueOrderItem>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const groupDifference = queueRank(left) - queueRank(right);
    if (groupDifference !== 0) return groupDifference;
    const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const dateDifference = left.dueDate.localeCompare(right.dueDate);
    return dateDifference !== 0 ? dateDifference : left.id.localeCompare(right.id);
  });
}

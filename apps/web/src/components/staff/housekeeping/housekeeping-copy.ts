import type {
  HousekeepingCondition,
  HousekeepingDiscrepancyStatus,
  HousekeepingPriority,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
  OccupancyDiscrepancyKind,
} from '@/lib/staff-housekeeping-api';

export const TASK_TYPE_LABELS: Record<HousekeepingTaskType, string> = {
  DEPARTURE_CLEAN: 'نظافت پس از خروج',
  STAYOVER_CLEAN: 'نظافت میان‌اقامت',
  INSPECTION: 'بازرسی اتاق',
  GUEST_REQUEST: 'درخواست مهمان',
  RE_CLEAN: 'نظافت دوباره',
};

export const TASK_STATUS_LABELS: Record<HousekeepingTaskStatus, string> = {
  OPEN: 'در انتظار شروع',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغوشده',
};

export const PRIORITY_LABELS: Record<HousekeepingPriority, string> = {
  LOW: 'کم',
  NORMAL: 'عادی',
  HIGH: 'بالا',
  URGENT: 'فوری',
};

export const CONDITION_LABELS: Record<HousekeepingCondition, string> = {
  DIRTY: 'نیازمند نظافت',
  CLEAN: 'نظافت‌شده',
  INSPECTED: 'بازرسی‌شده',
};

export const DISCREPANCY_KIND_LABELS: Record<OccupancyDiscrepancyKind, string> = {
  SLEEP: 'اتاق خالی ثبت شده؛ کارکنان حضور را مشاهده کرده‌اند',
  SKIP: 'اتاق اشغال ثبت شده؛ کارکنان اتاق را خالی مشاهده کرده‌اند',
};

export const DISCREPANCY_STATUS_LABELS: Record<HousekeepingDiscrepancyStatus, string> = {
  OPEN: 'نیازمند بررسی',
  RESOLVED: 'اصلاح‌شده',
  DISMISSED: 'ردشده با توضیح',
};

const PRIORITY_ORDER: Record<HousekeepingPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function sortHousekeepingTasksByUrgency<T extends {
  taskType: HousekeepingTaskType;
  priority: HousekeepingPriority;
  arrivalDue: boolean;
  departureDue: boolean;
  isOverdue: boolean;
  dueDate: string;
}>(tasks: readonly T[]): T[] {
  const group = (task: T) => task.arrivalDue ? 0 : task.taskType === 'DEPARTURE_CLEAN' && task.isOverdue ? 1 : 2;
  return [...tasks].sort((first, second) => {
    const byGroup = group(first) - group(second);
    if (byGroup !== 0) return byGroup;
    if (group(first) === 2) {
      const byDueDate = first.dueDate.localeCompare(second.dueDate);
      if (byDueDate !== 0) return byDueDate;
    }
    return PRIORITY_ORDER[first.priority] - PRIORITY_ORDER[second.priority] ||
      Number(second.departureDue) - Number(first.departureDue);
  });
}

export function hasHousekeepingFilters(filters: {
  dueDate: string;
  roomId: string;
  floor: string;
  taskType: string;
  assigneeStaffUserId: string;
  status: string;
  priority: string;
}): boolean {
  return Object.values(filters).some(Boolean);
}

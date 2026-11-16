import { StaffApiError } from '@/lib/staff-api';

export function safeErrorMessage(error: unknown, context?: 'move'): string {
  if (!(error instanceof StaffApiError)) return 'درخواست انجام نشد. دوباره تلاش کنید.';
  if (error.status === 0) return 'ارتباط با سامانه برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.';
  if (error.status === 403) return 'دسترسی شما برای انجام این کار تأیید نشد. صفحه را تازه‌سازی کنید یا با سرپرست شیفت تماس بگیرید.';
  switch (error.code) {
    case 'ROOM_ASSIGNMENT_INCOMPLETE':
      return 'تخصیص اتاق‌ها کامل نیست. ابتدا اتاق‌های باقی‌مانده را در وضعیت اتاق‌ها تخصیص دهید.';
    case 'ROOM_NOT_INSPECTED':
      if (context === 'move') {
        return 'انتقال انجام نشد؛ وضعیت بازرسی اتاق مقصد از سوی سامانه تأیید نشده است. اتاق‌های بازرسی‌شده را در وضعیت اتاق‌ها بررسی کنید.';
      }
      return 'ورود ثبت نشد؛ وضعیت بازرسی اتاق‌ها باید از سوی سامانه تأیید شود.';
    case 'ROOM_ASSIGNMENT_OVERLAP':
    case 'ROOM_BLOCKED':
      return 'این عملیات ثبت نشد؛ یکی از اتاق‌ها با یک رزرو یا محدودیت هم‌پوشانی دارد. وضعیت اتاق‌ها را بررسی کنید.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'شناسه امن درخواست قبلاً برای اطلاعات دیگری استفاده شده است. پیش از شروع درخواست تازه، وضعیت ثبت قبلی را بررسی کنید.';
    default:
      return error.message || 'درخواست انجام نشد. دوباره تلاش کنید.';
  }
}

export function hasRoomRecovery(error: unknown): boolean {
  return error instanceof StaffApiError && [
    'ROOM_ASSIGNMENT_INCOMPLETE',
    'ROOM_NOT_INSPECTED',
    'ROOM_ASSIGNMENT_OVERLAP',
    'ROOM_BLOCKED',
  ].includes(error.code ?? '');
}

import { z } from 'zod';

export type BookingFormConstraints = {
  guestCount: number;
  maxGuestsPerRoom: number;
  availableRooms: number;
};

export function normalizeIranianMobileNumber(value: string): string {
  const asciiDigits = value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const compact = asciiDigits.trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return '';

  let digits = compact.startsWith('+') ? compact.slice(1) : compact;
  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? `+98${digits}` : '';
}

export function createBookingFormSchema(constraints: BookingFormConstraints) {
  const minimumRooms = Math.ceil(constraints.guestCount / constraints.maxGuestsPerRoom);
  const maximumRooms = Math.min(constraints.availableRooms, 20);

  return z.object({
    roomQuantity: z
      .string()
      .regex(/^\d+$/, 'تعداد اتاق را انتخاب کنید.')
      .transform(Number)
      .pipe(
        z
          .number()
          .int()
          .min(minimumRooms, `برای این تعداد مهمان دست‌کم ${minimumRooms} اتاق لازم است.`)
          .max(maximumRooms, 'تعداد اتاق از ظرفیت موجود بیشتر است.'),
      ),
    guestName: z
      .string()
      .trim()
      .min(2, 'نام را با دست‌کم دو نویسه وارد کنید.')
      .max(160, 'نام نمی‌تواند بیشتر از ۱۶۰ نویسه باشد.'),
    guestPhone: z
      .string()
      .trim()
      .transform(normalizeIranianMobileNumber)
      .pipe(z.string().regex(/^\+989\d{9}$/, 'شمارهٔ موبایل معتبر ایران را وارد کنید.')),
    guestEmail: z
      .string()
      .trim()
      .transform((email) => (email ? email.toLowerCase() : undefined))
      .pipe(z.union([z.string().email('نشانی ایمیل معتبر وارد کنید.').max(254), z.undefined()])),
  });
}

export type BookingFormInput = z.input<ReturnType<typeof createBookingFormSchema>>;
export type BookingFormValues = z.output<ReturnType<typeof createBookingFormSchema>>;

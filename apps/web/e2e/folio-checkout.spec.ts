import { randomInt, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { isAvailabilityResult } from '../src/lib/availability';
import { formatGregorianAsJalali } from '../src/lib/jalali-date';
import { test } from './staff-fixtures';

const apiPort = process.env.HBE_E2E_API_PORT ?? '4015';
const webPort = process.env.HBE_E2E_WEB_PORT ?? '3015';
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const serviceName = 'خدمت آزمایشی پرداخت و خروج HPM008';
const servicePriceToman = '19000';
const printedServiceRowCount = 14;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addDays(dateOnly: string, offsetDays: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function sessionHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(`${apiBaseUrl}/staff`);
  const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
  if (!session || !csrf) throw new Error('The authenticated admin session is unavailable.');
  return {
    Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
    Origin: webOrigin,
    Referer: `${webOrigin}/staff`,
    'X-CSRF-Token': csrf,
  };
}

test('admin settles an in-house folio, checks out, and prints a final statement', async ({
  page,
  staffCookies,
}, testInfo) => {
  await page.context().addCookies(staffCookies);
  const headers = await sessionHeaders(page);
  const guestPhone = `+98915${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
  const guestName = `مهمان آزمایشی برای چاپ صورتحساب با نام بلند ${'آزمایش '.repeat(10)}`.slice(
    0,
    155,
  );

  const boardResponse = await page.request.get(`${apiBaseUrl}/staff/rooms/board`, { headers });
  expect(boardResponse.status()).toBe(200);
  const board: unknown = await boardResponse.json();
  if (!isRecord(board) || typeof board.businessDate !== 'string' || !Array.isArray(board.items)) {
    throw new Error('The room board did not provide its business date and room list.');
  }
  const businessDate = board.businessDate;
  const checkOut = addDays(businessDate, 1);
  const availabilityResponse = await page.request.get(
    `${apiBaseUrl}/availability?${new URLSearchParams({ checkIn: businessDate, checkOut, guests: '1' })}`,
  );
  expect(availabilityResponse.status()).toBe(200);
  const availability: unknown = await availabilityResponse.json();
  if (!isAvailabilityResult(availability)) {
    throw new Error('The same-day walk-in availability response was invalid.');
  }

  const assignableRoom = board.items.find((item) => {
    if (!isRecord(item)) return false;
    const roomType = item.roomType;
    if (!isRecord(roomType)) return false;
    const matchingType = availability.roomTypes.some(
      (type) => type.slug === roomType.slug && type.isAvailable && type.availableRooms > 0,
    );
    return (
      matchingType &&
      item.isActive === true &&
      item.housekeepingStatus === 'INSPECTED' &&
      item.occupancy === 'VACANT' &&
      Array.isArray(item.blocks) &&
      item.blocks.length === 0 &&
      typeof item.id === 'string' &&
      typeof item.roomNumber === 'string' &&
      typeof roomType.id === 'string' &&
      typeof roomType.slug === 'string'
    );
  });
  if (!isRecord(assignableRoom) || !isRecord(assignableRoom.roomType)) {
    throw new Error(
      'The isolated database has no inspected, vacant room for a same-day folio flow.',
    );
  }
  const roomId = assignableRoom.id as string;
  const roomNumber = assignableRoom.roomNumber as string;
  const roomTypeId = assignableRoom.roomType.id as string;
  const roomTypeSlug = assignableRoom.roomType.slug as string;

  const walkInResponse = await page.request.post(`${apiBaseUrl}/staff/bookings/walk-ins`, {
    headers: { ...headers, 'Idempotency-Key': `hpm008-browser-${randomUUID()}` },
    data: {
      roomTypeSlug,
      checkIn: businessDate,
      checkOut,
      guestCount: 1,
      roomQuantity: 1,
      guestName,
      guestPhone,
    },
  });
  const walkIn: unknown = await walkInResponse.json();
  expect(walkInResponse.status(), JSON.stringify(walkIn)).toBe(201);
  if (!isRecord(walkIn) || typeof walkIn.reference !== 'string') {
    throw new Error('The same-day walk-in did not return a booking reference.');
  }
  const reference = walkIn.reference;

  const assignedBoardResponse = await page.request.get(
    `${apiBaseUrl}/staff/rooms/board?${new URLSearchParams({ date: businessDate, roomTypeId })}`,
    { headers },
  );
  expect(assignedBoardResponse.status()).toBe(200);
  const assignedBoard: unknown = await assignedBoardResponse.json();
  if (!isRecord(assignedBoard) || !Array.isArray(assignedBoard.assignableBookings)) {
    throw new Error('The assignable booking list was missing from the room board.');
  }
  const assignableBooking = assignedBoard.assignableBookings.find(
    (item) => isRecord(item) && item.reference === reference,
  );
  if (!isRecord(assignableBooking) || typeof assignableBooking.revision !== 'string') {
    throw new Error('The walk-in had no room-assignment revision.');
  }

  const assignmentResponse = await page.request.put(
    `${apiBaseUrl}/staff/bookings/${encodeURIComponent(reference)}/room-assignments`,
    {
      headers,
      data: {
        expectedRevision: assignableBooking.revision,
        reason: 'HPM-008 fictional browser checkout fixture',
        assignments: [{ roomId, startDate: businessDate, endDate: checkOut }],
      },
    },
  );
  expect(assignmentResponse.status()).toBe(200);

  const checkInResponse = await page.request.post(
    `${apiBaseUrl}/staff/bookings/${encodeURIComponent(reference)}/check-in`,
    { headers, data: { earlyCheckInReason: 'HPM-008 browser test setup' } },
  );
  expect(checkInResponse.status()).toBe(200);
  const bookingResponse = await page.request.get(
    `${apiBaseUrl}/staff/bookings/${encodeURIComponent(reference)}`,
    { headers },
  );
  expect(bookingResponse.status()).toBe(200);
  const booking: unknown = await bookingResponse.json();
  if (!isRecord(booking) || typeof booking.id !== 'string') {
    throw new Error('The in-house booking detail did not return its folio ID.');
  }
  const bookingId = booking.id;

  const serviceListResponse = await page.request.get(`${apiBaseUrl}/staff/services`, { headers });
  expect(serviceListResponse.status()).toBe(200);
  const serviceList: unknown = await serviceListResponse.json();
  if (!isRecord(serviceList) || !Array.isArray(serviceList.items)) {
    throw new Error('The service catalog response did not contain its items.');
  }
  const existingService = serviceList.items.find(
    (item) => isRecord(item) && item.name === serviceName && item.isActive === true,
  );
  let serviceItemId: string | undefined =
    isRecord(existingService) && typeof existingService.id === 'string'
      ? existingService.id
      : undefined;
  if (typeof serviceItemId !== 'string') {
    const createServiceResponse = await page.request.post(`${apiBaseUrl}/staff/services`, {
      headers,
      data: { name: serviceName, category: 'آزمایش مرورگر', currentPriceToman: servicePriceToman },
    });
    expect(createServiceResponse.status()).toBe(201);
    const createdService: unknown = await createServiceResponse.json();
    if (!isRecord(createdService) || typeof createdService.id !== 'string') {
      throw new Error('The browser checkout test service was not created.');
    }
    serviceItemId = createdService.id;
  }

  await page.goto(`/staff/folios/${bookingId}`);
  await expect(page.getByRole('heading', { name: 'صورتحساب اقامت' })).toBeVisible();
  await page.getByRole('combobox', { name: 'خدمت' }).selectOption(serviceItemId);
  await page.getByLabel('تعداد', { exact: true }).fill('1');
  const serviceDate = formatGregorianAsJalali(businessDate);
  if (!serviceDate) throw new Error('Could not format the hotel service date for the folio form.');
  await page.getByLabel('تاریخ خدمت · شمسی').fill(serviceDate);
  await page.getByLabel('اتاق مرتبط · اختیاری').selectOption({ label: `اتاق ${roomNumber}` });
  const servicePosting = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/staff/folios/${bookingId}/services` &&
      response.request().method() === 'POST'
    );
  });
  await page.getByRole('button', { name: 'ثبت در صورتحساب' }).click();
  const serviceCharge = await servicePosting;
  expect(serviceCharge.status()).toBe(200);
  expect(serviceCharge.headers()['cache-control']).toContain('private, no-store');
  await expect(page.getByText(serviceName, { exact: true })).toBeVisible();

  const originalServiceRequest = serviceCharge.request();
  const serviceIdempotencyKey = originalServiceRequest.headers()['idempotency-key'];
  const folioHeaders = await sessionHeaders(page);
  expect(serviceIdempotencyKey).toBeTruthy();
  const retriedService = await page.request.post(
    `${apiBaseUrl}/staff/folios/${bookingId}/services`,
    {
      headers: { ...folioHeaders, 'Idempotency-Key': serviceIdempotencyKey },
      data: originalServiceRequest.postDataJSON(),
    },
  );
  const retriedServiceBody = await retriedService.text();
  expect(retriedService.status(), retriedServiceBody).toBe(200);
  const retriedServiceFolio: unknown = JSON.parse(retriedServiceBody);
  if (!isRecord(retriedServiceFolio) || !Array.isArray(retriedServiceFolio.entries)) {
    throw new Error('The retried service response did not include folio entries.');
  }
  expect(
    retriedServiceFolio.entries.filter((entry) => isRecord(entry) && entry.kind === 'SERVICE'),
  ).toHaveLength(1);

  for (let row = 1; row < printedServiceRowCount; row += 1) {
    const additionalService = await page.request.post(
      `${apiBaseUrl}/staff/folios/${bookingId}/services`,
      {
        headers: { ...folioHeaders, 'Idempotency-Key': `hpm008-print-${randomUUID()}` },
        data: {
          serviceItemId,
          quantity: 1,
          serviceDate: businessDate,
        },
      },
    );
    expect(additionalService.status()).toBe(200);
  }
  await page.reload();
  await expect(page.getByText(serviceName, { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('hpm008-folio-screen-active.png'),
    fullPage: true,
  });
  await page.goto(`/staff/folios/${bookingId}/print`);
  await expect(page.getByRole('heading', { name: 'صورتحساب موقت' })).toBeVisible();
  const interimStatement = page.getByRole('article', { name: 'صورتحساب موقت' });
  await expect(interimStatement).toContainText(guestName);
  await expect(interimStatement).toContainText(serviceName);
  await expect(interimStatement).toContainText(`اتاق ${roomNumber}`);
  await page.goto(`/staff/folios/${bookingId}`);
  await expect(page.getByRole('heading', { name: 'صورتحساب اقامت' })).toBeVisible();

  await expect(page.getByLabel('دلیل تسویه با مانده')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ثبت خروج' })).toBeDisabled();
  const totalServiceAmount = (
    BigInt(servicePriceToman) * BigInt(printedServiceRowCount)
  ).toString();
  await page.getByLabel('مبلغ پرداخت · تومان').fill(totalServiceAmount);
  await page.getByLabel('روش پرداخت').selectOption('BANK_TRANSFER');
  await page.getByLabel('شماره رسید بانکی · اختیاری').fill('HPM008-TRANSFER-01');
  const paymentPosting = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/staff/folios/${bookingId}/payments` &&
      response.request().method() === 'POST'
    );
  });
  await page.getByRole('button', { name: 'ثبت پرداخت' }).click();
  const payment = await paymentPosting;
  expect(payment.status()).toBe(200);
  await expect(page.getByText('پرداخت آفلاین در صورتحساب ثبت شد.')).toBeVisible();
  await expect(page.getByText('روش پرداخت: حواله بانکی', { exact: true })).toBeVisible();
  await expect(page.getByText('HPM008-TRANSFER-01')).toBeVisible();

  const originalPaymentRequest = payment.request();
  const paymentIdempotencyKey = originalPaymentRequest.headers()['idempotency-key'];
  const paymentRetryHeaders = await sessionHeaders(page);
  expect(paymentIdempotencyKey).toBeTruthy();
  const retriedPayment = await page.request.post(
    `${apiBaseUrl}/staff/folios/${bookingId}/payments`,
    {
      headers: { ...paymentRetryHeaders, 'Idempotency-Key': paymentIdempotencyKey },
      data: originalPaymentRequest.postDataJSON(),
    },
  );
  const retriedPaymentBody = await retriedPayment.text();
  expect(retriedPayment.status(), retriedPaymentBody).toBe(200);
  const retriedPaymentFolio: unknown = JSON.parse(retriedPaymentBody);
  if (!isRecord(retriedPaymentFolio) || !Array.isArray(retriedPaymentFolio.entries)) {
    throw new Error('The retried payment response did not include folio entries.');
  }
  expect(
    retriedPaymentFolio.entries.filter((entry) => isRecord(entry) && entry.kind === 'PAYMENT'),
  ).toHaveLength(1);

  const checkoutResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/staff/folios/${bookingId}/checkout` &&
      response.request().method() === 'POST'
    );
  });
  await page.getByRole('button', { name: 'ثبت خروج' }).click();
  const checkout = await checkoutResponse;
  expect(checkout.status()).toBe(200);
  expect(checkout.headers()['cache-control']).toContain('private, no-store');
  await expect(page.getByText('خروج نهایی ثبت شد و اتاق برای نظافت علامت‌گذاری شد.')).toBeVisible();
  await expect(page.getByText('صورتحساب عملیاتی · نهایی')).toBeVisible();

  const finalResponse = await page.request.get(`${apiBaseUrl}/staff/folios/${bookingId}/print`, {
    headers,
  });
  expect(finalResponse.status()).toBe(200);
  expect(finalResponse.headers()['cache-control']).toContain('private, no-store');
  const finalStatement: unknown = await finalResponse.json();
  expect(isRecord(finalStatement) && finalStatement.label).toBe('Final folio');
  if (
    !isRecord(finalStatement) ||
    !isRecord(finalStatement.folio) ||
    !Array.isArray(finalStatement.folio.entries)
  ) {
    throw new Error('The final print response did not include its ledger entries.');
  }
  const finalEntries = finalStatement.folio.entries.filter(isRecord);
  expect(finalEntries).toHaveLength(printedServiceRowCount + 1);
  expect(finalEntries.filter((entry) => entry.kind === 'SERVICE')).toHaveLength(
    printedServiceRowCount,
  );
  expect(finalEntries.filter((entry) => entry.kind === 'PAYMENT')).toHaveLength(1);
  expect(
    isRecord(finalStatement) && isRecord(finalStatement.folio) && finalStatement.folio.balanceToman,
  ).toBe('0');

  const printResponse = await page.goto(`/staff/folios/${bookingId}/print`);
  // Next.js development mode forces no-store on document responses.
  expect(printResponse?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'صورتحساب نهایی' })).toBeVisible();
  const printedStatement = page.getByRole('article', { name: 'صورتحساب نهایی' });
  await expect(printedStatement).toContainText(guestName);
  await expect(printedStatement).toContainText(reference);
  await expect(printedStatement).toContainText(serviceName);
  await expect(printedStatement).toContainText('19,000 تومان');
  await expect(printedStatement).toContainText('حواله بانکی');
  await expect(printedStatement).toContainText('HPM008-TRANSFER-01');
  await expect(page.getByRole('table', { name: 'ردیف‌های صورتحساب عملیاتی اقامت' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('hpm008-folio-screen-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'چاپ' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('hpm008-folio-screen-narrow.png'),
    fullPage: true,
  });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'چاپ' })).toBeHidden();
  await expect(page.locator('.staff-topbar')).toBeHidden();
  await expect(page.locator('.staff-sidebar')).toBeHidden();
  await expect(page.getByRole('table', { name: 'ردیف‌های صورتحساب عملیاتی اقامت' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('hpm008-folio-print-narrow.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole('table', { name: 'ردیف‌های صورتحساب عملیاتی اقامت' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('hpm008-folio-print-desktop.png'),
    fullPage: true,
  });
  await page.pdf({
    path: testInfo.outputPath('hpm008-folio-print.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
});

test('redirects an unauthenticated browser away from a private folio print route', async ({
  page,
}) => {
  await page.goto(`/staff/folios/${randomUUID()}/print`);
  await expect(page).toHaveURL(/\/staff\/login$/);
});

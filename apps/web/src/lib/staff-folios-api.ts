import { requestStaffApi } from './staff-api';

export interface StaffServiceItem {
  id: string;
  name: string;
  category: string;
  currentPriceToman: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffFolioEntry {
  id: string;
  direction: 'DEBIT' | 'CREDIT';
  kind:
    'ACCOMMODATION' | 'SERVICE' | 'FEE' | 'TAX' | 'DISCOUNT' | 'ADJUSTMENT' | 'PAYMENT' | 'REFUND';
  amountToman: string;
  serviceDate: string;
  description: string;
  roomNumber: string | null;
  quantity: number | null;
  unitAmountToman: string | null;
  correctsEntryId: string | null;
  correctionReason: string | null;
  paymentMethod: 'CASH' | 'BANK_TERMINAL' | 'BANK_TRANSFER' | 'OTHER' | null;
  paymentReference: string | null;
  actorUsername: string | null;
  balanceAfterToman: string;
  createdAt: string;
}

export interface StaffFolio {
  id: string;
  booking: {
    id: string;
    reference: string;
    guestName: string;
    status: string;
    checkIn: string;
    checkOut: string;
    actualDepartureDate: string | null;
    assignments: Array<{
      id: string;
      roomNumber: string | null;
      startDate: string;
      endDate: string;
    }>;
  };
  status: 'OPEN' | 'CLOSED' | 'CLOSED_DUE';
  balanceToman: string;
  entries: StaffFolioEntry[];
}

export interface StaffFolioLookup {
  bookingId: string;
  reference: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  folioStatus: 'OPEN' | 'CLOSED_DUE';
  balanceToman: string;
}

export interface StaffFolioPrint {
  label: 'Interim folio' | 'Final folio';
  printedAt: string;
  hotelTimezone: string;
  folio: StaffFolio;
}

export interface StaffFolioPaymentInput {
  amountToman: string;
  method: 'CASH' | 'BANK_TERMINAL' | 'BANK_TRANSFER' | 'OTHER';
  reference?: string;
}

export interface StaffFolioRefundInput {
  paymentEntryId: string;
  amountToman: string;
  reason: string;
}

export interface StaffServiceItemInput {
  name: string;
  category: string;
  currentPriceToman: string;
}

export function getStaffServiceItems(): Promise<{ items: StaffServiceItem[] }> {
  return requestStaffApi('services');
}

export function createStaffServiceItem(
  input: StaffServiceItemInput,
  csrfToken: string,
): Promise<StaffServiceItem> {
  return requestStaffApi('services', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function updateStaffServiceItem(
  serviceItemId: string,
  input: Partial<StaffServiceItemInput> & { isActive?: boolean },
  csrfToken: string,
): Promise<StaffServiceItem> {
  return requestStaffApi(`services/${encodeURIComponent(serviceItemId)}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
}

export function getStaffFolio(bookingId: string): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}`);
}

export function lookupStaffFolio(reference: string): Promise<StaffFolioLookup> {
  return requestStaffApi(`folios/lookup?reference=${encodeURIComponent(reference.trim())}`);
}

export function getStaffFolioPrint(bookingId: string): Promise<StaffFolioPrint> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/print`);
}

export function postStaffServiceCharge(
  bookingId: string,
  input: {
    serviceItemId: string;
    quantity: number;
    serviceDate: string;
    roomAssignmentId?: string;
  },
  idempotencyKey: string,
  csrfToken: string,
): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/services`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function adjustStaffFolio(
  bookingId: string,
  input: { correctsEntryId: string; amountToman: string; reason: string },
  idempotencyKey: string,
  csrfToken: string,
): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/adjustments`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function recordStaffFolioPayment(
  bookingId: string,
  input: StaffFolioPaymentInput,
  idempotencyKey: string,
  csrfToken: string,
): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/payments`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function refundStaffFolioPayment(
  bookingId: string,
  input: StaffFolioRefundInput,
  idempotencyKey: string,
  csrfToken: string,
): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/refunds`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function checkoutStaffFolio(
  bookingId: string,
  input: { onAccountReason?: string },
  idempotencyKey: string,
  csrfToken: string,
): Promise<StaffFolio> {
  return requestStaffApi(`folios/${encodeURIComponent(bookingId)}/checkout`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

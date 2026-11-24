import { requestStaffApi } from './staff-api';

export interface StaffOperationSignal {
  code: string;
  count: number;
  references: string[];
}

export interface StaffNightClosePreview {
  hotelName: string;
  timezone: string;
  businessDate: string;
  nextBusinessDate: string;
  blockers: StaffOperationSignal[];
  warnings: StaffOperationSignal[];
  warningCount: number;
  accommodation: { roomNightCount: number; amountToman: string };
  canClose: boolean;
}

export interface StaffNightCloseResult {
  businessDate: string;
  nextBusinessDate: string;
  status: 'COMPLETED';
  roomNightCount: number;
  accommodationAmountToman: string;
  warningCount: number;
  completedAt: string;
  replayed: boolean;
}

export interface StaffReportStay {
  reference: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomTypeName: string;
  roomQuantity: number;
  rooms: string[];
}

export interface StaffOperationsReport {
  date: string;
  businessDate: string;
  arrivals: StaffReportStay[];
  departures: StaffReportStay[];
  inHouse: StaffReportStay[];
  rooms: {
    total: number;
    occupied: number;
    available: number;
    occupancyPercent: number;
    readiness: { inspected: number; clean: number; dirty: number };
  };
  blocks: { outOfOrder: number; capacityClosed: number; total: number };
  pendingRequests: { reservations: number; maintenance: number };
  openBalances: {
    count: number;
    balanceToman: string;
    items: Array<{ reference: string; guestName: string; balanceToman: string }>;
  };
  dailyTotals: { debitsToman: string; creditsToman: string };
}

export function getStaffNightClosePreview(): Promise<StaffNightClosePreview> {
  return requestStaffApi('operations/close');
}

export function runStaffNightClose(
  preview: StaffNightClosePreview,
  csrfToken: string,
): Promise<StaffNightCloseResult> {
  return requestStaffApi('operations/close', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({
      businessDate: preview.businessDate,
      confirmation: {
        businessDate: preview.businessDate,
        nextBusinessDate: preview.nextBusinessDate,
        roomNightCount: preview.accommodation.roomNightCount,
        accommodationAmountToman: preview.accommodation.amountToman,
        warningCount: preview.warningCount,
      },
    }),
  });
}

export function getStaffOperationsReport(date?: string): Promise<StaffOperationsReport> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return requestStaffApi(`reports${query}`);
}

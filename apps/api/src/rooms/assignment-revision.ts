import { createHash } from 'node:crypto';

type AssignmentHistoryRow = {
  id: string;
  roomId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
};

export function assignmentRevision(
  bookingId: string,
  history: readonly AssignmentHistoryRow[],
): string {
  const rows = history
    .map(({ id, roomId, startDate, endDate, isActive }) =>
      JSON.stringify([id, roomId, startDate.getTime(), endDate.getTime(), isActive]),
    )
    .sort();

  return createHash('sha256')
    .update(JSON.stringify([bookingId, rows]))
    .digest('hex');
}

import { createHash } from 'node:crypto';

type ActiveAssignmentInterval = {
  id: string;
  roomId: string;
  startDate: Date;
  endDate: Date;
};

export function assignmentRevision(
  bookingId: string,
  assignments: readonly ActiveAssignmentInterval[],
): string {
  const intervals = assignments
    .map(({ id, roomId, startDate, endDate }) =>
      JSON.stringify([id, roomId, startDate.getTime(), endDate.getTime()]),
    )
    .sort();

  return createHash('sha256')
    .update(JSON.stringify([bookingId, intervals]))
    .digest('hex');
}

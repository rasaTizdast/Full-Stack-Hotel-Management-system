import { reservationContextOn } from './room-board-context';

describe('physical room reservation context', () => {
  const date = (value: string) => new Date(value);
  const booking = {
    checkIn: date('2027-06-01'),
    checkOut: date('2027-06-04'),
    status: 'CONFIRMED' as const,
  };

  it.each([
    ['2027-05-31', '2027-06-01', '2027-06-04', null],
    ['2027-06-01', '2027-06-01', '2027-06-04', 'ARRIVING'],
    ['2027-06-02', '2027-06-02', '2027-06-04', 'RESERVED'],
    ['2027-06-03', '2027-06-01', '2027-06-03', null],
    ['2027-06-04', '2027-06-01', '2027-06-04', 'DEPARTING'],
    ['2027-06-05', '2027-06-01', '2027-06-04', null],
  ])('classifies the room on %s for interval [%s, %s)', (day, start, end, context) => {
    expect(
      reservationContextOn(date(day), {
        startDate: date(start),
        endDate: date(end),
        booking,
      }),
    ).toBe(context);
  });
});

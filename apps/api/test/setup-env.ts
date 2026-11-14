process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://hotel_test:hotel_test@127.0.0.1:5433/hotel_booking_test?schema=public';

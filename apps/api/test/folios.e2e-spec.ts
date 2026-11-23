import { randomUUID } from 'node:crypto';
import { RoomBoardFixture } from './room-board-fixture';

describe('Staff folio and catalog HTTP access (e2e)', () => {
  let fixture: RoomBoardFixture | undefined;
  let property: Awaited<ReturnType<RoomBoardFixture['createProperty']>>;
  let housekeeper: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let receptionist: Awaited<ReturnType<RoomBoardFixture['staff']>>;
  let cashier: Awaited<ReturnType<RoomBoardFixture['staff']>>;

  beforeAll(async () => {
    fixture = await RoomBoardFixture.start();
    property = await fixture.createProperty('Asia/Tehran', undefined, randomUUID());
    housekeeper = await fixture.staff('HOUSEKEEPER');
    receptionist = await fixture.staff('RECEPTIONIST');
    cashier = await fixture.staff('CASHIER');
  });

  afterAll(async () => {
    await fixture?.close({ preserveData: true });
  });

  it('returns no-store for protected API reads and denies roles outside folio viewing', async () => {
    const folioPath = `/api/v1/staff/folios/${randomUUID()}`;
    await fixture!.client().get(folioPath).expect(401).expect('Cache-Control', 'private, no-store');
    await fixture!
      .client()
      .get(folioPath)
      .set(housekeeper.headers)
      .expect(403)
      .expect('Cache-Control', 'private, no-store');

    const services = await fixture!
      .client()
      .get('/api/v1/staff/services')
      .set(receptionist.headers)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(services.body).toHaveProperty('items');

    await fixture!
      .client()
      .post('/api/v1/staff/services')
      .set(cashier.headers)
      .send({ name: 'Unauthorized service', category: 'Test', currentPriceToman: '1000' })
      .expect(403)
      .expect('Cache-Control', 'private, no-store');
  });

  it('keeps guest booking DTOs free of private folio fields', async () => {
    await fixture!.inventory(property.type.id);
    const response = await fixture!
      .client()
      .post('/api/v1/bookings')
      .set('Idempotency-Key', `hpm007-public-${randomUUID().slice(0, 16)}`)
      .send({
        roomTypeSlug: property.type.slug,
        checkIn: fixture!.checkIn,
        checkOut: fixture!.checkOut,
        guestCount: 1,
        roomQuantity: 1,
        guestName: 'مهمان آزمایشی',
        guestPhone: '+989123456701',
        guestEmail: 'hpm007-guest@example.invalid',
      })
      .expect(201);

    expect(response.body).toMatchObject({ status: 'PENDING_CONFIRMATION' });
    expect(response.body).not.toHaveProperty('folio');
    expect(response.body).not.toHaveProperty('entries');
    const bookingResponse = response.body as { reference: string };
    const createdBooking = await fixture!.prisma.booking.findUnique({
      where: { publicReference: bookingResponse.reference },
      select: { id: true },
    });
    if (!createdBooking) throw new Error('The public booking reference was not stored.');
    expect(await fixture!.prisma.folio.count({ where: { bookingId: createdBooking.id } })).toBe(1);
  });
});

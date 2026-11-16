import { PrismaService } from '../database/prisma.service';
import { StaffStaysService } from './staff-stays.service';

describe('StaffStaysService', () => {
  it('reads the worklist page and count through one repeatable-read snapshot', async () => {
    const transactionClient = {
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const rootClient = {
      hotel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'hotel-1', timezone: 'UTC' }),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (operation: unknown, options?: unknown) => {
        void options;
        if (Array.isArray(operation)) return Promise.all(operation);
        return (operation as (client: typeof transactionClient) => Promise<unknown>)(
          transactionClient,
        );
      }),
    };
    const service = new StaffStaysService(rootClient as unknown as PrismaService);

    await service.arrivals({});

    expect(rootClient.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(transactionClient.booking.findMany).toHaveBeenCalledTimes(1);
    expect(transactionClient.booking.count).toHaveBeenCalledTimes(1);
    expect(rootClient.booking.findMany).not.toHaveBeenCalled();
    expect(rootClient.booking.count).not.toHaveBeenCalled();
  });
});

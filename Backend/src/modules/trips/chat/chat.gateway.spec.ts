// `@thallesp/nestjs-better-auth` ships as ESM and is not transformed by the
// repo's ts-jest config; importing ChatGateway would fail under Jest's CJS
// loader. Stub the module before the import so the class can be constructed
// with a plain object for AuthService. Mirrors chat.service.spec.ts.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {
    api = { getSession: jest.fn() };
  },
}));

// chat.gateway.ts evaluates buildTrustedOrigins() at decorator-time inside
// @WebSocketGateway(), which loads auth.factory → @better-auth/expo (ESM).
// Stub the factory so the gateway module loads cleanly under ts-jest CJS.
jest.mock('@modules/auth/auth.factory', () => ({
  buildTrustedOrigins: () => [],
}));

import { AuthService } from '@thallesp/nestjs-better-auth';
import { ChatGateway } from './chat.gateway';
import { ChatRepository } from './chat.repository';
import { TripsRepository } from '../trips/trips.repository';

const DRIVER_ID = 'driver-1';
const PASSENGER_ID = 'passenger-1';
const STRANGER_ID = 'stranger-1';
const TRIP_ID = 'trip-1';
const THREAD_ID = 'thread-1';

const buildThread = () => ({
  id: THREAD_ID,
  tripId: TRIP_ID,
  passengerId: PASSENGER_ID,
  createdAt: new Date('2026-05-10T10:00:00.000Z'),
  driverLastReadAt: null,
  passengerLastReadAt: null,
});

describe('ChatGateway.assertCanJoin', () => {
  let findThreadById: jest.Mock;
  let findDriverId: jest.Mock;
  let gateway: ChatGateway;

  beforeEach(() => {
    findThreadById = jest.fn();
    findDriverId = jest.fn();

    const chatRepo = { findThreadById } as unknown as ChatRepository;
    const tripsRepo = { findDriverId } as unknown as TripsRepository;
    const authService = {} as AuthService;
    const db = {} as never;
    gateway = new ChatGateway(db, authService, chatRepo, tripsRepo);
  });

  it('returns THREAD_NOT_FOUND when the thread does not exist', async () => {
    findThreadById.mockResolvedValueOnce(null);

    await expect(gateway.assertCanJoin(DRIVER_ID, THREAD_ID)).resolves.toEqual({
      error: 'THREAD_NOT_FOUND',
    });
    expect(findDriverId).not.toHaveBeenCalled();
  });

  it('returns driver role when caller is the trip driver', async () => {
    findThreadById.mockResolvedValueOnce(buildThread());
    findDriverId.mockResolvedValueOnce(DRIVER_ID);

    await expect(gateway.assertCanJoin(DRIVER_ID, THREAD_ID)).resolves.toEqual({
      role: 'driver',
    });
  });

  it('returns passenger role when caller is the thread passenger', async () => {
    findThreadById.mockResolvedValueOnce(buildThread());
    findDriverId.mockResolvedValueOnce(DRIVER_ID);

    await expect(
      gateway.assertCanJoin(PASSENGER_ID, THREAD_ID),
    ).resolves.toEqual({ role: 'passenger' });
  });

  it('returns FORBIDDEN when caller is neither driver nor passenger', async () => {
    findThreadById.mockResolvedValueOnce(buildThread());
    findDriverId.mockResolvedValueOnce(DRIVER_ID);

    await expect(
      gateway.assertCanJoin(STRANGER_ID, THREAD_ID),
    ).resolves.toEqual({ error: 'FORBIDDEN' });
  });
});

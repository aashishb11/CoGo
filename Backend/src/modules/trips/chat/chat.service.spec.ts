// The real ChatGateway pulls in `@thallesp/nestjs-better-auth`, which ships
// as ESM and is not transformed by the repo's ts-jest config. We only need a
// DI token here — stub the module so importing the class doesn't load the ESM.
jest.mock('./chat.gateway', () => ({
  ChatGateway: class ChatGatewayStub {},
}));

import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import type { ChatMessage, ChatThread } from '@core/database/schema';
import type { Trip } from '@core/database/schema/trips.schema';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { RidesRepository } from '../rides/rides.repository';
import { TripsRepository } from '../trips/trips.repository';
import { ChatGateway } from './chat.gateway';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import type { MessageWithSender } from './chat.types';

// `throw.ts` wraps the error code inside the exception's response body
// (`{ code, message }`). Assert on that rather than the message string so the
// tests stay robust if the wording changes.
const expectErrorCode = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((err: unknown) => {
    const body = (err as HttpException).getResponse() as { code?: string };
    expect(body.code).toBe(code);
  });
};

const DRIVER_ID = 'driver-1';
const PASSENGER_ID = 'passenger-1';
const STRANGER_ID = 'stranger-1';
const TRIP_ID = 'trip-1';
const THREAD_ID = 'thread-1';
const RIDE_ID = 'ride-1';

const buildThread = (overrides: Partial<ChatThread> = {}): ChatThread => ({
  id: THREAD_ID,
  tripId: TRIP_ID,
  passengerId: PASSENGER_ID,
  createdAt: new Date('2026-05-10T10:00:00.000Z'),
  driverLastReadAt: null,
  passengerLastReadAt: null,
  ...overrides,
});

const buildTrip = (overrides: Partial<Trip> = {}): Trip =>
  ({
    id: TRIP_ID,
    driverId: DRIVER_ID,
    status: 'active',
    // Other Trip columns are not read by ChatService; cast is safe for unit tests.
    ...overrides,
  }) as Trip;

const buildMessage = (
  overrides: Partial<MessageWithSender> = {},
): MessageWithSender => ({
  id: 'msg-1',
  threadId: THREAD_ID,
  senderId: DRIVER_ID,
  rideId: null,
  body: 'hello',
  createdAt: new Date('2026-05-10T10:05:00.000Z'),
  deletedAt: null,
  deletedByUserId: null,
  senderName: 'Driver Name',
  ...overrides,
});

describe('ChatService', () => {
  let service: ChatService;
  let findThreadById: jest.Mock;
  let insertMessage: jest.Mock;
  let findMessageById: jest.Mock;
  let softDeleteMessage: jest.Mock;
  let tripsFindDriverId: jest.Mock;
  let tripsFindById: jest.Mock;
  let ridesFindById: jest.Mock;
  let emitMessageCreated: jest.Mock;
  let emitMessageDeleted: jest.Mock;
  let emitThreadUpdated: jest.Mock;
  let sendChatMessage: jest.Mock;

  beforeEach(async () => {
    findThreadById = jest.fn();
    insertMessage = jest.fn();
    findMessageById = jest.fn();
    softDeleteMessage = jest.fn();
    tripsFindDriverId = jest.fn();
    tripsFindById = jest.fn();
    ridesFindById = jest.fn();
    emitMessageCreated = jest.fn();
    emitMessageDeleted = jest.fn();
    emitThreadUpdated = jest.fn();
    sendChatMessage = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: DB, useValue: {} },
        {
          provide: ChatRepository,
          useValue: {
            findThreadById,
            insertMessage,
            findMessageById,
            softDeleteMessage,
          },
        },
        {
          provide: TripsRepository,
          useValue: {
            findDriverId: tripsFindDriverId,
            findById: tripsFindById,
          },
        },
        { provide: RidesRepository, useValue: { findById: ridesFindById } },
        {
          provide: ChatGateway,
          useValue: {
            emitMessageCreated,
            emitMessageDeleted,
            emitThreadUpdated,
          },
        },
        { provide: NotificationsService, useValue: { sendChatMessage } },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe('sendMessage', () => {
    it('rejects when sender is not a participant', async () => {
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);

      await expectErrorCode(
        service.sendMessage(STRANGER_ID, THREAD_ID, { body: 'hi' }),
        'CHAT_NOT_PARTICIPANT',
      );
      expect(insertMessage).not.toHaveBeenCalled();
    });

    it('rejects when rideId belongs to a different trip', async () => {
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);
      tripsFindById.mockResolvedValueOnce(buildTrip());
      ridesFindById.mockResolvedValueOnce({
        id: RIDE_ID,
        tripId: 'trip-other',
      });

      await expectErrorCode(
        service.sendMessage(DRIVER_ID, THREAD_ID, {
          body: 'hi',
          rideId: RIDE_ID,
        }),
        'CHAT_RIDE_WRONG_TRIP',
      );
      expect(insertMessage).not.toHaveBeenCalled();
    });

    it('rejects when trip is archived', async () => {
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);
      tripsFindById.mockResolvedValueOnce(buildTrip({ status: 'archived' }));

      await expectErrorCode(
        service.sendMessage(DRIVER_ID, THREAD_ID, { body: 'hi' }),
        'CHAT_TRIP_NOT_ACTIVE',
      );
      expect(insertMessage).not.toHaveBeenCalled();
    });

    it('rejects when the trip row is null (regression: guard against null status)', async () => {
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);
      tripsFindById.mockResolvedValueOnce(null);

      await expectErrorCode(
        service.sendMessage(DRIVER_ID, THREAD_ID, { body: 'hi' }),
        'CHAT_TRIP_NOT_ACTIVE',
      );
      expect(insertMessage).not.toHaveBeenCalled();
    });

    it('rejects with CHAT_THREAD_NOT_FOUND when driverId resolves to null (regression: 83087e4)', async () => {
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(null);

      // The service still treats the sender as non-participant first (driverId !== sender),
      // so for this regression we make the sender match the thread's passenger so the
      // participant check passes and the null-driver branch is the one that fires.
      await expectErrorCode(
        service.sendMessage(PASSENGER_ID, THREAD_ID, { body: 'hi' }),
        'CHAT_THREAD_NOT_FOUND',
      );
      expect(insertMessage).not.toHaveBeenCalled();
    });

    it('happy path (driver sends): emits events and pushes to the passenger only', async () => {
      const message = buildMessage({ senderId: DRIVER_ID });
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);
      tripsFindById.mockResolvedValueOnce(buildTrip());
      insertMessage.mockResolvedValueOnce(message);

      const response = await service.sendMessage(DRIVER_ID, THREAD_ID, {
        body: 'hello',
      });

      expect(insertMessage).toHaveBeenCalledTimes(1);
      expect(emitMessageCreated).toHaveBeenCalledTimes(1);
      expect(emitMessageCreated).toHaveBeenCalledWith(THREAD_ID, response);

      expect(emitThreadUpdated).toHaveBeenCalledTimes(2);
      const expectedPayload = {
        threadId: THREAD_ID,
        tripId: TRIP_ID,
        latestMessage: response,
        updatedAt: response.createdAt,
      };
      expect(emitThreadUpdated).toHaveBeenNthCalledWith(
        1,
        DRIVER_ID,
        expectedPayload,
      );
      expect(emitThreadUpdated).toHaveBeenNthCalledWith(
        2,
        PASSENGER_ID,
        expectedPayload,
      );

      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      expect(sendChatMessage).toHaveBeenCalledWith(
        PASSENGER_ID,
        expect.objectContaining({
          threadId: THREAD_ID,
          tripId: TRIP_ID,
          body: 'hello',
          senderName: 'Driver Name',
        }),
      );
    });

    it('happy path (passenger sends): pushes to the driver only', async () => {
      const message = buildMessage({
        senderId: PASSENGER_ID,
        senderName: 'Passenger Name',
      });
      findThreadById.mockResolvedValueOnce(buildThread());
      tripsFindDriverId.mockResolvedValueOnce(DRIVER_ID);
      tripsFindById.mockResolvedValueOnce(buildTrip());
      insertMessage.mockResolvedValueOnce(message);

      await service.sendMessage(PASSENGER_ID, THREAD_ID, { body: 'hi back' });

      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      expect(sendChatMessage).toHaveBeenCalledWith(
        DRIVER_ID,
        expect.any(Object),
      );
    });
  });

  describe('deleteMessage', () => {
    it('rejects when requester is not the sender', async () => {
      findMessageById.mockResolvedValueOnce(
        buildMessage({ senderId: DRIVER_ID }) as ChatMessage,
      );

      await expectErrorCode(
        service.deleteMessage(STRANGER_ID, 'msg-1'),
        'CHAT_DELETE_NOT_SENDER',
      );
      expect(softDeleteMessage).not.toHaveBeenCalled();
    });

    it('does not emit when the message was already soft-deleted', async () => {
      findMessageById.mockResolvedValueOnce(
        buildMessage({ senderId: DRIVER_ID }) as ChatMessage,
      );
      softDeleteMessage.mockResolvedValueOnce(null);

      await expect(
        service.deleteMessage(DRIVER_ID, 'msg-1'),
      ).resolves.toBeUndefined();
      expect(emitMessageDeleted).not.toHaveBeenCalled();
    });
  });
});

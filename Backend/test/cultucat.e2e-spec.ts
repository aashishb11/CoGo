import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DbClient } from '@core/database/database.module';
import {
  CultucatClientError,
  CultucatClientService,
} from '@integrations/cultucat/cultucat-client.service';
import type { MailService } from '@integrations/mail/mail.service';
import type {
  CultucatEventListResponseDto,
  CultucatEventResponseDto,
} from '@modules/cultucat/dto/cultucat-events-response.dto';
import type {
  CultucatEventPayload,
  CultucatSearchRequest,
} from '@modules/cultucat/cultucat.types';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';

const EVENT: CultucatEventPayload = {
  id: 8421,
  externalId: 'EV-12345',
  title: 'Spring Festival',
  subtitle: 'Special Edition',
  description: 'Cultural show with activities throughout the weekend.',
  startDate: '2026-05-10T18:00:00.000Z',
  endDate: '2026-05-10T22:00:00.000Z',
  schedule: 'From 18:00 to 22:00',
  activityUrl: 'https://cultucat.example/activity',
  ticketsUrl: 'https://cultucat.example/tickets',
  minPrice: 0,
  maxPrice: 0,
  priceInfo: 'Free admission',
  modality: 'In-person',
  imageUrl: 'https://cultucat.example/image.jpg',
  comarca: 'Barcelonès',
  municipi: 'Barcelona',
  location: 'Parc del Forum',
  lat: 41.4121,
  lng: 2.2194,
  externalCreatedAt: '2026-04-20T09:30:00.000Z',
  createdAt: '2026-04-21T10:00:00.000Z',
  updatedAt: '2026-04-21T12:00:00.000Z',
  ambits: [{ id: 1, name: 'Music' }],
  categories: [{ id: 5, name: 'Festival' }],
};

const SEARCH_RESPONSE = {
  status: 'success',
  message: 'Events retrieved successfully',
  data: [EVENT],
  meta: { total: 247, page: 1, limit: 20, hasMore: true },
};

describe('CultuCat (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;
  let searchEventsCalls: CultucatSearchRequest[];
  let getEventByIdCalls: number[];

  const searchEvents = (body: CultucatSearchRequest) => {
    searchEventsCalls.push(body);
    return Promise.resolve(SEARCH_RESPONSE);
  };

  const getEventById = (id: number) => {
    getEventByIdCalls.push(id);
    if (id === 8421) {
      return Promise.resolve(EVENT);
    }
    return Promise.reject(new CultucatClientError('not_found', 'No event'));
  };

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp({
      providerOverrides: [
        {
          provide: CultucatClientService,
          useValue: { searchEvents, getEventById },
        },
      ],
    }));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await truncateAll(db);
    searchEventsCalls = [];
    getEventByIdCalls = [];
  });

  const newUser = (suffix = 'a') =>
    signUpAndVerify(app, mailService, {
      email: `cultucat-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `CultuCat ${suffix}`,
    });

  it('lists nearby events live and computes distance', async () => {
    const { cookie } = await newUser();

    const res = await request(app.getHttpServer())
      .get('/api/cultucat/events')
      .set('Cookie', cookie)
      .query({
        dateFrom: '2026-05-01T00:00:00.000Z',
        dateTo: '2026-05-31T23:59:59.000Z',
        lat: '41.3874',
        lng: '2.1686',
        radiusKm: '15',
      })
      .expect(200);

    const body = res.body as CultucatEventListResponseDto;

    expect(searchEventsCalls).toEqual([
      {
        dateFrom: '2026-05-01T00:00:00.000Z',
        dateTo: '2026-05-31T23:59:59.000Z',
        location: {
          mode: 'coordinates',
          lat: 41.3874,
          lng: 2.1686,
          radiusKm: 15,
        },
        page: 1,
      },
    ]);
    expect(body).toMatchObject({
      page: 1,
      limit: 20,
      total: 247,
      hasMore: true,
    });
    expect(body.items[0]).toMatchObject({
      eventId: '8421',
      title: 'Spring Festival',
      region: 'Barcelonès',
      municipality: 'Barcelona',
      externalEventContext: { provider: 'cultucat', eventId: '8421' },
    });
    expect(body.items[0].distanceFromOriginKm).toBeGreaterThan(0);
  });

  it('returns an event detail live by numeric id', async () => {
    const { cookie } = await newUser('b');

    const res = await request(app.getHttpServer())
      .get('/api/cultucat/events/8421')
      .set('Cookie', cookie)
      .query({ originLat: '41.3874', originLng: '2.1686' })
      .expect(200);

    const body = res.body as CultucatEventResponseDto;

    expect(getEventByIdCalls).toEqual([8421]);
    expect(body).toMatchObject({
      eventId: '8421',
      title: 'Spring Festival',
      externalEventContext: { provider: 'cultucat', eventId: '8421' },
    });
    expect(body.distanceFromOriginKm).toBeGreaterThan(0);
  });

  it('rejects a non-integer event id with 400', async () => {
    const { cookie } = await newUser('bad-id');

    await request(app.getHttpServer())
      .get('/api/cultucat/events/not-a-number')
      .set('Cookie', cookie)
      .expect(400);

    expect(getEventByIdCalls).toHaveLength(0);
  });

  it('returns CULTUCAT_EVENT_NOT_FOUND when the event does not exist upstream', async () => {
    const { cookie } = await newUser('missing');

    const res = await request(app.getHttpServer())
      .get('/api/cultucat/events/9999')
      .set('Cookie', cookie)
      .expect(404);

    expect(res.body).toMatchObject({
      code: 'CULTUCAT_EVENT_NOT_FOUND',
      statusCode: 404,
      message: 'CultuCat event could not be found or no longer exists.',
      details: null,
    });
  });
});

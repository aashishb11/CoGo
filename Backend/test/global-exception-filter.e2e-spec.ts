import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { sql } from 'drizzle-orm';
import { type DbClient } from '@core/database/database.module';
import type { MailService } from '@integrations/mail/mail.service';
import { signUpAndVerify } from './helpers/auth';
import { bootstrapTestApp } from './helpers/bootstrap';
import { truncateAll } from './helpers/db';
import {
  makeCar,
  makeCarModel,
  makeRide,
  makeTrip,
  makeTrustedContact,
} from './helpers/factories';

const pastDate = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

describe('Global exception filter (e2e)', () => {
  let app: INestApplication<App>;
  let db: DbClient;
  let mailService: MailService;

  beforeAll(async () => {
    ({ app, db, mailService } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  const newUser = (suffix: string) =>
    signUpAndVerify(app, mailService, {
      email: `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'password123',
      name: `User ${suffix}`,
    });

  it('upgrades CAR_NOT_OWNED via POST /trips with another user’s car', async () => {
    const owner = await newUser('owner');
    const car = await makeCar(db, owner.userId);
    const stranger = await newUser('stranger');
    // Trip publish now requires a trusted contact on the publishing user;
    // seed one so this test reaches the CAR_NOT_OWNED check it is asserting.
    await makeTrustedContact(db, stranger.userId);

    const res = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Cookie', stranger.cookie)
      .send({
        carId: car.id,
        type: 'sporadic',
        origin: { label: 'A', lat: 41.5381, lng: 2.4445 },
        destination: { label: 'B', lat: 41.3851, lng: 2.1734 },
        musicAllowed: false,
        seatsOffered: 3,
        pricePerSeatCents: 500,
        departureAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'CAR_NOT_OWNED',
      statusCode: 400,
      message: expect.stringContaining('do not own') as unknown,
      details: null,
    });
  });

  it('returns VALIDATION_FAILED with errors[] for malformed POST /trips body', async () => {
    const u = await newUser('v');

    const res = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Cookie', u.cookie)
      .send({})
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      statusCode: 400,
      message: 'Validation failed',
    });
    const details = (res.body as { details: { errors: string[] } }).details;
    expect(Array.isArray(details.errors)).toBe(true);
    expect(details.errors.length).toBeGreaterThan(0);
  });

  it('wraps a generic NotFoundException as code=NOT_FOUND with the original message', async () => {
    const u = await newUser('n');
    const res = await request(app.getHttpServer())
      .get('/api/trips/non-existent-id')
      .set('Cookie', u.cookie)
      .expect(404);

    expect(res.body).toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Trip not found',
      details: null,
    });
  });

  it('surfaces CAR_MODEL_MISSING (500) when the car model row is gone at completion', async () => {
    const driver = await newUser('cm');
    const carModel = await makeCarModel(db, { co2KgPerKm: 0.2 });
    const car = await makeCar(db, driver.userId, { modelId: carModel.id });
    const trip = await makeTrip(db, driver.userId, { carId: car.id });
    const ride = await makeRide(db, trip.id, {
      scheduledDeparture: pastDate(1),
      totalDistanceKm: 30,
      seatsOffered: 3,
      seatsOccupied: 1,
    });

    // Drop the FK + delete the model row so the inner join in `complete`
    // matches zero rows and the InternalServerErrorException path triggers.
    // Restore the constraint after, so other specs in the same db don't drift.
    await db.execute(
      sql`ALTER TABLE cars DROP CONSTRAINT IF EXISTS cars_model_id_car_models_id_fk`,
    );
    await db.execute(sql`DELETE FROM car_models WHERE id = ${carModel.id}`);

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/rides/${ride.id}/complete`)
        .set('Cookie', driver.cookie)
        .send({})
        .expect(500);

      expect(res.body).toMatchObject({
        code: 'CAR_MODEL_MISSING',
        statusCode: 500,
        message: expect.stringContaining('missing car model') as unknown,
      });
    } finally {
      // Truncate first to clear orphan cars rows; otherwise re-adding the FK
      // would fail because the inserted car still points at the deleted model.
      await truncateAll(db);
      await db.execute(
        sql`ALTER TABLE cars ADD CONSTRAINT cars_model_id_car_models_id_fk FOREIGN KEY (model_id) REFERENCES car_models(id)`,
      );
    }
  });
});

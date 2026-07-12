import { Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { cars } from '@core/database/schema';
import type { Car } from '@core/database/schema/cars.schema';
import type { CarModel } from '@core/database/schema/car-models.schema';

type InsertCar = typeof cars.$inferInsert;

@Injectable()
export class CarsRepository {
  async findAllByUserWithModel(
    tx: DbClient,
    userId: string,
  ): Promise<(Car & { model: CarModel })[]> {
    return tx.query.cars.findMany({
      where: eq(cars.userId, userId),
      with: { model: true },
    });
  }

  async existsByPlate(
    tx: DbClient,
    plate: string,
    excludeCarId?: string,
  ): Promise<boolean> {
    const where = excludeCarId
      ? and(eq(cars.plate, plate), ne(cars.id, excludeCarId))
      : eq(cars.plate, plate);
    const [row] = await tx
      .select({ id: cars.id })
      .from(cars)
      .where(where)
      .limit(1);
    return Boolean(row);
  }

  async insertOne(tx: DbClient, row: InsertCar): Promise<Car> {
    const [inserted] = await tx.insert(cars).values(row).returning();
    return inserted;
  }

  async deleteOwned(
    tx: DbClient,
    carId: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(cars)
      .where(and(eq(cars.id, carId), eq(cars.userId, userId)))
      .returning({ id: cars.id });
    return deleted.length > 0;
  }

  async updateOwned(
    tx: DbClient,
    carId: string,
    userId: string,
    patch: Partial<InsertCar>,
  ): Promise<Car | null> {
    // `updatedAt` is bumped automatically via `$onUpdate` on the schema.
    const [updated] = await tx
      .update(cars)
      .set(patch)
      .where(and(eq(cars.id, carId), eq(cars.userId, userId)))
      .returning();
    return updated ?? null;
  }
}

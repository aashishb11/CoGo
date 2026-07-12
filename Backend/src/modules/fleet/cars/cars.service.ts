import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { throwConflict } from '@shared/errors/throw';
import { TripsRepository } from '@modules/trips/trips/trips.repository';
import { CarsRepository } from './cars.repository';
import type { CreateCarDto } from './dto/create-car.dto';
import type { UpdateCarDto } from './dto/update-car.dto';

@Injectable()
export class CarsService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly carsRepo: CarsRepository,
    private readonly tripsRepo: TripsRepository,
  ) {}

  async findAllByUser(userId: string) {
    return this.carsRepo.findAllByUserWithModel(this.db, userId);
  }

  async create(userId: string, data: CreateCarDto) {
    if (await this.carsRepo.existsByPlate(this.db, data.plate)) {
      throw new ConflictException('A car with this plate already exists');
    }

    return this.carsRepo.insertOne(this.db, {
      id: randomUUID(),
      userId,
      modelId: data.modelId,
      plate: data.plate,
      color: data.color ?? null,
      passengerSeats: data.passengerSeats,
    });
  }

  async delete(userId: string, carId: string) {
    const hasActiveTrip = await this.tripsRepo.existsActiveByCar(
      this.db,
      carId,
      userId,
    );

    if (hasActiveTrip) {
      throwConflict(
        'CAR_HAS_ACTIVE_TRIPS',
        'Cannot delete car that is currently in use in a trip',
      );
    }

    const deleted = await this.carsRepo.deleteOwned(this.db, carId, userId);
    if (!deleted) {
      throw new NotFoundException('Car not found');
    }

    return { message: 'Car deleted successfully' };
  }

  async update(userId: string, carId: string, carData: UpdateCarDto) {
    if (carData.plate !== undefined) {
      const conflict = await this.carsRepo.existsByPlate(
        this.db,
        carData.plate,
        carId,
      );
      if (conflict) {
        throw new ConflictException('A car with this plate already exists');
      }
    }

    const updated = await this.carsRepo.updateOwned(
      this.db,
      carId,
      userId,
      carData,
    );
    if (!updated) {
      throw new NotFoundException('Car not found');
    }

    return updated;
  }
}

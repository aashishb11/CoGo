import { Module } from '@nestjs/common';
import { TripsModule } from '@modules/trips/trips.module';
import { CarModelsController } from './car-models/car-models.controller';
import { CarModelsRepository } from './car-models/car-models.repository';
import { CarModelsService } from './car-models/car-models.service';
import { CarsController } from './cars/cars.controller';
import { CarsRepository } from './cars/cars.repository';
import { CarsService } from './cars/cars.service';

@Module({
  imports: [TripsModule],
  controllers: [CarModelsController, CarsController],
  providers: [
    CarModelsRepository,
    CarModelsService,
    CarsRepository,
    CarsService,
  ],
  exports: [CarModelsService],
})
export class FleetModule {}

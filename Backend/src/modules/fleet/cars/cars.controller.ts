import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CarsService } from './cars.service';
import { CarResponseDto } from './dto/car-response.dto';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';

@ApiTags('Cars')
@ApiCookieAuth('better-auth.session_token')
@Controller('me/cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Get()
  @ApiOperation({
    description:
      'Lists every car owned by the authenticated user, with embedded car-model details (brand, name, year, co2KgPerKm).',
  })
  @ApiOkResponse({ type: [CarResponseDto] })
  async getCars(@Session() session: UserSession): Promise<CarResponseDto[]> {
    return this.carsService.findAllByUser(session.user.id);
  }

  @Post()
  @ApiOperation({
    description:
      'Registers a new car for the authenticated user, linked to a car model. The plate must be globally unique — returns 409 if any existing car already uses the same plate.',
  })
  @ApiCreatedResponse({ type: CarResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Car with this plate already exists',
  })
  async createCar(
    @Session() session: UserSession,
    @Body() carData: CreateCarDto,
  ): Promise<CarResponseDto> {
    return this.carsService.create(session.user.id, carData);
  }

  @Delete(':carId')
  @ApiOperation({
    description:
      "Deletes one of the authenticated user's cars. Blocked while the car is referenced by an active trip the user is driving (404 if the car doesn't belong to the caller, 409 if it's still in use); cancel those trips first.",
  })
  @ApiOkResponse({ description: 'Car deleted successfully' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Car has associated trips',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Car not found',
  })
  async deleteCar(
    @Session() session: UserSession,
    @Param('carId') carId: string,
  ) {
    return this.carsService.delete(session.user.id, carId);
  }

  @Patch(':carId')
  @ApiOperation({
    description:
      "Updates one of the authenticated user's cars (color, plate, passenger seats, model). 404 if the car doesn't belong to the caller. Trips already created from this car are not re-snapshotted.",
  })
  @ApiOkResponse({ type: CarResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Car not found',
  })
  async updateCar(
    @Session() session: UserSession,
    @Param('carId') carId: string,
    @Body() carData: UpdateCarDto,
  ): Promise<CarResponseDto> {
    return this.carsService.update(session.user.id, carId, carData);
  }
}

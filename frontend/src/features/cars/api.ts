import type { CarModel } from '@/features/car-models/api';
import { CreateCarSchema } from '@/features/cars/schemas';
import { apiFetch, validateSchema } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

export type UserCar = {
  id: string;
  userId?: string;
  modelId: string;
  plate?: string;
  color?: string | null;
  passengerSeats?: number;
  // Backend's CarsService.findAllByUser eagerly loads the related car_model row
  // (`with: { model: true }`). Optional here because POST/PATCH responses may
  // omit it depending on the route.
  model?: CarModel;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateUserCarInput = {
  modelId: string;
  plate: string;
  passengerSeats: number;
  color?: string;
};

export type UpdateUserCarInput = CreateUserCarInput;

// Backward-compat alias so existing `instanceof CarsApiError` checks keep working.
export { ApiError as CarsApiError };

export async function getUserCars(): Promise<UserCar[]> {
  const cars = await apiFetch<UserCar[]>({
    path: `/api/me/cars`,
    method: 'GET',
    allowNotFound: true,
  });
  return cars ?? [];
}

export async function createUserCar(input: CreateUserCarInput): Promise<UserCar | null> {
  // `CreateCarSchema` returns the normalized payload:
  //   - `plate` is reformatted as `NNNN-LLL`
  //   - `passengerSeats` is coerced to a number in [1, 9]
  //   - `color` is trimmed (dropped if empty)
  const payload = validateSchema(CreateCarSchema, input, 'Invalid car input');

  return apiFetch<UserCar>({
    path: `/api/me/cars`,
    method: 'POST',
    body: payload,
  });
}

export async function updateUserCar(
  carId: string,
  input: UpdateUserCarInput,
): Promise<UserCar | null> {
  const normalizedCarId = carId.trim();
  if (!normalizedCarId) {
    throw new ApiError('Car id is required to update a car.');
  }

  const payload = validateSchema(CreateCarSchema, input, 'Invalid car input');

  return apiFetch<UserCar>({
    path: `/api/me/cars/${encodeURIComponent(normalizedCarId)}`,
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteUserCar(carId: string): Promise<void> {
  await apiFetch<null>({
    path: `/api/me/cars/${encodeURIComponent(carId)}`,
    method: 'DELETE',
    allowNotFound: true,
  });
}

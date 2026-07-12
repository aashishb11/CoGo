import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createUserCar,
  deleteUserCar,
  getUserCars,
  updateUserCar,
  type CreateUserCarInput,
  type UpdateUserCarInput,
} from '@/features/cars/api';
import { invalidateAll } from '@/shared/query/invalidation';

export const queryKeys = {
  cars: (userId: string) => ['cars', userId] as const,
} as const;

export function useCars(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.cars(userId ?? ''),
    queryFn: () => getUserCars(),
    enabled: Boolean(userId),
  });
}

function invalidateCars(qc: ReturnType<typeof useQueryClient>, userId: string | null | undefined) {
  if (!userId) return;
  invalidateAll(qc, [queryKeys.cars(userId)]);
}

export function useCreateCar(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserCarInput) => createUserCar(input),
    onSuccess: () => invalidateCars(qc, userId),
  });
}

export function useDeleteCar(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (carId: string) => deleteUserCar(carId),
    onSuccess: () => invalidateCars(qc, userId),
  });
}

export function useUpdateCar(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ carId, input }: { carId: string; input: UpdateUserCarInput }) =>
      updateUserCar(carId, input),
    onSuccess: () => invalidateCars(qc, userId),
  });
}

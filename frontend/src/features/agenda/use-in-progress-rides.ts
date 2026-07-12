// Removed: the FE-side N+1 augmentation was a workaround for the agenda DTO
// not shipping `status`. The proper fix lives in the backend (add `status` to
// AgendaDriverItemDto / AgendaPassengerItemDto). This file is intentionally
// empty and safe to delete: `rm src/features/agenda/use-in-progress-rides.ts`.
export {};

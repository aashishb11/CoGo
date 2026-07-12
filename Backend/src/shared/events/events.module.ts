import { Module } from '@nestjs/common';

/**
 * Placeholder for the domain events infrastructure. Will start declaring
 * providers (event emitter, listeners) when the first domain event ships
 * (e.g. `ride.completed`). Not registered in AppModule yet — registering
 * a module with no providers has no runtime effect.
 */
@Module({})
export class EventsModule {}

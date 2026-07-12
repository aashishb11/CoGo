import { Module } from '@nestjs/common';
import { CultucatModule } from '@modules/cultucat/cultucat.module';
import { TrafficModule } from '@integrations/traffic/traffic.module';
import { RoutingModule } from '@integrations/routing/routing.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { SafetyModule } from '@modules/safety/safety.module';
import { WalletModule } from '@modules/wallet/wallet.module';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaIcsService } from './agenda/agenda-ics.service';
import { AgendaRepository } from './agenda/agenda.repository';
import { AgendaService } from './agenda/agenda.service';
import { BoardingController } from './bookings/boarding.controller';
import { BoardingService } from './bookings/boarding.service';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsExpiryService } from './bookings/bookings-expiry.service';
import { BookingsRepository } from './bookings/bookings.repository';
import { BookingsService } from './bookings/bookings.service';
import { ChatController } from './chat/chat.controller';
import { ChatGateway } from './chat/chat.gateway';
import { ChatRepository } from './chat/chat.repository';
import { ChatService } from './chat/chat.service';
import { FavoritesController } from './favorites/favorites.controller';
import { FavoritesRepository } from './favorites/favorites.repository';
import { FavoritesService } from './favorites/favorites.service';
import { RidesController } from './rides/rides.controller';
import { RidesRepository } from './rides/rides.repository';
import { RidesService } from './rides/rides.service';
import { RidesSweepService } from './rides/rides-sweep.service';
import { TrafficWatcherService } from './rides/traffic-watcher.service';
import { TripsController } from './trips/trips.controller';
import { TripsRepository } from './trips/trips.repository';
import { TripsService } from './trips/trips.service';

@Module({
  imports: [
    RoutingModule,
    TrafficModule,
    NotificationsModule,
    CultucatModule,
    SafetyModule,
    WalletModule,
  ],
  controllers: [
    TripsController,
    BookingsController,
    BoardingController,
    RidesController,
    FavoritesController,
    AgendaController,
    ChatController,
  ],
  providers: [
    TripsService,
    BookingsService,
    BoardingService,
    BookingsExpiryService,
    RidesService,
    RidesSweepService,
    FavoritesService,
    AgendaService,
    AgendaIcsService,
    TrafficWatcherService,
    ChatService,
    ChatGateway,
    TripsRepository,
    BookingsRepository,
    RidesRepository,
    FavoritesRepository,
    AgendaRepository,
    ChatRepository,
  ],
  exports: [TripsRepository, RidesService],
})
export class TripsModule {}

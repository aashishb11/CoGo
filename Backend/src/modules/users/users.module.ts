import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ProfileRideCompletedSubscriberService } from './profile-ride-completed-subscriber.service';
import { ProfileService } from './profile.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController, MeController],
  providers: [ProfileService, ProfileRideCompletedSubscriberService],
})
export class UsersModule {}

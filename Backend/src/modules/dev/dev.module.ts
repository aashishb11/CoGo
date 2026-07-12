import { Module } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { DevController } from './dev.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [DevController],
})
export class DevModule {}

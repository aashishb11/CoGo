import { Module } from '@nestjs/common';
import { CultucatClientService } from './cultucat-client.service';

@Module({
  providers: [CultucatClientService],
  exports: [CultucatClientService],
})
export class CultucatIntegrationModule {}

import { Module } from '@nestjs/common';
import { CultucatIntegrationModule } from '@integrations/cultucat/cultucat.module';
import { CultucatController } from './cultucat.controller';
import { CultucatService } from './cultucat.service';

@Module({
  imports: [CultucatIntegrationModule],
  controllers: [CultucatController],
  providers: [CultucatService],
  exports: [CultucatService],
})
export class CultucatModule {}

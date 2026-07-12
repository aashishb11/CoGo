import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardRepository } from './leaderboard.repository';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardRepository],
})
export class LeaderboardModule {}

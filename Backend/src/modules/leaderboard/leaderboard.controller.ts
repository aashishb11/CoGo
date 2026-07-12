import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardResponseDto } from './dto/leaderboard-response.dto';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('Leaderboard')
@ApiCookieAuth('better-auth.session_token')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @ApiOperation({
    description:
      'Returns a paginated, sorted ranking of users by `xp_points` (default), `co2_saved`, or `rides_completed`. ' +
      'Pass `organizationId` to scope the leaderboard to the members of a specific company or university. ' +
      "Results include rank, XP, computed level, total CO2 saved, and the user's organization.",
  })
  @ApiOkResponse({ type: LeaderboardResponseDto })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponseDto> {
    return this.leaderboardService.getLeaderboard(query);
  }
}

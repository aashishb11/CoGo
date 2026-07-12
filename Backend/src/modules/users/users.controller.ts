import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto';
import { toPublicProfileResponse } from './profile.mapper';
import { ProfileService } from './profile.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description:
      "Returns the authenticated better-auth user record (id, email, name, image, verification flags). For the caller's own application-level profile use GET /me/profile; for someone else's public profile use GET /users/:userId/profile.",
  })
  @ApiOkResponse({ schema: { $ref: '#/components/schemas/User' } })
  me(@Session() session: UserSession) {
    return session.user;
  }

  @Get(':userId/profile')
  @AllowAnonymous()
  @ApiOperation({
    description:
      'Returns the public profile (username, bio, totalCo2Saved, createdAt) for the given user id. Anonymous-accessible — used to render driver and passenger cards. Phone and locale are owner-only and live on GET /me/profile. 404 if the user has no profile.',
  })
  @ApiOkResponse({ type: PublicProfileResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getProfile(
    @Param('userId') userId: string,
  ): Promise<PublicProfileResponseDto> {
    const p = await this.profileService.getByUserId(userId);
    return toPublicProfileResponse(p);
  }
}

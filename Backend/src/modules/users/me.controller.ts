import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { SustainabilityResponseDto } from './dto/sustainability-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toProfileResponse } from './profile.mapper';
import { ProfileService } from './profile.service';

@ApiTags('Me')
@ApiCookieAuth('better-auth.session_token')
@Controller('me')
export class MeController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('profile')
  @ApiOperation({
    description:
      "Returns the authenticated user's own profile (full shape, includes `phone`, `locale`, `xpPoints`, `level`, and `badges` which are not on the public profile endpoint).",
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getProfile(
    @Session() session: UserSession,
  ): Promise<ProfileResponseDto> {
    const p = await this.profileService.getByUserId(session.user.id);
    return toProfileResponse(p);
  }

  @Post('profile')
  @ApiOperation({
    description:
      "Creates the authenticated user's profile (username, optional bio, phone, locale). One profile per user — returns 409 if a profile already exists for the caller.",
  })
  @ApiCreatedResponse({ type: ProfileResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async createProfile(
    @Session() session: UserSession,
    @Body() body: CreateProfileDto,
  ): Promise<ProfileResponseDto> {
    const p = await this.profileService.create(session.user.id, body);
    return toProfileResponse(p);
  }

  @Patch('profile')
  @ApiOperation({
    description:
      "Updates the authenticated user's profile. Only fields present in the body are touched; null clears bio, phone, or locale. 404 if the profile hasn't been created yet.",
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async updateProfile(
    @Session() session: UserSession,
    @Body() body: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const p = await this.profileService.update(session.user.id, body);
    return toProfileResponse(p);
  }

  @Get('sustainability')
  @ApiOperation({
    description:
      'Returns the sustainability impact summary for the authenticated user: total CO2 saved, equivalent trees per year, equivalent fuel litres saved, XP points, and current level.',
  })
  @ApiOkResponse({ type: SustainabilityResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getSustainability(
    @Session() session: UserSession,
  ): Promise<SustainabilityResponseDto> {
    return this.profileService.getSustainability(session.user.id);
  }
}

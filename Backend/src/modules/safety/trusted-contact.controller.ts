import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import {
  TrustedContactResponseDto,
  UpsertTrustedContactDto,
} from './dto/trusted-contact.dto';
import { TrustedContactService } from './trusted-contact.service';

@ApiTags('Safety')
@ApiCookieAuth('better-auth.session_token')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('me/trusted-contact')
export class TrustedContactController {
  constructor(private readonly service: TrustedContactService) {}

  @Get()
  @ApiOperation({
    description:
      "Returns the authenticated user's trusted safety contact. Returns 404 if none is set; the FE uses that to prompt for setup.",
  })
  @ApiOkResponse({ type: TrustedContactResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getMine(
    @Session() session: UserSession,
  ): Promise<TrustedContactResponseDto> {
    const row = await this.service.getMine(session.user.id);
    return {
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      "Sets or replaces the authenticated user's trusted safety contact. Both `name` and `email` are required; the endpoint NEVER clears the contact — repeated calls overwrite it. Required precondition for booking a seat and publishing a trip.",
  })
  @ApiOkResponse({ type: TrustedContactResponseDto })
  async upsert(
    @Session() session: UserSession,
    @Body() body: UpsertTrustedContactDto,
  ): Promise<TrustedContactResponseDto> {
    const row = await this.service.upsertMine(session.user.id, body);
    return {
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { PushSubscriptionResponseDto } from './dto/push-subscription-response.dto';
import { UpdatePushSubscriptionDto } from './dto/update-push-subscription.dto';
import { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import { toPushSubscriptionResponse } from './notifications.mapper';
import { NotificationsService } from './notifications.service';

@ApiTags('Push subscriptions')
@ApiCookieAuth('better-auth.session_token')
@Controller('me/push-subscriptions')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    description:
      'Lists every Web Push subscription registered by the authenticated user (one row per device/install). Settings are returned per-row so the FE can render per-device toggles.',
  })
  @ApiOkResponse({ type: [PushSubscriptionResponseDto] })
  async list(
    @Session() session: UserSession,
  ): Promise<PushSubscriptionResponseDto[]> {
    const rows = await this.notificationsService.list(session.user.id);
    return rows.map(toPushSubscriptionResponse);
  }

  @Post()
  @ApiOperation({
    description:
      'Registers (or refreshes) a Web Push subscription for the authenticated user. Idempotent on `endpoint`: re-POSTing the same endpoint rebinds the row to the caller and replaces `keys` / `settings`. Use this after the browser issues or rotates a subscription, after a different user signs in on the same device, or to set initial per-device settings.',
  })
  @ApiCreatedResponse({ type: PushSubscriptionResponseDto })
  async upsert(
    @Session() session: UserSession,
    @Body() body: UpsertPushSubscriptionDto,
  ): Promise<PushSubscriptionResponseDto> {
    const row = await this.notificationsService.upsert(session.user.id, body);
    return toPushSubscriptionResponse(row);
  }

  @Patch(':id')
  @ApiOperation({
    description:
      "Updates per-device notification settings on one of the authenticated user's push subscriptions. Partial-merge: omitted flags keep their current value; included flags replace.",
  })
  @ApiOkResponse({ type: PushSubscriptionResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Push subscription not found',
  })
  async updateSettings(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: UpdatePushSubscriptionDto,
  ): Promise<PushSubscriptionResponseDto> {
    const row = await this.notificationsService.updateSettings(
      session.user.id,
      id,
      body,
    );
    return toPushSubscriptionResponse(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Removes a Web Push subscription owned by the authenticated user. The FE should also call `subscription.unsubscribe()` browser-side to release the push manager registration.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Push subscription not found',
  })
  async delete(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    await this.notificationsService.delete(session.user.id, id);
  }
}

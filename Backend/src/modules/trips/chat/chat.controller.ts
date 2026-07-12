import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { ChatService } from './chat.service';
import {
  ChatMessageListResponseDto,
  ChatMessageResponseDto,
} from './dto/chat-message-response.dto';
import {
  ChatInboxItemDto,
  ChatInboxResponseDto,
} from './dto/chat-inbox-item.dto';
import { ChatInboxQueryDto } from './dto/chat-inbox-query.dto';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

@ApiTags('Chat')
@ApiCookieAuth('better-auth.session_token')
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ── Inbox ────────────────────────────────────────────────────────────────

  @Get('me/chat-inbox')
  @ApiOperation({
    description:
      'Returns every chat thread the authenticated user participates in — as driver or passenger. ' +
      'Each row includes both participants, trip context, unread count, and the latest message with its sender. ' +
      'Sorted newest-activity-first. Filter by ?tripId= to scope to one trip, or ?unreadOnly=true.',
  })
  @ApiOkResponse({ type: ChatInboxResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listInbox(
    @Session() session: UserSession,
    @Query() query: ChatInboxQueryDto,
  ): Promise<ChatInboxResponseDto> {
    return this.chatService.listInbox(session.user.id, query);
  }

  @Get('chat-threads/:threadId')
  @ApiOperation({
    description:
      'Returns a single inbox item by thread ID. Used for deep links and push tap-through. ' +
      'Only the driver and the passenger of the thread can access this.',
  })
  @ApiOkResponse({ type: ChatInboxItemDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getThread(
    @Param('threadId') threadId: string,
    @Session() session: UserSession,
  ): Promise<ChatInboxItemDto> {
    return this.chatService.getThread(session.user.id, threadId);
  }

  @Post('chat-threads/:threadId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Marks all messages in the thread as read for the current user by updating their lastReadAt timestamp. ' +
      'Call this when the user opens a thread to reset the unread count.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async markRead(
    @Param('threadId') threadId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.chatService.markRead(session.user.id, threadId);
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  @Get('chat-threads/:threadId/messages')
  @ApiOperation({
    description:
      'Lists messages in a thread, newest-first with cursor pagination. ' +
      'Only the driver and the passenger of the thread can access this endpoint.',
  })
  @ApiOkResponse({ type: ChatMessageListResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async listMessages(
    @Param('threadId') threadId: string,
    @Session() session: UserSession,
    @Query() query: ListChatMessagesQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    return this.chatService.listMessages(session.user.id, threadId, query);
  }

  @Post('chat-threads/:threadId/messages')
  @ApiOperation({
    description:
      'Sends a message to a thread. Only the driver and the passenger can send. ' +
      'Writing is blocked when the parent trip is no longer active. ' +
      'Optionally attach a rideId to scope the message to one ride occurrence within the trip.',
  })
  @ApiCreatedResponse({ type: ChatMessageResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Parent trip is not active.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async sendMessage(
    @Param('threadId') threadId: string,
    @Session() session: UserSession,
    @Body() body: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    return this.chatService.sendMessage(session.user.id, threadId, body);
  }

  @Delete('chat-messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    description:
      'Soft-deletes a message. Sender-only. The message row is preserved for ordering and audit; ' +
      'the body is cleared in API responses and the `deleted` flag is set to true.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @Session() session: UserSession,
  ): Promise<void> {
    await this.chatService.deleteMessage(session.user.id, messageId);
  }
}

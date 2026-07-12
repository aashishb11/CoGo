import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageResponseDto } from './chat-message-response.dto';

export class JoinThreadRequestDto {
  @ApiProperty({ example: 'thr_01HX...' })
  threadId!: string;
}

export class JoinThreadAckDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({
    required: false,
    enum: ['UNAUTHORIZED', 'THREAD_NOT_FOUND', 'FORBIDDEN'],
  })
  error?: string;
}

export class ChatMessageDeletedPayloadDto {
  @ApiProperty({ example: 'msg_01HX...' })
  messageId!: string;
}

export class ChatThreadUpdatedPayloadDto {
  @ApiProperty({ example: 'thr_01HX...' })
  threadId!: string;

  @ApiProperty({ example: 'trp_01HX...' })
  tripId!: string;

  @ApiProperty({ type: () => ChatMessageResponseDto })
  latestMessage!: ChatMessageResponseDto;

  @ApiProperty()
  updatedAt!: Date;
}

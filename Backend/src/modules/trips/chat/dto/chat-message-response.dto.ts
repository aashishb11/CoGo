import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MessageSenderDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class ChatMessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() threadId!: string;
  @ApiProperty({ type: () => MessageSenderDto }) sender!: MessageSenderDto;
  @ApiPropertyOptional() rideId!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() deleted!: boolean;
}

export class ChatMessageListResponseDto {
  @ApiProperty({ type: [ChatMessageResponseDto] })
  items!: ChatMessageResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as cursor to get the next page. Null when no more pages.',
  })
  nextCursor!: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ThreadPassengerDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() avatar!: string | null;
}

class ThreadLatestMessageDto {
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() deleted!: boolean;
}

export class ChatThreadListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() tripId!: string;
  @ApiProperty({ type: () => ThreadPassengerDto })
  passenger!: ThreadPassengerDto;
  @ApiPropertyOptional({ type: () => ThreadLatestMessageDto })
  latestMessage!: ThreadLatestMessageDto | null;
  @ApiProperty() createdAt!: Date;
}

export class ChatThreadListResponseDto {
  @ApiProperty({ type: [ChatThreadListItemDto] })
  items!: ChatThreadListItemDto[];
}

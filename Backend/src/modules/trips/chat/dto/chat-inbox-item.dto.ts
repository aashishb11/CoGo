import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { TripStatus } from '@modules/trips/trips.types';

class InboxTripDto {
  @ApiProperty() id!: string;
  @ApiProperty() origin!: string;
  @ApiProperty() destination!: string;
  @ApiPropertyOptional() departureAt!: Date | null;
  @ApiProperty() status!: TripStatus;
}

class InboxParticipantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() avatar!: string | null;
}

class InboxLatestMessageSenderDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class InboxLatestMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: () => InboxLatestMessageSenderDto })
  sender!: InboxLatestMessageSenderDto;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() deleted!: boolean;
}

export class ChatInboxItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['driver', 'passenger'] }) role!: 'driver' | 'passenger';
  @ApiProperty({ type: () => InboxTripDto }) trip!: InboxTripDto;
  @ApiProperty({ type: () => InboxParticipantDto })
  driver!: InboxParticipantDto;
  @ApiProperty({ type: () => InboxParticipantDto })
  passenger!: InboxParticipantDto;
  @ApiPropertyOptional({ type: () => InboxLatestMessageDto })
  latestMessage!: InboxLatestMessageDto | null;
  @ApiProperty() unreadCount!: number;
  @ApiPropertyOptional() lastReadAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ChatInboxResponseDto {
  @ApiProperty({ type: [ChatInboxItemDto] }) items!: ChatInboxItemDto[];
}

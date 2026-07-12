import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ChatInboxQueryDto {
  @ApiPropertyOptional({ description: 'Scope inbox to a single trip' })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({
    description: 'When true, return only threads with unread messages',
    default: false,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}

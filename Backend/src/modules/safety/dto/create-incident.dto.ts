import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '../safety.types';

// Maximum note length. Generous enough for a few paragraphs but bounded so a
// pathological payload can't bloat the table or the outbound email.
export const INCIDENT_NOTE_MAX_LENGTH = 1000;

export class CreateIncidentDto {
  @ApiProperty({ enum: INCIDENT_CATEGORIES, example: 'unsafe_driving' })
  @IsIn(INCIDENT_CATEGORIES as readonly string[])
  category!: IncidentCategory;

  @ApiPropertyOptional({
    description: 'Optional free-text note describing the incident.',
    maxLength: INCIDENT_NOTE_MAX_LENGTH,
    example: 'The driver was speeding through a 30km/h zone.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(INCIDENT_NOTE_MAX_LENGTH)
  note?: string;
}

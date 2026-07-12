import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Inbound shape for `PUT /me/trusted-contact`. The endpoint upserts and
// NEVER clears, so name/email are both required and non-empty here.
export class UpsertTrustedContactDto {
  @ApiProperty({ example: 'Marta García' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'marta@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class TrustedContactResponseDto {
  @ApiProperty({ example: 'Marta García' })
  name!: string;

  @ApiProperty({ example: 'marta@example.com' })
  email!: string;

  @ApiProperty({ example: '2026-05-24T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-05-24T10:00:00.000Z' })
  updatedAt!: Date;
}

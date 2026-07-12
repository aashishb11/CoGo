import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isExpoPushToken } from '@shared/push/expo-push';

@ValidatorConstraint({ name: 'isPushEndpoint', async: false })
export class IsPushEndpointConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (isExpoPushToken(value)) return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'endpoint must be an https Web Push URL or an Expo push token';
  }
}

export class PushSubscriptionKeysDto {
  @ApiProperty({
    example: 'BL4ID...',
    description: 'P-256 ECDH public key (base64url).',
  })
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @ApiProperty({
    example: 'aN4mTlW...',
    description: 'Auth secret (base64url).',
  })
  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class PushSubscriptionSettingsInputDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  traffic_alerts?: boolean;
}

export class UpsertPushSubscriptionDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description:
      'Subscription endpoint: a native Expo push token (`ExponentPushToken[…]`) or a browser Web Push URL (https). Acts as the unique key — re-POST with the same `endpoint` to refresh keys/settings or rebind to a new user on the same device.',
  })
  @IsString()
  @IsNotEmpty()
  @Validate(IsPushEndpointConstraint)
  endpoint!: string;

  @ApiProperty({ type: () => PushSubscriptionKeysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({
    type: () => PushSubscriptionSettingsInputDto,
    description:
      'Optional initial settings. Omitted flags fall back to the server default (currently `traffic_alerts: true`).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PushSubscriptionSettingsInputDto)
  settings?: PushSubscriptionSettingsInputDto;
}

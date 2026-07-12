import { ApiProperty } from '@nestjs/swagger';

export class AgendaFeedResponseDto {
  @ApiProperty({
    description:
      'Per-user iCalendar feed URL. Subscribe to it from Google Calendar, Apple Calendar, etc. The token in the query string authenticates the request; rotate it via POST /me/agenda/feed/rotate to revoke a leaked URL.',
    example:
      'https://api.cogo.example.com/api/me/agenda.ics?token=Hk3p...base64url',
  })
  url!: string;
}

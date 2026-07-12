import type { UserRating } from '@core/database/schema/user-ratings.schema';
import { RatingResponseDto } from './dto/rating-response.dto';

export function toRatingResponse(row: UserRating): RatingResponseDto {
  return {
    id: row.id,
    rideId: row.rideId,
    raterId: row.raterId,
    rateeId: row.rateeId,
    score: row.score,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}

import type { Organization } from '@core/database/schema/organizations.schema';
import type { OrganizationResponseDto } from './dto/organization-response.dto';

export const toOrganizationResponse = (
  org: Organization,
): OrganizationResponseDto => ({
  id: org.id,
  name: org.name,
  domain: org.domain,
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
});

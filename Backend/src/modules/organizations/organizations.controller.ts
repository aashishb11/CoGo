import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AllowAnonymous,
  Roles,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateOrganizationResponseDto } from './dto/create-organization-response.dto';
import { OrganizationDetailDto } from './dto/organization-detail.dto';
import { MeOrganizationResponseDto } from './dto/me-organization-response.dto';
import { OrganizationListItemDto } from './dto/organization-list-item.dto';
import { OrganizationMatchResponseDto } from './dto/organization-match-response.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { toOrganizationResponse } from './organizations.mapper';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @Roles(['admin'])
  @HttpCode(201)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description:
      'Creates a new organization and automatically links all existing unlinked users whose email domain matches.',
  })
  @ApiCreatedResponse({ type: CreateOrganizationResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation error',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Domain already registered',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async createOrganization(
    @Body() dto: CreateOrganizationDto,
  ): Promise<CreateOrganizationResponseDto> {
    const { organization, linkedCount } =
      await this.organizationsService.createOrganization(dto);
    return { organization: toOrganizationResponse(organization), linkedCount };
  }

  @Patch(':id')
  @Roles(['admin'])
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description: 'Updates an organization by ID. Admin only.',
  })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation error',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Domain already registered',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Organization not found',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async updateOrganization(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const organization = await this.organizationsService.updateOrganization(
      id,
      dto,
    );
    return toOrganizationResponse(organization);
  }

  @Get()
  @Roles(['admin'])
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description:
      'Returns all organizations with their member counts. Admin only.',
  })
  @ApiOkResponse({ type: [OrganizationListItemDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getAllOrganizations(): Promise<OrganizationListItemDto[]> {
    const orgs = await this.organizationsService.getAllOrganizations();
    return orgs.map((org) => ({
      ...toOrganizationResponse(org),
      memberCount: org.memberCount,
    }));
  }

  @Get('match')
  @AllowAnonymous()
  @ApiOperation({
    description:
      'Checks whether an organization exists for the domain of the given email address. Returns the organization when matched, or a structured unmatched response. Returns 400 for invalid email formats.',
  })
  @ApiQuery({
    name: 'email',
    required: true,
    example: 'student@estudiantat.upc.edu',
  })
  @ApiOkResponse({ type: OrganizationMatchResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid email format',
  })
  async matchByEmail(
    @Query('email') email: string,
  ): Promise<OrganizationMatchResponseDto> {
    const org = await this.organizationsService.findByEmailDomain(email);

    if (!org) {
      return {
        matched: false,
        organization: null,
        message: 'No supported organization was found for this email domain.',
      };
    }

    return { matched: true, organization: toOrganizationResponse(org) };
  }

  @Get('me')
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description:
      "Returns the organization the authenticated user is linked to, or null if they haven't been linked yet.",
  })
  @ApiOkResponse({ type: MeOrganizationResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Not authenticated',
  })
  async getMyOrganization(
    @Session() session: UserSession,
  ): Promise<MeOrganizationResponseDto> {
    const org = await this.organizationsService.getUserOrganization(
      session.user.id,
    );

    return { organization: org ? toOrganizationResponse(org) : null };
  }

  @Post(':id/members/:userId')
  @Roles(['admin'])
  @HttpCode(204)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description: 'Manually links a user to an organization. Admin only.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Organization not found',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async addMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.organizationsService.addMember(id, userId);
  }

  @Delete(':id/members/:userId')
  @Roles(['admin'])
  @HttpCode(204)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description: 'Removes a user from an organization. Admin only.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'User not a member of this org',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(id, userId);
  }

  @Get(':id')
  @Roles(['admin'])
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    description:
      'Returns a single organization with its full member list. Admin only.',
  })
  @ApiOkResponse({ type: OrganizationDetailDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Organization not found',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getOrganizationById(
    @Param('id') id: string,
  ): Promise<OrganizationDetailDto> {
    return this.organizationsService.getOrganizationById(id);
  }
}

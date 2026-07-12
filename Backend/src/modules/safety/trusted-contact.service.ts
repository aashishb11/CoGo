import { Injectable, NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Inject } from '@nestjs/common';
import { DB, type DbClient } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type { TrustedContact } from '@core/database/schema/trusted-contacts.schema';
import { throwForbidden } from '@shared/errors/throw';
import type { UpsertTrustedContactDto } from './dto/trusted-contact.dto';
import { TrustedContactRepository } from './trusted-contact.repository';

@Injectable()
export class TrustedContactService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: TrustedContactRepository,
  ) {}

  async getMine(userId: string): Promise<TrustedContact> {
    const row = await this.repo.findByUserId(this.db, userId);
    if (!row) {
      throw new NotFoundException('Trusted contact not set');
    }
    return row;
  }

  async upsertMine(
    userId: string,
    body: UpsertTrustedContactDto,
  ): Promise<TrustedContact> {
    return this.repo.upsert(this.db, {
      userId,
      name: body.name,
      email: body.email,
    });
  }

  // Called from other modules' transactions (BookingsService.createBatch,
  // TripsService.create). Takes the caller's tx — do NOT open a new
  // transaction here. Throws TRUSTED_CONTACT_REQUIRED (403) if the user
  // has not set a contact yet.
  async assertHasContact(tx: DbClient, userId: string): Promise<void> {
    const has = await this.repo.exists(tx, userId);
    if (!has) {
      throwForbidden(
        'TRUSTED_CONTACT_REQUIRED',
        'A trusted contact must be set before this action',
      );
    }
  }
}

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { trustedContacts } from '@core/database/schema';
import type {
  InsertTrustedContact,
  TrustedContact,
} from '@core/database/schema/trusted-contacts.schema';

@Injectable()
export class TrustedContactRepository {
  async findByUserId(
    tx: DbClient,
    userId: string,
  ): Promise<TrustedContact | null> {
    const [row] = await tx
      .select()
      .from(trustedContacts)
      .where(eq(trustedContacts.userId, userId))
      .limit(1);
    return row ?? null;
  }

  // Existence-only probe used by the gate (`assertHasContact`). Avoids
  // pulling the full row when only the boolean matters.
  async exists(tx: DbClient, userId: string): Promise<boolean> {
    const [row] = await tx
      .select({ userId: trustedContacts.userId })
      .from(trustedContacts)
      .where(eq(trustedContacts.userId, userId))
      .limit(1);
    return Boolean(row);
  }

  // Upsert path for PUT. The endpoint NEVER clears the row, so this
  // intentionally has no delete primitive.
  async upsert(
    tx: DbClient,
    row: InsertTrustedContact,
  ): Promise<TrustedContact> {
    const [inserted] = await tx
      .insert(trustedContacts)
      .values(row)
      .onConflictDoUpdate({
        target: trustedContacts.userId,
        set: { name: row.name, email: row.email },
      })
      .returning();
    return inserted;
  }
}

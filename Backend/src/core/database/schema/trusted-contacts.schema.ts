import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

// One trusted contact per user (PK on `user_id`). The contact is the
// person we notify when the user reports a safety incident; the row is
// also a precondition for booking and publishing a trip (US-05). The
// upsert path never clears the row — `PUT /me/trusted-contact` overwrites
// it but there is no DELETE / nullable variant.
export const trustedContacts = pgTable('trusted_contacts', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const trustedContactsRelations = relations(
  trustedContacts,
  ({ one }) => ({
    user: one(user, {
      fields: [trustedContacts.userId],
      references: [user.id],
    }),
  }),
);

export type TrustedContact = typeof trustedContacts.$inferSelect;
export type InsertTrustedContact = typeof trustedContacts.$inferInsert;

import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex('organizations_domain_idx').on(table.domain)],
);

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

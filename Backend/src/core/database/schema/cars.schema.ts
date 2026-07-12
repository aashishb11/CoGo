import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { carModels } from './car-models.schema';

export const cars = pgTable(
  'cars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    modelId: text('model_id')
      .notNull()
      .references(() => carModels.id),
    plate: text('plate').notNull().unique(),
    color: text('color'),
    passengerSeats: integer('passenger_seats').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('cars_userId_idx').on(table.userId)],
);

export const carsRelations = relations(cars, ({ one }) => ({
  user: one(user, {
    fields: [cars.userId],
    references: [user.id],
  }),
  model: one(carModels, {
    fields: [cars.modelId],
    references: [carModels.id],
  }),
}));

export type Car = typeof cars.$inferSelect;

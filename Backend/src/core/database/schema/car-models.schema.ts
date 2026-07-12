import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';

export const carModels = pgTable(
  'car_models',
  {
    id: text('id').primaryKey(),
    brand: text('brand').notNull(),
    name: text('name').notNull(),
    year: integer('year').notNull(),
    type: text('type').notNull(),
    co2KgPerKm: doublePrecision('co2_kg_per_km').notNull(),
  },
  (table) => [
    uniqueIndex('car_models_brand_name_year_uniq').on(
      table.brand,
      table.name,
      table.year,
    ),
  ],
);

export const carModelsRelations = relations(carModels, ({ many }) => ({
  cars: many(cars),
}));

export type CarModel = typeof carModels.$inferSelect;

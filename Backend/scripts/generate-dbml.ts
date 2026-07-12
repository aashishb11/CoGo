import { pgGenerate } from 'drizzle-dbml-generator';
import { writeFileSync } from 'fs';
import * as schema from '../src/core/database/schema';

const out = pgGenerate({ schema, relational: true });
writeFileSync('schema.dbml', out, { encoding: 'utf-8' });

console.log('schema.dbml generated successfully');

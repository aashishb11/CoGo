import { z } from 'zod';

// Mirrors backend `@IsFQDN()` (validator.js defaults, require_tld: true): allows
// Unicode letters/digits in each label, no leading/trailing hyphens, requires
// at least one dot. The schema lowercases ASCII first to match the backend's
// post-validation normalization.
const DOMAIN_REGEX =
  /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)+$/u;

export const CreateOrgSchema = z.object({
  name: z.string().trim().min(2, { message: 'admin.org.create.name.required' }).max(120),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => DOMAIN_REGEX.test(value), { message: 'admin.org.create.domain.invalid' }),
});

export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;

export type CreateOrgFormValues = {
  name: string;
  domain: string;
};

import { z } from 'zod';

import { EmailSchema, NonEmptyTrimmedString, PasswordSchema } from '@/shared/schemas/common';

export const LoginSchema = z.object({
  email: EmailSchema,
  // Login only requires a non-empty password — length validation (if any)
  // belongs to signup, not login.
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SignUpSchema = z
  .object({
    fullName: NonEmptyTrimmedString,
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwords_do_not_match',
    path: ['confirmPassword'],
  });
export type SignUpInput = z.infer<typeof SignUpSchema>;

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwords_do_not_match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

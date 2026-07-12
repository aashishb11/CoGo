import { registerDecorator, type ValidationOptions } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function IsYmd(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: {
        message: '$property must be in YYYY-MM-DD format',
        ...options,
      },
      constraints: [],
      validator: {
        validate: (v: unknown) => typeof v === 'string' && YMD.test(v),
      },
    });
  };
}

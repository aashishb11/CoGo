import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'MusicConsistent', async: false })
class MusicConsistentConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as {
      musicAllowed?: boolean;
      musicGenre?: string | null;
    };
    return !(obj.musicAllowed === false && obj.musicGenre);
  }

  defaultMessage(): string {
    return 'musicGenre must not be provided when musicAllowed is false';
  }
}

export function MusicConsistent(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: MusicConsistentConstraint,
    });
  };
}

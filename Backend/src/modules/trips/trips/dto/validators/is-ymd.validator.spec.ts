import { validate } from 'class-validator';
import { IsYmd } from './is-ymd.validator';

class TestDto {
  @IsYmd()
  date!: unknown;
}

const validateDate = async (value: unknown) => {
  const dto = new TestDto();
  dto.date = value;
  return validate(dto);
};

describe('IsYmd', () => {
  it('accepts a well-formed YYYY-MM-DD string', async () => {
    const errors = await validateDate('2026-05-25');

    expect(errors).toHaveLength(0);
  });

  it('rejects strings with the wrong separator', async () => {
    const errors = await validateDate('2026/05/25');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      customValidation: 'date must be in YYYY-MM-DD format',
    });
  });

  it('rejects strings with non-zero-padded month or day', async () => {
    expect(await validateDate('2026-5-25')).toHaveLength(1);
    expect(await validateDate('2026-05-5')).toHaveLength(1);
  });

  it('rejects ISO datetime strings that include a time component', async () => {
    const errors = await validateDate('2026-05-25T08:30:00.000Z');

    expect(errors).toHaveLength(1);
  });

  it('rejects values that are not strings', async () => {
    expect(await validateDate(20260525)).toHaveLength(1);
    expect(await validateDate(null)).toHaveLength(1);
    expect(await validateDate(undefined)).toHaveLength(1);
    expect(await validateDate(new Date('2026-05-25'))).toHaveLength(1);
  });

  it('rejects an empty string', async () => {
    const errors = await validateDate('');

    expect(errors).toHaveLength(1);
  });

  it('honours a custom message option passed to the decorator', async () => {
    class CustomDto {
      @IsYmd({ message: 'date must be ISO date' })
      date!: unknown;
    }

    const dto = new CustomDto();
    dto.date = 'nope';
    const errors = await validate(dto);

    expect(errors[0].constraints).toMatchObject({
      customValidation: 'date must be ISO date',
    });
  });
});

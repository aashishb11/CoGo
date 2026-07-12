import { validate } from 'class-validator';
import { MusicConsistent } from './music-consistent.validator';

class TestDto {
  musicAllowed?: boolean;
  musicGenre?: string | null;

  @MusicConsistent()
  consistencyMarker!: unknown;
}

const mkDto = (over: Partial<TestDto>) => {
  const dto = new TestDto();
  Object.assign(dto, over);
  return dto;
};

describe('MusicConsistent', () => {
  it('accepts musicAllowed true with a genre present', async () => {
    const errors = await validate(
      mkDto({ musicAllowed: true, musicGenre: 'indie' }),
    );

    expect(errors).toHaveLength(0);
  });

  it('accepts musicAllowed true with no genre set', async () => {
    const errors = await validate(
      mkDto({ musicAllowed: true, musicGenre: null }),
    );

    expect(errors).toHaveLength(0);
  });

  it('accepts musicAllowed false when no genre is provided', async () => {
    const errors = await validate(
      mkDto({ musicAllowed: false, musicGenre: null }),
    );

    expect(errors).toHaveLength(0);
  });

  it('accepts musicAllowed false when genre is an empty string (treated as absent)', async () => {
    const errors = await validate(
      mkDto({ musicAllowed: false, musicGenre: '' }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects musicAllowed false with a non-empty genre', async () => {
    const errors = await validate(
      mkDto({ musicAllowed: false, musicGenre: 'indie' }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      MusicConsistent:
        'musicGenre must not be provided when musicAllowed is false',
    });
  });

  it('accepts a dto where musicAllowed is undefined regardless of genre', async () => {
    const errors = await validate(mkDto({ musicGenre: 'indie' }));

    expect(errors).toHaveLength(0);
  });
});

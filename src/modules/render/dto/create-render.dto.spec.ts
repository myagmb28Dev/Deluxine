import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRenderDto } from './create-render.dto';

describe('CreateRenderDto cameraView', () => {
  const validateDto = (cameraView?: unknown) =>
    validate(
      plainToInstance(CreateRenderDto, {
        prompt: '',
        ...(cameraView === undefined ? {} : { cameraView }),
      }),
    );

  it('keeps cameraView optional for existing clients', async () => {
    await expect(validateDto()).resolves.toHaveLength(0);
  });

  it('accepts a valid camera viewpoint', async () => {
    await expect(
      validateDto({ azimuthDegrees: 38, elevationDegrees: 12 }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    [{ elevationDegrees: 12 }],
    [{ azimuthDegrees: 38 }],
    [{ azimuthDegrees: '38', elevationDegrees: 12 }],
    [{ azimuthDegrees: Number.NaN, elevationDegrees: 12 }],
    [{ azimuthDegrees: Number.POSITIVE_INFINITY, elevationDegrees: 12 }],
    [{ azimuthDegrees: 181, elevationDegrees: 12 }],
    [{ azimuthDegrees: -181, elevationDegrees: 12 }],
    [{ azimuthDegrees: 38, elevationDegrees: 91 }],
    [{ azimuthDegrees: 38, elevationDegrees: -91 }],
  ])('rejects an invalid camera viewpoint: %o', async (cameraView) => {
    expect(await validateDto(cameraView)).not.toHaveLength(0);
  });
});

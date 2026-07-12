import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { OpenRouterImageService } from './openrouter-image.service';
import { RenderModel } from './render-model';

describe('OpenRouterImageService', () => {
  const post = jest.fn();
  const configValues: Record<string, string> = {
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_TIMEOUT_MS: '600000',
    'app.baseUrl': 'http://localhost:3000',
    'app.name': 'Deluxine',
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new OpenRouterImageService(
    { post } as unknown as HttpService,
    configService,
  );

  const request = {
    model: RenderModel.GEMINI_3_1_FLASH_IMAGE,
    lineArtImage: 'https://cdn.example.com/line-art.png',
    poseData: { keypoints: [{ name: 'left_shoulder', x: 0.2, y: 0.3 }] },
    poseProjectionImage: 'data:image/png;base64,pose-base64',
    prompt: 'Keep the background white.',
  };

  beforeEach(() => {
    post.mockReset();
  });

  it('sends the selected model and both reference images to OpenRouter', async () => {
    post.mockReturnValue(
      of({
        data: {
          data: [{ b64_json: 'data:image/webp;base64,generated-image' }],
          usage: { cost: 0.08 },
        },
      }),
    );

    const result = await service.render(request);

    expect(post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/images',
      expect.objectContaining({
        model: RenderModel.GEMINI_3_1_FLASH_IMAGE,
        n: 1,
        input_references: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,pose-base64' },
          },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/line-art.png' },
          },
        ],
      }),
      expect.objectContaining({
        timeout: 600000,
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }) as unknown,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        outputImageBase64: 'generated-image',
        outputMimeType: 'image/webp',
        costUsd: 0.08,
      }),
    );
  });

  it.each([
    RenderModel.GEMINI_3_1_FLASH_LITE_IMAGE,
    RenderModel.GEMINI_3_1_FLASH_IMAGE,
    RenderModel.GEMINI_3_PRO_IMAGE,
  ])('prioritizes the pose reference for %s', async (model) => {
    post.mockReturnValue(
      of({
        data: {
          data: [{ b64_json: 'generated-image' }],
          usage: { cost: 0.04 },
        },
      }),
    );

    const result = await service.render({ ...request, model });
    const payload = post.mock.calls[0][1] as {
      prompt: string;
      input_references: Array<{ image_url: { url: string } }>;
    };

    expect(
      payload.input_references.map((reference) => reference.image_url.url),
    ).toEqual([
      'data:image/png;base64,pose-base64',
      'https://cdn.example.com/line-art.png',
    ]);
    expect(payload.prompt).toContain('TARGET POSE IS THE HIGHEST PRIORITY');
    expect(payload.prompt).toContain(
      'Do not preserve the source arm directions, leg directions, torso angle, or body orientation.',
    );
    expect(result).toEqual(
      expect.objectContaining({
        referenceStrategy: 'pose_first',
        referenceCount: 2,
      }),
    );
  });

  it('normalizes OpenRouter quota errors', async () => {
    post.mockReturnValue(
      throwError(() => ({
        isAxiosError: true,
        message: 'rate limited',
        response: { status: 429, data: { error: { message: 'rate limited' } } },
      })),
    );

    await expect(service.render(request)).rejects.toThrow('QUOTA_EXCEEDED');
  });
});

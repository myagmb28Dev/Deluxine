import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

interface RawKeypoint {
  name: string;
  x: number;
  y: number;
  confidence?: number;
}

@Injectable()
export class GeneratePoseService {
  private readonly logger = new Logger(GeneratePoseService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async execute(lineArtUrl: string) {
    const baseUrl = this.configService.get<string>('NANO_BANANA_BASE_URL');
    const model =
      this.configService.get<string>('NANO_BANANA_POSE_MODEL') ??
      'gemini-2.0-flash';
    const apiKey = this.configService.get<string>('NANO_BANANA_API_KEY');

    if (!apiKey || !baseUrl) {
      this.logger.warn('Gemini API not configured — returning mock pose data');
      return this.getMockPose();
    }

    // 이미지 파일 읽기
    const absolutePath = join(process.cwd(), lineArtUrl.replace(/^\/+/, ''));
    let imageBase64: string;
    const ext = extname(lineArtUrl).toLowerCase();
    const mimeType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';

    try {
      imageBase64 = await readFile(absolutePath, { encoding: 'base64' });
    } catch {
      this.logger.warn(
        `Line art file not readable (${lineArtUrl}) — returning mock pose data`,
      );
      return this.getMockPose();
    }

    const prompt = `Analyze this character line art illustration and detect the human body pose.

Return ONLY a valid JSON object (no markdown fences, no explanation) with this exact structure:
{
  "keypoints": [
    { "name": "head", "x": 0.0, "y": 0.0, "confidence": 0.0 },
    ...
  ]
}

Detect ALL of the following keypoints. Coordinates must be normalized (0.0–1.0), where (0,0) is the top-left corner:
head, neck, chest, abdomen, spine, pelvis,
left_shoulder, left_elbow, left_wrist,
left_thumb, left_index, left_middle, left_ring, left_pinky,
right_shoulder, right_elbow, right_wrist,
right_thumb, right_index, right_middle, right_ring, right_pinky,
left_hip, left_knee, left_ankle, left_foot, left_toe,
right_hip, right_knee, right_ankle, right_foot, right_toe

Rules:
- If a joint is occluded or not drawn, estimate its position from body proportions.
- Confidence: 0.9+ for clearly visible, 0.6–0.89 for inferred/partial, 0.3–0.59 for fully guessed.
- x increases to the right, y increases downward.
- Return ONLY the raw JSON — no markdown, no text before or after.`;

    try {
      this.logger.log(
        `Requesting Gemini Vision pose detection (model: ${model}) for ${lineArtUrl}`,
      );
      const response = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/models/${model}:generateContent`,
          {
            contents: [
              {
                role: 'user',
                parts: [
                  { inline_data: { mime_type: mimeType, data: imageBase64 } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            timeout: 60000,
          },
        ),
      );

      const rawText: string =
        response.data.candidates[0].content.parts[0].text ?? '';

      // JSON 마크다운 펜스 제거 후 파싱
      const jsonText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      const parsed: { keypoints: RawKeypoint[] } = JSON.parse(jsonText);

      if (!Array.isArray(parsed.keypoints) || parsed.keypoints.length === 0) {
        throw new Error('Empty keypoints in Gemini response');
      }

      this.logger.log(
        `Gemini returned ${parsed.keypoints.length} keypoints for session`,
      );

      return {
        candidates: [
          {
            id: `pose-${Date.now()}`,
            label: 'detected-pose',
            keypoints: parsed.keypoints.map((kp) => ({
              name: kp.name,
              x: Number(kp.x),
              y: Number(kp.y),
              confidence: kp.confidence ?? 0.85,
            })),
          },
        ],
      };
    } catch (error) {
      this.logger.error(
        'Gemini pose detection failed — falling back to mock data',
        error.response?.data ?? error.message,
      );
      return this.getMockPose();
    }
  }

  /** API 미설정·실패 시 반환하는 기본 자세 (정면 서기, 현실적 좌표) */
  private getMockPose() {
    return {
      candidates: [
        {
          id: `pose-mock-${Date.now()}`,
          label: 'mock-standing-pose',
          keypoints: [
            // ── 머리/목 ──
            { name: 'head',         x: 0.50, y: 0.08, confidence: 0.99 },
            { name: 'neck',         x: 0.50, y: 0.16, confidence: 0.95 },
            // ── 몸통 ──
            { name: 'chest',        x: 0.50, y: 0.24, confidence: 0.93 },
            { name: 'abdomen',      x: 0.50, y: 0.34, confidence: 0.90 },
            { name: 'spine',        x: 0.50, y: 0.40, confidence: 0.88 },
            { name: 'pelvis',       x: 0.50, y: 0.48, confidence: 0.90 },
            // ── 왼팔 ──
            { name: 'left_shoulder',x: 0.34, y: 0.22, confidence: 0.92 },
            { name: 'left_elbow',   x: 0.27, y: 0.37, confidence: 0.88 },
            { name: 'left_wrist',   x: 0.22, y: 0.52, confidence: 0.85 },
            // ── 왼손 (손목 기준 부채꼴 배치) ──
            { name: 'left_thumb',   x: 0.19, y: 0.53, confidence: 0.74 },
            { name: 'left_index',   x: 0.19, y: 0.56, confidence: 0.75 },
            { name: 'left_middle',  x: 0.20, y: 0.58, confidence: 0.74 },
            { name: 'left_ring',    x: 0.21, y: 0.58, confidence: 0.73 },
            { name: 'left_pinky',   x: 0.23, y: 0.57, confidence: 0.72 },
            // ── 오른팔 ──
            { name: 'right_shoulder',x: 0.66, y: 0.22, confidence: 0.92 },
            { name: 'right_elbow',  x: 0.73, y: 0.37, confidence: 0.88 },
            { name: 'right_wrist',  x: 0.78, y: 0.52, confidence: 0.85 },
            // ── 오른손 ──
            { name: 'right_thumb',  x: 0.81, y: 0.53, confidence: 0.74 },
            { name: 'right_index',  x: 0.81, y: 0.56, confidence: 0.75 },
            { name: 'right_middle', x: 0.80, y: 0.58, confidence: 0.74 },
            { name: 'right_ring',   x: 0.79, y: 0.58, confidence: 0.73 },
            { name: 'right_pinky',  x: 0.77, y: 0.57, confidence: 0.72 },
            // ── 왼다리 ──
            { name: 'left_hip',     x: 0.40, y: 0.52, confidence: 0.90 },
            { name: 'left_knee',    x: 0.39, y: 0.70, confidence: 0.87 },
            { name: 'left_ankle',   x: 0.37, y: 0.86, confidence: 0.84 },
            { name: 'left_foot',    x: 0.35, y: 0.92, confidence: 0.72 },
            { name: 'left_toe',     x: 0.32, y: 0.95, confidence: 0.68 },
            // ── 오른다리 ──
            { name: 'right_hip',    x: 0.60, y: 0.52, confidence: 0.90 },
            { name: 'right_knee',   x: 0.61, y: 0.70, confidence: 0.87 },
            { name: 'right_ankle',  x: 0.63, y: 0.86, confidence: 0.84 },
            { name: 'right_foot',   x: 0.65, y: 0.92, confidence: 0.72 },
            { name: 'right_toe',    x: 0.68, y: 0.95, confidence: 0.68 },
          ],
        },
      ],
    };
  }
}

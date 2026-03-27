import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UploadCompleteDto {
  @ApiPropertyOptional({ example: 'line_art', description: '프론트 업로드 종류(현재 엔드포인트에서는 참고용)' })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ example: 7, description: '희망 등신대 (0은 AUTO)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  targetRatio?: number;

  @ApiPropertyOptional({ example: false, description: 'true면 기존 포즈가 있어도 재생성' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  force?: boolean;
}

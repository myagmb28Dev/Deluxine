import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UploadCompleteDto {
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


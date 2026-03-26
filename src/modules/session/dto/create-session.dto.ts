import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({ example: 'line.png' })
  @IsOptional()
  @IsString()
  lineArt?: string;

  @ApiPropertyOptional({ example: '무릎 포즈 실험 #1' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 7, description: '희망 등신대 (0은 AUTO)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  targetRatio?: number;
}

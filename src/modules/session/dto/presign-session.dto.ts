import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PresignSessionDto {
  @ApiPropertyOptional({ example: '무릎 포즈 실험 #1' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'image/png', description: '프론트가 PUT에 사용할 Content-Type (서명에 포함될 수 있음)' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({ example: 'line.png', description: '원본 파일명(확장자 추정용)' })
  @IsOptional()
  @IsString()
  originalFilename?: string;
}


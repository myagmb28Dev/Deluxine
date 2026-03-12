import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListSessionsDto {
  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'updatedAt:desc' })
  @IsOptional()
  @IsIn(['updatedAt:desc', 'updatedAt:asc', 'createdAt:desc', 'createdAt:asc'])
  sort?: 'updatedAt:desc' | 'updatedAt:asc' | 'createdAt:desc' | 'createdAt:asc';

  @ApiPropertyOptional({ example: '무릎' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'eyJ2YWx1ZSI6IjIwMjYtMDMtMTFUMDA6MDA6MDAuMDAwWiIsImlkIjoiYWJjMTIzIn0=' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

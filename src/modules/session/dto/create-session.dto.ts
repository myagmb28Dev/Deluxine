import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({ example: 'line.png' })
  @IsOptional()
  @IsString()
  lineArt?: string;
}

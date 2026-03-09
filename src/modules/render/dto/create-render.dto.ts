import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateRenderDto {
  @ApiProperty({ example: '비 오는 도시 배경, 조명 강조' })
  @IsString()
  prompt: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRenderDto {
  @ApiProperty({ example: '비 오는 도시 배경, 조명 강조' })
  @IsString()
  prompt: string;

  @ApiProperty({
    required: false,
    description: '프론트에서 캡처한 포즈 투영 이미지(data URL)',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  @IsOptional()
  @IsString()
  poseProjectionImage?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DEFAULT_RENDER_MODEL, RenderModel } from '../render-model';
import { RenderCameraViewDto } from './render-camera-view.dto';

export class CreateRenderDto {
  @ApiPropertyOptional({
    enum: RenderModel,
    default: DEFAULT_RENDER_MODEL,
    description: 'Image generation model selected by the user.',
  })
  @IsOptional()
  @IsEnum(RenderModel)
  model?: RenderModel;

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

  @ApiPropertyOptional({
    type: RenderCameraViewDto,
    description: 'Camera viewpoint used to capture the pose projection.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RenderCameraViewDto)
  cameraView?: RenderCameraViewDto;
}

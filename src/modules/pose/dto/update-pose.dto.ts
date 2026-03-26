import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsString, IsOptional } from 'class-validator';

class KeypointDto {
  @ApiProperty({ example: 'left_shoulder' })
  @IsString()
  name: string;

  @ApiProperty({ example: 120.5 })
  @IsNumber()
  x: number;

  @ApiProperty({ example: 210.3 })
  @IsNumber()
  y: number;
  
  @ApiProperty({ example: 0.5, required: false })
  @IsOptional()
  @IsNumber()
  z?: number;

  @ApiProperty({ example: 0.95, required: false })
  @IsOptional()
  @IsNumber()
  confidence?: number;
}

class EditorTransformDto {
  @ApiProperty({ example: [0, 0, 0], type: [Number] })
  @IsArray()
  position: [number, number, number];

  @ApiProperty({ example: [0, 0, 0, 1], type: [Number] })
  @IsArray()
  quaternion: [number, number, number, number];

  @ApiProperty({ example: [1, 1, 1], type: [Number] })
  @IsArray()
  scale: [number, number, number];
}

class EditorBoneStateDto {
  @ApiProperty({ example: [0, 0, 0, 1], type: [Number] })
  @IsArray()
  quaternion: [number, number, number, number];
}

class EditorStateDto {
  @ApiProperty({ example: '1.0' })
  @IsString()
  version: string;

  @ApiProperty({ type: EditorTransformDto })
  wholeTransform: EditorTransformDto;

  @ApiProperty({
    example: {
      head: { quaternion: [0, 0, 0, 1] },
      left_shoulder: { quaternion: [0, 0, 0, 1] },
    },
  })
  bones: Record<string, EditorBoneStateDto>;
}

export class UpdatePoseDto {
  @ApiProperty({ type: [KeypointDto] })
  @IsArray()
  keypoints: KeypointDto[];

  @ApiProperty({ type: EditorStateDto, required: false })
  @IsOptional()
  editorState?: EditorStateDto;
}

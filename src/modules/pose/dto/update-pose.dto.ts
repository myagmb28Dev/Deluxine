import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsString } from 'class-validator';

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
}

export class UpdatePoseDto {
  @ApiProperty({ type: [KeypointDto] })
  @IsArray()
  keypoints: KeypointDto[];
}

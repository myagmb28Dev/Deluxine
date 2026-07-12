import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNumber, Max, Min } from 'class-validator';

export class RenderCameraViewDto {
  @ApiProperty({ example: 38, minimum: -180, maximum: 180 })
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  azimuthDegrees: number;

  @ApiProperty({ example: 12, minimum: -90, maximum: 90 })
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  elevationDegrees: number;
}

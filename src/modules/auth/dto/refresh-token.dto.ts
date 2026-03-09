import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: '15ebad65-f14d-4f06-b8fc-caf264fced86' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  refreshToken: string;
}

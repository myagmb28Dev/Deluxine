import { Controller, Delete, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { User } from '../../entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 로그인 사용자 정보 조회 및 토큰 검증' })
  async me(@Req() req: { user: User }) {
    // FirebaseAuthGuard가 이미 토큰을 검증하고 DB와 동기화된 User 엔티티를 주입했습니다.
    const result = await this.authService.getMe(req.user.id);
    if (!result) {
      throw new NotFoundException('user not found');
    }

    return result;
  }

  @Delete('users/:userId')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회원 삭제 (Firebase Auth 사용자 및 DB 정보 삭제)' })
  async deleteUser(@Req() req: { user: User }) {
    // 보안을 위해 자신의 계정만 삭제 가능하도록 설정
    const result = await this.authService.deleteUser(req.user.id);
    if (!result) {
      throw new NotFoundException('user not found');
    }

    return result;
  }
}

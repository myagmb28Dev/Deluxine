import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthUser } from './auth.types';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './types/jwt-payload.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google 로그인 시작' })
  googleLogin() {
    return;
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google 로그인 콜백 및 토큰/프로필 저장' })
  async googleCallback(@Req() req: { user: GoogleAuthUser }) {
    const result = await this.authService.handleGoogleLogin(req.user);

    return {
      message: 'google login success',
      ...result,
    };
  }

  @Get('users/:userId/storage-status')
  @ApiOperation({ summary: '저장된 OAuth 토큰/사용자 정보 상태 확인' })
  async getStorageStatus(@Param('userId') userId: string) {
    const user = await this.authService.getUserStorageStatus(userId);
    if (!user) {
      throw new NotFoundException('user not found');
    }

    return user;
  }

  @Post('users/:userId/logout')
  @ApiOperation({ summary: '로그아웃 (저장된 OAuth 토큰 폐기 및 제거)' })
  async logout(@Param('userId') userId: string) {
    const result = await this.authService.logout(userId);
    if (!result) {
      throw new NotFoundException('user not found');
    }

    return result;
  }

  @Delete('users/:userId')
  @ApiOperation({ summary: '회원 삭제 (OAuth 토큰 폐기 후 계정 정보 삭제)' })
  async deleteUser(@Param('userId') userId: string) {
    const result = await this.authService.deleteUser(userId);
    if (!result) {
      throw new NotFoundException('user not found');
    }

    return result;
  }

  @Post('users/:userId/revoke-retry')
  @ApiOperation({ summary: '실패했던 Google 토큰 revoke 재시도' })
  async retryRevoke(@Param('userId') userId: string) {
    return this.authService.retryPendingRevoke(userId);
  }

  @Post('refresh')
  @ApiOperation({ summary: '앱 JWT 액세스/리프레시 토큰 재발급(회전)' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshAppToken(dto.userId, dto.refreshToken);
    if (!result) {
      throw new UnauthorizedException('invalid refresh token');
    }

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '현재 로그인 사용자 정보 조회' })
  async me(@Req() req: { user: JwtPayload }) {
    const result = await this.authService.getMe(req.user.sub);
    if (!result) {
      throw new NotFoundException('user not found');
    }

    return result;
  }
}

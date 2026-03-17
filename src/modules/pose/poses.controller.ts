import { Controller, Get, Param, NotFoundException, ForbiddenException, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PoseService } from './pose.service';
import { SessionService } from '../session/session.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';

@ApiTags('poses')
@ApiBearerAuth()
@Controller('poses')
export class PosesController {
  constructor(
    private readonly poseService: PoseService,
    private readonly sessionService: SessionService,
  ) {}

  @UseGuards(FirebaseAuthGuard)
  @Get(':poseId')
  async getById(@Param('poseId') poseId: string, @Req() req: any) {
    const pose = await this.poseService.findById(poseId);
    if (!pose) {
      throw new NotFoundException('pose not found');
    }

    const session = await this.sessionService.findById(pose.sessionId);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    // 소유자 확인: 요청자와 세션 소유자 일치 여부
    const requester = req?.user?.id;
    if (session.userId && requester !== session.userId) {
      throw new ForbiddenException('access denied');
    }

    return pose;
  }
}

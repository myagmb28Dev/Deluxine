import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { PresignSessionDto } from './dto/presign-session.dto';
import { UploadCompleteDto } from './dto/upload-complete.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionService } from './session.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { User } from '../../entities/user.entity';
import { PoseService } from '../pose/pose.service';

@ApiTags('session')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly poseService: PoseService,
  ) {}

  @Post('presign')
  @ApiOperation({ summary: '세션 생성 + 선화 업로드용 presigned PUT 발급' })
  async presign(@Body() dto: PresignSessionDto, @Req() req: { user: User }) {
    const { session, upload } = await this.sessionService.createLineArtPresign({
      userId: req.user.id,
      title: dto.title,
      contentType: dto.contentType,
      filename: dto.filename,
      size: dto.size,
    });

    return {
      session,
      upload,
    };
  }

  @Post(':id/uploads/complete')
  @ApiOperation({ summary: 'R2 업로드 완료 알림 + 포즈 생성 시작 트리거' })
  async uploadComplete(@Param('id') id: string, @Body() dto: UploadCompleteDto, @Req() req: { user: User }) {
    const session = await this.sessionService.confirmLineArtUpload(id, req.user.id);
    if (!session) {
      if (await this.sessionService.exists(id)) {
        throw new ForbiddenException('forbidden');
      }
      throw new NotFoundException('session not found');
    }

    const generation = await this.poseService.generate(id, dto.targetRatio, dto.force ?? false);
    if ((generation as { enqueued?: boolean }).enqueued) {
      await this.sessionService.appendHistory(id, 'pose.auto_generation_requested');
    }

    return {
      session: await this.sessionService.presentSession(session),
      pose: generation,
    };
  }

  @Get()
  @ApiOperation({ summary: '내 세션 목록 조회 (최신순)' })
  async findMine(@Req() req: { user: User }, @Query() query: ListSessionsDto) {
    return this.sessionService.findSummaryByUser(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '세션 조회' })
  async findOne(@Param('id') id: string, @Req() req: { user: User }) {
    const session = await this.sessionService.findById(id, req.user.id);
    if (!session) {
      if (await this.sessionService.exists(id)) {
        throw new ForbiddenException('forbidden');
      }
      throw new NotFoundException('session not found');
    }

    return this.sessionService.presentSession(session);
  }

  @Patch(':id')
  @ApiOperation({ summary: '세션 메타(제목) 수정' })
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto, @Req() req: { user: User }) {
    const updated = await this.sessionService.updateSession(id, req.user.id, dto);
    if (!updated) {
      if (await this.sessionService.exists(id)) {
        throw new ForbiddenException('forbidden');
      }
      throw new NotFoundException('session not found');
    }

    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '세션 삭제' })
  async remove(@Param('id') id: string, @Req() req: { user: User }) {
    const removed = await this.sessionService.deleteSession(id, req.user.id);
    if (!removed) {
      if (await this.sessionService.exists(id)) {
        throw new ForbiddenException('forbidden');
      }
      throw new NotFoundException('session not found');
    }
  }
}

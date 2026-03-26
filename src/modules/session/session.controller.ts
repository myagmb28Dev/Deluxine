import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateSessionDto } from './dto/create-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
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

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        title: {
          type: 'string',
          example: '점프 구도 실험 A안',
        },
        targetRatio: {
          type: 'number',
          example: 7,
          description: '희망 등신대 (0은 AUTO)',
        },
      },
    },
  })
  @ApiOperation({ summary: '선화 업로드 및 세션 생성' })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateSessionDto,
    @Req() req: { user: User },
  ) {
    const session = await this.sessionService.create({
      userId: req.user.id,
      title: dto.title,
    });

    if (file) {
      const updatedSession = await this.sessionService.attachLineArtFile(session, file);
      
      // 파일 업로드 후 자동으로 포즈 생성 시작
      try {
        const generation = await this.poseService.generate(updatedSession.id, dto.targetRatio);
        if ((generation as { enqueued?: boolean }).enqueued) {
          await this.sessionService.appendHistory(updatedSession.id, 'pose.auto_generation_requested');
        }
      } catch (error) {
        // 포즈 생성 실패해도 세션은 반환 (사용자가 나중에 다시 시도할 수 있음)
        console.error('Auto pose generation failed:', error);
      }
      
      return updatedSession;
    }

    return session;
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

    return session;
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

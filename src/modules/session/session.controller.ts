import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateSessionDto } from './dto/create-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.type';

@ApiTags('session')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

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
      },
    },
  })
  @ApiOperation({ summary: '선화 업로드 및 세션 생성' })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateSessionDto,
    @Req() req: { user: JwtPayload },
  ) {
    const session = await this.sessionService.create({
      userId: req.user.sub,
      title: dto.title,
    });

    if (file) {
      return this.sessionService.attachLineArtFile(session, file);
    }

    return session;
  }

  @Get()
  @ApiOperation({ summary: '내 세션 목록 조회 (최신순)' })
  async findMine(@Req() req: { user: JwtPayload }, @Query() query: ListSessionsDto) {
    return this.sessionService.findSummaryByUser(req.user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '세션 조회' })
  async findOne(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    const session = await this.sessionService.findById(id, req.user.sub);
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
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto, @Req() req: { user: JwtPayload }) {
    const updated = await this.sessionService.updateSession(id, req.user.sub, dto);
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
  async remove(@Param('id') id: string, @Req() req: { user: JwtPayload }) {
    const removed = await this.sessionService.deleteSession(id, req.user.sub);
    if (!removed) {
      if (await this.sessionService.exists(id)) {
        throw new ForbiddenException('forbidden');
      }
      throw new NotFoundException('session not found');
    }
  }
}

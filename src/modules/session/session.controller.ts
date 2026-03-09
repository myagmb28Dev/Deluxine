import { Body, Controller, Get, NotFoundException, Param, Post, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('session')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
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
      },
    },
  })
  @ApiOperation({ summary: '선화 업로드 및 세션 생성' })
  async create(@UploadedFile() file: Express.Multer.File) {
    const lineArtUrl = file ? `/uploads/${file.filename}` : '/uploads/default-line.png';
    return this.sessionService.create(lineArtUrl);
  }

  @Get(':id')
  @ApiOperation({ summary: '세션 조회' })
  async findOne(@Param('id') id: string) {
    const session = await this.sessionService.findById(id);
    if (!session) {
      throw new NotFoundException('session not found');
    }

    return session;
  }
}

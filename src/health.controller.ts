import { Controller, Get, Head } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/')
  root() {
    return {
      ok: true,
      service: 'Deluxine',
      timestamp: new Date().toISOString(),
    };
  }

  @Head('/')
  headRoot() {
    return;
  }

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Head('/health')
  headHealth() {
    return;
  }
}


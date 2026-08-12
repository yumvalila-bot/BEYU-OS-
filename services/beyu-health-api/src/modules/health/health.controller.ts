import { Controller, Get } from '@nestjs/common';
import { Public } from '../../core/public.decorator';
import { getDatabase } from '../../db/driver';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  async check() {
    const db = getDatabase();
    const healthy = await db.healthCheck();
    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'BEYU HEALTH OS API',
      version: '1.0.0',
      database: healthy ? 'connected' : 'disconnected',
      contracts: '1.0.0',
    };
  }

  @Public()
  @Get('ready')
  async ready() {
    const db = getDatabase();
    const healthy = await db.healthCheck();
    return { ready: healthy, timestamp: new Date().toISOString() };
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/public.decorator';
import { getDatabase } from '../../db/driver';
import { resolveAgricultureDatabaseTarget } from '../../db/connection-target';
import { AGRICULTURE_CONTRACTS_VERSION } from '@beyu/agriculture-types';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', service: 'beyu-agriculture-os' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const db = getDatabase();
    const ok = await db.healthCheck();
    const target = resolveAgricultureDatabaseTarget();
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'beyu-agriculture-os',
      version: AGRICULTURE_CONTRACTS_VERSION,
      database: { driver: db.driver, ok, target: target.sanitized },
      timestamp: new Date().toISOString(),
    };
  }
}

import { Controller, Get } from '@nestjs/common';
import { Public } from '../../core/public.decorator';
import { getDatabase } from '../../db/driver';
import { resolveHealthDatabaseTarget } from '../../db/connection-target';
import { supabaseRuntimeStatus } from '../../integrations/supabase/client';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  async check() {
    const db = getDatabase();
    const healthy = await db.healthCheck();
    const target = resolveHealthDatabaseTarget();
    const supabase = supabaseRuntimeStatus();
    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'BEYU HEALTH OS API',
      version: '1.0.0',
      database: {
        connected: healthy,
        driver: target.driver,
        supabase: target.supabase,
        projectRef: target.projectRef,
      },
      supabase: {
        configured: supabase.configured,
        projectRef: supabase.projectRef,
        associatedProjectRef: supabase.associatedProjectRef,
        usesAssociatedProject: supabase.usesAssociatedProject,
      },
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

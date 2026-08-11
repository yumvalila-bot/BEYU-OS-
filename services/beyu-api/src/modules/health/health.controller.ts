/**
 * Liveness and readiness endpoints (spec §72).
 *
 * Public by design: orchestrators must probe them without credentials. They
 * expose no tenant data, no configuration values and no secrets.
 */

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { BEYU_CONTRACTS_VERSION } from '@beyu/types';

import { DATABASE } from '../../core/database.module';
import { Public } from '../../core/authorization.guard';
import type { Database } from '../../db/driver';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Liveness probe. Returns 200 while the process is running.' })
  health(): { status: string; contractsVersion: string; timestamp: string } {
    return {
      status: 'ok',
      contractsVersion: BEYU_CONTRACTS_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Readiness probe. Verifies the database is reachable.' })
  async ready(): Promise<{ status: string; database: string; driver: string }> {
    const healthy = await this.db.healthCheck();
    if (!healthy) {
      throw new ServiceUnavailableException('Database is not reachable.');
    }
    return { status: 'ready', database: 'up', driver: this.db.driver };
  }
}

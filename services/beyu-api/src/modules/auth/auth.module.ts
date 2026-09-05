/**
 * Authentication module (spec §17, §55).
 */

import { Global, Module } from '@nestjs/common';

import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from './user.repository';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: UserRepository,
      inject: [DATABASE],
      useFactory: (db: Database): UserRepository => new UserRepository(db),
    },
    AuthService,
  ],
  exports: [AuthService, UserRepository],
})
export class AuthModule {}

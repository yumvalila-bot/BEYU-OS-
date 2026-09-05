import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from './user.repository';
import { UserController } from './user.controller';

@Global()
@Module({
  controllers: [AuthController, UserController],
  providers: [AuthService, UserRepository],
  exports: [AuthService, UserRepository],
})
export class IdentityModule {}

import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRepository } from './ai.repository';
@Module({ controllers: [AiController], providers: [AiRepository], exports: [AiRepository] })
export class AiModule {}

import { Module } from '@nestjs/common';
import { WorkforceController } from './workforce.controller';
import { WorkforceRepository } from './workforce.repository';
@Module({ controllers: [WorkforceController], providers: [WorkforceRepository], exports: [WorkforceRepository] })
export class WorkforceModule {}

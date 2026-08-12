import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
@Module({ controllers: [BillingController], providers: [BillingRepository], exports: [BillingRepository] })
export class BillingModule {}

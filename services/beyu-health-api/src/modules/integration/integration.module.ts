import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationRepository } from './integration.repository';
@Module({ controllers: [IntegrationController], providers: [IntegrationRepository], exports: [IntegrationRepository] })
export class IntegrationModule {}

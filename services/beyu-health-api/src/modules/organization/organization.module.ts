import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationRepository } from './organization.repository';
@Module({ controllers: [OrganizationController], providers: [OrganizationRepository], exports: [OrganizationRepository] })
export class OrganizationModule {}

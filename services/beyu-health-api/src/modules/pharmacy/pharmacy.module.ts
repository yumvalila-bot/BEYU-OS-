import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyRepository } from './pharmacy.repository';
@Module({ controllers: [PharmacyController], providers: [PharmacyRepository], exports: [PharmacyRepository] })
export class PharmacyModule {}

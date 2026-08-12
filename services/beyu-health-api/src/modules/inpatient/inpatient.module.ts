import { Module } from '@nestjs/common';
import { InpatientController } from './inpatient.controller';
import { InpatientRepository } from './inpatient.repository';
@Module({ controllers: [InpatientController], providers: [InpatientRepository], exports: [InpatientRepository] })
export class InpatientModule {}

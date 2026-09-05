import { Module } from '@nestjs/common';
import { OphthalmologyController } from './ophthalmology.controller';
import { OphthalmologyRepository } from './ophthalmology.repository';
@Module({ controllers: [OphthalmologyController], providers: [OphthalmologyRepository], exports: [OphthalmologyRepository] })
export class OphthalmologyModule {}

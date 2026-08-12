import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentRepository } from './appointment.repository';
@Module({ controllers: [AppointmentController], providers: [AppointmentRepository], exports: [AppointmentRepository] })
export class AppointmentModule {}

/**
 * Authentication request bodies.
 *
 * The global ValidationPipe runs with `whitelist` and `forbidNonWhitelisted`,
 * so any property not declared here causes the request to be rejected rather
 * than silently ignored.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'trustee@beyu.example' })
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  // Length is validated on the way in for registration, not on login: telling
  // an attacker their guess was "too short" is information they do not need.
  @MaxLength(512)
  password!: string;

  @ApiPropertyOptional({
    description:
      'Tenant to activate for this session. Honoured only if the user holds it; ' +
      'otherwise ignored.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

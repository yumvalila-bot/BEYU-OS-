import { Body, Controller, Get, Post, Headers, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/public.decorator';
import { AuthService } from './auth.service';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { getSecurityContext } from '../../core/request-context';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() tenantId?: string;
}

class RefreshDto {
  @IsString() refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: LoginDto, @Headers('x-request-id') requestId: string, @Req() req: Request) {
    const meta = { requestId: requestId ?? 'req-'+Date.now(), ipAddress: req.ip, userAgent: req.headers['user-agent'] as string };
    return this.auth.login(body.email, body.password, meta, body.tenantId ?? null);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Headers('x-request-id') requestId: string, @Req() req: Request) {
    const meta = { requestId: requestId ?? 'req-'+Date.now(), ipAddress: req.ip, userAgent: req.headers['user-agent'] as string };
    return this.auth.refresh(body.refreshToken, meta);
  }

  @Public()
  @Post('logout')
  async logout(@Body() body: RefreshDto) {
    await this.auth.logout(body.refreshToken);
    return { success: true };
  }

  @Get('me')
  async me() {
    const ctx = getSecurityContext();
    return ctx;
  }
}

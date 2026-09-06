import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../../core/public.decorator';
import { AuthenticationGuard } from '../../core/authentication.guard';
import { getSecurityContext } from '../../core/request-context';
import { AuthService } from './auth.service';

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
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Headers('x-request-id') requestId: string, @Req() req: Request) {
    const meta = { requestId: requestId ?? 'req-' + Date.now(), ipAddress: req.ip, userAgent: req.headers['user-agent'] as string };
    return this.auth.login(body.email, body.password, meta, body.tenantId ?? null);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshDto, @Headers('x-request-id') requestId: string, @Req() req: Request) {
    const meta = { requestId: requestId ?? 'req-' + Date.now(), ipAddress: req.ip, userAgent: req.headers['user-agent'] as string };
    return this.auth.refresh(body.refreshToken, meta);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: RefreshDto) {
    await this.auth.logout(body.refreshToken);
    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthenticationGuard)
  @ApiBearerAuth()
  async me() {
    const ctx = getSecurityContext();
    return ctx;
  }
}

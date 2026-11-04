import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import {
  ErrorResponseDto,
  LoginResponseDto,
  ProfileResponseDto,
} from './dto/auth-responses.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida las credenciales y emite un JWT' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo invalido' })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Credenciales invalidas o usuario inactivo (respuesta generica)',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Mas de 5 intentos fallidos en 15 minutos para la cuenta',
  })
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.authService.login(dto, { ip: req.ip, requestId: req.requestId });
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el perfil del usuario autenticado' })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Token ausente, invalido o vencido, o usuario inactivo',
  })
  profile(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.sub);
  }
}

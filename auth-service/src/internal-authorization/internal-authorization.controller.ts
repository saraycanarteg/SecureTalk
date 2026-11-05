import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { ErrorResponseDto } from '../auth/dto/auth-responses.dto';
import { AuthorizationCheckService } from './authorization-check.service';
import { AuthorizationCheckDto, AuthorizationDecisionDto } from './dto/authorization-check.dto';
import { ServiceKeyGuard } from './service-key.guard';

@ApiTags('internal')
@ApiSecurity('service-key')
// Todo STEGO llega desde una IP: el limite global lo dejaria sin decisiones y responderia 503.
// La proteccion aqui es la clave de servicio, de al menos 32 caracteres.
@SkipThrottle()
@UseGuards(ServiceKeyGuard)
@Controller('internal/authorization')
export class InternalAuthorizationController {
  constructor(private readonly checkService: AuthorizationCheckService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decide si un usuario puede ejecutar una accion de STEGO',
    description:
      'Solo para STEGO. Responde 200 tambien al denegar, con allowed=false. ' +
      'Decide con el estado y los roles vigentes en la base de datos.',
  })
  @ApiOkResponse({ type: AuthorizationDecisionDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Cuerpo invalido o subject_token del que no se puede determinar el usuario',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Cabecera X-Service-Key ausente o incorrecta',
  })
  check(@Body() dto: AuthorizationCheckDto, @Req() req: Request & { requestId?: string }) {
    return this.checkService.check(dto, req.requestId);
  }
}

import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthGuard } from './auth.guard';
import { ErrorResponseDto } from './dto/auth-responses.dto';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

// El orden importa: primero la identidad (401) y despues el permiso (403).
export const AdminOnly = () =>
  applyDecorators(
    Roles('ADMIN'),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Token ausente, invalido o vencido',
    }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: 'El usuario no tiene el rol ADMIN vigente',
    }),
  );

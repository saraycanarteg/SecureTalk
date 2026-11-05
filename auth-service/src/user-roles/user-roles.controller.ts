import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../auth/dto/auth-responses.dto';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRoleResponseDto } from './dto/user-role-response.dto';
import { UserRolesService } from './user-roles.service';

@ApiTags('user-roles')
@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Post()
  @ApiOperation({ summary: 'Asigna un rol a un usuario' })
  @ApiCreatedResponse({ type: UserRoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo invalido' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'El usuario o el rol no existen' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'El usuario ya tiene ese rol' })
  create(@Body() dto: CreateUserRoleDto) {
    return this.userRolesService.create(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retira un rol a un usuario' })
  @ApiNoContentResponse({ description: 'Asignacion eliminada' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Identificador invalido' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'La asignacion no existe' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userRolesService.remove(id);
  }
}

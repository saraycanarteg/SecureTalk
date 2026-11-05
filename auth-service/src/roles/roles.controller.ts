import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminOnly } from '../auth/admin-only.decorator';
import { ErrorResponseDto } from '../auth/dto/auth-responses.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleListResponseDto, RoleResponseDto } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@AdminOnly()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un rol' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo invalido' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'El rol ya existe' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los roles con paginacion' })
  @ApiOkResponse({ type: RoleListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Paginacion invalida' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualiza un rol',
    description: 'Con estado=false lo desactiva: los roles no se borran fisicamente.',
  })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo o identificador invalido' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'El rol no existe' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'El rol ya existe' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }
}

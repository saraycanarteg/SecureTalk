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
import { CedulaPipe } from '../common/pipes/cedula/cedula.pipe';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un usuario' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Cuerpo invalido, cedula invalida o contrasena fuera de la politica',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'El username, el email o la cedula ya existen',
  })
  create(@Body(CedulaPipe) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los usuarios con paginacion' })
  @ApiOkResponse({ type: UserListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Paginacion invalida' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualiza un usuario',
    description: 'Con estado=false lo desactiva: los usuarios no se borran fisicamente.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Cuerpo o identificador invalido' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'El usuario no existe' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'El username, el email o la cedula ya existen',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body(CedulaPipe) dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}

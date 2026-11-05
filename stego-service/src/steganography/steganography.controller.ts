import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AuthzGuard, RequireAction } from '../authz/authz.guard';
import { AnalysisResponseDto, ErrorResponseDto } from './dto/analysis-response.dto';
import { SteganographyService } from './steganography.service';

@ApiTags('steganography')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Token ausente, invalido o vencido' })
@ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH denego la operacion' })
@ApiServiceUnavailableResponse({
  type: ErrorResponseDto,
  description: 'No se obtuvo una decision verificable de AUTH; no se proceso nada',
})
@ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'Se supero el limite de peticiones' })
@Controller('steganography')
export class SteganographyController {
  constructor(private readonly steganographyService: SteganographyService) {}

  // Nest ejecuta los guards antes que los interceptores: el archivo no se recibe
  // hasta que el JWT y la autorizacion han sido aprobados.
  @Post('analyze')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, AuthzGuard)
  @RequireAction('steganography.analyze')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Analiza una imagen PNG o BMP en busca de datos ocultos por LSB',
    description:
      'Requiere ADMIN o ANALYST. Valida extension, tipo de contenido, firma real, tamaño y limites de ' +
      'procesamiento antes de analizar; un archivo rechazado no se guarda ni se registra. ' +
      'Politica: sospechoso pasa a cuarentena, sin_indicios no tiene accion, no_concluyente genera una ' +
      'advertencia y error se rechaza. El resultado es indicativo, no una prueba de esteganografia.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen .png o .bmp de hasta 10 MB y 16 megapixeles',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: AnalysisResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Falta el archivo, o esta vacio o danado' })
  @ApiPayloadTooLargeResponse({
    type: ErrorResponseDto,
    description: 'El archivo supera 10 MB o la imagen supera 16 megapixeles',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorResponseDto,
    description: 'La extension, el tipo de contenido o la firma no corresponden a un PNG o BMP',
  })
  analyze(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.steganographyService.analyze(file, {
      userId: req.user.sub,
      requestId: req.requestId,
    });
  }

  @Get('results/:id')
  @UseGuards(JwtAuthGuard, AuthzGuard)
  @RequireAction('steganography.results.read')
  @ApiOperation({
    summary: 'Consulta un analisis propio',
    description: 'Requiere ADMIN o ANALYST y que el analisis pertenezca al usuario del token.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'analysis_id devuelto por el analisis' })
  @ApiOkResponse({ type: AnalysisResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'AUTH denego la operacion o el analisis pertenece a otro usuario',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Identificador invalido' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'El analisis no existe' })
  getResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.steganographyService.getResult(id, {
      userId: req.user.sub,
      requestId: req.requestId,
    });
  }
}

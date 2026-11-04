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
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
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
  @ApiOperation({ summary: 'Recibe una imagen y registra su analisis' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: AnalysisResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Falta el archivo' })
  @ApiPayloadTooLargeResponse({ type: ErrorResponseDto, description: 'El archivo supera 10 MB' })
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
  @ApiOperation({ summary: 'Consulta un analisis propio' })
  @ApiOkResponse({ type: AnalysisResponseDto })
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

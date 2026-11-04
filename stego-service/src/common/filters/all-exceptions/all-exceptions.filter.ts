import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // El detalle queda en el log del servidor y nunca llega al cliente.
      this.logger.error(
        `[${req.requestId}] ${req.method} ${req.path} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (res.headersSent) {
      return;
    }

    res.status(statusCode).json({
      statusCode,
      message:
        statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? INTERNAL_ERROR_MESSAGE
          : this.clientMessage(exception),
      requestId: req.requestId,
    });
  }

  private clientMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return INTERNAL_ERROR_MESSAGE;
    }
    const response = exception.getResponse();
    return typeof response === 'string'
      ? response
      : ((response as { message?: string | string[] }).message ?? exception.message);
  }
}

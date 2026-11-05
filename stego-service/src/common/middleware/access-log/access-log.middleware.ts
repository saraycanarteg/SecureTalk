import { Injectable, Logger, NestMiddleware } from '@nestjs/common';

const HEALTH_PATH = '/health';

// Registra cada peticion al terminar, incluidas las que se cortan antes de llegar al servicio,
// como un archivo que supera el tamaño maximo. Usa req.path porque la cadena de consulta
// puede traer datos del cliente, y nunca registra cabeceras ni el cuerpo.
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AccessLogMiddleware.name);

  use(req: any, res: any, next: () => void) {
    const startedAt = Date.now();

    res.on('finish', () => {
      // El healthcheck de Docker llenaria la bitacora sin aportar trazabilidad.
      if (req.path === HEALTH_PATH) {
        return;
      }
      this.logger.log(
        `acceso metodo=${req.method} ruta=${req.path} estado=${res.statusCode} userId=${req.user?.sub ?? 'anonimo'} ip=${req.ip} requestId=${req.requestId} ms=${Date.now() - startedAt}`,
      );
    });
    next();
  }
}

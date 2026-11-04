import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';

export const REQUEST_ID_HEADER = 'x-request-id';

// Limita el valor recibido del cliente para evitar inyeccion en los logs.
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const received = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof received === 'string' && VALID_REQUEST_ID.test(received)
        ? received
        : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}

import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const run = (exception: unknown) => {
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'req-1', method: 'GET', path: '/x' }),
        getResponse: () => res,
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(exception, host);
    return res;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no expone detalles de un error inesperado', () => {
    const res = run(new Error('password authentication failed for user "x"'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
      requestId: 'req-1',
    });
  });

  it('conserva el mensaje de una excepcion HTTP de cliente', () => {
    const res = run(new BadRequestException(['campo invalido']));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['campo invalido'],
      requestId: 'req-1',
    });
  });
});

import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const run = (received?: string) => {
    const req: any = { headers: { [REQUEST_ID_HEADER]: received } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    new RequestIdMiddleware().use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    return req.requestId as string;
  };

  it('conserva un identificador valido', () => {
    expect(run('abc12345-valido')).toBe('abc12345-valido');
  });

  it('genera uno nuevo si falta', () => {
    expect(run()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('descarta un valor que podria inyectar lineas en los logs', () => {
    expect(run('malicioso\nlinea-falsa')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

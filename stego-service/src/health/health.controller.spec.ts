import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde ok cuando la base de datos contesta', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const controller = new HealthController(dataSource as unknown as DataSource);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      service: 'stego-service',
    });
  });

  it('responde 503 sin detalles cuando la base de datos falla', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('db interna')) };
    const controller = new HealthController(dataSource as unknown as DataSource);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

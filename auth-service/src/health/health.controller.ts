import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio y su conexion a la base de datos' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde' })
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok', service: 'auth-service' };
  }
}

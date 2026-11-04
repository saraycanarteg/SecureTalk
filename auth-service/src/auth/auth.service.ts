import { randomBytes } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { hashPassword, verifyPassword } from '../common/security/password-hash';
import { User } from '../users/entities/user.entity';
import { LoginResponseDto, ProfileResponseDto } from './dto/auth-responses.dto';
import { LoginDto } from './dto/login.dto';
import { hashIdentifier, LoginAttemptsService } from './login-attempts.service';
import { TokenService } from './token.service';

export interface RequestContext {
  ip?: string;
  requestId?: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: string;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly attempts: LoginAttemptsService,
    private readonly tokens: TokenService,
  ) {}

  // Con un usuario inexistente se verifica contra este hash para que el tiempo
  // de respuesta no revele si la cuenta existe.
  async onModuleInit() {
    this.dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  }

  async login(dto: LoginDto, context: RequestContext): Promise<LoginResponseDto> {
    const identifierHash = hashIdentifier(dto.username);
    const subject = `identificador=${identifierHash.slice(0, 12)}`;

    if (!(await this.attempts.consume(identifierHash))) {
      this.logFailure('bloqueado', subject, context);
      throw new HttpException(
        'Demasiados intentos. Intenta de nuevo mas tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username', { username: dto.username })
      .getOne();

    const validPassword = await verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      dto.password,
    );

    if (!user || !validPassword || !user.estado) {
      const reason = !user
        ? 'usuario_inexistente'
        : !validPassword
          ? 'contrasena_invalida'
          : 'usuario_inactivo';
      this.logFailure(reason, user ? `userId=${user.id}` : subject, context);
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.attempts.reset(identifierHash);
    const accessToken = await this.tokens.sign(user.id);
    this.logger.log(
      `login_exitoso userId=${user.id} ip=${context.ip} requestId=${context.requestId}`,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.expiresInSeconds,
    };
  }

  // Revisa la BD en cada consulta: un usuario desactivado pierde el acceso aunque su JWT siga vigente.
  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.users.findOneBy({ id: userId, estado: true });
    if (!user) {
      throw new UnauthorizedException('No autenticado');
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      nombres: user.nombres,
      apellidos: user.apellidos,
    };
  }

  private logFailure(reason: string, subject: string, context: RequestContext) {
    this.logger.warn(
      `login_fallido motivo=${reason} ${subject} ip=${context.ip} requestId=${context.requestId}`,
    );
  }
}

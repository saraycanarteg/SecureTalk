import { hashPassword } from '../../common/security/password-hash.js';
import { seedEnvSchema } from '../../config/env.schema.js';
import { Role } from '../../roles/entities/role.entity.js';
import { UserRole } from '../../user-roles/entities/user-role.entity.js';
import { User } from '../../users/entities/user.entity.js';
import dataSource from '../data-source.js';

const ROLES = [
  { rol: 'ADMIN', description: 'Operaciones administrativas de usuarios y roles' },
  { rol: 'ANALYST', description: 'Ejecuta analisis y consulta sus resultados autorizados' },
  { rol: 'USER', description: 'Accede a su perfil y a las operaciones habilitadas' },
];

// Idempotente: se puede repetir sin duplicar datos ni cambiar la contrasena de un ADMIN existente.
async function seed(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(`Variables de seed invalidas: ${fields.join(', ')}`);
  }
  const env = parsed.data;

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      await manager.upsert(Role, ROLES, { conflictPaths: ['rol'] });
      const adminRole = await manager.findOneByOrFail(Role, { rol: 'ADMIN' });

      let admin = await manager.findOne(User, {
        where: [
          { username: env.SEED_ADMIN_USERNAME },
          { email: env.SEED_ADMIN_EMAIL },
        ],
        withDeleted: true,
      });

      if (!admin) {
        admin = await manager.save(
          manager.create(User, {
            cedula: env.SEED_ADMIN_CEDULA,
            nombres: env.SEED_ADMIN_NOMBRES,
            apellidos: env.SEED_ADMIN_APELLIDOS,
            fechaNacimiento: env.SEED_ADMIN_FECHA_NACIMIENTO,
            username: env.SEED_ADMIN_USERNAME,
            email: env.SEED_ADMIN_EMAIL,
            passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
          }),
        );
      }

      await manager.upsert(
        UserRole,
        { userId: admin.id, roleId: adminRole.id },
        { conflictPaths: ['userId', 'roleId'], skipUpdateIfNoValuesChanged: true },
      );

      console.log(`Seed completado: roles base y ADMIN "${admin.username}".`);
    });
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: Error) => {
  console.error(`Seed fallido: ${error.message}`);
  process.exit(1);
});

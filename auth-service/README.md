# auth-service

Microservicio de autenticación y autorización de SecureTalk: usuarios, roles, asignaciones N:M, JWT firmados con EdDSA y decisiones RBAC con los roles vigentes en la base de datos.

Para levantarlo junto con STEGO usando Docker, sigue el [README principal](../README.md). Esta guía sirve para ejecutarlo solo.

## Ejecutarlo fuera de Docker

Requiere Node.js y un PostgreSQL accesible.

```bash
# Desde la raíz del repositorio: llaves de los JWT
node scripts/generate-jwt-keys.mjs

cd auth-service
cp .env.example .env   # cambiar los valores de ejemplo
npm ci
npm run build
npm run migration:run
npm run seed           # roles base y usuario ADMIN inicial
npm run start:prod
```

El servicio escucha en `http://localhost:3001`. Con `NODE_ENV` distinto de `production`, Swagger está en `http://localhost:3001/api/docs`.

El puerto HTTPS interno solo se abre si se configuran `INTERNAL_TLS_CERT_PATH` e `INTERNAL_TLS_KEY_PATH`, y es obligatorio con `NODE_ENV=production`.

## Pruebas

Las pruebas e2e usan una base de datos desechable y la borran al empezar:

```bash
# Desde la raíz del repositorio
docker compose -f docker-compose.test.yml up -d --wait postgres-test

cd auth-service
npm test            # unitarias
npm run test:e2e    # de extremo a extremo
npm run lint
```

## Documentación

- [Autenticación JWT y RBAC](../docs/autenticacion-rbac.md)
- [Modelo de datos](../docs/modelo-datos.md)
- [Matriz de roles y permisos](../docs/matriz-roles-permisos.md)
- [Contrato con STEGO](../docs/contrato-auth-stego.md)

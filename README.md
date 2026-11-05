# SecureTalk: Backend V1

Backend de una aplicación de salas de chat seguras, formado por dos microservicios independientes:

- **`auth-service`:** usuarios, roles, asignaciones N:M, JWT y decisiones de autorización RBAC.
- **`stego-service`:** validación y análisis de imágenes, siempre después de comprobar la autorización vigente en AUTH.

Cada servicio tiene su propio proceso, su configuración y su base de datos. El acuerdo entre ambos está en [docs/contrato-auth-stego.md](docs/contrato-auth-stego.md).

La arquitectura y los límites de confianza están en [docs/arquitectura.md](docs/arquitectura.md).

Cada servicio tiene su guía: [auth-service](auth-service/README.md) y [stego-service](stego-service/README.md).

## Puesta en marcha

Requisitos: Docker con Docker Compose y Node.js.

```bash
# 1. Configuración (cambiar los valores de ejemplo)
cp .env.example .env
cp auth-service/.env.example auth-service/.env
cp stego-service/.env.example stego-service/.env
# STEGO_SERVICE_KEY debe tener el mismo valor en ambos servicios y al menos 32 caracteres.

# 2. Llaves Ed25519 de los JWT y certificado del canal interno entre servicios
node scripts/generate-jwt-keys.mjs
node scripts/generate-internal-cert.mjs

# 3. Levantar los servicios
docker compose up -d --build
```

Antes de usar la API, prepara las bases de datos de ambos servicios. El seed crea los roles base y el usuario ADMIN inicial:

```bash
docker compose exec auth-service npm run migration:run
docker compose exec auth-service npm run seed
docker compose exec stego-service npm run migration:run
```

Con `NODE_ENV` distinto de `production`, Swagger de AUTH está en `http://localhost:3001/api/docs`.

Las especificaciones exportadas están en [docs/openapi/auth-service.json](docs/openapi/auth-service.json) y [docs/openapi/stego-service.json](docs/openapi/stego-service.json). Para volver a exportarlas, con los servicios en marcha y `NODE_ENV` distinto de `production`, usa `http://localhost:3001/api/docs-json` y `http://localhost:3002/api/docs-json`.

## Pruebas de AUTH

```bash
docker compose -f docker-compose.test.yml up -d --wait postgres-test
cd auth-service
npm ci
npm test
npm run test:e2e
```

## Estado de los endpoints de AUTH

| Método | Ruta | Acceso requerido | Estado |
|---|---|---|---|
| POST | `/api/auth/login` | Público, con límite de intentos | Implementado |
| GET | `/api/auth/profile` | Usuario autenticado | Implementado |
| POST | `/api/auth/logout` | Sesión autenticada | Implementado |
| POST, GET | `/api/users` | ADMIN | Implementado |
| PATCH | `/api/users/:id` | ADMIN | Implementado |
| POST, GET | `/api/roles` | ADMIN | Implementado |
| PATCH | `/api/roles/:id` | ADMIN | Implementado |
| POST | `/api/user-roles` | ADMIN | Implementado |
| DELETE | `/api/user-roles/:id` | ADMIN | Implementado |
| POST | `/internal/authorization/check` | Solo STEGO, con `X-Service-Key` | Implementado |

## Documentación de AUTH

- [Autenticación JWT y RBAC](docs/autenticacion-rbac.md)
- [Modelo de datos y diagrama entidad-relación](docs/modelo-datos.md)
- [Matriz de roles y permisos](docs/matriz-roles-permisos.md)

## Matriz de riesgos

La matriz de activos, amenazas, vulnerabilidades, riesgos y controles está en [docs/riesgos.md](docs/riesgos.md).

## Análisis esteganográfico

El método, sus parámetros, resultados y limitaciones están en [docs/estegoanalisis.md](docs/estegoanalisis.md).

## Evidencias

Los resultados de las pruebas y las bitácoras depuradas están en [docs/evidencias/](docs/evidencias/README.md).

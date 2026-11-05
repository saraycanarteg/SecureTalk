# SecureTalk: Backend V1

Backend de una aplicación de salas de chat seguras, formado por dos microservicios independientes:

- **`auth-service`:** usuarios, roles, asignaciones N:M, JWT y decisiones de autorización RBAC.
- **`stego-service`:** validación y análisis de imágenes, siempre después de comprobar la autorización vigente en AUTH.

Cada servicio tiene su propio proceso, su configuración y su base de datos. El acuerdo entre ambos está en [docs/contrato-auth-stego.md](docs/contrato-auth-stego.md).

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

La matriz de roles y permisos está en [docs/matriz-roles-permisos.md](docs/matriz-roles-permisos.md).

## Matriz de riesgos

La matriz de activos, amenazas, vulnerabilidades, riesgos y controles se está elaborando en una hoja de cálculo aparte.

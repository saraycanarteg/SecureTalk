# stego-service

Microservicio de detección de esteganografía de SecureTalk: valida imágenes PNG y BMP, ejecuta un análisis estadístico del bit menos significativo y registra el resultado. Cada operación verifica el JWT con la llave pública y pide a AUTH una decisión de autorización vigente.

Para levantarlo junto con AUTH usando Docker, sigue el [README principal](../README.md). Esta guía sirve para ejecutarlo solo.

## Endpoints

| Método | Ruta | Acceso requerido |
|---|---|---|
| GET | `/health` | Público |
| POST | `/api/steganography/analyze` | ADMIN o ANALYST |
| GET | `/api/steganography/results/:id` | RBAC y propiedad del recurso |

`analyze` recibe `multipart/form-data` con el campo `file`: una imagen `.png` o `.bmp` de hasta 10 MB y 16 megapíxeles. La clasificación determina la política aplicada:

| Clasificación | Política |
|---|---|
| `sin_indicios` | `ninguna` |
| `no_concluyente` | `advertencia` |
| `sospechoso` | `cuarentena` |
| `error` | `rechazo` |

Un resultado `sospechoso` es un indicio, no una prueba.

## Ejecutarlo fuera de Docker

Requiere Node.js, un PostgreSQL accesible, AUTH en marcha y la llave pública de los JWT.

```bash
cd stego-service
cp .env.example .env   # cambiar los valores de ejemplo
npm ci
npm run build
npm run migration:run
npm run start:prod
```

El servicio escucha en `http://localhost:3002`. Con `NODE_ENV` distinto de `production`, Swagger está en `http://localhost:3002/api/docs`.

## Configuración importante

- **`STEGO_SERVICE_KEY`:** debe ser igual a la de AUTH y tener al menos 32 caracteres.
- **`AUTH_BASE_URL`:** con `NODE_ENV=production` debe usar `https`. Fuera de Docker, `NODE_EXTRA_CA_CERTS` indica el certificado de AUTH.
- **`AUTHZ_MODE`:** usa `real`. Con `mock`, cualquier JWT válido puede operar sin consultar a AUTH; solo sirve en desarrollo y el servicio no arranca con él en producción.
- **`UPLOAD_DIR` y `QUARANTINE_DIR`:** deben estar en el mismo sistema de archivos, porque la cuarentena mueve el archivo sin copiarlo.

STEGO nunca recibe la llave privada de los JWT ni accede a la base de datos de AUTH. Si AUTH no responde, las operaciones dan 503 sin procesar el archivo.

## Pruebas

Las pruebas e2e usan una base de datos desechable y la borran al empezar:

```bash
# Desde la raíz del repositorio
docker compose -f docker-compose.test.yml up -d --wait stego-db-test

cd stego-service
npm test            # unitarias
npm run test:e2e    # de extremo a extremo
npm run lint
```

Las muestras de `samples/` que superan los 10 MB no se versionan. Se generan con `node scripts/generate-stego-samples.mjs` desde la raíz del repositorio.

## Documentación

- [Análisis esteganográfico](../docs/estegoanalisis.md)
- [Contrato con AUTH](../docs/contrato-auth-stego.md)
- [Arquitectura y límites de confianza](../docs/arquitectura.md)
- [Especificación OpenAPI](../docs/openapi/stego-service.json)

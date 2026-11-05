# Contrato AUTH - STEGO

Acuerdo entre los dos microservicios, implementado en ambos.

## Flujo

1. El cliente inicia sesión en AUTH (`POST /api/auth/login`) y recibe un JWT.
2. El cliente llama a STEGO con `Authorization: Bearer <JWT>`.
3. STEGO verifica el JWT localmente con la llave pública. Si falla, responde 401.
4. STEGO pide a AUTH una decisión para esa acción. Si no obtiene una decisión verificable, responde 503. Si `allowed=false`, responde 403.
5. Solo con `allowed=true` STEGO recibe el archivo o consulta el resultado.

STEGO repite los pasos 3 y 4 en **cada** operación: una decisión anterior nunca se reutiliza.

## JWT

| Campo | Valor |
|---|---|
| Algoritmo (`alg`) | `EdDSA` (Ed25519). Cualquier otro, incluido `none`, se rechaza |
| `sub` | UUID del usuario |
| `iss` | Igual a `JWT_ISSUER` en ambos servicios (por defecto `securetalk-auth`) |
| `aud` | Igual a `JWT_AUDIENCE` en ambos servicios (por defecto `securetalk-api`) |
| `iat`, `exp` | Obligatorios. Vigencia máxima: 15 minutos |
| `jti` | Identificador único del token. Obligatorio |

La llave privada existe solo en AUTH. STEGO recibe únicamente la llave pública (`JWT_PUBLIC_KEY_PATH`). El JWT no lleva roles: los permisos siempre se resuelven en AUTH.

## Autorización: `POST {AUTH_BASE_URL}/internal/authorization/check`

La ruta no lleva el prefijo `/api`.

### Autenticación de STEGO ante AUTH

Cabecera `X-Service-Key: <STEGO_SERVICE_KEY>`. El valor es un secreto compartido de al menos 32 caracteres, configurado en ambos servicios. AUTH debe:

- Compararlo en tiempo constante.
- Rechazar con 401 una clave ausente o incorrecta.
- No registrarlo nunca en los logs.

### Petición

```json
{
  "subject_token": "<JWT_DEL_USUARIO>",
  "action": "steganography.analyze",
  "resource_id": null
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `subject_token` | string | JWT recibido del cliente. AUTH debe validarlo de nuevo |
| `action` | string | Una de las acciones de la tabla siguiente |
| `resource_id` | string o null | Identificador del análisis en la lectura de resultados; `null` en `analyze`. Su formato no está validado todavía cuando llega a AUTH |

### Acciones

| Acción | Endpoint de STEGO | Roles previstos |
|---|---|---|
| `steganography.analyze` | `POST /api/steganography/analyze` | ADMIN o ANALYST |
| `steganography.results.read` | `GET /api/steganography/results/:id` | ADMIN o ANALYST |

AUTH decide por los roles y el estado **vigentes en la base de datos**, sin confiar en datos del token más allá de su identidad. La propiedad del análisis la comprueba STEGO, porque AUTH no conoce ese dato.

### Respuesta

Siempre HTTP **200** cuando AUTH pudo decidir, también al denegar:

```json
{
  "subject_id": "<UUID_USUARIO>",
  "action": "steganography.analyze",
  "allowed": true,
  "reason": "active_role_grants_permission"
}
```

| Campo | Regla |
|---|---|
| `subject_id` | Debe ser igual al `sub` del JWT |
| `action` | Debe ser igual a la acción pedida |
| `allowed` | Booleano JSON. Los valores `"true"` o `1` no son válidos |
| `reason` | Texto de hasta 200 caracteres, sin datos sensibles |

Con un `subject_token` inválido o un usuario inactivo, AUTH debe responder 200 con `allowed=false` y el `subject_id` que corresponda. Si no puede determinarlo, debe responder con un error: STEGO lo tratará como falta de decisión. AUTH usa 400 en ese caso, y los valores de `reason` están en [matriz-roles-permisos.md](matriz-roles-permisos.md).

## Comportamiento ante fallos

STEGO deniega por defecto. En estos casos no recibe el archivo, no crea registros ni devuelve datos:

| Situación | Respuesta de STEGO |
|---|---|
| Token ausente, manipulado, vencido, con otro `alg`, `iss` o `aud` | 401 |
| AUTH responde `allowed=false` | 403 |
| AUTH caído o sin responder en `AUTH_TIMEOUT_MS` (3000 ms por defecto) | 503 |
| AUTH responde con un código distinto de 200, incluidas redirecciones | 503 |
| Cuerpo que no es JSON, sin los campos esperados o con tipos incorrectos | 503 |
| `subject_id` o `action` no coinciden con lo pedido | 503 |

## Endpoints de STEGO

| Situación | `POST /analyze` | `GET /results/:id` |
|---|---|---|
| Éxito | 201 | 200 |
| Falta el archivo o el identificador no es UUID | 400 | 400 |
| Análisis de otro usuario | No aplica | 403 |
| El análisis no existe | No aplica | 404 |
| Archivo de más de 10 MB | 413 | No aplica |

La respuesta de éxito sigue el Anexo C:

```json
{
  "analysis_id": "<UUID_ANALISIS>",
  "user_id": "<UUID_USUARIO>",
  "filename": "muestra.png",
  "sha256": "<HASH_DEL_ARCHIVO>",
  "technique": "pendiente_implementacion",
  "status": "no_concluyente",
  "indicators": {},
  "action": "advertencia",
  "limitations": "..."
}
```

## Modo de desarrollo

Con `AUTHZ_MODE=mock`, STEGO permite la operación si el JWT es válido, sin consultar a AUTH, y avisa en el log al arrancar. Con `NODE_ENV=production` el servicio se niega a arrancar en este modo.

## Pendiente

- **Canal seguro:** la sección 2.4 lo exige, pero hoy la llamada usa HTTP dentro de la red de Docker. La clave de servicio y el JWT viajan sin cifrar por esa red hasta que se configure TLS o mTLS.

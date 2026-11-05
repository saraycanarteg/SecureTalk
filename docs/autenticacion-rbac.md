# Autenticación JWT y autorización RBAC

AUTH separa dos preguntas: quién es el usuario (autenticación) y qué puede hacer ahora (autorización). Un JWT válido solo responde la primera. La segunda se responde siempre con los datos actuales de la base de datos.

## Inicio de sesión

`POST /api/auth/login` compara la contraseña con el hash guardado y devuelve un JWT.

- **Almacenamiento:** Argon2id con 19 MiB de memoria, 2 iteraciones y paralelismo 1. `password_hash` nunca se devuelve en una respuesta.
- **Política de contraseñas:** mínimo 8 caracteres y al menos 3 de 4 tipos: minúscula, mayúscula, dígito y símbolo.
- **Límite de intentos:** 5 fallos en 15 minutos por identificador. El contador se reserva antes de verificar, en una sola sentencia atómica, para que varias peticiones simultáneas no puedan superarlo.
- **Respuesta uniforme:** contraseña incorrecta, usuario inexistente y usuario inactivo reciben el mismo 401. Con un usuario inexistente también se verifica un hash, para que el tiempo de respuesta no revele si la cuenta existe.

## El JWT

| Control | Decisión |
|---|---|
| Algoritmo | Solo `EdDSA` (Ed25519). Cualquier otro, incluido `none`, se rechaza antes de verificar la firma |
| Llaves | La privada existe solo en AUTH. STEGO recibe únicamente la pública. Ambas se generan con `node scripts/generate-jwt-keys.mjs` y `keys/` está ignorada por git |
| `sub` | UUID del usuario |
| `iss`, `aud` | Se comprueban contra `JWT_ISSUER` y `JWT_AUDIENCE` |
| `iat`, `exp` | Obligatorios. La vigencia máxima es de 15 minutos |
| `jti` | Identificador único del token. Permite revocarlo |
| Roles | **No van en el token** |

El JWT no lleva roles a propósito: un token emitido antes de retirar un permiso seguiría declarando ese permiso hasta vencer. Aunque alguien firmara un token con roles, AUTH los ignora.

## Logout y revocación

`POST /api/auth/logout` guarda el `jti` del token en `revoked_tokens`, y `AuthGuard` rechaza con 401 cualquier token revocado. Solo se revoca el token usado, así que las otras sesiones del usuario siguen activas. La tabla nunca guarda el JWT, y cada logout elimina las revocaciones de tokens ya vencidos.

## Comprobación de roles vigentes

`AuthorizationService.getActiveRoles` es la única fuente de permisos. Consulta `user_roles`, `users` y `roles` en cada petición, y solo cuenta usuarios y roles activos y sin borrar. No hay caché, así que el efecto de un cambio es inmediato:

| Cambio | Siguiente petición con el mismo JWT |
|---|---|
| Se retira un rol | Pierde el permiso |
| Se asigna un rol | Gana el permiso |
| Se desactiva el rol | Nadie conserva ese permiso por él |
| Se desactiva al usuario | Pierde todos los permisos |
| Logout | Token rechazado |

Esto se aplica por dos caminos que usan la misma consulta:

1. **Rutas administrativas de AUTH:** `AuthGuard` valida el token (401) y `RolesGuard` comprueba `@Roles(...)` (403). Una ruta con `RolesGuard` que olvide declarar `@Roles` se deniega.
2. **Operaciones de STEGO:** STEGO verifica el JWT con la llave pública y pide una decisión a `POST /internal/authorization/check` en cada operación. Sin una decisión verificable, responde 503 sin procesar el archivo.

Los permisos por rol están en [matriz-roles-permisos.md](matriz-roles-permisos.md) y el acuerdo entre servicios en [contrato-auth-stego.md](contrato-auth-stego.md).

## Canal entre servicios

STEGO se identifica con `X-Service-Key`, que AUTH compara en tiempo constante. La llamada va por HTTPS a un puerto que no se publica fuera de la red de Docker, y STEGO verifica el certificado de AUTH. El certificado se genera con `node scripts/generate-internal-cert.mjs`.

Con `NODE_ENV=production`, AUTH no arranca sin certificado y rechaza el endpoint interno por HTTP. Fuera de producción lo sigue aceptando por HTTP en su puerto público, para las pruebas manuales con Postman.

## Registros

Los eventos de login, logout, acceso, cambios administrativos y decisiones de autorización se registran con el identificador del usuario y de la petición. Nunca incluyen contraseñas, hashes, JWT completos ni la clave de servicio.

## Limitaciones

- **Tokens no revocados:** un token robado sirve hasta que vence, salvo que su dueño cierre esa sesión o pierda el permiso. La vigencia de 15 minutos limita ese tiempo.
- **Sin autenticación mutua:** AUTH verifica a STEGO con la clave de servicio, no con un certificado de cliente.
- **Bloqueo por cuenta:** cinco fallos bloquean la cuenta durante 15 minutos, incluso a su dueño legítimo.
- **Quedarse sin administradores:** nada impide desactivar el rol `ADMIN` o retirárselo al último administrador. El seed puede restaurar la asignación del ADMIN inicial, pero no reactiva un rol ni un usuario desactivados.

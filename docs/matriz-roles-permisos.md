# Matriz de roles y permisos

Los permisos se asignan por rol, nunca por usuario. Un usuario puede acumular varios roles y recibe la suma de sus permisos. AUTH resuelve los roles en cada petición desde la base de datos, así que el JWT no lleva roles y un cambio tiene efecto en la siguiente petición.

## Operaciones

| Operación | Sin sesión | USER | ANALYST | ADMIN |
|---|---|---|---|---|
| `POST /api/auth/login` | Sí, con límite de intentos | Sí | Sí | Sí |
| `GET /api/auth/profile` | No | Sí | Sí | Sí |
| `POST /api/auth/logout` | No | Sí | Sí | Sí |
| `POST`, `GET /api/users` | No | No | No | Sí |
| `PATCH /api/users/:id` | No | No | No | Sí |
| `POST`, `GET /api/roles` | No | No | No | Sí |
| `PATCH /api/roles/:id` | No | No | No | Sí |
| `POST /api/user-roles` | No | No | No | Sí |
| `DELETE /api/user-roles/:id` | No | No | No | Sí |
| `POST /api/steganography/analyze` | No | No | Sí | Sí |
| `GET /api/steganography/results/:id` | No | No | Sí, según la propiedad del análisis | Sí, según la propiedad del análisis |

Sin sesión, las rutas protegidas responden 401. Con sesión pero sin el permiso, responden 403.

La propiedad del análisis la comprueba STEGO, porque AUTH no conoce ese dato. `POST /internal/authorization/check` no depende de un rol: solo la puede usar STEGO con su clave de servicio.

## Acciones que autoriza AUTH para STEGO

La tabla está en [action-permissions.ts](../auth-service/src/internal-authorization/action-permissions.ts). Cualquier acción que no aparezca se deniega.

| Acción | Roles permitidos |
|---|---|
| `steganography.analyze` | ADMIN, ANALYST |
| `steganography.results.read` | ADMIN, ANALYST |

## Cómo decide AUTH

Solo cuentan los usuarios y roles activos y sin borrar, y sus asignaciones actuales en `user_roles`. `POST /internal/authorization/check` comprueba en este orden y se detiene en la primera condición que se cumple:

| Situación | HTTP | `allowed` | `reason` |
|---|---|---|---|
| Clave de servicio ausente o incorrecta | 401 | No aplica | No aplica |
| Token del que no se puede determinar el usuario, como una firma inválida | 400 | No aplica | No aplica |
| Token vencido con firma válida | 200 | `false` | `token_expired` |
| Token revocado por logout | 200 | `false` | `token_revoked` |
| Usuario inactivo, borrado o inexistente | 200 | `false` | `user_inactive` |
| Acción desconocida | 200 | `false` | `unknown_action` |
| Ningún rol vigente da el permiso | 200 | `false` | `no_active_role_grants_permission` |
| Un rol vigente da el permiso | 200 | `true` | `active_role_grants_permission` |

STEGO trata cualquier respuesta distinta de 200 como falta de decisión y responde 503.

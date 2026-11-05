# Matriz de riesgos

Activos, amenazas, vulnerabilidades, riesgos y controles del Backend V1. Las filas se revisan contra la implementación: un control solo aparece como aplicado si existe en el código y tiene una prueba o evidencia.

ISO/IEC 27001 e ISO/IEC 27034 se usan como referencia de principios. El proyecto no afirma certificación ni cumplimiento normativo integral.

## Escala

- **Probabilidad e impacto:** Baja, Media o Alta. Es una valoración cualitativa del equipo antes de aplicar los controles.
- **Riesgo:** resultado de combinar ambos.
- **Residual:** riesgo que queda con los controles actuales.

## Matriz

### Credenciales e identidades (AUTH)

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R01 | Robo de contraseñas si se filtra la base de datos | Guardar contraseñas en claro o con un hash débil | Media | Alta | Alto | Argon2id (19 MiB, 2 iteraciones); `password_hash` no se devuelve en las respuestas | `password-hash.spec.ts`, T02 | Bajo |
| R02 | Fuerza bruta contra el login | Intentos ilimitados | Alta | Alta | Alto | Máximo 5 fallos en 15 minutos por identificador, con reserva atómica; límite global de peticiones | `auth.e2e-spec.ts` | Bajo |
| R03 | Contraseñas fáciles de adivinar | Falta de política | Media | Media | Medio | Mínimo 8 caracteres y 3 de 4 tipos | `password-policy.spec.ts` | Bajo |

### Asignaciones N:M y RBAC (AUTH)

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R04 | Elevación de privilegios con roles enviados por el cliente o guardados en el JWT | Confiar en datos que el cliente controla | Media | Alta | Alto | El JWT no lleva roles; se resuelven desde la base de datos en cada petición | `rbac.e2e-spec.ts` | Bajo |
| R05 | Un permiso retirado sigue activo hasta que vence el JWT | Autorizar solo con el token | Alta | Alta | Alto | Decisión vigente de AUTH en cada operación de STEGO | T07 en [ensayo](evidencias/ensayo-demo.txt) | Bajo |
| R06 | Asignaciones duplicadas o huérfanas | Falta de integridad referencial | Media | Media | Medio | Claves foráneas y `UNIQUE(user_id, role_id)` | T05 y T06, `user-roles.e2e-spec.ts` | Bajo |

### JWT y claves

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R07 | Tokens falsificados o alterados, incluido `alg=none` | Aceptar cualquier algoritmo o no verificar los claims | Media | Alta | Alto | Solo EdDSA; se verifican firma, `iss`, `aud`, `exp`, `iat` y `jti` | T03, `stego.e2e-spec.ts` | Bajo |
| R08 | Fuga de la llave privada | Compartirla con STEGO o versionarla | Baja | Alta | Medio | Solo AUTH la monta; STEGO recibe la pública; `keys/` y `*.pem` están ignorados por git | Comprobado en el contenedor de STEGO | Bajo |
| R09 | Reutilización de un token robado | Vigencia larga | Media | Media | Medio | Vigencia máxima de 15 minutos y revocación por logout | `logout.e2e-spec.ts` | Medio: el token sirve hasta que vence si no se revoca |

### Comunicación AUTH-STEGO

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R10 | Suplantación de STEGO ante AUTH | Endpoint interno sin autenticar | Media | Alta | Alto | `X-Service-Key` de al menos 32 caracteres, comparada en tiempo constante | `internal-authorization.e2e-spec.ts` | Bajo |
| R11 | Procesar archivos sin una decisión válida | Permitir por defecto ante fallos | Media | Alta | Alto | Denegación por defecto: caída, timeout, redirección, otro código o respuesta inválida dan 503 sin recibir el archivo | T08, `stego.e2e-spec.ts` | Bajo |
| R12 | Interceptar el JWT o la clave de servicio dentro de la red | **Canal HTTP sin cifrar entre servicios** | Baja | Alta | Medio | Red de Docker separada; AUTH y STEGO publicados solo en `127.0.0.1`. **No hay TLS ni mTLS** | `docker-compose.yml` | **Medio. Pendiente: la sección 2.4 del enunciado exige un canal seguro** |

### Archivos e imágenes (STEGO)

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R13 | Subir un ejecutable o script disfrazado de imagen | Confiar en la extensión o en el tipo declarado | Alta | Alta | Alto | Se exige coincidencia de extensión, tipo de contenido y firma real; el archivo nunca se ejecuta | T10, `image-file.validator.spec.ts` | Bajo |
| R14 | Agotar la memoria con una bomba de descompresión | Descomprimir sin conocer el tamaño final | Media | Alta | Alto | Límite de 16 MP antes de descomprimir; salida limitada al tamaño exacto declarado; 10 MB por archivo | T10, `image-decoder.spec.ts` | Bajo |
| R15 | Archivos corruptos o manipulados que afecten el análisis | Procesar sin validar la estructura | Media | Media | Medio | Se valida la estructura, el CRC y los datos antes de analizar; un rechazo no deja archivo ni registro | T10 | Bajo |
| R16 | Archivo que oculta otro formato al final (políglota) | Aceptar datos tras el final de la imagen | Media | Media | Medio | Se rechaza con 400 lo que sigue a `IEND` o a los píxeles | T10 | Bajo: los metadatos PNG no se inspeccionan |
| R17 | Sobrescribir archivos del servidor con el nombre enviado | Usar el nombre del cliente como ruta | Media | Alta | Alto | Nombre aleatorio en disco; el nombre original se limpia y se guarda solo como dato | T10, `stego.e2e-spec.ts` | Bajo: una futura interfaz debe escapar `filename` al mostrarlo |
| R18 | Acceso público a un archivo sospechoso | Carpeta servida por HTTP o con permisos amplios | Baja | Alta | Medio | Carpeta aislada `0700`, archivo `0400` sin ejecución, sin rutas estáticas, `stored_path` no se expone | `quarantine.store.spec.ts`, comprobado en el contenedor | Bajo |
| R19 | Evadir el detector | Técnicas que no reemplazan LSB y cargas muy pequeñas | Alta | Media | Alto | Tres análisis (chi-cuadrado, pares de muestras y texto en claro), por canal y por porciones iniciales; limitaciones informadas en cada respuesta | [estegoanalisis.md](estegoanalisis.md) | **Medio: `steghide` no se detecta (0 de 27), medido y documentado** |
| R20 | Tomar un falso positivo como prueba | Interpretar el resultado como definitivo | Media | Media | Medio | `sospechoso` se presenta como indicio y `limitations` lo aclara; chi-cuadrado no basta por sí solo; el umbral sube en imágenes pequeñas | T09, [estegoanalisis.md](estegoanalisis.md) | Bajo: 0 de 72 imágenes tipo fotografía y 13 de 700 gráficos del sistema |
| R21 | Saturar el disco con la cuarentena | No hay purga automática | Media | Media | Medio | Requiere rol autorizado y está sujeto al límite de peticiones | Sin evidencia automatizada | **Medio: falta definir retención y purga** |

### Resultados y registros (STEGO)

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R22 | Consultar análisis de otro usuario | Autorizar sin comprobar la propiedad | Media | Media | Medio | STEGO compara el propietario además de pedir autorización a AUTH | T11 | Bajo |
| R23 | Exponer secretos en las bitácoras | Registrar cabeceras, tokens o archivos | Media | Alta | Alto | Eventos de campos fijos; sin JWT, claves, nombres de archivo, contenido ni cadena de consulta | T12, [bitácora](evidencias/bitacora-stego.log) | Bajo |
| R24 | Falsear las bitácoras con saltos de línea | Registrar texto del cliente | Baja | Media | Bajo | Identificador de petición validado; texto externo serializado con JSON | `request-id.middleware.spec.ts` | Bajo |
| R25 | No poder reconstruir lo ocurrido | Faltan eventos | Media | Media | Medio | Se registran accesos, decisiones de AUTH, análisis, rechazos y cuarentena | T12 | Medio: las bitácoras dependen de Docker y no se protegen contra alteración |
| R26 | Detalles internos en los errores | Devolver trazas al cliente | Media | Baja | Bajo | Filtro global: los errores 5xx dan un mensaje genérico | `all-exceptions.filter.spec.ts` | Bajo |

### Disponibilidad y errores encontrados con la colección de Postman

| ID | Amenaza | Vulnerabilidad | Prob. | Imp. | Riesgo | Controles aplicados | Evidencia | Residual |
|---|---|---|---|---|---|---|---|---|
| R27 | Dejar STEGO sin servicio para todos con un token válido | Las decisiones que STEGO pide a AUTH salen de una sola IP y cuentan contra el límite de 100 por minuto de AUTH | Media | Alta | Alto | Falla de forma segura: responde 503 y no procesa nada | [inundar-limite-auth.mjs](evidencias/inundar-limite-auth.mjs): tras 100 operaciones, 503 durante 85 s | **Alto: pendiente excluir el endpoint interno de ese límite** |
| R28 | Error interno con un cuerpo grande en una ruta pública | `auth-service` usa NestJS 12.2.0, que no traduce este error del analizador de JSON | Media | Baja | Bajo | Mensaje genérico, sin detalles | [coleccion-postman.txt](evidencias/coleccion-postman.txt): 500 en vez de 413 | **Bajo: pendiente; el enunciado pide 413** |
| R29 | Error interno con una paginación extrema | `page` no tiene máximo y el desplazamiento no cabe en `bigint` | Baja | Baja | Bajo | Solo ADMIN; mensaje genérico | [coleccion-postman.txt](evidencias/coleccion-postman.txt): 500 con `page=1e300` | **Bajo: pendiente** |
| R30 | Bloquear la cuenta de otra persona | El bloqueo es por cuenta: 5 intentos fallidos la bloquean incluso con la contraseña correcta | Alta | Media | Alto | El bloqueo dura 15 minutos y evita la fuerza bruta | [coleccion-postman.txt](evidencias/coleccion-postman.txt) | Medio: compromiso aceptado, también aplica a `admin` |

## Riesgos abiertos

| ID | Decisión pendiente |
|---|---|
| R12 | Agregar TLS o mTLS entre AUTH y STEGO, o justificar el riesgo como aceptado en la entrega |
| R19 | Se acepta para esta versión. Detectar técnicas que conservan las estadísticas requiere otros métodos |
| R21 | Definir retención de la cuarentena y un procedimiento de eliminación |
| R25 | Enviar las bitácoras a un destino fuera del contenedor |
| R27 | Excluir `/internal/authorization/check` del límite por IP en `auth-service`; ya está protegido por la clave de servicio |
| R28 | Actualizar NestJS en `auth-service` a la versión que usa `stego-service` |
| R29 | Agregar un máximo a `page` en `auth-service` |

## Relación con los enfoques y normas

| Enfoque o principio | Cómo se aplica | Riesgos |
|---|---|---|
| Zero Trust | El JWT no basta: cada operación pide una decisión vigente a AUTH y ninguna decisión se reutiliza | R04, R05, R07, R10, R11, R22 |
| Secure by Design | Denegación por defecto, mínimo privilegio, servicios y bases de datos separados, archivos tratados como no confiables | R08, R11, R13, R14, R17, R18 |
| Shift Left Security | Riesgos y pruebas de seguridad junto con el código; T03, T04, T07, T08, T10, T11 y T12 son automatizadas | R02, R07, R13, R15, R23 |
| ISO/IEC 27034 | Controles de seguridad de aplicación vinculados a un riesgo y a su evidencia de verificación | Toda la matriz |

| Control de ISO/IEC 27001:2022 (Anexo A) | Riesgos |
|---|---|
| 5.15 Control de acceso, 5.18 Derechos de acceso, 8.2 Accesos privilegiados, 8.3 Restricción de acceso a la información | R04, R05, R22 |
| 5.16 Gestión de identidades, 5.17 Información de autenticación, 8.5 Autenticación segura | R01, R02, R03, R07, R09, R10 |
| 8.7 Protección contra malware | R13, R15, R16, R18 |
| 8.12 Prevención de fuga de datos | R18, R23, R26 |
| 8.15 Registro, 8.16 Actividades de monitoreo | R23, R24, R25 |
| 8.20 Seguridad de redes, 8.22 Segregación de redes | R10, R11, R12 |
| 8.24 Uso de criptografía | R01, R07, R08, R12 |
| 8.6 Gestión de la capacidad | R14, R21, R27, R30 |
| 8.25 Ciclo de desarrollo seguro, 8.28 Codificación segura, 8.29 Pruebas de seguridad | R14, R15, R17, R19, R20, R28, R29 |

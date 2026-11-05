# Evidencias

Resultados de una ejecución real del Backend V1, obtenidos el 5 de noviembre de 2026 con los contenedores de `docker-compose.yml`, una base de datos vacía, secretos aleatorios y `AUTHZ_MODE=real`. La colección se ejecutó con la versión que está en `postman/`.

| Archivo | Contenido | Resultado |
|---|---|---|
| [pruebas-auth.txt](pruebas-auth.txt) | Pruebas unitarias y de extremo a extremo de AUTH | 53 unitarias y 187 e2e aprobadas |
| [pruebas-stego.txt](pruebas-stego.txt) | Pruebas unitarias y de extremo a extremo de STEGO | 130 unitarias y 69 e2e aprobadas, 2 omitidas |
| [coleccion-postman.txt](coleccion-postman.txt) | Colección de Postman ejecutada con Newman, sin la carpeta T08 Manual | 210 peticiones y 992 aserciones, sin fallos |
| [ensayo-demo.txt](ensayo-demo.txt) | Ensayo de la sustentación, de T01 a T12, producido por [ensayo-demo.mjs](ensayo-demo.mjs) | Todas las comprobaciones pasaron |
| [comprobaciones-contenedor.txt](comprobaciones-contenedor.txt) | Llaves que recibe cada servicio y permisos de las carpetas de STEGO | Ver el archivo |
| [bitacora-auth.log](bitacora-auth.log) y [bitacora-stego.log](bitacora-stego.log) | Bitácoras de la colección y del ensayo | Sin JWT completos ni secretos |

Las 2 pruebas omitidas comprueban permisos de archivos POSIX y se saltan al ejecutarse en Windows. Lo que verifican se comprobó dentro del contenedor, en `comprobaciones-contenedor.txt`.

## Qué se depuró

- **Bitácoras:** se quitaron los colores y los mensajes de arranque del framework. Los eventos quedan como se emitieron e incluyen identificadores de prueba, ya eliminados junto con esa base de datos.
- **Colección:** solo se conservan nombres, códigos de estado y número de aserciones, sin URL, cabeceras ni cuerpos.
- **Pruebas:** se quitaron las trazas de los errores que las pruebas provocan a propósito, porque traen rutas locales.

Todos los archivos se revisaron en busca de JWT completos, llaves privadas, contraseñas y claves de servicio de la corrida.

## Cómo repetirlas

```bash
# Pila completa: seguir la puesta en marcha del README principal, con AUTHZ_MODE=real
ADMIN_PASSWORD=<SEED_ADMIN_PASSWORD> node docs/evidencias/ensayo-demo.mjs

# Colección: los archivos de más de 10 MB se generan aparte
node scripts/generate-stego-samples.mjs
npx newman run postman/SecureTalk.postman_collection.json --working-dir . \
  --folder "00 Preparacion" # repetir --folder con cada carpeta, excepto T08 Manual

# Pruebas de cada servicio
docker compose -f docker-compose.test.yml up -d --wait
cd auth-service && npm ci && npm test && npm run test:e2e
cd ../stego-service && npm ci && npm test && npm run test:e2e
```

Las variables de la colección deben tener los valores de tu `.env`: las peticiones que la colección lanza desde sus scripts usan `authUrl` tal como está guardada en ella, no la de un entorno externo.

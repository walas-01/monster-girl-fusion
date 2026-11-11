# 001 — Base del backend

**Estado:** completada dentro del alcance aprobado; los tres lotes están terminados. Las pruebas de señales POSIX están añadidas pero omitidas en Windows y pendientes de ejecución real en POSIX. Linux ARM64 sigue sin verificarse. El usuario aprobó explícitamente `.env` en desarrollo y el lote 3 completo.

## Objetivo

Tener un backend mínimo, independiente y fácil de entender que podamos arrancar, consultar y probar antes de incorporar base de datos, autenticación o reglas del juego.

Al redactar esta especificación, `backend/` estaba vacío. El lote 1 añade la aplicación HTTP; la tarea 1 del lote 2 incorpora el punto de entrada ejecutable, configuración y cierre. Las referencias históricas de `project.md` no representan código disponible y no se reutilizarán como prueba de implementación.

## Alcance

- Servicio HTTP con Node.js, Express y TypeScript bajo `backend/`.
- Flujo documentado de instalación, desarrollo, comprobación de tipos, pruebas, compilación y arranque compilado.
- Puerto configurable mediante la variable de entorno `PORT`, con valor predeterminado `3000` para desarrollo.
- Carga opcional de `.env` local durante desarrollo mediante Node, sin dependencias adicionales; variables del entorno tienen prioridad. El arranque compilado de producción recibe su configuración del entorno, sin depender de ese archivo.
- Endpoint público `GET /api/health`.
- Respuestas JSON consistentes para rutas inexistentes y errores internos.
- Detección de configuración inválida y errores de arranque.
- Apagado ordenado con tiempo límite.
- Pruebas automatizadas que no requieran Google, servicios externos ni almacenamiento del jugador.

## Exclusiones

- SQLite, tablas, migraciones, catálogos y datos persistentes.
- Autenticación, sesiones, Google y autorización.
- Monstruos, huevos, enemigos, expediciones, recursos y mejoras.
- Frontend, proxy de desarrollo y configuración CORS para clientes externos.
- Dockerfiles, Compose, Caddy, recursos cloud o despliegue real.
- Capas genéricas, carpetas vacías y sistemas de configuración o logging para necesidades futuras.

## Comportamiento y requisitos

### Arranque y configuración

1. El backend puede ejecutarse independientemente del frontend.
2. En desarrollo, los cambios de código reinician el proceso sin requerir compilación manual.
3. La compilación produce JavaScript ejecutable con Node.js, sin cargadores de desarrollo en el arranque compilado.
4. `PORT`, cuando se proporciona, debe representar un entero entre 1 y 65535. Un valor vacío o inválido produce un error claro y un código de salida distinto de cero; no se sustituye silenciosamente por el predeterminado.
5. Si el puerto está ocupado, el proceso informa del fallo y termina sin quedar colgado ni anunciar que arrancó correctamente.
6. El log de arranque permite identificar el puerto utilizado y no expone variables de entorno completas ni secretos.
7. El comando de desarrollo carga `.env` del paquete si existe. Se ofrece `.env.example` sin secretos; el archivo local real queda fuera de Git. Si no existe, se mantienen las variables del entorno o el puerto predeterminado. Editar `.env` requiere reiniciar el desarrollo. El comando `start` no carga archivos locales.

### Health check

`GET /api/health` devuelve HTTP `200`, contenido JSON y exactamente:

```json
{ "status": "ok" }
```

Es una comprobación ligera de que el proceso HTTP responde, no una promesa sobre futuras dependencias. No requiere autenticación ni crea sesiones, abre bases de datos o hace peticiones externas. No expone versiones, rutas locales o configuración privada.

### Errores HTTP

- Una ruta inexistente devuelve HTTP `404` con el código `NOT_FOUND`.
- Un error interno no controlado durante una petición devuelve HTTP `500` con el código `INTERNAL_ERROR`.
- Los errores usan esta forma común, con mensajes técnicos en inglés:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found."
  }
}
```

- La respuesta de error interno usa el mensaje `Internal server error.` y no incluye stack traces, rutas locales ni detalles internos. El backend registra el error para diagnóstico sin volcar cuerpos de petición ni configuración privada.
- Las pruebas pueden provocar un fallo de forma aislada, pero no se añade un endpoint público para generar errores.

### Apagado

- Al recibir `SIGINT` o `SIGTERM`, el servidor deja de aceptar conexiones nuevas y permite finalizar las peticiones activas.
- El apagado tiene un límite de 10 segundos. Si no puede finalizar normalmente, termina las conexiones restantes y sale con un código distinto de cero.
- Recibir una segunda señal no inicia otro flujo de cierre ni provoca errores por recursos ya cerrados.
- En esta fase solo existe el servidor HTTP: no se crean mecanismos para cerrar bases de datos o sesiones inexistentes.

### Simplicidad y compatibilidad

- Mantener un recorrido corto y visible entre arranque, configuración y manejo HTTP. El health check no necesita tres archivos de rutas, controlador y servicio.
- No crear módulos para dominios todavía no implementados ni añadir dependencias sin una necesidad concreta.
- El plan elegirá versiones mantenidas y compatibles de Node.js, Express y TypeScript; no copiará versiones de la documentación histórica sin verificarlas.
- Mantener compatibilidad con el destino Linux ARM64 y un futuro proxy HTTPS, sin configurar infraestructura de producción ni confiar indiscriminadamente en cabeceras reenviadas.
- Documentar los comandos y las limitaciones reales de verificación, especialmente las señales POSIX cuando se trabaje desde Windows.

## Criterios de aceptación

- [x] Una instalación limpia permite ejecutar los comandos documentados desde `backend/`.
- [x] El servidor arranca en desarrollo y responde al health check con el contrato definido.
- [x] Cambiar `PORT` cambia el puerto; los valores inválidos fallan claramente.
- [x] Un puerto ocupado produce una salida de error sin dejar otro servidor activo.
- [x] Las rutas inexistentes devuelven el JSON `404` definido.
- [x] Una prueba aislada verifica el JSON `500` sin filtrar detalles internos ni crear una ruta de diagnóstico pública.
- [x] Las pruebas automatizadas pasan y cierran sus servidores, sin procesos colgados ni servicios externos.
- [x] La comprobación de tipos y la compilación pasan.
- [x] La versión compilada arranca con Node.js y responde al health check sin un cargador de desarrollo.
- [x] El cierre normal y el límite de apagado se prueban donde la plataforma lo permita; cualquier parte no verificada se documenta explícitamente.
- [x] No se crean bases de datos, sesiones, tablas, pantallas ni infraestructura de producción.
- [x] La documentación distingue los pasos ejecutados de la compatibilidad todavía no verificada en Linux ARM64.

Verificación de cierre: las pruebas directas de drenaje, límite y cierre repetido pasan en Windows. Las dos pruebas de entrega real de `SIGINT`/`SIGTERM` se omiten explícitamente allí; su ejecución en POSIX sigue pendiente. No se considera que terminar un proceso a la fuerza demuestre un cierre ordenado.

Verificación final del lote 3: en Windows x64 con Node 24.19.0/npm 11.17.0 pasan instalación limpia, tipos, compilación y 37 pruebas; dos pruebas POSIX se omiten explícitamente. En copias temporales aisladas se verificaron `npm start` con solo dependencias de ejecución, sin fuentes/compilador/`.env`, y el reinicio de desarrollo al editar y restaurar una fuente. No se modificaron las fuentes del usuario; todos los procesos temporales se cerraron. Los límites de plataforma y los comandos están documentados en `backend/README.md` y `plan.md`.

## Aprobaciones y cierre

- El usuario aprobó este alcance y sus contratos al avanzar por las tareas del plan, incluido el puerto predeterminado `3000` y el límite de cierre de 10 segundos.
- Las versiones y herramientas elegidas están registradas en `plan.md`, `backend/package.json` y su lockfile.
- La carga nativa de `.env` en desarrollo fue solicitada explícitamente por el usuario; el arranque de producción recibe variables del entorno.

La función queda cerrada dentro de su alcance, con los límites de verificación declarados. Persistencia, autenticación, juego y despliegue requieren trabajo y aprobaciones separados.

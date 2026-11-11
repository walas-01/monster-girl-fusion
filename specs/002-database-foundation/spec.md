# 002 — Base de datos y esquema inicial

**Estado:** borrador pendiente de aprobación. No autoriza instalar un driver, crear una base real ni ejecutar cambios de esquema. Después de aprobar esta spec, el plan deberá mostrar el SQL exacto y las decisiones pendientes antes de implementar.

## Objetivo

Preparar una base SQLite persistente con las nueve tablas acordadas en `database.md`, sus relaciones y un mecanismo pequeño de migraciones. El backend debe poder abrirla, actualizar su esquema de forma segura y cerrarla correctamente, dejando la estructura preparada para futuras funciones.

Esta función implementa almacenamiento y esquema, no el juego que los utilizará. La base empieza sin jugadores, sesiones, especies, recetas ni inventario.

## Estado de partida

- La función 001 está completa: Express/TypeScript, health, errores JSON, PORT, `.env`, arranque y cierre.
- No existe driver SQLite, conexión, ejecutor de migraciones ni esquema implementado en este reboot.
- `database.md` es un diseño aprobado a nivel conceptual; faltan el SQL exacto y algunas decisiones de inicialización. Las notas históricas de `project.md` no constituyen código disponible ni aprobación de un driver/versionado anterior.

## Alcance

- Una base SQLite de archivo y una conexión compartida por proceso del backend, reutilizable por las funciones futuras. No separar sesiones y juego en bases distintas.
- Ubicación configurable mediante `DATABASE_PATH`, utilizable desde el entorno y desde `.env` durante desarrollo.
- Apertura, configuración de integridad y migraciones antes de aceptar peticiones HTTP.
- Las nueve tablas del diseño, con restricciones e índices concretos por revisar en el plan.
- Historial de migraciones persistente y aplicación automática de versiones pendientes, en orden.
- Cierre de la conexión después de terminar el cierre HTTP, y liberación de recursos si falla el arranque.
- Pruebas con bases desechables y documentación de uso, migraciones y copias de seguridad.

## Tablas incluidas

| Tabla | Propósito |
| --- | --- |
| `schema_migrations` | Versiones aplicadas, nombre, checksum SQL y fecha. |
| `users` | Identidad Google, username y tres recursos. |
| `player_progress` | Mejoras, dificultad desbloqueada y marcador de entrega inicial. |
| `sessions` | Preparación del almacenamiento persistente de sesiones, sin implementar todavía su adaptador HTTP. |
| `monster_species` | Definiciones y estadísticas base de especies. |
| `enemy_species` | Definiciones enemigas y una dificultad por especie. |
| `monsters` | Instancias de monstruos poseídos. |
| `monster_recipes` | Entradas canónicas y resultado de fusión. |
| `eggs` | Instancias de huevos y plazos de eclosión. |

No añadir tablas de pools, recursos separados, expediciones, instancias enemigas, tipos, precios, límites o unlocks. Se mantienen las responsabilidades de `database.md`.

## Requisitos de persistencia y configuración

1. El archivo sobrevive al reinicio del proceso y no se almacena dentro de `src/`, `dist/` o `node_modules`.
2. Propuesta para desarrollo: `backend/data/game.sqlite` por defecto. Las rutas relativas se resuelven de forma documentada respecto al paquete, no de forma distinta entre código fuente y compilado.
3. Propuesta para producción: exigir `DATABASE_PATH` absoluto y explícito, sin crear silenciosamente otra base en una ubicación alternativa. El plan definirá el manejo del directorio padre y su validación.
4. Un archivo inaccesible, configuración inválida, esquema incompatible o migración fallida impide abrir el puerto HTTP y produce una salida de error, sin volcar datos privados.
5. Activar claves foráneas y definir el modo de journaling, sincronización y espera ante bloqueos en el plan. Las transacciones deben ser cortas y no atravesar operaciones asíncronas.
6. El health check conserva su contrato y no consulta SQL ni abre conexiones adicionales por petición. No se añaden endpoints públicos de diagnóstico de base de datos.
7. Los archivos SQLite y sus archivos auxiliares permanecen fuera de Git. El respaldo debe ser coherente con el modo de journaling: copiar únicamente el archivo principal de una base activa no se considera una copia válida por defecto.

## Migraciones: comportamiento esperado

1. Mantener una secuencia explícita y versionada de cambios. El ejecutor prepara `schema_migrations`; la primera migración crea las ocho tablas de dominio y sus índices. El resultado son nueve tablas de aplicación, contando el historial.
2. Al arrancar, comparar las migraciones disponibles con las registradas y ejecutar únicamente las pendientes, en orden. Una base ya actualizada no vuelve a crear sus tablas ni modifica sus filas.
3. Cada migración y el registro de su aplicación se guardan en la misma transacción. Si falla, no queda marcada como aplicada ni deja una parte de sus cambios confirmada.
4. Versiones desconocidas, historial inconsistente o checksum distinto de una migración ya aplicada detienen el arranque. No se reescribe el historial para ocultar diferencias.
5. Una migración aplicada no se edita: los cambios futuros usan una nueva versión. No borrar ni recrear una base con datos para actualizar su estructura.
6. No implementar un sistema genérico de plugins, un ORM ni una herramienta externa de migraciones sin una necesidad demostrada. La representación de las migraciones y su ejecución en JavaScript compilado se explicarán en el plan.
7. No añadir comandos que borren/reseten datos ni rollback automático de versiones ya confirmadas. Ante un problema posterior se prepara una migración correctiva; restaurar una copia coherente es una operación explícita y separada. Un respaldo no sustituye la transacción de una migración fallida.

## Requisitos del esquema

- Respetar columnas y relaciones de `database.md`, con nombres en inglés y el plural `monster_recipes`.
- Claves foráneas de juego con borrado/actualización restringidos; no añadir cascadas silenciosas.
- Username único sin distinguir mayúsculas para los nombres ASCII previstos; los controles HTTP y la política de nombre permanente corresponden a autenticación.
- Estadísticas, balances, niveles y timestamps enteros dentro de los límites seguros acordados; máximo HP positivo, cantidades no negativas y `ready_at >= created_at`.
- Parejas de receta ordenadas y distintas, con clave primaria compuesta. No duplicar relaciones mediante columnas o tablas auxiliares innecesarias.
- Mantener los resultados de huevos como regla derivada de tier y ausencia de receta productora. No almacenar pools ni implementar todavía la eclosión/validación de catálogos.
- Crear las tablas vacías sin decidir por defecto balances iniciales, capacidades, monstruos iniciales, costos o límites de mejoras. Las futuras funciones deberán insertar explícitamente los valores aprobados; el plan identificará cualquier default técnico necesario.

## Exclusiones

- Registro/login Google, endpoints de usuarios y adaptador de sesiones.
- Inicialización de jugadores, entrega de iniciales, compras, fusiones, eclosión y expediciones.
- Importadores, catálogo real, especies/enemigos inventados o balances de juego.
- Rutas CRUD creadas solo para demostrar que las tablas existen.
- Migración/importación de datos de una implementación histórica o de una base del usuario. Cualquier base existente encontrada debe investigarse antes de usarla.
- Docker, Compose, Caddy, cloud y modificación de infraestructura de producción.
- Compatibilidad entre varios drivers, repositorios genéricos y capas adicionales de acceso a datos.

## Criterios de aceptación

- [ ] El plan documenta y recibe aprobación para el driver/versionado, SQL, restricciones, índices y configuración de archivo/integridad.
- [ ] El backend crea las nueve tablas previstas en una base nueva, antes de aceptar peticiones HTTP, sin insertar contenido de juego o cuentas.
- [ ] Un segundo arranque no repite migraciones y conserva registros de prueba tras cerrar/reabrir una base temporal.
- [ ] Las restricciones rechazan referencias inexistentes, duplicados y cantidades/timestamps inválidos según el SQL aprobado.
- [ ] Una migración que falla revierte sus cambios y no registra éxito; el historial incompatible o modificado provoca un fallo seguro.
- [ ] Los errores de archivo/configuración/arranque no dejan conexiones ni listeners HTTP abiertos.
- [ ] La conexión se cierra después del servidor HTTP, incluido el manejo de errores y cierre forzado, sin doble cierre ni temporizadores abandonados.
- [ ] Pruebas y ejecución compilada usan el mismo mecanismo de esquema/migraciones. Todas las pruebas emplean bases desechables, nunca almacenamiento del jugador.
- [ ] Se conservan el contrato de health, los errores existentes y las verificaciones de la función 001, adaptadas al nuevo arranque persistente cuando corresponda.
- [ ] La documentación cubre DATABASE_PATH, archivos persistentes/auxiliares, migraciones, respaldo, comandos y límites de verificación en Windows/Linux ARM64.
- [ ] No se implementan funciones ni infraestructura excluidas.

## Decisiones pendientes antes de implementar

- **Driver:** comparar `node:sqlite` integrado con `better-sqlite3`. El primero evita una dependencia pero su documentación Node 24 lo clasifica como release candidate; el segundo ofrece una API madura pero añade un módulo nativo cuya instalación hay que verificar en Windows y para el destino ARM64. No instalar ni elegir silenciosamente uno.
- **SQL:** presentar la definición exacta de las nueve tablas, índices y defaults técnicos. La aprobación del diseño conceptual no reemplaza esta revisión.
- **Dificultades:** acordar su codificación numérica y restricciones compartidas por `enemy_species` y `player_progress`; no confundirla con valores iniciales del jugador.
- **Migraciones/operación:** aprobar representación, transacciones, resolución de rutas, configuración SQLite y cierre en el plan. No crear un CLI adicional de migraciones si el arranque automático cubre la necesidad actual.

Siguiente paso: aprobar o ajustar esta especificación y preparar después el plan con SQL revisable y lotes pequeños. Ninguna base real se crea al redactar este documento.

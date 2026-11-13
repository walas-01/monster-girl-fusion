# 002 — Base de datos y esquema inicial

**Estado:** los cuatro lotes están completos (2026-11-12). Con aprobación explícita se adoptó npm 12.2.2 y `allowScripts: { "better-sqlite3": false }`, sin actualizar npm globalmente ni cambiar versiones de dependencias. Instalación limpia, tipos, compilación y suite: **170 correctas, dos omitidas en Windows por señales POSIX, cero fallos** (172 total). Runtime compilado aislado, reinicios/persistencia y `.env`/watch verificados; documentación de operación/respaldo completa. Migración 2 añade nombres bilingües sin editar la 1. Solo bases desechables; `.env` real y datos del jugador intactos. Linux ARM64, señales POSIX reales y cortes de energía siguen sin verificar.

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

Por simplificación explícitamente aprobada, DATABASE_PATH es configuración de confianza: solo se comprueban rutas normalizadas, sin resolver enlaces simbólicos/junctions ni verificar previamente que el destino sea un archivo regular. Los errores habituales de apertura se delegan al driver. Un enlace puede eludir la protección léxica de directorios; mantener la ubicación real fuera del código es responsabilidad de quien configura el servidor. No se retiran ajustes/verificaciones SQLite ni limpieza de conexiones.

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
- Username obligatorio y único sin distinguir mayúsculas para los nombres ASCII previstos; se debe elegir antes de insertar el usuario. Los controles HTTP y la política de nombre permanente corresponden a autenticación.
- Todos los campos de usuario son obligatorios. En progreso solo `starters_granted_at` admite NULL; niveles no negativos y dificultad obligatoria entre 1 y 4. En ambos catálogos el tipo es obligatorio y puede ser `normal`; el aspecto admite NULL. El cansancio usa únicamente `tired_until`, sin columna de estado.
- Seguimiento aprobado: `monster_species` y `enemy_species` guardan `name_en` y `name_es` obligatorios y no vacíos; los nombres no son únicos ni se duplican en instancias poseídas. La migración 2 no inventa traducciones: si una tabla de especies de versión 1 ya tiene filas, rechaza la actualización y revierte todos sus cambios hasta acordar una migración de datos con nombres reales.
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

- [x] El plan documenta y recibe aprobación para el driver/versionado, SQL, restricciones, índices y configuración de archivo/integridad.
- [x] El backend crea las nueve tablas previstas en una base nueva, antes de aceptar peticiones HTTP, sin insertar contenido de juego o cuentas (paso 1 del lote 3, pruebas directas temporales).
- [x] Un segundo arranque no repite migraciones y conserva registros de prueba tras cerrar/reabrir una base temporal.
- [x] Las restricciones rechazan referencias inexistentes, duplicados y cantidades/timestamps inválidos según el SQL aprobado.
- [x] Una migración que falla revierte sus cambios y no registra éxito; el historial incompatible o modificado provoca un fallo seguro.
- [x] Los errores de archivo/configuración/arranque no dejan conexiones ni listeners HTTP abiertos (rutas de fallo verificadas; no garantiza recuperación de cualquier fallo nativo del driver).
- [x] La conexión se cierra después del servidor HTTP, incluido el manejo de errores y cierre forzado, sin doble cierre ni temporizadores abandonados (pruebas directas y cierre por código; señales POSIX reales pendientes).
- [x] Pruebas y ejecución compilada usan el mismo mecanismo de esquema/migraciones. Todas las pruebas emplean bases desechables, nunca almacenamiento del jugador.
- [x] Se conservan el contrato de health, los errores existentes y las verificaciones de la función 001, adaptadas al nuevo arranque persistente cuando corresponda.
- [x] La documentación cubre DATABASE_PATH, archivos persistentes/auxiliares, migraciones, respaldo, comandos y límites de verificación en Windows/Linux ARM64.
- [x] No se implementan funciones ni infraestructura excluidas.

## Decisiones aprobadas y trabajo pendiente

- **Driver/rutas/configuración:** aprobados e implementados en el lote 1; ARM64 continúa sin verificar.
- **SQL:** nueve tablas STRICT, siete índices explícitos y restricciones aprobados e implementados en el lote 2. No hay contenido de juego ni valores iniciales de jugador.
- **Dificultades:** 1 = Easy, 2 = Normal, 3 = Hard, 4 = Very Hard; no fija la dificultad inicial desbloqueada.
- **Migraciones:** SQL en TypeScript, SHA-256 normalizado a LF, transacción inmediata para historial y todas las versiones pendientes; rechazo de historial incompatible y esquemas desconocidos. Implementado y probado con almacenamiento temporal, incluida paridad fuente/compilado.
- **Arranque/cierre:** paso 1 del lote 3 autorizado e implementado. El ejecutor recibe una conexión del llamador y no la cierra; `startServer` es ahora su propietario y la cierra ante fallo de migraciones/bind y después del cierre HTTP. Timeout fuerza HTTP antes de cerrar SQLite; los errores de cierre rechazan la promesa y no dejan handlers/timer propios registrados. Las pruebas de fallo de cierre inyectan un error después de liberar el handle real; no garantizan recuperación de un driver cuyo cierre nativo falle.
- **Aislamiento:** paso 2 del lote 3 autorizado e implementado; cada proceso hijo recibe su ruta temporal, incluida producción y los casos de PORT inválido. Se reutiliza la limpieza existente para esperar/detener el proceso antes de borrar su directorio. Las pruebas HTTP puras y de PORT no abren SQLite; los hijos de señales siguen siendo HTTP-only, omitidos en Windows.
- **Regresión:** paso 3 del lote 3 autorizado y completo: diez casos nuevos de reinicio/persistencia y fallo antes de bind para fuente/compilado; suite completa correcta, sin corregir código de aplicación. Se conservan las pruebas anteriores y las omisiones explícitas de señales en Windows.
- **Lote 4 completo:** tras la pausa se aprobó npm 12.2.2 con denegación explícita de scripts del driver. El lock solo sincroniza el requisito npm, sin `gypfile` manual ni cambios de dependencias. Instalación completa (81 paquetes), instalación runtime (67), SQLite 3.54.1, reinicios con datos persistidos, shutdown por código, paridad de rutas y `.env`/watch correctos; ambas instalaciones sin vulnerabilidades reportadas ni advertencias de compilación nativa/EPERM. Todos los procesos y archivos temporales se limpiaron; fingerprints del código/config/lock/`.env` real se conservaron durante las pruebas. Respaldo/restauración offline y límites documentados en README. Sin cambios de infraestructura ni datos del jugador.

La integración, persistencia y runtime aislado están verificados en Windows x64/Node 24.19.0/npm 12.2.2. Señales POSIX reales, Linux ARM64, cortes de energía y restauración de datos reales no están certificados. El cierre normal por código en Windows no certifica señales POSIX. Prevalece la suite limpia actual de 170 correctas/dos omitidas sobre resultados parciales históricos.

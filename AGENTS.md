# AGENTS.md — Monster Girl App

Juego full-stack pensado para móviles: coleccionar chicas monstruo, enviarlas a expediciones para obtener recursos y huevos, incubar huevos y fusionar monstruos para descubrir especies. Es un proyecto de aprendizaje y portafolio: priorizar claridad, simplicidad y un MVP funcional. PvP y funciones sociales quedan fuera del MVP.

## Tecnologías

- Frontend: React (Vite) + TypeScript + Tailwind CSS.
- Backend: Express + TypeScript; API REST bajo `/api`.
- Base de datos: SQLite.
- Autenticación: Google Identity Services + `express-session`.
- Despliegue previsto: Docker Compose en una VM Linux ARM64 de Oracle Cloud, con Caddy como proxy inverso.
- Pruebas: scripts JavaScript/TypeScript y herramientas existentes del proyecto.

## Estructura y documentación

- `frontend/`: aplicación React.
- `backend/`: API y lógica del juego.
- `AGENTS.md`: instrucciones para agentes y flujo de trabajo.
- `project.md`: arquitectura, estructura y decisiones técnicas, incluido el despliegue.
- `specs/<number>-<slug>/spec.md`: requisitos y criterios de aceptación.
- `specs/<number>-<slug>/plan.md`: diseño y lotes de implementación.
- `specs/<number>-<slug>/references/`: referencias visuales opcionales para la interfaz.
- `MEMORY.md`: contexto breve y trabajo pendiente para la siguiente sesión.

Antes de planificar o modificar una función, leer la documentación relevante e inspeccionar el código y sus convenciones. No asumir que la estructura documentada coincide con la actual ni inventar el contenido de documentos inexistentes.

## Reglas de desarrollo

- Priorizar legibilidad y aprendizaje por encima de sofisticación arquitectónica. El usuario quiere leer, tocar y entender el código junto con la IA; la simplicidad es un requisito del producto.
- Elegir la solución más pequeña y comprensible. No añadir sistemas, abstracciones, mecanismos alternativos, compatibilidad o dependencias para necesidades hipotéticas. Cada mecanismo nuevo debe ser imprescindible para una función aprobada, la seguridad o la integridad de los datos.
- Usar nombres descriptivos, condicionales claros y una operación significativa por línea. Evitar ternarios anidados y código comprimido: menos archivos no debe significar código más denso.
- Mantener junto el código relacionado. Separarlo solo por una mejora clara de comprensión, reutilización real o tamaño manejable; evitar tanto un archivo por cada detalle como archivos gigantes con funciones inconexas.
- Antes de proponer archivos, capas o mecanismos nuevos, explicar su función, por qué no basta lo existente y cuál es la alternativa más sencilla. No crear carpetas vacías, capas de relleno ni envoltorios que solo delegan llamadas.
- Limitar los cambios al alcance acordado en la conversación o la especificación activa. Ampliar rutas, servicios y componentes existentes cuando corresponda; reutilizar validación, errores y autenticación. No reescribir funciones operativas ni hacer refactorizaciones ajenas sin motivo concreto.
- El frontend gestiona presentación y estado de interfaz; el backend es la autoridad para autorización, estado del jugador, reglas, recompensas y progresión.
- Mantener esquemas de datos simples. **Explicar los cambios y esperar aprobación** antes de implementarlos; documentar migraciones y código afectado.
- Antes de romper un contrato de API, identificar sus consumidores y obtener aprobación.
- Para decisiones importantes de arquitectura, dependencias o reglas del juego, presentar alternativas, ventajas e inconvenientes y una recomendación.
- No incluir credenciales, secretos, bases SQLite ni datos privados en commits.
- Añadir o actualizar pruebas cuando sea práctico e indicar qué se verificó y qué no.

### Organización legible para principiantes

- Backend: `routes/`, `controllers/` y `services/`, agrupados por dominio (usuarios, monstruos, huevos, expediciones). Las rutas declaran métodos, direcciones y middleware; los controladores leen la entrada HTTP, llaman a servicios y responden; los servicios contienen operaciones de negocio, SQL y transacciones, sin objetos request/response de Express.
- Usar un archivo por dominio en cada capa necesaria, por ejemplo `routes/users.ts`, `controllers/users.ts` y `services/users.ts`. No crear un archivo por endpoint ni exigir tres capas para un health check. No mover autenticación a usuarios solo por seguir el ejemplo.
- Mantener ayudas, validaciones, tipos y SQL con su dominio, salvo beneficio demostrado al separarlos. No añadir por defecto repositorios, DTO, casos de uso, interfaces ni fábricas. La inicialización y migraciones de base de datos, seguridad y errores transversales pueden ir aparte.
- Frontend: la dirección deseada es un componente de entrada `.jsx` por página real en `frontend/src/pages/`. Mantener allí los componentes exclusivos de esa página si resulta legible; lo mismo aplica a archivos `.tsx` existentes o aprobados. Extraer componentes solo por reutilización o claridad.
- El frontend actual usa TypeScript/TSX. Adoptar páginas JSX requiere un plan de alcance explícito; esta convención no autoriza renombrar archivos, cambiar el compilador ni convertir frontend o backend a JavaScript.
- Preferir estado local y pocas funciones de petición con nombres claros. Controladores frontend, hooks propios, estados globales y capas de cliente/API requieren una necesidad actual demostrada. Preservar las protecciones asíncronas y de errores; no trasladar reglas autoritativas al navegador para reducir archivos.
- Estas convenciones orientan trabajo futuro aprobado, no autorizan migraciones ni reescrituras masivas. Proponer simplificaciones por separado, explicar su impacto y esperar aprobación. No eliminar pruebas ni debilitar seguridad o garantías de recuperación.

## Metodología: combinar planificación y trabajo directo

Alternar según la tarea y lo que pida el usuario, sin imponer documentación a cada ajuste:

- **Trabajo directo:** correcciones acotadas, pequeños cambios de interfaz, documentación y refactorizaciones locales sin decisiones importantes. Acordar brevemente el alcance en la conversación e implementar lo solicitado sin exigir `spec.md` ni `plan.md`. Una petición explícita de cambio ya autoriza ese alcance; no pedir una confirmación redundante.
- **Especificación y plan (SDD):** funciones nuevas o cambios amplios, de riesgo o con decisiones importantes. Redactar o actualizar `spec.md`, esperar aprobación, preparar `plan.md` y esperar aprobación antes de implementar.
- **Explicación y exploración:** si el usuario quiere entender o probar algo por su cuenta, explicar sobre el código real, señalar archivos y avanzar en pasos pequeños. No editar código salvo que lo pida.

Se puede pausar una implementación para explicar o hacer un ajuste pequeño y después retomarla. No ampliar el alcance ni crear capas «por si acaso». Si un cambio directo deja de ser pequeño o revela riesgos, explicar el motivo y acordar cómo continuar. Las aprobaciones de esquema, contratos de API e infraestructura siguen siendo obligatorias en ambos modos.

### Documentos para el modo SDD

Crear una carpeta por función con el siguiente número secuencial disponible, por ejemplo `specs/001-login-page/`, con estos documentos:

### `spec.md`: qué y por qué

- Objetivo y comportamiento visible para el usuario.
- Alcance y exclusiones.
- Requisitos y criterios de aceptación.
- Preguntas o decisiones que requieren aprobación.

Evitar detalles de implementación salvo que condicionen el comportamiento esperado.

### `plan.md`: cómo y en qué orden

- Enfoque y archivos o componentes afectados.
- Justificación sencilla de nuevos archivos, capas o mecanismos y por qué no basta una solución menor.
- Impacto en API, base de datos y despliegue.
- Lotes pequeños, ordenados y con casillas, revisables de forma independiente.
- Pruebas de cada lote significativo, riesgos, dependencias y aprobaciones pendientes.

No crear una lista enorme para una función sencilla. Para el impacto de despliegue, revisar los puntos de la sección correspondiente.

## Idioma y localización

- Usar inglés en código, identificadores, archivos, comentarios, commits, contratos de API, nombres de base de datos, logs y documentación técnica.
- Excepciones: este `AGENTS.md` está en español; `spec.md` puede estar en español o inglés. Conservar el idioma de las especificaciones al editarlas.
- La aplicación debe ofrecer inglés y español, elegir inicialmente según las preferencias del navegador y usar inglés si ninguna es compatible. Permitir el cambio manual.
- No incrustar textos para jugadores en componentes React: usar claves en inglés y mantener ambas traducciones.
- Documentar las decisiones de localización en `project.md`.

## Flujo de trabajo

1. Leer `MEMORY.md`, las especificaciones relevantes, `project.md` si existe y el código afectado.
2. Elegir el modo adecuado a la petición. Aclarar solo dudas importantes e indicar supuestos razonables.
3. En trabajo directo, resumir el ajuste y avanzar; en SDD, obtener las aprobaciones de especificación y plan. Si solo se pide una explicación, responder sin implementar.
4. Implementar el alcance acordado en pasos pequeños, fáciles de leer y revisar con el usuario. No encadenar cambios adicionales sin pedirlos.
5. Ejecutar las comprobaciones pertinentes, revisar las diferencias e informar resultados y limitaciones.
6. Actualizar documentación afectada y, si existen, especificación y plan. No crearlos solo para registrar un ajuste menor.
7. Tras trabajo significativo, actualizar `MEMORY.md` con un resumen breve y factual.

Si el usuario pide solo conversación, documentación o planificación, no modificar código de la aplicación.

## Comunicación y memoria

- Ser breve y concreto; distinguir hechos observados, supuestos y sugerencias.
- Facilitar que el usuario participe: indicar dónde mirar, explicar el porqué de los cambios y dar ejemplos pequeños cuando ayuden. Si quiere ir paso a paso, detenerse en el punto acordado en lugar de resolver toda la función de una vez.
- Antes de programar, resumir cambios y aprobaciones necesarias. Después, resumir resultados, pruebas, pendientes y siguiente paso recomendado.
- No afirmar que una función o prueba está completa sin haberla implementado o verificado.
- `MEMORY.md` es un relevo breve, no la fuente de verdad: prevalecen el código, las especificaciones aprobadas y las decisiones documentadas. Actualizarlo tras trabajo significativo y retirar notas obsoletas; no convertirlo en un diario.

## Preparación para despliegue

Diseñar para la arquitectura de `project.md`, incluso al trabajar sin Docker. Mantener allí las decisiones técnicas detalladas, sin duplicarlas aquí.

- Configurar puertos, secretos, rutas de almacenamiento y proxy mediante variables de entorno. Evitar rutas o comportamientos de shell exclusivos de una máquina.
- El estado esencial debe sobrevivir a reinicios y estar separado del código y los archivos compilados. No usar sesiones en memoria ni almacenamiento volátil para el estado autoritativo del jugador.
- Mantener peticiones relativas `/api` y un backend independiente en desarrollo y producción.
- Conservar compatibilidad con HTTPS detrás de un proxy de confianza limitada; no confiar indiscriminadamente en cabeceras reenviadas.
- Verificar dependencias y compilación en Linux ARM64, especialmente módulos nativos de SQLite y sesiones. Informar requisitos de compilación nativa o compatibilidad no verificada antes de adoptarlos.
- Preservar apagado ordenado con tiempo límite, arranque y migraciones reproducibles y un health check ligero.

En cada `plan.md`, evaluar variables y secretos, almacenamiento persistente, puertos y servicios nuevos, compilación y arranque, Linux ARM64, proxy/HTTPS/cookies, proxy de desarrollo e impacto en Docker o producción. Documentar los impactos pertinentes y límites de verificación; informar incompatibilidades existentes antes de modificar código.

**No crear ni modificar infraestructura de producción sin aprobación explícita**, incluidos Dockerfiles, archivos Compose, configuración de Caddy y recursos cloud. Preferir soluciones sencillas válidas tanto en local como en el despliegue previsto.

# 003 — Fundación del frontend

**Estado:** función completa, con los tres lotes aprobados y cerrados (2026-11-12). Instalación limpia aislada, tipos/lint/build, preview estático, HMR y proxy contra el backend real correctos en Windows x64/Node 24.19.0/npm 12.2.2. La vista provisional ofrece inglés/español, preferencia manual persistente y accesibilidad básica sin llamadas API automáticas. Un seguimiento de seguridad posteriormente aprobado sustituye minimatch por 11.0.8 mediante tres overrides acotados; audit actual: **cero vulnerabilidades**. Suite actual: **25 pruebas Node correctas**, incluidas tres regresiones del linter, sin cambiar versiones directas de ESLint/typescript-eslint ni quitar reglas. Documentación finalizada; datos reales/.env/infraestructura intactos. Linux ARM64, HTTPS/producción y autenticación siguen fuera de lo verificado.

## Objetivo

Crear en `frontend/` una base independiente de React, Vite, TypeScript y Tailwind CSS, limpia de la demostración del generador, fácil de entender y preparada para construir las pantallas del juego más adelante.

La aplicación debe poder abrirse y compilarse sin autenticación, datos de juego ni backend disponible. Esta función prepara el proyecto, no diseña ni implementa el juego.

## Estado de partida

- Al redactar este borrador `frontend/` estaba vacío. Durante el cierre del backend aparecieron archivos y dependencias frontend independientes; antes de preparar el plan hay que revisarlos con el usuario y conservar su trabajo. El lote de base de datos no los modificó ni validó.
- El backend tiene `GET /api/health`, con respuesta JSON `{ "status": "ok" }`, además de errores JSON. No hay endpoints de autenticación ni juego.
- La función 002 tiene los cuatro lotes completos: con aprobación explícita adoptó npm 12.2.2 y su política de scripts para superar el bloqueo de instalación. Sus resultados y límites constan en su plan y el README del backend; no autorizan implementar este frontend.
- `project.md` contiene notas frontend históricas de la implementación anterior. No reutilizar sus versiones, pantallas, dependencias o resultados de pruebas como si existieran en este checkout.
- Se usará TypeScript/TSX, como pide el usuario. La orientación histórica hacia páginas JSX no autoriza introducir una mezcla de lenguajes ni cambiar el backend.

## Comportamiento visible

- Al abrir la aplicación aparece una vista provisional sencilla con el nombre del proyecto, un mensaje breve de preparación y un selector de idioma.
- No aparece el contador, los enlaces promocionales, logotipos o textos de demostración de Vite/React.
- La vista funciona en móvil y escritorio, con controles accesibles mediante teclado, foco visible y sin desplazamiento horizontal a 360 px de ancho.
- Todo texto de interfaz está disponible en inglés y español. Al cargar se respeta primero una preferencia válida guardada en `localStorage`; si no existe, se siguen las preferencias del navegador y, si ninguna es compatible, se usa inglés.
- La selección manual actualiza los textos y el idioma del documento y se recuerda en `localStorage` al recargar. Solo se guarda esa preferencia de interfaz, no datos del jugador; si el almacenamiento no está disponible, la vista sigue siendo utilizable.
- La vista no representa una pantalla final de inicio, login o colección, ni muestra inventario, saldos o botones de juego ficticios.
- Arrancar sin backend no impide mostrar la vista ni cambiar el idioma. No se harán peticiones automáticas a una API que la vista todavía no necesita.

## Alcance

### 1. Proyecto independiente y reproducible

- Aprovechar la plantilla React + TypeScript que el usuario ya inicializó en `frontend/`, con su propio paquete y lockfile; no regenerarla ni sobrescribir sus modificaciones.
- Ofrecer comandos claros para desarrollo, comprobación de tipos, build estático y previsualización local del build.
- Verificar instalación limpia y ejecución con Node 24 compatible con el entorno actual; fijar versiones y documentar los requisitos reales en el plan. No copiar versiones de notas históricas.
- El frontend se instala, desarrolla y compila sin ejecutar instalaciones o migraciones del backend. No introducir workspaces ni un comando raíz que reinstale ambos paquetes.
- La previsualización de Vite es una herramienta local, no el servidor de producción.

### 2. Limpieza proporcionada de la plantilla

- Revisar lo que genera la versión elegida antes de eliminar archivos: no asumir una lista fija de archivos o herramientas.
- Retirar la demostración, imágenes promocionales, estilos de ejemplo y referencias a ellos en componentes o HTML; actualizar el título del documento.
- Conservar los archivos necesarios para React, TypeScript, Vite, estilos y compilación. No borrar configuración simplemente porque no sea visible en pantalla.
- No dejar imports, scripts, dependencias o configuraciones huérfanos. Las herramientas adicionales que se conserven deben tener una finalidad actual explicada en el plan.
- No crear carpetas de páginas, componentes, servicios, hooks o assets vacías para funciones futuras. La vista provisional puede vivir en la entrada de la aplicación.

### 3. Estilos mínimos y accesibilidad

- Integrar Tailwind CSS y una base global pequeña: tamaño de página, tipografía del sistema, fondo oscuro, texto legible y foco visible.
- Aplicar un enfoque mobile-first. Los acentos morado/rosa pueden orientar la vista provisional, pero no fijan aún el diseño definitivo del juego.
- No introducir una biblioteca de componentes, iconos, fuentes remotas ni assets de monstruos para demostrar la instalación.
- Mantener semántica HTML y etiquetas accesibles. No crear un sistema de diseño, catálogo de componentes o conjunto completo de tokens antes de tener pantallas reales.

### 4. Localización desde el inicio

- Centralizar textos con claves en inglés y mantener ambas traducciones, sin textos para jugadores incrustados en componentes.
- Usar una preferencia guardada válida (`en` o `es`) antes de consultar el navegador. Ignorar un valor no compatible. Sin preferencia válida, resolver las preferencias ordenadas del navegador, incluidas variantes como `es-AR` y `en-GB`, y usar inglés como fallback.
- Proporcionar selección manual y actualizar `document.documentElement.lang` al idioma activo.
- Recomendar una solución pequeña para los pocos textos actuales; una dependencia de traducción no se justifica solo por necesidades futuras. La elección se revisará en el plan.
- Recordar el idioma elegido en `localStorage`, según lo aprobado. No introducir estado global del jugador, sesiones ni un framework de persistencia; no sincronizar esta preferencia con una cuenta o base de datos.
- Separar traducciones de interfaz de contenido: los nombres del catálogo se guardan como `name_en` y `name_es` en `monster_species` y `enemy_species`. No duplicarlos en el diccionario de botones/mensajes ni en cada monstruo poseído. Esta fundación no añade pantallas, endpoints ni carga de catálogos para mostrarlos.
- Documentar las decisiones implementadas en `project.md` sin reescribir las notas históricas ajenas al alcance.

### 5. Preparación de la conexión con el backend

- Mantener el backend como proceso independiente. Preparar el proxy de desarrollo para `/api`, sin cambiar ese prefijo ni los contratos existentes.
- El destino del proxy y el puerto de desarrollo deben poder configurarse desde el entorno de Vite, no desde componentes React. El plan concretará nombres y valores de desarrollo; no inventar requisitos de producción.
- Si el puerto solicitado está ocupado, informar del conflicto en lugar de cambiar silenciosamente a otro.
- Las futuras peticiones del navegador usarán rutas relativas `/api`; no se necesita todavía un cliente API genérico, Axios, hooks de peticiones ni una página de diagnóstico.
- Comprobar el proxy con `/api/health` durante la verificación, sin convertir esa prueba en una función permanente de la interfaz. Si solo se puede comprobar contra un servidor de prueba, distinguirlo de una integración real con el backend.
- No exponer secretos en variables públicas del cliente ni añadir ahora variables de Google, sesiones o base de datos. La configuración del proxy es de desarrollo y no debe convertirse en una URL incrustada en el bundle.
- No cambiar CORS, autenticación, cookies, rutas o lógica del backend para completar esta fundación.

### 6. Verificación y documentación

- Verificar instalación limpia en el paquete frontend, tipos, build, carga del build y actualización durante desarrollo. La instalación existente no sustituye esta comprobación.
- Comprobar Tailwind, selección/detección de idiomas, vista móvil/escritorio y navegación por teclado; registrar problemas de consola y límites de verificación.
- Añadir comprobaciones automatizadas pequeñas cuando sean prácticas con las herramientas disponibles. No adoptar un framework de pruebas solo por inercia del scaffolding.
- Documentar instalación, comandos, variables, arranque separado de frontend/backend, limpieza de la plantilla, build estático y la diferencia entre proxy de desarrollo y publicación en producción.
- Crear `.env.example` solo para las variables realmente adoptadas, sin secretos; no crear ni sobrescribir el `.env` del usuario.
- Informar cualquier requisito de binarios nativos de las herramientas de build y lo no verificado en Linux ARM64. No afirmar compatibilidad de despliegue solo por leer metadatos.

## Referencias visuales

**No se requieren referencias ni mockups para este alcance técnico.** La vista provisional solo permite comprobar React, estilos, accesibilidad y localización; no debe interpretarse como diseño aprobado del producto.

Para futuras pantallas de login, colección, huevos, fusión o expediciones sí convendrá revisar referencias antes de fijar composición, navegación, tarjetas y estados visuales. Si el usuario desea incluir ahora una pantalla final o una navegación real, habrá que ampliar y aprobar el alcance y su dirección visual antes de implementarlos.

No crear una carpeta `references/` vacía ni generar imágenes para completar esta especificación.

## Exclusiones

- Pantallas finales, navegación del juego, rutas protegidas y login Google.
- Cuentas, sesiones, CSRF, recursos, catálogo, inventario, temporizadores o reglas del juego.
- Menú inferior con secciones inexistentes, tarjetas o datos simulados del jugador.
- Router, estado global, librería de componentes, cliente API genérico, fuentes/iconos externos o infraestructura de pruebas sin necesidad actual aprobada.
- PWA, funcionamiento offline, service workers, SSR, analítica y optimizaciones especulativas.
- Cambios en el esquema, contratos o código del backend; rehacer el lote 4 de la función 002, ya completado.
- Dockerfiles, Compose, Caddy, recursos cloud u otra infraestructura de producción.
- Migrar código a JavaScript/JSX o rehacer la documentación histórica completa.

## Criterios de aceptación

- [x] El alcance está aprobado y existe después un plan aprobado con dependencias/versiones verificadas y pasos pequeños.
- [x] `frontend/` contiene un paquete React/Vite/TypeScript independiente; su instalación limpia, tipos y build funcionan con el entorno documentado.
- [x] No queda demostración de Vite/React ni imports, scripts, assets o dependencias huérfanos; no se crean estructuras vacías para funciones futuras.
- [x] La vista provisional funciona sin backend y no simula pantallas o datos de juego.
- [x] Tailwind y la base global se aplican correctamente; la vista es utilizable con teclado y sin overflow horizontal en móvil.
- [x] Inglés/español, variantes regionales, fallback y cambio manual funcionan; los textos usan claves y `lang` sigue el idioma activo.
- [x] La preferencia de idioma se conserva en `localStorage` al recargar, tiene prioridad sobre el navegador y no almacena estado autoritativo ni impide la carga si el almacenamiento falla.
- [x] El proxy conserva `/api`, tiene destino configurable y se verifica sin incrustar URLs de backend o secretos en React.
- [x] El build se puede previsualizar como archivos estáticos; no se depende del servidor/proxy de Vite para producción.
- [x] README, ejemplo de entorno y estado del proyecto reflejan lo implementado y sus límites, sin modificar `.env`, infraestructura o backend.
- [x] Se registran resultados reales y compatibilidad ARM64 no verificada, sin confundir pruebas frontend con la verificación ya completada de la función 002.

## Decisiones aprobadas

1. **Fundación técnica, no primera pantalla del juego:** incluir Tailwind, una vista provisional, idiomas y proxy; sin referencias visuales obligatorias.
2. **Preferencia de idioma — aprobada e implementada en el lote 2:** recordar la selección en `localStorage`, con prioridad sobre el navegador. No autoriza ampliar el alcance a estado del jugador o sincronización con cuentas.
3. **Herramientas mínimas:** tipos/build y verificación funcional como base; sin router, store ni biblioteca de componentes/traducción. Se conservan ESLint y las configuraciones TypeScript; las pruebas de idioma usan Node sin un framework adicional. Las razones constan en el plan.
4. **Independencia del backend:** la función 002 ya está completa; esta función no la reimplementa ni reinstala. Cualquier comprobación real de backend usará almacenamiento temporal y preservará su `.env` y dependencias.

**Siguiente paso:** acordar una nueva función por separado. Este cierre no autoriza pantallas finales, autenticación, cambios de dependencias ni infraestructura.

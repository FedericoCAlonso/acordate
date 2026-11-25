# Reglas del proyecto Acordate

## Versionado — Fuente única de verdad (Single Source of Truth)

- **Nunca hardcodear el número de versión en vistas ni componentes de la UI.** Toda pantalla, modal, barra o etiqueta visible que muestre la versión debe importar `APP_VERSION` desde `src/core/version.js`.
- **Sincronización obligatoria en cada actualización de versión:** siempre que se lance una nueva versión (corrección, mejora o release), incrementar y reflejar el mismo número semántico (`MAJOR.MINOR.PATCH`) en todos los puntos de referencia del proyecto:
  1. `src/core/version.js` (`export const APP_VERSION = 'X.Y.Z';`) — fuente única para la app.
  2. `package.json` (`"version": "X.Y.Z"`).
  3. `README.md` (encabezado de versión actual `vX.Y.Z`).
  4. `sw.js` (incrementar `CACHE_NAME` y actualizar el comentario de versión `App vX.Y.Z`, verificando paridad de `PRECACHE_ASSETS`).
- **Verificación automática:** ejecutar `npm test` antes de confirmar o subir cambios; `tests/production.test.js` valida que `APP_VERSION`, `package.json`, `README.md` y `sw.js` coincidan exactamente.

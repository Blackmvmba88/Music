# Roadmap de BlackMamba Music

Cada fase se considera terminada sólo con implementación y validación verificable.

## Arquitectura integrada Music

- [x] Reproductor y Escuela de Música accesibles dentro del mismo producto.
- [x] Herramienta histórica de catálogo Python conservada en `tools/catalog-legacy`.
- [x] Diseños, scripts y divergencias de `Documents/Reproductor` preservados.
- [ ] Revisar el parche histórico e incorporar únicamente mejoras que no estén superadas.
- [ ] Renombrar el repositorio remoto de GitHub de `Reproductor` a `Music`.

## Entrenamiento musical

### Nivel 1 · fundamentos — completado

- Blancas, negras, corcheas, silencios y ligaduras.
- Diez tareas por sesión, metrónomo audiovisual, entrada global y puntuación local.
- Canciones tradicionales en tres dificultades con reproducción de piano.

### Nivel 2 · módulo 1: pulso desplazado — completado

- Contratiempos, silencios fuertes y entradas en “y”.
- Dos compases por tarea y tempo configurable entre 60 y 110 BPM.
- Métricas explicables de pulso, ritmo, continuidad y anticipación.
- Evidencia, advertencias, confianza y fallback del análisis.

### Nivel 2 · módulos siguientes

1. Ligaduras y síncopas.
2. Semicorcheas y lectura continua.
3. Ritmos con punto.
4. Tresillos.
5. Frases musicales de 2, 4, 8 y 16 compases.
6. Memoria musical y Sight Reading generativo.

## 0.1 — Biblioteca canónica · completado

- Una carpeta por canción con audio, portada, letra y metadatos.
- Consolidación desde Downloads y colecciones históricas de la USB.
- Identificación y verificación SHA-256.
- Manifiesto central `library.json`.
- Revisión antes de borrar y auditorías de limpieza.
- Regla de propiedad para registros `neocyber`.

## 0.2 — Reproductor privado · completado

- WebUI `/music` y aplicación Electron para macOS arm64.
- Reproducción, pausa, stop, seek, timeline, volumen, navegación y shuffle.
- Canción activa centrada en la lista.
- Calificación de estrellas durante reproducción.
- Orden por catálogo y calificación.
- Búsqueda normalizada y filtros de revisión.
- Historial persistente de reproducción.
- Cuatro layouts y animaciones configurables.
- Temas visuales individuales por canción con presets Sunset, Dawn, Violet y Ember.
- Portadas 1:1 y 16:9.
- Editor de letra, hashtags y metadatos de SoundCloud.
- DMG privado sin MP3 ni WAV.

## 0.3 — Persistencia canónica de metadatos · siguiente

- API local de lectura y escritura segura de `metadata.json`.
- Migrar ediciones actuales desde `localStorage` a la USB.
- Escribir artista, autor y sello fijos en todas las fichas canónicas.
- Guardar calificaciones, hashtags, letras, ISRC, ISWC, álbum y lanzamiento.
- Resolver conflictos entre WebUI, manifiesto USB y metadatos embebidos.
- Copia de seguridad antes de cada migración.

Criterio de salida: editar una canción, reiniciar en otro dispositivo con la misma USB y recuperar todos los campos sin depender del navegador original.

## 0.4 — Catálogo remoto y disponibilidad

- Completar cotejo SoundCloud ↔ Suno ↔ USB.
- Marcar claramente `local`, `stream`, `recuperar desde Suno`, `recuperar desde SoundCloud`, `MP3` y `WAV`.
- Descargar desde Suno únicamente con coincidencia validada por título y duración.
- Extraer de Suno la letra disponible, portada y metadatos sin confundir estilo con letra.
- Flujo de sustitución MP3 → WAV sin perder metadatos.
- Streaming de SoundCloud mediante backend autorizado.
- Evitar registros que aparenten ser reproducibles cuando no existe audio.

Criterio de salida: cada registro muestra evidencia de su fuente y toda canción reproducible tiene un archivo local verificado o un stream autorizado funcional.

## 0.5 — Portadas y letras

- Cotejo asistido de imágenes de `00_COVER_INBOX`.
- Validación visual antes de asignar portada.
- Variantes cuadrada y panorámica por canción.
- Importación y edición de letras con control de versión.
- Reporte de canciones sin portada o letra.

Criterio de salida: ninguna portada se asigna sin evidencia y todas las canciones tienen un estado explícito para ambos formatos visuales y la letra.

## 0.6 — Aplicación distribuible

- Firma Developer ID y notarización de Apple.
- Manifiesto remoto versionado y firmado.
- Descarga, verificación e instalación automática de actualizaciones.
- Canales estable y prueba.
- Rollback a la versión anterior.
- Pruebas de actualización sin USB y con USB conectada.

Criterio de salida: una instalación previa detecta, verifica e instala una actualización firmada y puede recuperarse si falla.

## 0.7 — Sincronización privada opcional

- Perfil privado y cifrado de preferencias.
- Sincronización de estrellas, historial y decisiones entre dispositivos.
- La USB continúa siendo la autoridad del audio.
- Exportación e importación completa sin proveedor remoto.

Criterio de salida: dos instalaciones comparten preferencias sin subir los archivos maestros de audio.

## Deuda conocida

- Las ediciones de fichas viven en `localStorage`, no en `metadata.json`.
- El historial y las estrellas no se sincronizan.
- La consulta de actualización sólo reporta estado; no descarga ni instala.
- El backend de streaming SoundCloud requiere `SOUNDCLOUD_STREAM_API`.
- Los scripts USB usan rutas absolutas del entorno actual.
- Algunas tareas destructivas carecen todavía de modo `--dry-run`.
- La deduplicación acústica elimina carpetas al confirmar el umbral; requiere respaldo y revisión operativa.

## Fuera de alcance por ahora

- Distribución pública desde la aplicación.
- Publicación automática en DistroKid, SoundCloud o Suno.
- Almacenamiento remoto de los masters.
- Venta o licenciamiento automático.

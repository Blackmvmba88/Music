# BlackMamba Music

Reproductor y biblioteca privada de BlackMamba Records. Funciona como WebUI local en `/music` y como aplicación de escritorio para macOS. Los audios canónicos pueden permanecer en la USB; el DMG no incorpora MP3 ni WAV.

Este repositorio es el producto integrado `Music`: contiene el reproductor, la
Escuela de Música, el catálogo, los conectores Suno/SoundCloud y las
herramientas heredadas. El reproductor es un módulo del sistema, no el nombre
del sistema completo.

Material consolidado durante la migración:

- `tools/catalog-legacy/`: catálogo Python procedente del antiguo repositorio
  local `music`.
- `docs/designs/legacy-reproductor/`: diseños exclusivos conservados desde la
  copia histórica `Documents/Reproductor`.
- `docs/migrations/reproductor-working-tree-2026-07-15.patch`: cambios locales
  divergentes de esa copia, preservados antes de la consolidación.
- `exports/`: reportes de letras y transcripción recuperados de la última rama
  operativa de `Reproductor`.

## Estado actual

- Biblioteca unificada USB + fichas recuperables desde Suno o SoundCloud.
- Reproducción local con `play`, pausa, stop, anterior, siguiente, ±10 segundos, volumen, timeline y shuffle.
- Botón Video a MP3 junto a los controles de cambio de canción; selecciona un video local, extrae su audio con `ffmpeg` y abre el resultado en Finder.
- Canción activa centrada y siempre visible.
- Búsqueda ligera por título, artista, archivo, URL, hashtags y metadatos de índice; ignora acentos y mayúsculas.
- Calificación de 1 a 5 estrellas durante la reproducción y ordenamiento por estrellas.
- Historial local de las últimas 100 reproducciones.
- Estrellas persistentes en `localStorage` y en `.bmmp-data/ratings.json` mediante escritura atómica.
- Volumen inicial migrado a 100%, conservando después el ajuste elegido.
- Edición directa del nombre dentro de la fila de la canción.
- Filtros funcionales para audio local, recuperables, sin portada y sin letra.
- Duración colocada bajo el nombre y selector persistente iluminado en morado: Reggae, Rock, Reggaeton, Pop, Clásica, Electrónica, Corrido y Rap.
- El control `Letra ✓` se ilumina en verde cuando la canción ya tiene una letra disponible.
- Descarga independiente del archivo local de cada canción; recuperación guiada desde Suno o SoundCloud cuando todavía no está materializada.
- Vistas Combined, Grid, Console y Focus.
- Estudio visual por canción reutilizado de EscrituraSound: cuatro presets, siete canales de color y ritmo de animación persistente.
- Portada cuadrada 1:1 y panorámica 16:9 por canción.
- Botón flotante de eliminación durante la edición de la galería, accesible desde cualquier posición del scroll.
- Galería separada por dimensiones reales en portadas 1:1, panorámicas y otros formatos.
- La portada del reproductor inferior abre directamente la biblioteca con la canción actual como destino.
- Editor de letra, género, estilo y metadatos editoriales de SoundCloud.
- Persistencia canónica de letras editadas en `lyrics.txt`, `metadata.json` y `library.json` mediante escrituras atómicas.
- Transcripción inteligente en dos escuchas: borrador estructural con Whisper Small, segunda interpretación contextual con Whisper Medium y selección por confianza/acuerdo. `BLACKMAMBA_WHISPER_SECOND_MODEL` permite cambiar el segundo modelo.
- Menú lateral `Letras` para revisión humana rápida: búsqueda, reproducción simultánea, editor amplio y guardado canónico en USB.
- La letra canónica de la USB tiene precedencia sobre borradores locales antiguos o vacíos.
- Identidad fija: artista `Iyari Gomez`, autor `Iyari Cancino Gomez`, sello `BlackMamba RECORDS`.
- Revisión de pertenencia: aprobada, rechazada o para después.
- Aplicación Electron arm64 y DMG privado sin archivos de audio.
- Consulta remota de actualizaciones mediante manifiesto; no instala actualizaciones todavía.

El entrenador rítmico histórico continúa disponible en `/`, pero el producto principal de escritorio abre `/music`.

### Entrenamiento rítmico

El nivel medio **Pulso desplazado** está disponible en `/`: diez tareas de dos compases con contratiempos, silencios en tiempos fuertes y entradas en “y”. Permite elegir de 60 a 110 BPM y entrega diagnóstico local de pulso, ritmo, continuidad y anticipación. Cada diagnóstico conserva evidencia, advertencias, confianza y razón de fallback cuando faltan datos.

## Inicio rápido

Requisitos:

- Node.js 22 o posterior.
- npm 10 o posterior.
- `ffprobe` para importar y analizar medios.
- `ffmpeg` para el botón local Video a MP3.
- USB montada en `/Volumes/ADATA SC740` para usar la biblioteca canónica completa.
- `fpcalc` sólo para deduplicación acústica.

```bash
npm ci
npm run doctor
npm run dev
```

Abre `http://127.0.0.1:5173/music`.

Aplicación de escritorio:

```bash
npm run desktop:dev
```

DMG privado:

```bash
npm run desktop:dmg:private
```

El artefacto queda en `release/BlackMamba-Music-0.2.0-arm64.dmg`.

## Operación

| Comando                       | Efecto                                           |
| ----------------------------- | ------------------------------------------------ |
| `npm run dev`                 | Inicia Vite con recarga automática               |
| `npm run build`               | Valida TypeScript y genera `dist/`               |
| `npm run desktop:dev`         | Compila y abre Electron                          |
| `npm run desktop:dmg:private` | Construye app y DMG sin MP3/WAV                  |
| `npm run doctor`              | Comprueba Node, dependencias, scripts y entradas |
| `npm run lint`                | Ejecuta ESLint                                   |
| `npm run typecheck`           | Valida TypeScript                                |
| `npm test -- --run`           | Ejecuta las pruebas una vez                      |
| `npm run check`               | Lint, tipos, cobertura y build                   |
| `npm run clean`               | Borra únicamente artefactos generados            |
| `npm run library:covers`      | Unifica y deduplica imágenes en la bandeja USB   |
| `npm run library:repair-lyrics` | Audita indicadores de letras; añade `-- --apply` para repararlos con respaldo |
| `npm run library:cotejar-soundcloud` | Coteja el perfil público en vivo por ID, título y duración; no descarga audio |
| `npm run library:cotejar-soundcloud:apply` | Aplica sólo coincidencias verificadas del reporte reciente |
| `npm run library:transcribe-soundcloud -- --apply` | Transcribe secuencialmente las coincidencias confirmadas sin letra |
| `npm run library:repair-json` | Detecta valores JSON no finitos; añade `-- --apply` para repararlos |

Los comandos de biblioteca USB se documentan en [METACOMMANDS.md](./METACOMMANDS.md). Algunos eliminan archivos después de verificar hashes; deben ejecutarse deliberadamente.

La biblioteca principal combina una sola ficha por canción con disponibilidad
independiente en USB/local, Suno y SoundCloud. Para importar el inventario Suno
enriquecido y validado:

```bash
npm run library:import-suno
```

El reproductor muestra también canciones que sólo existen en Suno y conserva
badges apagados/activos para distinguir las plataformas donde está cada obra.

El arranque usa un catálogo ligero en `/player/library.json`. Las letras,
descripciones, evidencias y advertencias extensas se solicitan por canción a
`/api/tracks/:id/details` al abrir la letra o el editor. La vista Suno tampoco
transfiere todas las letras durante su carga inicial.

Las calificaciones se guardan tanto en el perfil local como en
`ratings.json` dentro de los datos persistentes de la aplicación. El servidor
usa normalmente `127.0.0.1:17892`, evitando que un puerto aleatorio cambie el
origen del almacenamiento entre reinicios.

Para preparar la recuperación desde Suno:

```bash
npm run library:audit-sources
npm run library:prepare-suno
```

La segunda orden coteja por título y duración y genera `suno-recovery-queue.json`
con letra (cuando Suno la expone), portada, estilo, versión y evidencia. La URL
de audio pública se conserva sólo como previsualización MP3; el WAV permanece
marcado como descarga autenticada pendiente.

Para SoundCloud, primero se genera `soundcloud-live-cotejo.json`. La aplicación
posterior exige un reporte de menos de 24 horas, confianza mínima de 0.98 y una
diferencia de duración no mayor a dos segundos. Las coincidencias ambiguas nunca
se escriben automáticamente. Las letras publicadas por el autor tienen prioridad;
si no existen, el lote local usa Whisper small y medium en serie y conserva
confianza, evidencia y advertencias para la revisión editorial.

## Biblioteca canónica

Ruta predeterminada:

```text
/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER
├── library.json
├── 00_COVER_INBOX/
└── <titulo>--<hash>/
    ├── audio.mp3
    ├── cover.jpg
    ├── lyrics.txt
    └── metadata.json
```

Cada canción se identifica por SHA-256. El servidor Electron detecta la USB, lee `library.json` y sirve audio con soporte HTTP Range. Cuando la USB no está conectada, la aplicación conserva la interfaz y las fichas. Una canción sin archivo local ni stream aún no puede reproducirse, pero se muestra como recuperable: primero WAV desde Suno y después SoundCloud.

## Persistencia local

La WebUI usa `localStorage`:

| Clave                         | Contenido                        |
| ----------------------------- | -------------------------------- |
| `blackmamba-vitrine-reviews`  | Decisiones de pertenencia        |
| `blackmamba-vitrine-ratings`  | Calificaciones de estrellas      |
| `blackmamba-track-metadata`   | Ediciones de fichas de canciones |
| `blackmamba-playback-history` | Últimas 100 reproducciones       |

Estas preferencias todavía no se sincronizan entre dispositivos ni se escriben automáticamente en la USB.

## Metadata visual y palabras clave

- Cada imagen de `00_COVER_INBOX/images.json` puede guardar `prompt`, `keywords`, fuente y confianza.
- `npm run library:image-metadata -- --apply` clasifica localmente las imágenes con Vision de macOS; no sube archivos ni altera los JPG.
- Cada letra guarda `lyricKeywords` en `library.json` y en su `metadata.json`.
- `npm run library:lyric-keywords -- --apply` genera palabras clave para letras ya existentes.
- La galería ordena primero las imágenes con coincidencias semánticas entre la letra y la metadata visual; los prompts y palabras clave pueden corregirse manualmente desde la WebUI.

## Video a MP3

En la aplicación Electron, `Web:Mp3` aparece como sección en la barra lateral y
abre el panel completo de extracción. El botón con icono de video situado junto
a “canción anterior” conserva el acceso directo al selector nativo de macOS.
Acepta MP4, MOV, MKV, WEBM, AVI,
M4V, MPEG y MPG. El MP3 se guarda en `~/Downloads/Web-a-MP3` y Finder lo muestra
al terminar. El video original no se modifica y ningún archivo sale del Mac.

La operación devuelve confianza, evidencia, advertencias y razón de fallback.
Por ahora el resultado queda en la bandeja de Descargas; su incorporación al
catálogo canónico debe pasar después por fingerprint y revisión.

## Arquitectura

```text
USB / SoundCloud / Suno
        ↓
Confidence + Evidence + Warnings + Fallback
        ↓
Fingerprint y deduplicación SHA-256 / Chromaprint
        ↓
Catálogo e ingestión
        ↓
Servidor local Electron
        ↓
React WebUI / aplicación macOS
```

```text
src/app/                 Reproductor y biblioteca
src/api/                 Contrato de carga del catálogo
electron/media-server.cjs Catálogo, streaming y archivos USB
electron/main.cjs        Ventana, transporte y actualizaciones
scripts/                 Ingesta, auditoría, dedupe y releases
public/player/           Snapshot web del catálogo
```

Toda operación de ingestión debe exponer confianza, evidencia, advertencias y razón de fallback. En movimientos destructivos se verifica primero la copia canónica y el hash de origen.

## Desarrollo seguro

- No editar manualmente `dist/`, `release/`, `coverage/` ni `node_modules/`.
- No borrar audios originales hasta verificar la copia canónica por SHA-256.
- No aplicar deduplicación únicamente por nombre; usar huella acústica.
- No incrustar MP3 o WAV en builds públicos o DMG privados.
- Vite no copia `public/player/*.mp3` ni `public/music/*.mp3`; el build incluye únicamente catálogos y muestras de piano autorizadas.
- No asumir que un registro remoto equivale a audio disponible.
- Mantener fijos artista, autor y sello salvo una directiva explícita del propietario.
- Ejecutar `npm run typecheck`, `npm test -- --run` y `npm run build` antes de entregar.

## Documentación

- [ROADMAP.md](./ROADMAP.md): fases terminadas y pendientes.
- [METACOMMANDS.md](./METACOMMANDS.md): órdenes cortas para operar el proyecto.

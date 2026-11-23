# BlackMamba Overlay

Panel nativo no activador para macOS 14 o posterior. El icono de nota en la barra de menús vuelve a mostrar el panel y ofrece la opción de salir. Cerrar el panel de letra deja visible la cintilla.

Desde la raíz del repositorio, compila con `bash native/overlay/build.sh "$PWD/overlay-build"`. Abre `overlay-build/BlackMamba Overlay.app`. El build utiliza la arquitectura de la Mac que lo compila.

Para publicar la reproducción de Spotify, ejecuta `node native/overlay/bridge.mjs [catalog.json] [directorio-vtt]` en un proceso con `SPOTIFY_ACCESS_TOKEN` ya configurado y el permiso de lectura de reproducción. El puente reutiliza el lector de Spotify de Electron. Sigue escaneando aunque la ventana de Music Engine esté cerrada. La app nativa lee por defecto `~/Library/Application Support/BlackMamba Overlay/now-playing.json`. Ambos procesos aceptan `BLACKMAMBA_NOW_PLAYING_FILE` para usar otra ubicación. Los datos antiguos caducan.

Si el catálogo de Music Engine contiene una coincidencia única por ID de Spotify o ISRC, se muestra su letra y se buscan marcas VTT por ID del catálogo. El panel no asume que las grabaciones con títulos iguales sean la misma toma.

La publicación de reproducción desde Engine, SoundCloud externo y Chrome todavía requiere conectarlos al mismo archivo de estado. El panel no instala capturas de entrada, atajos globales ni monitores de mandos.

Con Spotify de escritorio en la misma Mac, **Conectar Spotify** lee la reproducción sin token OAuth. La lista de fuentes muestra los vínculos de DistroKid, SoundCloud y Suno que constan en el catálogo cotejado.

Para vincular letras, crea `recordings.json` en el directorio de soporte del overlay con registros de la misma forma que `catalog-evidence.json`, más `lyrics` (texto) y/o `cues` (objetos `start`, `end` en segundos y `text`). Usa el ID exacto de Spotify. También puedes incluir este archivo en un build privado pasando su ruta en `BLACKMAMBA_RECORDINGS_FILE`.

El respaldo de SoundCloud consulta el permalink cotejado con el token OAuth disponible en el proceso. Solo acepta texto después de una línea independiente `Letra:` o `Lyrics:`. Si la consulta no obtiene letra, espera dos minutos antes de reintentar para esa URL. El texto recuperado se muestra sin marcas de sincronización.

El historial local `listening-history.jsonl` registra una escucha al observar 30 segundos de avance de reproducción en una toma. Cuenta observaciones de la Mac, no cifras oficiales de plataformas. Una pausa no incrementa el contador.

# BlackMamba Overlay

Panel nativo no activador para macOS 14 o posterior. El icono de nota en la barra de menús vuelve a mostrar el panel y ofrece la opción de salir. Cerrar el panel de letra deja visible la cintilla.

Desde la raíz del repositorio, compila con `bash native/overlay/build.sh "$PWD/overlay-build"`. Abre `overlay-build/BlackMamba Overlay.app`. El build utiliza la arquitectura de la Mac que lo compila.

Para publicar la reproducción de Spotify, ejecuta `node native/overlay/bridge.mjs [catalog.json] [directorio-vtt]` en un proceso con `SPOTIFY_ACCESS_TOKEN` ya configurado y el permiso de lectura de reproducción. El puente reutiliza el lector de Spotify de Electron. Sigue escaneando aunque la ventana de Music Engine esté cerrada. La app nativa lee por defecto `~/Library/Application Support/BlackMamba Overlay/now-playing.json`. Ambos procesos aceptan `BLACKMAMBA_NOW_PLAYING_FILE` para usar otra ubicación. Los datos antiguos caducan.

Si el catálogo de Music Engine contiene una coincidencia única por ID de Spotify o ISRC, se muestra su letra y se buscan marcas VTT por ID del catálogo. El panel no asume que las grabaciones con títulos iguales sean la misma toma.

La publicación de reproducción desde Engine, SoundCloud externo y Chrome todavía requiere conectarlos al mismo archivo de estado. El panel no instala capturas de entrada, atajos globales ni monitores de mandos.

Para Spotify de escritorio en la misma Mac, pulsa **Conectar Spotify** en la cintilla. La detección local consulta título, artista, posición y estado sin token OAuth. El puente con catálogo sigue siendo necesario para adjuntar letras y marcas VTT.

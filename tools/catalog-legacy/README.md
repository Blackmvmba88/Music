# Music Bot

Bot local para ordenar tu música publicada en Suno.

## Qué hace

- crea un catálogo local de canciones
- agrega canciones una por una
- lista y busca canciones
- importa desde CSV o JSON
- exporta el catálogo

## Uso rápido

```bash
python3 music_bot.py init
python3 music_bot.py add "Mi canción" --published-at "2026-06-18" --suno-url "https://..." --genre "reggaeton"
python3 music_bot.py set-genre "Mi canción" "reggaeton"
python3 music_bot.py list
python3 music_bot.py list --genre "reggaeton"
python3 music_bot.py search "canción"
python3 music_bot.py inventory "/Volumes/ADATA SC740" /Users/blackmambarecords/Documents/music --limit 20
python3 music_bot.py duplicates "/Volumes/ADATA SC740" /Users/blackmambarecords/Documents
python3 music_bot.py duplicate-report "/Volumes/ADATA SC740" /Users/blackmambarecords/Documents /Users/blackmambarecords/Documents/music/duplicates.json
python3 music_bot.py inspect 1
python3 music_bot.py mark-duplicate "Mi canción" keep
python3 music_bot.py deck-html /Users/blackmambarecords/Documents/music/deck.html --open
```

## Reunir canciones en una sola carpeta

Primero simula el plan:

```bash
python3 music_bot.py collect-audio "/Volumes/ADATA SC740" /Users/blackmambarecords/Documents /Users/blackmambarecords/Documents/music/inbox --copy
```

Si la lista se ve bien, ejecuta de verdad:

```bash
python3 music_bot.py collect-audio "/Volumes/ADATA SC740" /Users/blackmambarecords/Documents /Users/blackmambarecords/Documents/music/inbox --copy --execute
```

Después puedes llevar esa carpeta a la USB.

## Formato CSV

Columnas sugeridas:

- `title`
- `published_at`
- `suno_url`
- `status`
- `genre`
- `notes`

## Siguiente paso

Cuando tengas la lista de publicaciones de Suno, la importamos aquí y luego le añadimos automatización para:

- evitar duplicados
- etiquetar por género
- marcar publicados, pendientes y descartados
- generar resúmenes

## Géneros

Los géneros se guardan como texto libre dentro del catálogo. Eso nos deja empezar rápido con clasificación manual y después unificar nombres cuando ya tengamos la biblioteca completa.

## Contexto

- `inventory` muestra los audios encontrados con duración, tamaño, género y ruta.
- `duplicates` agrupa archivos muy parecidos para quedarnos con una sola copia.
- `duplicate-report` genera un JSON para revisar y decidir qué conservar.
- `inspect` muestra el detalle de una canción del catálogo por índice.
- `mark-duplicate` guarda la decisión manual `keep` o `discard`.
- `deck-html` genera una vista animada con brillo, aura y barras vivas.

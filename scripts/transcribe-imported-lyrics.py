#!/usr/bin/env python3
import json
import re
from pathlib import Path

import mlx_whisper

LIBRARY = Path('/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER')
MANIFEST = LIBRARY / 'library.json'
MODEL = 'mlx-community/whisper-small-mlx'


def clean_transcript(text: str) -> str:
    lines = [re.sub(r'\s+', ' ', line).strip() for line in text.splitlines() if line.strip()]
    cleaned: list[str] = []
    repeated = 0
    previous = ''
    for line in lines:
        key = re.sub(r'[^a-z0-9áéíóúñ]+', '', line.lower())
        if key == previous:
            repeated += 1
            if repeated >= 2:
                continue
        else:
            previous = key
            repeated = 0
        cleaned.append(line)
    return '\n'.join(cleaned).strip() + '\n'


catalog = json.loads(MANIFEST.read_text())
pending = [track for track in catalog['tracks'] if track.get('soundcloudId') and 'pendiente' in (track.get('warnings') or [''])[0].lower()]
print(f'pending={len(pending)} model={MODEL}', flush=True)

for index, track in enumerate(pending, 1):
    folder = LIBRARY / track['folder']
    audio = folder / track['audio']
    print(f'[{index}/{len(pending)}] {track["title"]}', flush=True)
    try:
        result = mlx_whisper.transcribe(str(audio), path_or_hf_repo=MODEL, verbose=False)
        transcript = clean_transcript(result.get('text', ''))
        if len(transcript.strip()) < 12:
            track['warnings'] = ['No se detectó voz suficiente para extraer letra']
            track['lyricsConfidence'] = 0.2
            print('  no-vocals', flush=True)
        else:
            (folder / 'lyrics.txt').write_text(transcript)
            detected = result.get('language')
            track['lyricsLanguage'] = detected
            track['lyricsConfidence'] = 0.72
            track['warnings'] = ['Letra transcrita automáticamente; requiere revisión editorial']
            track.setdefault('evidence', []).append(f'Transcripción local con {MODEL}; idioma {detected or "auto"}')
            print(f'  lyrics={len(transcript)} language={detected}', flush=True)
        (folder / 'metadata.json').write_text(json.dumps(track, indent=2, ensure_ascii=False) + '\n')
        MANIFEST.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
    except Exception as error:
        track['warnings'] = [f'Transcripción fallida: {error}']
        MANIFEST.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
        print(f'  error={error}', flush=True)

print('complete', flush=True)

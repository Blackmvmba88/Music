from __future__ import annotations

import re
import math
from difflib import SequenceMatcher
from typing import Any


def clean_transcript(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text or "")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned: list[str] = []
    previous = ""
    repeated = 0
    for line in lines:
        key = re.sub(r"[^a-z0-9áéíóúñ]+", "", line.lower())
        if key == previous:
            repeated += 1
            if repeated >= 2:
                continue
        else:
            previous, repeated = key, 0
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def quality_score(result: dict[str, Any], text: str) -> float:
    segments = result.get("segments") or []
    probabilities = [value if math.isfinite(value) else -1.5 for item in segments if math.isfinite(value := float(item.get("avg_logprob", -1.5)))]
    no_speech = [value if math.isfinite(value) else 0 for item in segments if math.isfinite(value := float(item.get("no_speech_prob", 0)))]
    confidence = sum(probabilities) / len(probabilities) if probabilities else -1.5
    silence = sum(no_speech) / len(no_speech) if no_speech else 0
    words = re.findall(r"[\wáéíóúñ']+", text.lower())
    diversity = len(set(words)) / max(1, len(words))
    repeated_pairs = sum(1 for left, right in zip(words, words[1:]) if left == right)
    score = confidence * 2.2 + diversity - silence - repeated_pairs * 0.08
    return round(score if math.isfinite(score) else -3.3, 5)


def choose_transcript(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    first_text = clean_transcript(first.get("text", ""))
    second_text = clean_transcript(second.get("text", ""))
    first_score = quality_score(first, first_text)
    second_score = quality_score(second, second_text)
    agreement = SequenceMatcher(None, first_text.lower(), second_text.lower()).ratio()
    # La segunda escucha recibe contexto y gana en empates razonables, pero una
    # caída clara de confianza conserva la primera para evitar alucinaciones.
    selected = "second" if second_score >= first_score - 0.08 else "first"
    text = second_text if selected == "second" else first_text
    return {
        "text": text,
        "selected": selected,
        "firstScore": first_score,
        "secondScore": second_score,
        "agreement": round(agreement, 5),
        "warning": None if agreement >= 0.72 else "Las dos escuchas difieren; requiere revisión editorial",
    }


def build_second_pass_prompt(title: str, artist: str, first_text: str) -> str:
    words = re.findall(r"[A-Za-záéíóúñ']{5,}", first_text.lower())
    counts: dict[str, int] = {}
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    vocabulary = ", ".join(word for word, _count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:32])
    return (
        f"Song title: {title}. Artist: {artist}. "
        "Transcribe song lyrics accurately. Preserve verses and chorus. "
        "Important vocabulary may include BlackMamba, Ganja Love, moonlight, bassline, sacred trees, remedy. "
        f"Vocabulary heard during a first listening: {vocabulary}."
    )

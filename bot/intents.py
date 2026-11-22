"""Deterministic Portuguese intent and preference extraction."""
from __future__ import annotations

import re
import unicodedata


GENRES = {
    "acao": ("Ação", {"movie": 28, "tv": 10759}),
    "aventura": ("Aventura", {"movie": 12, "tv": 10759}),
    "animacao": ("Animação", {"movie": 16, "tv": 16}),
    "comedia": ("Comédia", {"movie": 35, "tv": 35}),
    "crime": ("Crime", {"movie": 80, "tv": 80}),
    "documentario": ("Documentário", {"movie": 99, "tv": 99}),
    "drama": ("Drama", {"movie": 18, "tv": 18}),
    "familia": ("Família", {"movie": 10751, "tv": 10751}),
    "fantasia": ("Fantasia", {"movie": 14, "tv": 10765}),
    "ficcao cientifica": ("Ficção científica", {"movie": 878, "tv": 10765}),
    "misterio": ("Mistério", {"movie": 9648, "tv": 9648}),
    "romance": ("Romance", {"movie": 10749, "tv": None}),
    "suspense": ("Suspense", {"movie": 53, "tv": 9648}),
    "terror": ("Terror", {"movie": 27, "tv": 9648}),
    "guerra": ("Guerra", {"movie": 10752, "tv": 10768}),
    "historia": ("História", {"movie": 36, "tv": 10768}),
    "musical": ("Musical", {"movie": 10402, "tv": None}),
    "western": ("Faroeste", {"movie": 37, "tv": 37}),
}

ALIASES = {
    "acao": ("ação",),
    "animacao": ("animação", "desenho"),
    "comedia": ("comédia", "engraçado", "engraçada"),
    "crime": ("investigação", "investigacao", "detetive", "policial"),
    "documentario": ("documentário",),
    "familia": ("família",),
    "fantasia": ("fantasia",),
    "ficcao cientifica": ("ficção científica", "ficcao", "sci-fi", "sci fi"),
    "misterio": ("mistério",),
    "romance": ("romântico", "romântica", "romantico", "romantica", "amor"),
    "terror": ("horror",),
    "western": ("faroeste",),
    "guerra": ("bélico", "guerra"),
    "historia": ("história",),
}


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _find_genre(text: str):
    normalized = normalize(text)
    for key, (label, ids) in GENRES.items():
        terms = {normalize(key), *(normalize(alias) for alias in ALIASES.get(key, ()))}
        for term in sorted(terms, key=len, reverse=True):
            if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", normalized):
                return label, ids
    return None, None


def _similar_title(text: str) -> str | None:
    match = re.search(
        r"\b(?:parecid[oa]s?|similar(?:es)?|no estilo de|como)\s+"
        r"(?:com\s+|a\s+|ao\s+)?[\"“]?(.+?)[\"”]?[.!?,;]*$",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    title = re.sub(r"^(?:algo|um filme|uma serie|uma série|um titulo|uma obra)\s+", "", match.group(1).strip(), flags=re.IGNORECASE)
    return title[:100] or None


def parse_message(message: str) -> dict:
    normalized = normalize(message).strip()
    filters = {}
    genre, genre_ids = _find_genre(message)
    if genre:
        filters["genre"] = genre
        filters["genre_ids"] = genre_ids

    if re.search(r"\b(series|serie|seriado|temporadas|minisserie)\b", normalized):
        filters["type"] = "tv"
    elif re.search(r"\b(filme|longa|longa metragem|cinema)\b", normalized):
        filters["type"] = "movie"

    runtime = re.search(r"\b(?:menos de|no maximo|ate|em ate)\s+(\d{1,3})\s*(?:min(?:uto)?s?)?\b", normalized)
    if runtime:
        filters["max_runtime"] = min(int(runtime.group(1)), 600)
    else:
        hours = re.search(r"\b(?:menos de|no maximo|ate|em ate)\s+(uma|um|duas|dois|tres|tr[eê]s)\s+horas?\b", normalized)
        if hours:
            filters["max_runtime"] = {"uma": 60, "um": 60, "duas": 120, "dois": 120, "tres": 180, "três": 180}[hours.group(1)]
        elif re.search(r"\b(?:curto|curta|rapid[oa]|pouco tempo)\b", normalized):
            filters["max_runtime"] = 100

    year = re.search(r"\b(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b", normalized)
    if year:
        filters["year"] = int(year.group(1))

    similar = _similar_title(message)
    if similar:
        filters["similar_to"] = similar

    if re.search(r"\b(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí)\b", normalized):
        intent = "saudacao"
    elif re.search(r"\b(ajuda|como funciona|o que voce faz|o que você faz)\b", normalized):
        intent = "ajuda"
    elif similar:
        intent = "buscar_similares"
    elif genre:
        intent = "buscar_por_genero"
    elif "max_runtime" in filters:
        intent = "buscar_por_duracao"
    elif "year" in filters:
        intent = "buscar_por_ano"
    elif filters.get("type") == "tv":
        intent = "recomendar_serie"
    else:
        intent = "recomendar_filme"

    return {"intent": intent, "filters": filters}


def merge_preferences(previous: dict, current: dict) -> dict:
    """Keep earlier conversational preferences unless this message replaces them."""
    merged = dict(previous)
    merged.update(current)
    return merged

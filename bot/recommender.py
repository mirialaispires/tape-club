"""TMDB discovery, similar-title lookup, and deterministic recommendation ranking."""
from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from .intents import merge_preferences, parse_message


class BotError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code


def rank_candidates(candidates: list[dict], filters: dict, limit: int = 5) -> list[dict]:
    ranked = []
    wanted_type = filters.get("type")
    genre_filter = filters.get("genre_ids") or {}

    for item in candidates:
        if wanted_type and item.get("kind") != wanted_type:
            continue
        runtime = item.get("runtime")
        max_runtime = filters.get("max_runtime")
        if max_runtime and (runtime is None or runtime > max_runtime):
            continue
        if filters.get("year") and item.get("year") != filters["year"]:
            continue

        genre_ids = set(item.get("genre_ids") or [])
        wanted_genre = genre_filter.get(item.get("kind"))
        if genre_filter and (wanted_genre is None or wanted_genre not in genre_ids):
            continue

        score = 0.0
        if wanted_type and item.get("kind") == wanted_type:
            score += 20
        if wanted_genre is not None:
            score += 35
        if max_runtime and runtime is not None:
            score += 20 * (1 - runtime / (max_runtime * 2))
        if filters.get("year") and item.get("year") == filters["year"]:
            score += 20
        rating = item.get("rating")
        if rating is not None:
            score += max(0, min(float(rating), 10)) * 0.8
        votes = max(0, int(item.get("votes") or 0))
        score += min(votes, 1000) / 1000
        ranked.append({**item, "recommendation_score": round(score, 3)})
    ranked.sort(key=lambda item: (-item["recommendation_score"], -(item.get("rating") or 0), -(item.get("votes") or 0), item["title"].casefold()))
    return ranked[:limit]


class TmdbClient:
    def __init__(self, api_key: str | None = None, read_token: str | None = None, base_url: str | None = None, opener=None):
        self.api_key = (api_key if api_key is not None else os.environ.get("TMDB_API_KEY", "")).strip()
        self.read_token = (read_token if read_token is not None else os.environ.get("TMDB_READ_TOKEN", "")).strip()
        if not self.read_token and self.api_key.startswith("eyJ"):
            self.read_token, self.api_key = self.api_key, ""
        self.base_url = (base_url or os.environ.get("TMDB_BASE_URL") or "https://api.themoviedb.org/3").rstrip("/")
        self.opener = opener or urllib.request.urlopen

    @property
    def enabled(self):
        return bool(self.api_key or self.read_token)

    def request(self, path: str, params: dict | None = None) -> dict:
        if not self.enabled:
            raise BotError(503, "not_configured", "O TMDB não está configurado neste servidor. Defina TMDB_API_KEY ou TMDB_READ_TOKEN.")
        query = dict(params or {})
        query["language"] = "pt-BR"
        if self.api_key:
            query["api_key"] = self.api_key
        url = f"{self.base_url}{path}?{urllib.parse.urlencode(query)}"
        headers = {"Accept": "application/json", "User-Agent": "TapeClubBot/1.0"}
        if self.read_token:
            headers["Authorization"] = f"Bearer {self.read_token}"
        request = urllib.request.Request(url, headers=headers)
        try:
            with self.opener(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, dict):
                    raise BotError(502, "bad_tmdb_response", "O TMDB retornou um formato inesperado.")
                return payload
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            if status in (401, 403):
                raise BotError(503, "tmdb_auth", "O TMDB recusou a chave do servidor. Confira TMDB_API_KEY ou TMDB_READ_TOKEN.") from None
            if status == 429:
                raise BotError(503, "rate_limited", "O TMDB está limitando as consultas. Aguarde um pouco e tente de novo.") from None
            raise BotError(502, "tmdb_unavailable", "O TMDB não conseguiu atender à consulta agora.") from None
        except (urllib.error.URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError):
            raise BotError(502, "tmdb_unavailable", "Não consegui falar com o TMDB agora. Tente novamente em instantes.") from None

    @staticmethod
    def _year(date):
        try:
            return int(date[:4]) if date and len(date) >= 4 else None
        except (TypeError, ValueError):
            return None

    def _normalize(self, raw: dict, kind: str) -> dict | None:
        if not isinstance(raw, dict):
            return None
        title = raw.get("title") or raw.get("name") or raw.get("original_title") or raw.get("original_name")
        if not isinstance(title, str) or not title or not raw.get("id"):
            return None
        path = raw.get("poster_path")
        score = raw.get("vote_average")
        try:
            score = float(score) if score is not None else None
            if score is not None and not math.isfinite(score):
                score = None
        except (ValueError, TypeError):
            score = None
        try:
            votes = max(0, int(raw.get("vote_count") or 0))
        except (ValueError, TypeError):
            votes = 0
        return {
            "id": str(raw["id"]),
            "kind": kind,
            "title": title,
            "original_title": raw.get("original_title") or raw.get("original_name"),
            "year": self._year(raw.get("release_date") or raw.get("first_air_date")),
            "overview": raw.get("overview") or "",
            "poster": f"https://image.tmdb.org/t/p/w342{path}" if isinstance(path, str) and path.startswith("/") else None,
            "genre_ids": [int(g) for g in raw["genre_ids"] if isinstance(g, int)] if isinstance(raw.get("genre_ids"), list) else [],
            "runtime": raw.get("runtime") or None,
            "rating": score,
            "votes": votes,
        }

    def discover(self, filters: dict) -> list[dict]:
        kind = filters.get("type")
        kinds = [kind] if kind in ("movie", "tv") else ["movie", "tv"]
        results = []
        for content_type in kinds:
            params = {"include_adult": "false", "sort_by": "vote_average.desc", "vote_count.gte": 10, "page": 1}
            genre_ids = filters.get("genre_ids") or {}
            if genre_ids and genre_ids.get(content_type) is None:
                continue
            genre_id = genre_ids.get(content_type)
            if genre_id is not None:
                params["with_genres"] = genre_id
            if filters.get("max_runtime"):
                params["with_runtime.lte"] = filters["max_runtime"]
            if filters.get("year"):
                params["primary_release_year" if content_type == "movie" else "first_air_date_year"] = filters["year"]
            payload = self.request(f"/discover/{content_type}", params)
            raw_results = payload.get("results")
            for raw in raw_results if isinstance(raw_results, list) else []:
                item = self._normalize(raw, content_type)
                if item:
                    results.append(item)
        results.sort(key=lambda item: (-(item.get("rating") or 0), -(item.get("votes") or 0), item["title"].casefold()))
        return results

    def similar(self, title: str, filters: dict) -> list[dict]:
        found = self.request("/search/multi", {"query": title, "include_adult": "false", "page": 1}).get("results", [])
        if not isinstance(found, list):
            found = []
        found = [item for item in found if isinstance(item, dict) and item.get("media_type") in ("movie", "tv") and item.get("id")]
        found.sort(key=lambda item: (item.get("vote_count") or 0, item.get("popularity") or 0), reverse=True)
        if not found:
            return []
        best = found[0]
        kind = best["media_type"]
        source_id = urllib.parse.quote(str(best["id"]), safe="")
        similar = self.request(f"/{kind}/{source_id}/similar", {"page": 1}).get("results", [])
        if not isinstance(similar, list):
            similar = []
        return [item for raw in similar if (item := self._normalize(raw, kind))]

    def with_runtime(self, candidates: list[dict]) -> list[dict]:
        """Fetch runtime for a bounded set so duration preferences can be scored accurately."""
        selected = candidates[:8]
        if not selected:
            return []

        def fetch_runtime(item):
            payload = self.request(f"/{item['kind']}/{urllib.parse.quote(item['id'], safe='')}")
            runtime = payload.get("runtime") if item["kind"] == "movie" else (
                (payload.get("episode_run_time") or [None])[0]
                or (payload.get("last_episode_to_air") or {}).get("runtime")
            )
            try:
                runtime = int(runtime) if runtime is not None else None
            except (TypeError, ValueError):
                runtime = None
            return {**item, "runtime": runtime}

        completed = []
        errors = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fetch_runtime, item): item for item in selected}
            for future in as_completed(futures):
                try:
                    completed.append(future.result())
                except BotError as error:
                    errors.append(error)
        completed.sort(key=lambda item: (-(item.get("rating") or 0), -(item.get("votes") or 0), item["title"].casefold()))
        if not any(item.get("runtime") is not None for item in completed) and errors:
            raise errors[0]
        return completed


class RecommendationEngine:
    def __init__(self, tmdb: TmdbClient):
        self.tmdb = tmdb

    def respond(self, message: str, previous_preferences: dict):
        parsed = parse_message(message)
        intent, filters = parsed["intent"], parsed["filters"]
        if intent == "saudacao":
            return {"intent": intent, "filters": filters, "recommendations": [], "message": "Oi! Posso procurar filmes ou séries por gênero, duração, ano ou algo parecido com um título. O que está no clima hoje?"}
        if intent == "ajuda":
            return {"intent": intent, "filters": filters, "recommendations": [], "message": "Me diga o gênero, se prefere filme ou série, a duração máxima, o ano ou um título de referência. Exemplo: “um filme de terror com menos de duas horas”."}

        effective = merge_preferences(previous_preferences, filters)
        if intent == "buscar_similares":
            candidates = self.tmdb.similar(effective["similar_to"], effective)
        else:
            candidates = self.tmdb.discover(effective)

        if effective.get("max_runtime"):
            candidates = self.tmdb.with_runtime(candidates)
        recommendations = rank_candidates(candidates, effective)
        if not recommendations:
            response = "Não achei opções com esses filtros no catálogo disponível do TMDB. Tente ampliar o período ou remover um dos critérios."
        else:
            names = ", ".join(item["title"] for item in recommendations[:3])
            response = f"Separei {len(recommendations)} opção(ões) para você: {names}. Usei os filtros identificados e ordenei pela combinação de aderência, avaliação e volume de votos."
        return {"intent": intent, "filters": filters, "preferences": effective, "recommendations": recommendations, "message": response}

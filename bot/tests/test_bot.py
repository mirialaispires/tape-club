import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from tempfile import TemporaryDirectory

from bot.intents import parse_message
from bot.recommender import BotError, RecommendationEngine, TmdbClient, rank_candidates
from bot.server import create_server
from bot.service import BotService
from bot.storage import Store


class FakeTmdb:
    enabled = True

    def __init__(self, candidates=None):
        self.candidates = candidates or []
        self.queries = []

    def discover(self, filters):
        self.queries.append(("discover", filters))
        return self.candidates

    def similar(self, title, filters):
        self.queries.append(("similar", title, filters))
        return self.candidates

    def with_runtime(self, candidates):
        return candidates


def candidate(title, **changes):
    base = {
        "id": "42",
        "kind": "movie",
        "title": title,
        "year": 2020,
        "overview": "Sinopse",
        "poster": None,
        "genre_ids": [27],
        "runtime": 90,
        "rating": 8.0,
        "votes": 500,
    }
    return {**base, **changes}


class IntentTests(unittest.TestCase):
    def test_extracts_genre_type_and_word_duration(self):
        parsed = parse_message("Quero uma série de investigação com menos de duas horas")
        self.assertEqual(parsed["intent"], "buscar_por_genero")
        self.assertEqual(parsed["filters"]["genre"], "Crime")
        self.assertEqual(parsed["filters"]["type"], "tv")
        self.assertEqual(parsed["filters"]["max_runtime"], 120)

    def test_extracts_movie_genre_and_numeric_duration(self):
        parsed = parse_message("Quero um filme de terror com menos de 110 minutos")
        self.assertEqual(parsed["intent"], "buscar_por_genero")
        self.assertEqual(parsed["filters"]["genre_ids"]["movie"], 27)
        self.assertEqual(parsed["filters"]["max_runtime"], 110)

    def test_similarity_greeting_year_and_help_intents(self):
        self.assertEqual(parse_message("Algo parecido com Interestelar")["filters"]["similar_to"], "Interestelar")
        self.assertEqual(parse_message("Oi, tudo bem?")["intent"], "saudacao")
        self.assertEqual(parse_message("um filme de 1994")["intent"], "buscar_por_ano")
        self.assertEqual(parse_message("Como funciona?")["intent"], "ajuda")

    def test_intent_labels_cover_recommendation_modes(self):
        self.assertEqual(parse_message("Quero uma série")["intent"], "recomendar_serie")
        self.assertEqual(parse_message("Não sei o que assistir")["intent"], "recomendar_filme")
        self.assertEqual(parse_message("Quero algo curto")["intent"], "buscar_por_duracao")


class RankingTests(unittest.TestCase):
    def test_scores_apply_filters_and_ratings_deterministically(self):
        items = [
            candidate("Terror bem avaliado", rating=9.0),
            candidate("Ação popular", genre_ids=[28], rating=9.5, votes=10000),
            candidate("Terror longo", runtime=150, rating=10.0),
        ]
        ranked = rank_candidates(items, {"type": "movie", "genre_ids": {"movie": 27}, "max_runtime": 120})
        self.assertEqual([item["title"] for item in ranked], ["Terror bem avaliado"])
        self.assertGreater(ranked[0]["recommendation_score"], 0)

    def test_filters_by_exact_year_and_type(self):
        items = [
            candidate("Ano certo", year=1994, kind="movie"),
            candidate("Ano errado", year=1995, kind="movie"),
            candidate("Série", year=1994, kind="tv"),
        ]
        ranked = rank_candidates(items, {"type": "movie", "year": 1994})
        self.assertEqual([item["title"] for item in ranked], ["Ano certo"])


class TmdbTests(unittest.TestCase):
    def test_discover_uses_server_key_and_normalizes_incomplete_payload(self):
        calls = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return json.dumps({"results": [{"id": 7, "title": "Fita", "genre_ids": [27], "vote_average": 8.1}]}).encode()

        def opener(request, timeout):
            calls.append((request, timeout))
            return Response()

        client = TmdbClient(api_key="server-secret", base_url="https://tmdb.test/3", opener=opener)
        items = client.discover({"type": "movie", "genre_ids": {"movie": 27}, "max_runtime": 100})
        self.assertEqual(items[0]["title"], "Fita")
        self.assertEqual(items[0]["year"], None)
        self.assertIsNone(items[0]["poster"])
        self.assertIn("api_key=server-secret", calls[0][0].full_url)
        self.assertIn("with_runtime.lte=100", calls[0][0].full_url)

    def test_upstream_auth_and_rate_limits_are_reported(self):
        def response_for(code):
            def opener(*_, **__):
                raise urllib.error.HTTPError("https://tmdb.test", code, "upstream", {}, None)
            return opener

        for code, expected in ((401, "tmdb_auth"), (429, "rate_limited")):
            client = TmdbClient(api_key="secret", opener=response_for(code))
            with self.subTest(code=code), self.assertRaises(BotError) as caught:
                client.request("/discover/movie")
            self.assertEqual(caught.exception.code, expected)

    def test_runtime_lookup_uses_details_endpoint_and_preserves_known_title_data(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return json.dumps({"runtime": 94}).encode()

        client = TmdbClient(api_key="server-secret", base_url="https://tmdb.test/3", opener=lambda *_args, **_kwargs: Response())
        result = client.with_runtime([candidate("Tempo certo")])
        self.assertEqual(result[0]["runtime"], 94)
        self.assertEqual(result[0]["title"], "Tempo certo")

    def test_similar_lookup_searches_reference_then_uses_its_type_endpoint(self):
        calls = []
        payloads = [
            {"results": [
                {"id": 12, "media_type": "person", "name": "Pessoa"},
                {"id": 42, "media_type": "movie", "vote_count": 200, "popularity": 10},
            ]},
            {"results": [{"id": 99, "title": "Parente distante", "genre_ids": [878], "vote_average": 7.5}]},
        ]

        class Response:
            def __init__(self, value):
                self.value = value

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return json.dumps(self.value).encode()

        def opener(request, timeout):
            calls.append(request.full_url)
            return Response(payloads.pop(0))

        client = TmdbClient(api_key="server-secret", base_url="https://tmdb.test/3", opener=opener)
        result = client.similar("Interestelar", {})
        self.assertEqual(result[0]["title"], "Parente distante")
        self.assertIn("/3/search/multi?", calls[0])
        self.assertIn("/3/movie/42/similar?", calls[1])

    def test_missing_credentials_is_explicit(self):
        client = TmdbClient(api_key="", read_token="", opener=lambda *_args, **_kwargs: None)
        with self.assertRaises(BotError) as caught:
            client.discover({})
        self.assertEqual(caught.exception.code, "not_configured")


class RestAndStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.store = Store(f"{self.temp.name}/bot.sqlite3")
        self.tmdb = FakeTmdb([candidate("Terror na fita")])
        self.service = BotService(self.store, RecommendationEngine(self.tmdb))
        self.server = create_server("127.0.0.1", 0, self.service)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def request(self, method, path, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            response = urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            response = error
        return response.code, json.loads(response.read().decode())

    def test_rest_chat_recommendations_and_history_persist(self):
        status, created = self.request("POST", "/api/conversations", {})
        self.assertEqual(status, 201)
        status, result = self.request("POST", "/api/chat", {
            "conversation_id": created["conversation_id"],
            "message": "Quero um filme de terror",
        })
        self.assertEqual(status, 200)
        self.assertEqual(result["intent"], "buscar_por_genero")
        self.assertEqual(result["recommendations"][0]["title"], "Terror na fita")
        status, history = self.request("GET", f"/api/conversations/{created['conversation_id']}")
        self.assertEqual(status, 200)
        self.assertEqual([message["role"] for message in history["messages"]], ["user", "assistant"])
        self.assertEqual(len(history["messages"][1]["recommendations"]), 1)
        self.assertEqual(self.store.preferences(created["conversation_id"])["genre"], "Terror")

    def test_validation_missing_conversation_and_empty_results(self):
        status, error = self.request("POST", "/api/chat", {"message": "   "})
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "invalid_message")
        status, error = self.request("POST", "/api/chat", {"message": "a" * 501})
        self.assertEqual(status, 413)
        self.assertEqual(error["error"]["code"], "message_too_long")
        status, error = self.request("GET", "/api/conversations/AAAAAAAAAAAAAAAAAAAA")
        self.assertEqual(status, 404)
        self.tmdb.candidates = []
        _, created = self.request("POST", "/api/conversations", {})
        status, result = self.request("POST", "/api/chat", {
            "conversation_id": created["conversation_id"],
            "message": "Quero um filme de terror",
        })
        self.assertEqual(status, 200)
        self.assertEqual(result["recommendations"], [])
        self.assertIn("Não achei", result["message"])

    def test_tmdb_failure_returns_actionable_rest_error(self):
        self.service.engine.tmdb = TmdbClient(api_key="", read_token="")
        _, created = self.request("POST", "/api/conversations", {})
        status, error = self.request("POST", "/api/chat", {
            "conversation_id": created["conversation_id"],
            "message": "Quero um filme",
        })
        self.assertEqual(status, 503)
        self.assertEqual(error["error"]["code"], "not_configured")
        history = self.service.conversation(created["conversation_id"])
        self.assertEqual(len(history["messages"]), 2)


if __name__ == "__main__":
    unittest.main()

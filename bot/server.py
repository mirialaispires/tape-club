"""Standard-library JSON REST API for the Tape Club Bot."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.recommender import BotError, RecommendationEngine, TmdbClient
from bot.service import BotService
from bot.storage import Store

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv():
    file = ROOT / ".env"
    if not file.exists():
        return
    for line in file.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if not match or match.group(1) in os.environ:
            continue
        value = match.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[match.group(1)] = value


def create_server(host: str, port: int, service: BotService):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TapeClubBot/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            print(f"[tape-club-bot] {fmt % args}", file=sys.stderr)

        def respond(self, status: int, payload: dict):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/health":
                return self.respond(200, {"ok": True, "tmdb_configured": service.engine.tmdb.enabled})
            prefix = "/api/conversations/"
            if path.startswith(prefix):
                try:
                    return self.respond(200, service.conversation(unquote(path[len(prefix):])))
                except BotError as error:
                    return self.respond(error.status, {"error": {"code": error.code, "message": str(error)}})
            self.respond(404, {"error": {"code": "not_found", "message": "Rota não encontrada."}})

        def do_POST(self):
            path = urlsplit(self.path).path
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.respond(400, {"error": {"code": "bad_length", "message": "Cabeçalho de tamanho inválido."}})
            if length < 0:
                return self.respond(400, {"error": {"code": "bad_length", "message": "Cabeçalho de tamanho inválido."}})
            if length > 8192:
                return self.respond(413, {"error": {"code": "too_large", "message": "O envio excede o limite permitido."}})
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(payload, dict):
                    raise ValueError("object_required")
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
                return self.respond(400, {"error": {"code": "bad_json", "message": "Envie um objeto JSON válido."}})

            if path == "/api/conversations":
                return self.respond(201, service.new_conversation())
            if path == "/api/chat":
                try:
                    answer = service.chat(payload.get("message"), payload.get("conversation_id"))
                    return self.respond(200, answer)
                except BotError as error:
                    return self.respond(error.status, {"error": {"code": error.code, "message": str(error)}})
            self.respond(404, {"error": {"code": "not_found", "message": "Rota não encontrada."}})

        def do_PUT(self):
            self.respond(405, {"error": {"code": "method_not_allowed", "message": "Método não permitido."}})

        do_PATCH = do_PUT
        do_DELETE = do_PUT

    return ThreadingHTTPServer((host, port), Handler)


def main():
    load_dotenv()
    data_file = Path(os.environ.get("BOT_DB", str(ROOT / "data" / "tape-club-bot.sqlite3")))
    if not data_file.is_absolute():
        data_file = ROOT / data_file
    store = Store(data_file)
    service = BotService(store, RecommendationEngine(TmdbClient()))
    host = os.environ.get("BOT_HOST", "127.0.0.1")
    port = int(os.environ.get("BOT_PORT", "3101"))
    server = create_server(host, port, service)
    print(f"Tape Club Bot REST em http://{host}:{port} (TMDB {'configurado' if service.engine.tmdb.enabled else 'sem chave'})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

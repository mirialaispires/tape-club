"""SQLite persistence for anonymous bot conversations and recommendation history."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._connect() as db:
            db.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                    content TEXT NOT NULL,
                    intent TEXT,
                    filters_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS messages_conversation
                    ON messages(conversation_id, id);
                CREATE TABLE IF NOT EXISTS preferences (
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    key TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (conversation_id, key)
                );
                CREATE TABLE IF NOT EXISTS recommendations (
                    id INTEGER PRIMARY KEY,
                    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                    rank INTEGER NOT NULL,
                    external_id TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK (kind IN ('movie', 'tv')),
                    score REAL NOT NULL,
                    payload_json TEXT NOT NULL,
                    UNIQUE(message_id, external_id, kind)
                );
                """
            )

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def create_conversation(self, conversation_id: str):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO conversations (id) VALUES (?)", (conversation_id,))
        return conversation_id

    def has_conversation(self, conversation_id: str) -> bool:
        with self._lock, self._connect() as db:
            return db.execute("SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)).fetchone() is not None

    def preferences(self, conversation_id: str) -> dict:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT key, value_json FROM preferences WHERE conversation_id = ?", (conversation_id,)).fetchall()
        return {row["key"]: json.loads(row["value_json"]) for row in rows}

    def save_turn(self, conversation_id: str, user_text: str, assistant_text: str, intent: str, filters: dict, recommendations: list):
        with self._lock, self._connect() as db:
            db.execute("BEGIN")
            user = db.execute(
                "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
                (conversation_id, user_text),
            )
            assistant = db.execute(
                "INSERT INTO messages (conversation_id, role, content, intent, filters_json) VALUES (?, 'assistant', ?, ?, ?)",
                (conversation_id, assistant_text, intent, json.dumps(filters, ensure_ascii=False)),
            )
            message_id = assistant.lastrowid
            for key, value in filters.items():
                db.execute(
                    """INSERT INTO preferences (conversation_id, key, value_json)
                       VALUES (?, ?, ?)
                       ON CONFLICT(conversation_id, key) DO UPDATE SET
                         value_json = excluded.value_json, updated_at = datetime('now')""",
                    (conversation_id, key, json.dumps(value, ensure_ascii=False)),
                )
            for rank, item in enumerate(recommendations, start=1):
                db.execute(
                    """INSERT INTO recommendations
                       (message_id, rank, external_id, kind, score, payload_json)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (message_id, rank, str(item["id"]), item["kind"], item["recommendation_score"], json.dumps(item, ensure_ascii=False)),
                )
            db.execute("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", (conversation_id,))
            db.commit()
        return int(user.lastrowid), int(message_id)

    def get_conversation(self, conversation_id: str) -> dict | None:
        with self._lock, self._connect() as db:
            conversation = db.execute("SELECT id, created_at, updated_at FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
            if conversation is None:
                return None
            messages = db.execute(
                "SELECT id, role, content, intent, filters_json, created_at FROM messages WHERE conversation_id = ? ORDER BY id",
                (conversation_id,),
            ).fetchall()
            result = []
            for row in messages:
                recs = db.execute(
                    "SELECT payload_json FROM recommendations WHERE message_id = ? ORDER BY rank",
                    (row["id"],),
                ).fetchall()
                result.append({
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"],
                    "intent": row["intent"],
                    "filters": json.loads(row["filters_json"]),
                    "created_at": row["created_at"],
                    "recommendations": [json.loads(rec["payload_json"]) for rec in recs],
                })
        return {"id": conversation["id"], "created_at": conversation["created_at"], "updated_at": conversation["updated_at"], "messages": result}

"""Application service coordinating intent parsing, TMDB, and conversation storage."""
from __future__ import annotations

import secrets
import re

from .intents import parse_message
from .recommender import BotError, RecommendationEngine
from .storage import Store


CONVERSATION_ID = re.compile(r"^[A-Za-z0-9_-]{20,64}$")


class BotService:
    def __init__(self, store: Store, engine: RecommendationEngine):
        self.store = store
        self.engine = engine

    def new_conversation(self):
        conversation_id = secrets.token_urlsafe(24)
        self.store.create_conversation(conversation_id)
        return {"conversation_id": conversation_id}

    def chat(self, message: str, conversation_id: str | None = None):
        if not isinstance(message, str) or not message.strip():
            raise BotError(400, "invalid_message", "Escreva uma mensagem antes de enviar.")
        message = message.strip()
        if len(message) > 500:
            raise BotError(413, "message_too_long", "A mensagem deve ter no máximo 500 caracteres.")
        if conversation_id is None:
            conversation_id = self.new_conversation()["conversation_id"]
        elif not isinstance(conversation_id, str) or not CONVERSATION_ID.fullmatch(conversation_id):
            raise BotError(400, "invalid_conversation", "Identificador de conversa inválido.")
        elif not self.store.has_conversation(conversation_id):
            raise BotError(404, "conversation_not_found", "Esta conversa não existe. Inicie uma nova conversa.")

        previous = self.store.preferences(conversation_id)
        parsed = parse_message(message)
        try:
            answer = self.engine.respond(message, previous)
        except BotError as error:
            self.store.save_turn(conversation_id, message, error.args[0], parsed["intent"], parsed["filters"], [])
            raise

        effective_preferences = answer.get("preferences", previous)
        self.store.save_turn(
            conversation_id,
            message,
            answer["message"],
            answer["intent"],
            effective_preferences,
            answer["recommendations"],
        )
        return {"conversation_id": conversation_id, **answer}

    def conversation(self, conversation_id: str):
        if not CONVERSATION_ID.fullmatch(conversation_id):
            raise BotError(400, "invalid_conversation", "Identificador de conversa inválido.")
        conversation = self.store.get_conversation(conversation_id)
        if conversation is None:
            raise BotError(404, "conversation_not_found", "Esta conversa não existe. Inicie uma nova conversa.")
        return conversation

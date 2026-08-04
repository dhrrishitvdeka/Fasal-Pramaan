"""Redacted end-to-end smoke test for Gemini Live ephemeral sessions."""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlencode

import websockets

from app.core.config import get_settings
from app.services.gemini_live import create_ephemeral_session


def _safe_error(error: BaseException) -> str:
    value = str(error)
    value = re.sub(r"access_token=[^&\s]+", "access_token=[REDACTED]", value)
    value = re.sub(r"auth_tokens/[^&\s]+", "auth_tokens/[REDACTED]", value)
    return value[:240]


async def verify() -> dict[str, object]:
    session = create_ephemeral_session(get_settings())
    uri = f"{session.websocket_url}?{urlencode({'access_token': session.token})}"
    setup_complete = False
    audio_received = False
    transcription_received = False
    turn_complete = False

    async with websockets.connect(
        uri,
        open_timeout=15,
        close_timeout=5,
        max_size=8 * 1024 * 1024,
    ) as socket:
        # This mirrors the Flutter client. The constrained token supplies and
        # locks the full system instruction, tools, transcription, and voice.
        await socket.send(
            json.dumps(
                {
                    "setup": {
                        "model": f"models/{session.model}",
                        "generationConfig": {"responseModalities": ["AUDIO"]},
                    }
                }
            )
        )
        for _ in range(5):
            message = json.loads(await asyncio.wait_for(socket.recv(), timeout=15))
            if "setupComplete" in message:
                setup_complete = True
                break
        if not setup_complete:
            raise RuntimeError("Gemini Live did not acknowledge session setup")

        await socket.send(
            json.dumps(
                {
                    "realtimeInput": {
                        "text": "Briefly say that the farmer voice assistant is connected. Do not call a function."
                    }
                }
            )
        )
        for _ in range(100):
            message = json.loads(await asyncio.wait_for(socket.recv(), timeout=30))
            server_content = message.get("serverContent")
            if not isinstance(server_content, dict):
                continue
            output = server_content.get("outputTranscription")
            if isinstance(output, dict) and output.get("text"):
                transcription_received = True
            model_turn = server_content.get("modelTurn")
            if isinstance(model_turn, dict):
                for part in model_turn.get("parts", []):
                    if isinstance(part, dict) and isinstance(part.get("inlineData"), dict):
                        if part["inlineData"].get("data"):
                            audio_received = True
            if server_content.get("turnComplete") is True:
                turn_complete = True
                break

    if not audio_received and not transcription_received:
        raise RuntimeError("Gemini Live returned no audio or output transcription")
    return {
        "session_created": True,
        "setup_complete": setup_complete,
        "audio_received": audio_received,
        "transcription_received": transcription_received,
        "turn_complete": turn_complete,
        "model": session.model,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(asyncio.run(verify()), sort_keys=True))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": _safe_error(exc)}, sort_keys=True))
        raise SystemExit(1) from None

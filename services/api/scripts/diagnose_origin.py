"""Check whether Gemini Live rejects browser Origin headers."""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlencode

import httpx
import websockets


def _redact(value: str) -> str:
    value = re.sub(r"access_token=[^&\s]+", "access_token=[REDACTED]", value)
    value = re.sub(r"auth_tokens/[^\s\"']+", "auth_tokens/[REDACTED]", value)
    return value[:280]


async def attempt(origin: str | None) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        login = await client.post(
            "http://api:8000/api/v1/auth/login",
            json={"email": "farmer@fasalpramaan.local", "password": "Demo@12345"},
        )
        access = login.json()["access_token"]
        session = await client.post(
            "http://api:8000/api/v1/voice/session-token",
            headers={"Authorization": f"Bearer {access}"},
            json={},
        )
        payload = session.json()
        uri = payload["websocket_url"] + "?" + urlencode(
            {"access_token": payload["token"]}
        )
        model = payload["model"]

    headers = {"Origin": origin} if origin is not None else None
    try:
        async with websockets.connect(
            uri,
            open_timeout=15,
            close_timeout=5,
            additional_headers=headers,
            max_size=8 * 1024 * 1024,
        ) as socket:
            await socket.send(
                json.dumps(
                    {
                        "setup": {
                            "model": f"models/{model.removeprefix('models/')}",
                            "generationConfig": {"responseModalities": ["AUDIO"]},
                        }
                    }
                )
            )
            raw = await asyncio.wait_for(socket.recv(), timeout=15)
            text = raw.decode() if isinstance(raw, (bytes, bytearray)) else raw
            print(f"origin={origin or '(none)'} RESULT=ok snip={_redact(text)[:100]}")
    except Exception as exc:  # noqa: BLE001
        print(
            f"origin={origin or '(none)'} RESULT=FAIL "
            f"type={type(exc).__name__} detail={_redact(str(exc))}"
        )


async def main() -> None:
    for origin in (
        None,
        "http://localhost:8085",
        "http://127.0.0.1:8085",
        "null",
        "https://localhost:8085",
    ):
        await attempt(origin)


if __name__ == "__main__":
    asyncio.run(main())

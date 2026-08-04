"""Verify same-origin style Live proxy: JWT → API WS → Gemini setupComplete."""

from __future__ import annotations

import asyncio
import json
import re

import httpx
import websockets


def _redact(value: str) -> str:
    value = re.sub(r"access_token=[^&\s]+", "access_token=[REDACTED]", value)
    value = re.sub(r"auth_tokens/[^\s\"']+", "auth_tokens/[REDACTED]", value)
    value = re.sub(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", "[JWT]", value)
    return value[:280]


async def main() -> int:
    async with httpx.AsyncClient(timeout=30.0) as client:
        login = await client.post(
            "http://api:8000/api/v1/auth/login",
            json={"email": "farmer@fasalpramaan.local", "password": "Demo@12345"},
        )
        print("login", login.status_code)
        access = login.json()["access_token"]
        session = await client.post(
            "http://api:8000/api/v1/voice/session-token",
            headers={"Authorization": f"Bearer {access}"},
            json={},
        )
        print("session", session.status_code)
        body = session.json()
        print(
            "use_proxy",
            body.get("use_proxy"),
            "proxy_path",
            body.get("proxy_path"),
            "model",
            body.get("model"),
        )
        model = body["model"]

    uri = f"ws://api:8000/api/v1/voice/live?access_token={access}"
    setup = {
        "setup": {
            "model": f"models/{model.removeprefix('models/')}",
            "generationConfig": {"responseModalities": ["AUDIO"]},
        }
    }
    try:
        async with websockets.connect(uri, open_timeout=20, max_size=8 * 1024 * 1024) as ws:
            print("proxy_open_ok")
            await ws.send(json.dumps(setup))
            raw = await asyncio.wait_for(ws.recv(), timeout=20)
            text = raw.decode() if isinstance(raw, (bytes, bytearray)) else raw
            print("recv", _redact(text[:200]))
            if "setupComplete" in text:
                print("RESULT setup_complete=true")
                return 0
            print("RESULT unexpected")
            return 2
    except Exception as exc:  # noqa: BLE001
        print("FAIL", type(exc).__name__, _redact(str(exc)))
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

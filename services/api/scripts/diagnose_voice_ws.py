"""Mint a voice session via local API, then open Gemini Live WS from this host.

Prints only safe diagnostics (no full token).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from urllib.parse import quote, urlencode

import httpx
import websockets


def _redact(value: str) -> str:
    value = re.sub(r"access_token=[^&\s]+", "access_token=[REDACTED]", value)
    value = re.sub(r"auth_tokens/[^\s\"']+", "auth_tokens/[REDACTED]", value)
    return value[:300]


async def main() -> int:
    api = os.getenv("DIAG_API", "http://localhost:8000")
    email = os.getenv("DIAG_EMAIL", "farmer@fasalpramaan.local")
    password = os.getenv("DIAG_PASSWORD", "Demo@12345")

    async with httpx.AsyncClient(timeout=30.0) as client:
        login = await client.post(
            f"{api}/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        print("login_status", login.status_code)
        if login.status_code != 200:
            print("login_body", _redact(login.text))
            return 1
        token = login.json()["access_token"]

        session = await client.post(
            f"{api}/api/v1/voice/session-token",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        print("session_token_status", session.status_code)
        if session.status_code != 200:
            print("session_token_body", _redact(session.text))
            return 1
        payload = session.json()
        live_token = payload["token"]
        model = payload["model"]
        ws_url = payload["websocket_url"]
        print("model", model)
        print("ws_url", ws_url)
        print("token_prefix", live_token.split("/")[0] if "/" in live_token else live_token[:12])
        print("token_len", len(live_token))

    endpoints = [
        ("server_url_query", f"{ws_url}?{urlencode({'access_token': live_token})}"),
        (
            "v1alpha_constrained",
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1alpha.GenerativeService."
            f"BidiGenerateContentConstrained?access_token={quote(live_token, safe='')}",
        ),
        (
            "v1beta_constrained",
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1beta.GenerativeService."
            f"BidiGenerateContentConstrained?access_token={quote(live_token, safe='')}",
        ),
        (
            "v1beta_unconstrained",
            "wss://generativelanguage.googleapis.com/ws/"
            "google.ai.generativelanguage.v1beta.GenerativeService."
            f"BidiGenerateContent?access_token={quote(live_token, safe='')}",
        ),
    ]

    setup = {
        "setup": {
            "model": f"models/{model.removeprefix('models/')}",
            "generationConfig": {"responseModalities": ["AUDIO"]},
        }
    }

    # One-use token: only first successful open can consume it. Mint per attempt.
    for label, uri in endpoints:
        print("---", label, "---")
        # Remint for each attempt because uses=1
        async with httpx.AsyncClient(timeout=30.0) as client:
            login = await client.post(
                f"{api}/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            access = login.json()["access_token"]
            session = await client.post(
                f"{api}/api/v1/voice/session-token",
                headers={"Authorization": f"Bearer {access}"},
                json={},
            )
            if session.status_code != 200:
                print("remint_failed", session.status_code, _redact(session.text))
                continue
            live_token = session.json()["token"]
            model = session.json()["model"]
            base = session.json()["websocket_url"]
            if label == "server_url_query":
                uri = f"{base}?{urlencode({'access_token': live_token})}"
            elif "v1alpha" in label:
                uri = (
                    "wss://generativelanguage.googleapis.com/ws/"
                    "google.ai.generativelanguage.v1alpha.GenerativeService."
                    f"BidiGenerateContentConstrained?access_token={quote(live_token, safe='')}"
                )
            elif "v1beta_constrained" in label:
                uri = (
                    "wss://generativelanguage.googleapis.com/ws/"
                    "google.ai.generativelanguage.v1beta.GenerativeService."
                    f"BidiGenerateContentConstrained?access_token={quote(live_token, safe='')}"
                )
            else:
                uri = (
                    "wss://generativelanguage.googleapis.com/ws/"
                    "google.ai.generativelanguage.v1beta.GenerativeService."
                    f"BidiGenerateContent?access_token={quote(live_token, safe='')}"
                )
            setup["setup"]["model"] = f"models/{model.removeprefix('models/')}"

        try:
            async with websockets.connect(
                uri,
                open_timeout=15,
                close_timeout=5,
                max_size=8 * 1024 * 1024,
            ) as socket:
                print("open_ok")
                await socket.send(json.dumps(setup))
                try:
                    raw = await asyncio.wait_for(socket.recv(), timeout=15)
                except Exception as exc:  # noqa: BLE001
                    print("recv_error", type(exc).__name__, _redact(str(exc)))
                    continue
                if isinstance(raw, bytes):
                    print("recv_type=bytes len", len(raw))
                    text = raw.decode("utf-8", errors="replace")
                else:
                    print("recv_type=str len", len(raw))
                    text = raw
                print("recv_snip", _redact(text[:400]))
                try:
                    msg = json.loads(text)
                except Exception:
                    print("recv_not_json")
                    continue
                if "setupComplete" in msg:
                    print("RESULT setup_complete=true")
                elif "error" in msg:
                    print("RESULT error=", _redact(json.dumps(msg.get("error"))[:250]))
                else:
                    print("RESULT keys=", list(msg.keys()))
        except Exception as exc:  # noqa: BLE001
            print("connect_error", type(exc).__name__, _redact(str(exc)))

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

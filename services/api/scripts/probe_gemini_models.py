"""Probe which Live models the current GEMINI_API_KEY can access. Never prints the key."""

from __future__ import annotations

import json
import sys

import httpx

from app.core.config import get_settings


def main() -> int:
    settings = get_settings()
    key = settings.gemini_api_key.get_secret_value().strip()
    configured = settings.gemini_live_model.removeprefix("models/")
    print(f"configured_model={configured}")
    print(f"voice_enabled={settings.voice_assistant_enabled}")
    print(f"key_present={bool(key)} key_len={len(key)}")
    if not key:
        print("NO_KEY")
        return 2

    headers = {"x-goog-api-key": key}
    live_hits: list[dict] = []
    for base in (
        "https://generativelanguage.googleapis.com/v1beta/models",
        "https://generativelanguage.googleapis.com/v1alpha/models",
    ):
        try:
            response = httpx.get(
                base, headers=headers, params={"pageSize": 200}, timeout=30.0
            )
            print(f"list {base} status={response.status_code}")
            if response.status_code != 200:
                print("list_body_snip=" + response.text[:240])
                continue
            models = response.json().get("models") or []
            hits = []
            for model in models:
                name = model.get("name") or ""
                display = model.get("displayName") or ""
                methods = model.get("supportedGenerationMethods") or []
                blob = f"{name} {display} {' '.join(methods)}".lower()
                if any(
                    token in blob
                    for token in ("live", "native-audio", "bidi", "realtime")
                ):
                    hits.append(
                        {
                            "name": name,
                            "displayName": display,
                            "methods": methods,
                        }
                    )
            print(f"live_ish_count={len(hits)} total={len(models)}")
            for hit in sorted(hits, key=lambda item: item["name"]):
                print(json.dumps(hit, ensure_ascii=True))
                live_hits.append(hit)
        except Exception as exc:  # noqa: BLE001
            print(f"list_error base={base} type={type(exc).__name__}")

    candidates = [
        configured,
        "gemini-3.1-flash-live-preview",
        "gemini-2.5-flash-native-audio-preview-12-2025",
        "gemini-2.5-flash-native-audio-preview-09-2025",
        "gemini-2.5-flash-preview-native-audio-dialog",
        "gemini-live-2.5-flash-preview",
        "gemini-2.0-flash-live-001",
    ]
    print("--- getModel probes ---")
    for model_id in candidates:
        model_id = model_id.removeprefix("models/")
        for version in ("v1beta", "v1alpha"):
            url = (
                f"https://generativelanguage.googleapis.com/{version}/models/{model_id}"
            )
            try:
                response = httpx.get(url, headers=headers, timeout=20.0)
                print(f"get {version}/{model_id} -> {response.status_code}")
                if response.status_code == 200:
                    data = response.json()
                    print(
                        "  name="
                        + str(data.get("name"))
                        + " display="
                        + str(data.get("displayName"))
                    )
                    print("  methods=" + str(data.get("supportedGenerationMethods")))
            except Exception as exc:  # noqa: BLE001
                print(
                    f"get_error {version}/{model_id} type={type(exc).__name__}"
                )

    configured_found = any(
        (hit.get("name") or "").endswith(configured) for hit in live_hits
    )
    print(f"configured_in_live_list={configured_found}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

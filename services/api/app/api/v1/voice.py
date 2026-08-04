"""Authenticated farmer endpoints for the Gemini Live voice demo."""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import joinedload

from app.core.config import Settings, get_settings
from app.core.deps import ROLE_FARMER, DbSession, require_roles, user_role_codes
from app.core.security import safe_decode
from app.db.models import User, UserRole
from app.db.session import SessionLocal
from app.schemas.voice import VoiceActionAuditIn, VoiceActionAuditOut, VoiceSessionTokenOut
from app.services.audit import write_audit
from app.services.gemini_live import (
    GEMINI_LIVE_WEBSOCKET_URL,
    GeminiLiveUnavailable,
    create_ephemeral_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/session-token", response_model=VoiceSessionTokenOut)
def create_session_token(
    request: Request,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_FARMER)),
    settings: Settings = Depends(get_settings),
) -> VoiceSessionTokenOut:
    try:
        session = create_ephemeral_session(settings)
    except GeminiLiveUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
            headers={"Retry-After": "2"},
        ) from exc

    write_audit(
        db,
        action="voice_session_started",
        entity_type="voice_session",
        entity_id=session.session_id,
        actor_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        correlation_id=getattr(request.state, "correlation_id", None),
        after={"model": session.model, "expires_at": session.expires_at.isoformat()},
    )
    db.commit()
    return VoiceSessionTokenOut(
        token=session.token,
        model=session.model,
        websocket_url=session.websocket_url,
        expires_at=session.expires_at,
        new_session_expires_at=session.new_session_expires_at,
        session_id=session.session_id,
        proxy_path="/api/v1/voice/live",
        use_proxy=True,
    )


@router.post("/actions/audit", response_model=VoiceActionAuditOut)
def audit_voice_action(
    body: VoiceActionAuditIn,
    request: Request,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_FARMER)),
) -> VoiceActionAuditOut:
    write_audit(
        db,
        action=f"voice_{body.action}",
        entity_type="voice_session",
        entity_id=body.session_id,
        actor_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        correlation_id=getattr(request.state, "correlation_id", None),
        after={"outcome": body.outcome, "entity_id": body.entity_id},
    )
    db.commit()
    return VoiceActionAuditOut()


def _authenticate_farmer_ws(access_token: str) -> User:
    payload = safe_decode(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        uid = UUID(str(payload.get("sub")))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .options(joinedload(User.roles).joinedload(UserRole.role))
            .filter(User.id == uid, User.is_deleted.is_(False))
            .first()
        )
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
        if payload.get("token_version") != user.token_version:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
        if ROLE_FARMER not in user_role_codes(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Farmer role required")
        db.expunge(user)
        return user
    finally:
        db.close()


@router.websocket("/live")
async def voice_live_proxy(
    websocket: WebSocket,
    access_token: str = Query(..., min_length=20),
    settings: Settings = Depends(get_settings),
) -> None:
    """Same-origin Gemini Live bridge for the Flutter web client.

    Accept the browser socket *before* minting the Gemini token. Pre-accept
    minting blocks the handshake and surfaces as Flutter TimeoutException 15s.

    Keep both relay directions alive until either side disconnects — do not
    cancel the peer task on FIRST_COMPLETED or the session dies after the
    first model turn.
    """
    try:
        _authenticate_farmer_ws(access_token)
    except HTTPException as exc:
        try:
            await websocket.close(code=4401, reason=str(exc.detail)[:110])
        except Exception:  # noqa: BLE001
            try:
                await websocket.accept()
                await websocket.close(code=4401, reason=str(exc.detail)[:110])
            except Exception:  # noqa: BLE001
                return
        return

    await websocket.accept()

    import websockets
    from websockets.exceptions import ConnectionClosed

    try:
        session = await asyncio.to_thread(create_ephemeral_session, settings)
    except GeminiLiveUnavailable:
        logger.warning("voice_proxy_token_unavailable")
        try:
            await websocket.send_text(
                '{"error":{"status":"UNAVAILABLE","message":"Voice service is temporarily unavailable"}}'
            )
        except Exception:  # noqa: BLE001
            pass
        await websocket.close(code=1013, reason="Voice service unavailable")
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("voice_proxy_token_failed type=%s", type(exc).__name__)
        try:
            await websocket.send_text(
                '{"error":{"status":"INTERNAL","message":"Voice session could not be created"}}'
            )
        except Exception:  # noqa: BLE001
            pass
        await websocket.close(code=1011, reason="Voice session failed")
        return

    gemini_uri = f"{GEMINI_LIVE_WEBSOCKET_URL}?{urlencode({'access_token': session.token})}"

    try:
        async with websockets.connect(
            gemini_uri,
            open_timeout=20,
            close_timeout=5,
            max_size=8 * 1024 * 1024,
        ) as gemini:
            stop = asyncio.Event()

            async def client_to_gemini() -> None:
                try:
                    while not stop.is_set():
                        message = await websocket.receive()
                        msg_type = message.get("type")
                        if msg_type == "websocket.disconnect":
                            break
                        text = message.get("text")
                        data = message.get("bytes")
                        try:
                            if text is not None:
                                await gemini.send(text)
                            elif data is not None:
                                # Browser must send JSON text frames for Live API;
                                # binary payloads are ignored to avoid InvalidMessage.
                                try:
                                    await gemini.send(data.decode("utf-8"))
                                except UnicodeDecodeError:
                                    logger.warning("voice_proxy_ignored_binary_client_frame")
                        except ConnectionClosed:
                            break
                except WebSocketDisconnect:
                    return
                except Exception as exc:  # noqa: BLE001
                    logger.warning("voice_proxy_client_relay type=%s", type(exc).__name__)
                finally:
                    stop.set()

            async def gemini_to_client() -> None:
                try:
                    async for raw in gemini:
                        if stop.is_set():
                            break
                        try:
                            if isinstance(raw, (bytes, bytearray)):
                                await websocket.send_bytes(bytes(raw))
                            else:
                                await websocket.send_text(str(raw))
                        except Exception:  # noqa: BLE001
                            break
                except ConnectionClosed:
                    return
                except Exception as exc:  # noqa: BLE001
                    logger.warning("voice_proxy_gemini_relay type=%s", type(exc).__name__)
                finally:
                    stop.set()

            tasks = [
                asyncio.create_task(client_to_gemini(), name="client_to_gemini"),
                asyncio.create_task(gemini_to_client(), name="gemini_to_client"),
            ]
            # Wait until *either* side ends, then cancel the other cleanly.
            # Previously FIRST_COMPLETED cancelled the peer too aggressively mid-session.
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            stop.set()
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                exc = task.exception() if not task.cancelled() else None
                if exc is not None and not isinstance(
                    exc, (WebSocketDisconnect, ConnectionClosed, asyncio.CancelledError)
                ):
                    logger.warning("voice_proxy_task_error type=%s", type(exc).__name__)
    except Exception as exc:  # noqa: BLE001
        logger.warning("voice_proxy_upstream_failed type=%s", type(exc).__name__)
        try:
            await websocket.send_text(
                '{"error":{"status":"UNAVAILABLE","message":"Gemini Live upstream unavailable"}}'
            )
        except Exception:  # noqa: BLE001
            pass
        try:
            await websocket.close(code=1011, reason="Voice upstream unavailable")
        except Exception:  # noqa: BLE001
            return

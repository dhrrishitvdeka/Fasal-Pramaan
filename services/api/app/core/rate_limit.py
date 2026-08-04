"""Rate limiting with a local backend for development and Redis for production."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status
import redis

from app.core.config import get_settings


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _raise_limited(self) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
        )

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        settings = get_settings()
        if settings.rate_limit_backend == "redis":
            self._check_redis(key, limit, window_seconds, settings.redis_url)
            return
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_seconds:
                q.popleft()
            if len(q) >= limit:
                self._raise_limited()
            q.append(now)

    def _check_redis(self, key: str, limit: int, window_seconds: int, redis_url: str) -> None:
        """Use an atomic fixed window shared by every API replica."""
        bucket = int(time.time()) // window_seconds
        redis_key = f"fasalpramaan:rate:{key}:{bucket}"
        client = redis.Redis.from_url(redis_url, socket_timeout=2)
        count = int(client.incr(redis_key))
        if count == 1:
            client.expire(redis_key, window_seconds + 1)
        if count > limit:
            self._raise_limited()

    def reset(self) -> None:
        """Clear all windows (used by tests so suites do not exhaust shared TestClient IP)."""
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


async def rate_limit_dependency(request: Request) -> None:
    """Optional Depends() form; middleware is the primary enforcer.

    Uses RATE_LIMIT_PER_MINUTE as-is (floor 10). Auth routes use min(30, limit).
    """
    settings = get_settings()
    limit = max(int(settings.rate_limit_per_minute), 10)
    client = request.client.host if request.client else "unknown"
    path = request.url.path
    if "/auth/login" in path or "/auth/register" in path:
        limiter.check(f"auth:{client}", min(30, limit), 60)
    else:
        limiter.check(f"api:{client}", limit, 60)

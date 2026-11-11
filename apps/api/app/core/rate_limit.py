from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque

from app.core.config import get_settings
from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        async with self._lock:
            q = self._buckets[key]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please slow down and try again shortly.",
                )
            q.append(now)


_limiter = InMemoryRateLimiter()


async def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> None:
    await _limiter.check(key, limit=limit, window_seconds=window_seconds)


async def rate_limit_dependency(request: Request) -> None:
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    key = f"rl:{client_ip}:{request.url.path}"
    await _limiter.check(key, limit=settings.rate_limit_per_minute, window_seconds=60)

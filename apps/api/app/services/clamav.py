from __future__ import annotations

import asyncio
import logging
import socket
import struct
from dataclasses import dataclass

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Standard harmless EICAR test string used by AV tests
EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


@dataclass(frozen=True)
class ScanResult:
    clean: bool
    engine: str
    detail: str | None = None


def _scan_clamd_sync(data: bytes, host: str, port: int) -> ScanResult:
    with socket.create_connection((host, port), timeout=15) as sock:
        sock.sendall(b"zINSTREAM\0")
        chunk_size = 8192
        for i in range(0, len(data), chunk_size):
            chunk = data[i : i + chunk_size]
            sock.sendall(struct.pack("!I", len(chunk)) + chunk)
        sock.sendall(struct.pack("!I", 0))
        response = sock.recv(4096).decode("utf-8", errors="replace").strip("\x00\r\n ")

    if response.endswith("OK"):
        return ScanResult(clean=True, engine="clamd", detail=response)
    return ScanResult(clean=False, engine="clamd", detail=response)


def _ping_clamd_sync(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=3) as sock:
            sock.sendall(b"zPING\0")
            resp = sock.recv(64)
            return b"PONG" in resp
    except Exception:
        return False


async def scan_bytes_for_malware(data: bytes) -> ScanResult:
    settings = get_settings()
    if EICAR_SIGNATURE in data:
        return ScanResult(clean=False, engine="signature_guard", detail="EICAR-Test-File detected")

    if settings.clamav_mode == "clamd":
        return await asyncio.to_thread(
            _scan_clamd_sync, data, settings.clamav_host, settings.clamav_port
        )

    logger.warning("ClamAV running in disabled_dev mode; skipping clamd daemon scan.")
    return ScanResult(clean=True, engine="disabled_dev", detail="Skipped in dev mode")


async def clamav_health() -> str:
    settings = get_settings()
    if settings.clamav_mode != "clamd":
        return "disabled_dev"
    ok = await asyncio.to_thread(_ping_clamd_sync, settings.clamav_host, settings.clamav_port)
    return "ok" if ok else "unreachable"

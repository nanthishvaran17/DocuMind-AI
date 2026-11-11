from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Protocol

import boto3
from botocore.client import Config

from app.core.config import get_settings


class StorageAdapter(Protocol):
    async def put_bytes(
        self, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str: ...
    async def get_bytes(self, key: str) -> bytes: ...
    async def delete_object(self, key: str) -> None: ...
    async def exists(self, key: str) -> bool: ...
    async def health_check(self) -> bool: ...


class LocalStorageAdapter:
    """Filesystem-backed storage adapter for local development without MinIO/S3."""

    def __init__(self, base_dir: str) -> None:
        self.base_path = Path(base_dir).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        clean_key = key.lstrip("/").replace("..", "")
        target = (self.base_path / clean_key).resolve()
        if not str(target).startswith(str(self.base_path)):
            raise ValueError("Invalid storage key path traversal attempt.")
        return target

    async def put_bytes(
        self, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_bytes, data)
        return key

    async def get_bytes(self, key: str) -> bytes:
        target = self._resolve(key)
        if not target.exists():
            raise FileNotFoundError(f"Storage key not found: {key}")
        return await asyncio.to_thread(target.read_bytes)

    async def delete_object(self, key: str) -> None:
        target = self._resolve(key)
        if target.exists():
            await asyncio.to_thread(target.unlink)

    async def exists(self, key: str) -> bool:
        return self._resolve(key).exists()

    async def health_check(self) -> bool:
        return self.base_path.exists() and self.base_path.is_dir()


class S3StorageAdapter:
    """S3 / MinIO storage adapter."""

    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "us-east-1",
    ) -> None:
        self.bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    async def put_bytes(
        self, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    async def get_bytes(self, key: str) -> bytes:
        resp = await asyncio.to_thread(self._client.get_object, Bucket=self.bucket, Key=key)
        return await asyncio.to_thread(resp["Body"].read)

    async def delete_object(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self.bucket, Key=key)

    async def exists(self, key: str) -> bool:
        try:
            await asyncio.to_thread(self._client.head_object, Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    async def health_check(self) -> bool:
        try:
            await asyncio.to_thread(self._client.head_bucket, Bucket=self.bucket)
            return True
        except Exception:
            return False


_adapter: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    global _adapter
    if _adapter is None:
        settings = get_settings()
        if settings.storage_backend == "s3":
            _adapter = S3StorageAdapter(
                endpoint_url=settings.s3_endpoint_url,
                access_key=settings.s3_access_key,
                secret_key=settings.s3_secret_key,
                bucket=settings.s3_bucket_name,
                region=settings.s3_region,
            )
        else:
            _adapter = LocalStorageAdapter(settings.local_storage_path)
    return _adapter

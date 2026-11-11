from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import CHAR, String, Text
from sqlalchemy.dialects.postgresql import INET as PG_INET
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator

try:
    from pgvector.sqlalchemy import Vector as PGVector
except ImportError:  # pragma: no cover
    PGVector = None  # type: ignore[assignment, misc]


class PortableUUID(TypeDecorator[str]):
    """Stores UUID natively on PostgreSQL and as CHAR(36) on SQLite."""

    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=False))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return str(uuid.UUID(str(value)))

    def process_result_value(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return str(value)


class PortableJSON(TypeDecorator[Any]):
    """Stores JSONB on PostgreSQL and serialized JSON TEXT on SQLite."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, str):
            return json.loads(value)
        return value


class PortableINET(TypeDecorator[str]):
    """Stores INET on PostgreSQL and String(45) on SQLite."""

    impl = String(45)
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_INET())
        return dialect.type_descriptor(String(45))


class PortableVector(TypeDecorator[list[float]]):
    """Stores pgvector Vector(dim) on PostgreSQL and JSON float list TEXT on SQLite."""

    impl = Text
    cache_ok = True

    def __init__(self, dim: int = 384) -> None:
        super().__init__()
        self.dim = dim

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql" and PGVector is not None:
            return dialect.type_descriptor(PGVector(self.dim))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        vec = [float(x) for x in value]
        if dialect.name == "postgresql":
            return vec
        return json.dumps(vec)

    def process_result_value(self, value: Any, dialect: Any) -> list[float] | None:
        if value is None:
            return None
        if isinstance(value, str):
            return [float(x) for x in json.loads(value)]
        return [float(x) for x in value]

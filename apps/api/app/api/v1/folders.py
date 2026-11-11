from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ActorContext, require_authenticated_user
from app.db.models import Folder
from app.db.session import get_db
from app.schemas.common import ok_response
from app.schemas.documents import FolderCreate, FolderOut, FolderUpdate

router = APIRouter(prefix="/folders", tags=["folders"])


def _folder_to_out(f: Folder) -> dict:
    return FolderOut(
        id=f.id,
        parent_id=f.parent_id,
        name=f.name,
        created_at=f.created_at,
        updated_at=f.updated_at,
    ).model_dump()


@router.get("")
async def list_folders(
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = (
        select(Folder)
        .where(Folder.owner_id == actor.user_id, Folder.deleted_at.is_(None))
        .order_by(Folder.name.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return ok_response([_folder_to_out(r) for r in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: FolderCreate,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    if payload.parent_id:
        parent = (
            await db.execute(
                select(Folder).where(
                    Folder.id == payload.parent_id,
                    Folder.owner_id == actor.user_id,
                    Folder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found."
            )

    folder = Folder(owner_id=actor.user_id, parent_id=payload.parent_id, name=payload.name.strip())
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return ok_response(_folder_to_out(folder))


@router.patch("/{folder_id}")
async def update_folder(
    folder_id: str,
    payload: FolderUpdate,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    folder = (
        await db.execute(
            select(Folder).where(
                Folder.id == folder_id,
                Folder.owner_id == actor.user_id,
                Folder.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")
    if payload.name is not None:
        folder.name = payload.name.strip()
    if payload.parent_id is not None:
        if payload.parent_id == folder.id:
            raise HTTPException(status_code=400, detail="Folder cannot be its own parent.")
        folder.parent_id = payload.parent_id
    await db.commit()
    await db.refresh(folder)
    return ok_response(_folder_to_out(folder))


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    folder = (
        await db.execute(
            select(Folder).where(
                Folder.id == folder_id,
                Folder.owner_id == actor.user_id,
                Folder.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")
    folder.deleted_at = datetime.now(UTC)
    await db.commit()
    return ok_response({"deleted": True})

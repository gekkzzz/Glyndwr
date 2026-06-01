from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from core.database import (
    get_gallery, create_gallery_item, get_gallery_item,
    update_gallery_item, delete_gallery_item, get_session_user,
)

router = APIRouter(prefix="/api/gallery", tags=["gallery"])


def _get_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("session_token")


class GalleryCreateRequest(BaseModel):
    name: str = "Untitled"
    data: str
    thumbnail: str = ""
    width: int = 800
    height: int = 600


class GalleryUpdateRequest(BaseModel):
    name: Optional[str] = None
    data: Optional[str] = None
    thumbnail: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


@router.get("/")
async def list_gallery(request: Request):
    return await get_gallery()


@router.post("/")
async def create_image(request: Request, body: GalleryCreateRequest):
    item = await create_gallery_item(
        name=body.name, data=body.data, thumbnail=body.thumbnail,
        width=body.width, height=body.height,
    )
    return item


@router.get("/{item_id}")
async def get_image(item_id: str):
    item = await get_gallery_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Image not found")
    return item


@router.put("/{item_id}")
async def update_image(item_id: str, body: GalleryUpdateRequest):
    item = await get_gallery_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Image not found")
    kwargs = {k: v for k, v in body.dict().items() if v is not None}
    updated = await update_gallery_item(item_id, **kwargs)
    return updated


@router.delete("/{item_id}")
async def delete_image(item_id: str):
    item = await get_gallery_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Image not found")
    await delete_gallery_item(item_id)
    return {"ok": True}

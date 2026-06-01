from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional
from core.database import get_memories, create_memory, delete_memory, clear_memories

router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryCreateRequest(BaseModel):
    title: str
    content: str
    category: str = "general"
    confidence: int = 100
    source: str = "manual"


@router.get("/")
async def list_memories(search: Optional[str] = Query(None)):
    return await get_memories(search=search)


@router.post("/")
async def create_memory_endpoint(body: MemoryCreateRequest):
    mem = await create_memory(
        title=body.title, content=body.content, category=body.category,
        confidence=body.confidence, source=body.source,
    )
    return mem


@router.delete("/all")
async def clear_all_memories():
    await clear_memories()
    return {"ok": True}


@router.delete("/{mem_id}")
async def delete_memory_endpoint(mem_id: str):
    await delete_memory(mem_id)
    return {"ok": True}

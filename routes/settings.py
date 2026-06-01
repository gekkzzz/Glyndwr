from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Dict

from core import database as db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingValue(BaseModel):
    value: Any


@router.get("/")
async def get_all_settings():
    return await db.get_all_settings()


@router.put("/")
async def update_settings(body: Dict[str, Any]):
    for key, value in body.items():
        await db.set_setting(key, value)
    return await db.get_all_settings()


@router.get("/{key}")
async def get_setting(key: str):
    value = await db.get_setting(key)
    return {"key": key, "value": value}


@router.put("/{key}")
async def set_setting(key: str, body: SettingValue):
    await db.set_setting(key, body.value)
    return {"key": key, "value": body.value}

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from core.database import (
    get_all_users, create_user, update_user, delete_user,
    delete_user_sessions, get_session_user,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("session_token")


async def _require_admin(request: Request):
    token = _get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_session_user(token)
    if not user or not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    is_admin: Optional[bool] = None
    password: Optional[str] = None


@router.get("/")
async def list_users(request: Request):
    await _require_admin(request)
    return await get_all_users()


@router.post("/")
async def create_user_endpoint(request: Request, body: CreateUserRequest):
    await _require_admin(request)
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await create_user(body.username, body.password, is_admin=body.is_admin)
    return user


@router.put("/{user_id}")
async def update_user_endpoint(request: Request, user_id: str, body: UpdateUserRequest):
    admin = await _require_admin(request)
    kwargs = {}
    if body.username is not None:
        kwargs["username"] = body.username
    if body.is_admin is not None:
        kwargs["is_admin"] = body.is_admin
    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        kwargs["password"] = body.password
    updated = await update_user(user_id, **kwargs)
    return updated


@router.delete("/{user_id}")
async def delete_user_endpoint(request: Request, user_id: str):
    admin = await _require_admin(request)
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await delete_user_sessions(user_id)
    await delete_user(user_id)
    return {"ok": True}

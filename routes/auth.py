from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional
from core.database import (
    authenticate_user, create_user, create_session, delete_session,
    get_session_user, get_user_count, get_user_by_id,
    get_all_user_settings, set_user_setting,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _get_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("session_token")


@router.get("/status")
async def auth_status():
    count = await get_user_count()
    return {"users_exist": count > 0, "needs_setup": count == 0}


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    user = await authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["id"])
    response.set_cookie("session_token", token, max_age=604800, httponly=True, samesite="lax")
    return {
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])},
    }


@router.post("/setup")
async def setup(body: SignupRequest):
    count = await get_user_count()
    if count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await create_user(body.username, body.password, is_admin=True)
    return {"ok": True, "user": {"id": user["id"], "username": user["username"]}}


@router.post("/signup")
async def signup(body: SignupRequest, request: Request):
    token = _get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    current_user = await get_session_user(token)
    if not current_user or not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = await create_user(body.username, body.password, is_admin=body.is_admin)
    return {"ok": True, "user": {"id": user["id"], "username": user["username"]}}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = _get_token(request)
    if token:
        await delete_session(token)
    response.delete_cookie("session_token")
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    token = _get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    prefs = await get_all_user_settings(user["id"])
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
        "prefs": prefs,
    }


@router.put("/prefs")
async def update_prefs(request: Request, body: dict):
    token = _get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    for key, value in body.items():
        await set_user_setting(user["id"], key, value)
    return {"ok": True}


@router.post("/change-password")
async def change_password(request: Request, body: ChangePasswordRequest):
    from core.database import authenticate_user, update_user
    token = _get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    verified = await authenticate_user(user["username"], body.current_password)
    if not verified:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await update_user(user["id"], password=body.new_password)
    return {"ok": True}

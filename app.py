from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from core.database import init_db, DB_PATH
from core.config import settings
from routes.chat import router as chat_router
from routes.models import router as models_router
from routes.settings import router as settings_router
from routes.notes import router as notes_router
from routes.tasks import router as tasks_router
from routes.email import router as email_router
from routes.notifications import router as notifications_router
from routes.tools import router as tools_router
from routes.calendar_api import router as calendar_router
from routes.documents import router as documents_router
from routes.research import router as research_router
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.gallery import router as gallery_router
from routes.memories import router as memories_router

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.error(f"Database init failed: {e}")
        raise

    # Auto-create admin on first run
    from core.database import get_user_count, create_user
    import secrets
    import string
    count = await get_user_count()
    if count == 0:
        pw_chars = string.ascii_letters + string.digits + "!@#$%"
        generated_pw = ''.join(secrets.choice(pw_chars) for _ in range(16))
        await create_user("admin", generated_pw, is_admin=True)
        sep = "=" * 54
        print(f"\n{sep}")
        print(f"  GLYNDWR -- First Run Setup")
        print(sep)
        print(f"  Admin account created automatically.")
        print(f"")
        print(f"  Username : admin")
        print(f"  Password : {generated_pw}")
        print(f"")
        print(f"  Sign in at http://localhost:7860/login")
        print(f"  Change credentials in Settings -> Account")
        print(f"{sep}\n")

    yield


app = FastAPI(
    title="Glyndwr",
    description="Self-hosted AI workspace",
    version="1.2.0",
    lifespan=lifespan,
    redirect_slashes=True,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(gallery_router)
app.include_router(memories_router)
app.include_router(chat_router)
app.include_router(models_router)
app.include_router(settings_router)
app.include_router(notes_router)
app.include_router(tasks_router)
app.include_router(email_router)
app.include_router(notifications_router)
app.include_router(tools_router)
app.include_router(calendar_router)
app.include_router(documents_router)
app.include_router(research_router)

_static_dir = os.path.join(_BASE_DIR, "static")
app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(_BASE_DIR, "static", "index.html"))


@app.get("/login")
async def serve_login():
    return FileResponse(os.path.join(_BASE_DIR, "static", "login.html"))


@app.get("/sw.js")
async def serve_sw():
    return FileResponse(os.path.join(_BASE_DIR, "static", "sw.js"), media_type="application/javascript")


@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse(os.path.join(_BASE_DIR, "static", "manifest.json"), media_type="application/json")


@app.get("/health")
async def health():
    return {"status": "ok", "app": "Glyndwr", "version": "1.2.0"}


@app.get("/api/status")
async def api_status():
    routes = [r.path for r in app.routes if hasattr(r, "path")]
    return {"status": "ok", "routes_count": len(routes)}


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=False,
        log_level="info",
    )

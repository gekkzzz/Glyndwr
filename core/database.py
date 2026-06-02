import aiosqlite
import uuid
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_BASE_DIR, "data", "glyndwr.db")


def _now() -> str:
    return datetime.utcnow().isoformat()


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split(":", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == h
    except Exception:
        return False


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New Chat',
                model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
                system_prompt TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                user_id TEXT DEFAULT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT DEFAULT '',
                tokens_used INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (user_id, key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id)"
        )
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled',
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_id TEXT DEFAULT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                due_date TEXT DEFAULT NULL,
                user_id TEXT DEFAULT NULL
            )
        """)
        # ── Migrations: add columns that may be missing from older databases ──
        migrations = [
            "ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT NULL",
            "ALTER TABLE tasks ADD COLUMN user_id TEXT DEFAULT NULL",
            "ALTER TABLE conversations ADD COLUMN user_id TEXT DEFAULT NULL",
            "ALTER TABLE notes ADD COLUMN user_id TEXT DEFAULT NULL",
        ]
        for sql in migrations:
            try:
                await db.execute(sql)
            except Exception:
                pass  # column already exists

        await db.execute("""
            CREATE TABLE IF NOT EXISTS calendar_events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT DEFAULT '',
                description TEXT DEFAULT '',
                color TEXT DEFAULT '',
                source TEXT DEFAULT 'local',
                caldav_uid TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id TEXT PRIMARY KEY,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS gallery (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'Untitled',
                thumbnail TEXT DEFAULT '',
                data TEXT NOT NULL DEFAULT '',
                width INTEGER DEFAULT 800,
                height INTEGER DEFAULT 600,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_id TEXT DEFAULT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                confidence INTEGER DEFAULT 100,
                source TEXT DEFAULT 'manual',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_id TEXT DEFAULT NULL
            )
        """)
        await db.commit()


# ─── Users ────────────────────────────────────────────────────────────────────

async def get_user_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0


async def create_user(username: str, password: str, is_admin: bool = False) -> Dict[str, Any]:
    user_id = str(uuid.uuid4())
    now = _now()
    pw_hash = _hash_password(password)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO users (id, username, password_hash, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, username, pw_hash, 1 if is_admin else 0, now, now),
        )
        await db.commit()
    return {"id": user_id, "username": username, "is_admin": is_admin, "created_at": now}


async def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE username = ?", (username,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_all_users() -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def update_user(user_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    allowed = {"username", "is_admin"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if "password" in kwargs:
        updates["password_hash"] = _hash_password(kwargs["password"])
    if not updates:
        return await get_user_by_id(user_id)
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        await db.commit()
    return await get_user_by_id(user_id)


async def delete_user(user_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()
    return True


async def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    user = await get_user_by_username(username)
    if not user:
        return None
    if not _verify_password(password, user["password_hash"]):
        return None
    return user


# ─── Sessions ─────────────────────────────────────────────────────────────────

async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token, user_id, expires, now),
        )
        await db.commit()
    return token


async def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token = ?", (token,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
                return None
    return await get_user_by_id(row["user_id"])


async def delete_session(token: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        await db.commit()
    return True


async def delete_user_sessions(user_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        await db.commit()
    return True


# ─── User Settings ────────────────────────────────────────────────────────────

async def get_user_setting(user_id: str, key: str) -> Optional[Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT value FROM user_settings WHERE user_id = ? AND key = ?", (user_id, key)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            try:
                return json.loads(row["value"])
            except Exception:
                return row["value"]


async def set_user_setting(user_id: str, key: str, value: Any) -> None:
    serialized = json.dumps(value)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
            (user_id, key, serialized),
        )
        await db.commit()


async def get_all_user_settings(user_id: str) -> Dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM user_settings WHERE user_id = ?", (user_id,)) as cursor:
            rows = await cursor.fetchall()
            result = {}
            for row in rows:
                try:
                    result[row["key"]] = json.loads(row["value"])
                except Exception:
                    result[row["key"]] = row["value"]
            return result


# ─── Conversations ────────────────────────────────────────────────────────────

async def create_conversation(
    title: str = "New Chat",
    model: str = "gpt-4o-mini",
    system_prompt: str = "",
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    conv_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO conversations (id, title, model, system_prompt, created_at, updated_at, pinned, user_id)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
            (conv_id, title, model, system_prompt, now, now, user_id),
        )
        await db.commit()
    return {
        "id": conv_id, "title": title, "model": model, "system_prompt": system_prompt,
        "created_at": now, "updated_at": now, "pinned": False, "message_count": 0,
    }


async def get_conversations(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if user_id:
            query = """
                SELECT c.id, c.title, c.model, c.system_prompt, c.created_at, c.updated_at, c.pinned,
                       COUNT(m.id) as message_count, MAX(m.content) as last_message
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id AND m.role IN ('user', 'assistant')
                WHERE c.user_id = ? OR c.user_id IS NULL
                GROUP BY c.id ORDER BY c.pinned DESC, c.updated_at DESC
            """
            async with db.execute(query, (user_id,)) as cursor:
                rows = await cursor.fetchall()
        else:
            query = """
                SELECT c.id, c.title, c.model, c.system_prompt, c.created_at, c.updated_at, c.pinned,
                       COUNT(m.id) as message_count, MAX(m.content) as last_message
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id AND m.role IN ('user', 'assistant')
                GROUP BY c.id ORDER BY c.pinned DESC, c.updated_at DESC
            """
            async with db.execute(query) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_conversation(conv_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    allowed = {"title", "model", "system_prompt", "pinned"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_conversation(conv_id)
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [conv_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE conversations SET {set_clause} WHERE id = ?", values)
        await db.commit()
    return await get_conversation(conv_id)


async def delete_conversation(conv_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        await db.commit()
    return True


# ─── Messages ─────────────────────────────────────────────────────────────────

async def add_message(conversation_id: str, role: str, content: str, model: str = "", tokens_used: int = 0) -> Dict[str, Any]:
    msg_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO messages (id, conversation_id, role, content, model, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (msg_id, conversation_id, role, content, model, tokens_used, now),
        )
        await db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
        await db.commit()
    return {"id": msg_id, "conversation_id": conversation_id, "role": role, "content": content, "model": model, "tokens_used": tokens_used, "created_at": now}


async def get_messages(conversation_id: str) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", (conversation_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def clear_messages(conversation_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        await db.commit()
    return True


# ─── Settings ─────────────────────────────────────────────────────────────────

async def get_setting(key: str) -> Optional[Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            try:
                return json.loads(row["value"])
            except Exception:
                return row["value"]


async def set_setting(key: str, value: Any) -> None:
    serialized = json.dumps(value)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, serialized),
        )
        await db.commit()


async def get_all_settings() -> Dict[str, Any]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM settings") as cursor:
            rows = await cursor.fetchall()
            result = {}
            for row in rows:
                try:
                    result[row["key"]] = json.loads(row["value"])
                except Exception:
                    result[row["key"]] = row["value"]
            return result


# ─── Notes ────────────────────────────────────────────────────────────────────

async def get_notes(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM notes ORDER BY updated_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def create_note(title: str = "Untitled", content: str = "", user_id: Optional[str] = None) -> Dict[str, Any]:
    note_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT INTO notes (id, title, content, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
                         (note_id, title, content, now, now, user_id))
        await db.commit()
    return {"id": note_id, "title": title, "content": content, "created_at": now, "updated_at": now}


async def get_note(note_id: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_note(note_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    allowed = {"title", "content"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_note(note_id)
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [note_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE notes SET {set_clause} WHERE id = ?", values)
        await db.commit()
    return await get_note(note_id)


async def delete_note(note_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        await db.commit()
    return True


# ─── Tasks ────────────────────────────────────────────────────────────────────

async def get_tasks(done: Optional[bool] = None, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if done is None:
            async with db.execute("SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC") as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute("SELECT * FROM tasks WHERE done = ? ORDER BY sort_order ASC, created_at DESC", (1 if done else 0,)) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def create_task(text: str, due_date: Optional[str] = None, user_id: Optional[str] = None) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT INTO tasks (id, text, done, created_at, updated_at, sort_order, due_date, user_id) VALUES (?, ?, 0, ?, ?, 0, ?, ?)",
                         (task_id, text, now, now, due_date, user_id))
        await db.commit()
    return {"id": task_id, "text": text, "done": False, "created_at": now, "updated_at": now, "due_date": due_date}


async def update_task(task_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    allowed = {"text", "done", "sort_order", "due_date"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return None
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
        await db.commit()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def delete_task(task_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()
    return True


# ─── Gallery ──────────────────────────────────────────────────────────────────

async def get_gallery(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, name, thumbnail, width, height, created_at, updated_at FROM gallery ORDER BY updated_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def create_gallery_item(name: str, data: str, thumbnail: str = "", width: int = 800, height: int = 600, user_id: Optional[str] = None) -> Dict[str, Any]:
    item_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO gallery (id, name, thumbnail, data, width, height, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item_id, name, thumbnail, data, width, height, now, now, user_id),
        )
        await db.commit()
    return {"id": item_id, "name": name, "thumbnail": thumbnail, "width": width, "height": height, "created_at": now, "updated_at": now}


async def get_gallery_item(item_id: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM gallery WHERE id = ?", (item_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def update_gallery_item(item_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    allowed = {"name", "data", "thumbnail", "width", "height"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return await get_gallery_item(item_id)
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [item_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE gallery SET {set_clause} WHERE id = ?", values)
        await db.commit()
    return await get_gallery_item(item_id)


async def delete_gallery_item(item_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM gallery WHERE id = ?", (item_id,))
        await db.commit()
    return True


# ─── Memories ─────────────────────────────────────────────────────────────────

async def get_memories(user_id: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if search:
            async with db.execute(
                "SELECT * FROM memories WHERE (title LIKE ? OR content LIKE ?) ORDER BY updated_at DESC",
                (f"%{search}%", f"%{search}%"),
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with db.execute("SELECT * FROM memories ORDER BY updated_at DESC") as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def create_memory(title: str, content: str, category: str = "general", confidence: int = 100, source: str = "manual", user_id: Optional[str] = None) -> Dict[str, Any]:
    mem_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO memories (id, title, content, category, confidence, source, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mem_id, title, content, category, confidence, source, now, now, user_id),
        )
        await db.commit()
    return {"id": mem_id, "title": title, "content": content, "category": category, "confidence": confidence, "source": source, "created_at": now, "updated_at": now}


async def delete_memory(mem_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
        await db.commit()
    return True


async def clear_memories(user_id: Optional[str] = None) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM memories")
        await db.commit()
    return True

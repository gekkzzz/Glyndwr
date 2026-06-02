import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core import database as db
from services.llm import stream_chat, _get_provider_for_model, get_available_providers
from core.config import settings as app_settings

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str = "New Chat"
    model: str = "gpt-4o-mini"
    system_prompt: str = ""


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    pinned: Optional[bool] = None


class MessageRequest(BaseModel):
    content: str
    model: Optional[str] = None
    system_prompt: Optional[str] = None


class RenameRequest(BaseModel):
    title: Optional[str] = None  # if None, auto-rename


# ─── Conversation CRUD ────────────────────────────────────────────────────────

@router.post("/")
async def create_conversation(body: ConversationCreate):
    conv = await db.create_conversation(
        title=body.title,
        model=body.model,
        system_prompt=body.system_prompt,
    )
    return conv


@router.get("/")
async def list_conversations():
    convs = await db.get_conversations()
    return convs


@router.get("/{conv_id}")
async def get_conversation(conv_id: str):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = await db.get_messages(conv_id)
    conv["messages"] = messages
    return conv


@router.put("/{conv_id}")
async def update_conversation(conv_id: str, body: ConversationUpdate):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    updates = body.model_dump(exclude_none=True)
    updated = await db.update_conversation(conv_id, **updates)
    return updated


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete_conversation(conv_id)
    return {"ok": True}


# ─── Messages ─────────────────────────────────────────────────────────────────

@router.get("/{conv_id}/messages")
async def get_messages(conv_id: str):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return await db.get_messages(conv_id)


@router.delete("/{conv_id}/messages")
async def clear_messages(conv_id: str):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.clear_messages(conv_id)
    return {"ok": True}


@router.post("/{conv_id}/message")
async def send_message(conv_id: str, body: MessageRequest):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"]
    system_prompt = body.system_prompt if body.system_prompt is not None else conv.get("system_prompt", "")
    provider = _get_provider_for_model(model)

    # Read API keys + Ollama host from the database so users never need .env
    db_settings = await db.get_all_settings()

    # Save user message
    await db.add_message(
        conversation_id=conv_id,
        role="user",
        content=body.content,
        model=model,
    )

    # Build message history for LLM
    history = await db.get_messages(conv_id)
    llm_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if m["role"] in ("user", "assistant")
    ]

    async def event_stream():
        full_response = ""
        total_tokens = 0

        try:
            async for chunk in stream_chat(
                provider=provider,
                model=model,
                messages=llm_messages,
                system_prompt=system_prompt,
                db_settings=db_settings,
            ):
                yield chunk
                # Parse to accumulate response
                if chunk.startswith("data: "):
                    try:
                        data = json.loads(chunk[6:])
                        if data.get("done"):
                            total_tokens = data.get("total_tokens", 0)
                        else:
                            full_response += data.get("content", "")
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            error_payload = json.dumps({"content": f"\n\n[Error: {str(e)}]", "done": True, "total_tokens": 0})
            yield f"data: {error_payload}\n\n"
            full_response += f"\n\n[Error: {str(e)}]"

        # Save assistant message to DB after stream completes
        if full_response:
            await db.add_message(
                conversation_id=conv_id,
                role="assistant",
                content=full_response,
                model=model,
                tokens_used=total_tokens,
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ─── Auto-rename ──────────────────────────────────────────────────────────────

@router.post("/{conv_id}/rename")
async def rename_conversation(conv_id: str, body: RenameRequest):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if body.title:
        # Manual rename
        updated = await db.update_conversation(conv_id, title=body.title)
        return updated

    # Auto-rename: ask LLM for a short title
    messages = await db.get_messages(conv_id)
    if not messages:
        return conv

    # Take the first user message
    first_user = next((m for m in messages if m["role"] == "user"), None)
    if not first_user:
        return conv

    model = conv["model"]
    provider = _get_provider_for_model(model)

    prompt_messages = [
        {
            "role": "user",
            "content": (
                f"Generate a short, descriptive title (max 6 words) for a conversation "
                f"that starts with this message. Reply with ONLY the title, no quotes, "
                f"no punctuation at the end:\n\n{first_user['content'][:500]}"
            ),
        }
    ]

    title_parts: List[str] = []
    try:
        async for chunk in stream_chat(
            provider=provider,
            model=model,
            messages=prompt_messages,
            system_prompt="",
        ):
            if chunk.startswith("data: "):
                try:
                    data = json.loads(chunk[6:])
                    if not data.get("done"):
                        title_parts.append(data.get("content", ""))
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass

    new_title = "".join(title_parts).strip().strip('"').strip("'")
    if new_title:
        # Truncate to reasonable length
        new_title = new_title[:80]
        updated = await db.update_conversation(conv_id, title=new_title)
        return updated

    return conv

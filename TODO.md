# 🚀 Phase 2 Roadmap — Glyndwr as an AI Operating System

> 📎 See also: [README.md](README.md) · [GUIDES.md](GUIDES.md)

## Status

| Symbol | Meaning |
| ------ | ------- |
| ⬜ | Not started |
| 🚧 | In progress |
| ✅ | Complete |

---

## 👁️ 1. Multi-Modal Ingestion & Execution

Expand what Glyndwr can *see* and *run* — beyond plain text.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Vision & OCR Pipeline** | Feed complex PDFs — diagrams, schematics, handwritten notes — through local vision models (LLaVA) or cloud APIs, extracting structured markdown directly into Documents. |
| ⬜ | **Audio & Video Transcription** | Hook into a local Whisper endpoint (`whisper.cpp`) so users can drop in meetings, screen recordings, or voice memos and get instant markdown summaries. |
| ⬜ | **Image Generation** | Connect to local Stable Diffusion engines (ComfyUI / A1111) or cloud text-to-image APIs to generate and save images straight into the Gallery. |

---

## 🧠 2. Knowledge Management & Long-Term Context

Give the AI a persistent, searchable brain that grows with the user.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Vector RAG (Local)** | Run a local vector database (Chroma, Qdrant, or Milvus) inside the server so notes, documents, and chat history become retrievable context injected into every conversation. |
| ⬜ | **Knowledge Graph Engine** | Map relational concepts across files and conversations using a graph structure so the AI can surface connections between ideas that live in different notes or chats. |
| ⬜ | **Semantic Prompt Cache** | Embed each incoming prompt and check it against past queries. When similarity exceeds a threshold, serve the cached response instantly — no API call needed. |
| ⬜ | **Episodic vs. Semantic Memory** | Split the memory store into *episodic* (session events: "that bug yesterday") and *semantic* (permanent facts: "user prefers functional React"). Treat them differently in context injection. |
| ⬜ | **Context Compression & TTL** | Automatically compress old conversation threads into lean summaries as token limits approach. Stale debug logs expire; key decisions are pinned permanently. |
| ⬜ | **Dynamic Document Stitching** | Let the pipeline surgically extract fragments from multiple files — lines 12–50 of one doc, a snippet from another — and assemble a tight, optimised prompt from only what matters. |

---

## 🤖 3. Autonomous Background Workers

Tasks that run while you're not looking.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Proactive Document Synthesiser** | A low-priority background worker that scans your workspace at idle, finds conceptual overlaps between notes, and quietly generates Smart Map summaries. |
| ⬜ | **Scheduled Natural Language Jobs** | Let users describe recurring tasks in plain English ("every morning, summarise my RSS bookmarks relative to my active projects and save the result"). |
| ⬜ | **Git Repository Companion** | Connect to local git repos via webhooks. When a commit lands, a background agent reads the diff against the roadmap and drafts updated documentation, changelogs, or test stubs. |
| ⬜ | **Isolated Code Execution Loop** | A server-side sandboxed runtime (Docker or secure subprocess) where the AI can write, run, and iterate on code safely — not just suggest it. |

---

## ⚡ 4. Forge — Advanced Inference & Hardware Routing

Make local model running smarter, faster, and distributed.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Intelligent Cost/Performance Router** | Automatically send lightweight editing tasks to fast local models and complex reasoning to heavy cloud APIs — transparent to the user, configurable by them. |
| ⬜ | **Intranet Cluster Mode** | Let multiple machines on a LAN discover each other and pool VRAM. Distribute large models across nodes or route idle tasks to whichever machine has headroom. |
| ⬜ | **Multi-Agent Swarm Mode** | Chain specialised agents (Researcher → Writer → QA Editor) into a single workflow that tackles complex, multi-step prompts without the user having to orchestrate each step. |
| ⬜ | **Speculative Decoding** | Pair a heavy local model with a tiny draft model to generate candidate tokens in parallel, dramatically increasing tokens-per-second on large runs. |
| ⬜ | **Continuous Batching & Flash Attention** | Integrate vLLM's paged KV-cache so Glyndwr can handle multiple concurrent generations efficiently rather than serialising every request. |
| ⬜ | **Thermal & Battery Throttling** | Automatically hot-swap to a lower quantisation or offload to a cloud model when the host device hits a thermal limit or drops to battery, keeping the experience smooth. |

---

## 🛠️ 5. Power-User Controls & Developer Playgrounds

Surface the internals for users who want full control.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Live Hardware Telemetry Panel** | A WebSocket-powered dashboard streaming real-time VRAM usage, CPU thermals, RAM pressure, and tokens-per-second directly into the Forge view. |
| ⬜ | **Quantisation Controller** | An interactive slider in Forge that lets users switch active model quantisation targets (FP16, Q8_0, Q4_K_M) on the fly to trade quality for speed. |
| ⬜ | **AST Code Debugger** | Integrate tree-sitter so the AI sees code as a parsed syntax tree rather than flat text, dramatically improving accuracy on refactoring and multi-file edits. |
| ⬜ | **Token Probability Playground** | A special chat mode that exposes logprobs, pauses generation at any point, and lets the user pick an alternative token from a dropdown to manually steer the model's output. |

---

## 🔐 6. Multi-Tenant Infrastructure & Privacy

Safe to run as a shared household or team server.

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Role-Based Access Control** | Admin, Developer, and Guest tiers with fine-grained permission scopes — guests can chat but cannot touch API credentials or shared infrastructure. |
| ⬜ | **Isolated User Workspaces** | Fully siloed storage per user: conversations, notes, memory, and vector stores encrypted at rest and invisible to other accounts on the same instance. |
| ⬜ | **Offline Compliance Mode** | A hard switch that tears down all outbound cloud connections instantly, forcing every model call through local infrastructure — for air-gapped or privacy-critical environments. |
| ⬜ | **Zero-Knowledge Mobile Sync** | A cryptographic peer-to-peer sync protocol (WebRTC or local tunnel) that replicates chat history and documents to mobile without exposing raw content to any third-party relay. |

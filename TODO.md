# 🗺️ Project Roadmap: UI Overhaul & Feature Additions

### 🚦 Status Key
* `⬜ - [ ] Todo`
* `🚧 - [ ] In Progress`
* `✅ - [x] Complete`

---

## 🎨 1. Layout & UI Polish

| Status | Feature | Description |
| :---: | :--- | :--- |
| 🚧 | **Page Stretching** | Fix layout of **Deep Research, Agents, Memory, and Forge** sections. Headers must span full width; remove horizontal squishing for a responsive design. |
| ⬜ | **Settings Page Cleanup** | Fix alignment issues (e.g., hex color input spilling out of picker). Widen the settings container to prevent element overlapping. |
| ⬜ | **Theme Visibility Audit** | Audit all themes for text-contrast bugs. Fix the **Mabinogi theme** (dark text on dark backgrounds in code blocks) to ensure global readability. |
| ⬜ | **Loading Animation** | Replace the legacy spinning square with a modern **3D spinning cube** animation. |

- [ ] 🚧 **Page Stretching**
- [ ] ⬜ **Settings Page Cleanup**
- [ ] ⬜ **Theme Visibility Audit**
- [ ] ⬜ **Loading Animation**

---

## 🧭 2. Navigation & Sidebar Enhancements

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Collapsible Sidebar & Chat List** | Allow independent toggling of the main sidebar and conversation history to enable an distraction-free **"Focus Mode"**. |
| ⬜ | **Expandable Sidebar Labels** | Reveal text labels (e.g., "Notes", "Agents") next to icons upon hover or click. |

- [ ] ⬜ **Collapsible Sidebar & Chat List**
- [ ] ⬜ **Expandable Sidebar Labels**

---

## 💬 3. Chat & Core AI Functions

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Chat Message Ordering Bug** | Fix chronological rendering. Prevent AI responses from floating to the top; enforce strict `[User] -> [AI] -> [User]` alternation. |
| ⬜ | **User Profile Pictures** | Support custom avatar uploads to globally replace the default person emoji in chat threads. |
| ⬜ | **AI Model Avatars** | Replace the generic `⊕` symbol with dynamic, text-based tags representing the active model (e.g., `GRK`, `LLM`). |
| ⬜ | **Model Compare Tool** | Finalize side-by-side prompt benchmarking to allow live performance evaluations between two models. |

- [ ] ⬜ **Chat Message Ordering Bug**
- [ ] ⬜ **User Profile Pictures**
- [ ] ⬜ **AI Model Avatars**
- [ ] ⬜ **Model Compare Tool**

---

## 📝 4. Notes & Documents ("Library" Overhaul)

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Rename "Library" to "Documents"** | Update all references, section headers, and associated iconography/emojis. |
| ⬜ | **Markdown Auto-Rendering** | Instantly render markdown syntax (`##`, `**`, `*`) into stylized rich text within the **Notes** section. |
| ⬜ | **Editor Keyboard Shortcuts** | Implement native hotkeys (e.g., `Ctrl+B` / `Cmd+B` for bolding text) across `.md` and `.txt` file types in **Documents**. |
| ⬜ | **Document Export Engine** | Add formatting pipeline to export documents directly to **PDF** and **DOCX**. |
| ⬜ | **AI Dropdown Menu Fix** | Fix the UI component bug restricting available options in the Notes dropdown menu. |

- [ ] ⬜ **Rename "Library" to "Documents"**
- [ ] ⬜ **Markdown Auto-Rendering (Notes)**
- [ ] ⬜ **Editor Keyboard Shortcuts (Documents)**
- [ ] ⬜ **Document Export Engine**
- [ ] ⬜ **AI Dropdown Menu Fix**

---

## ⚙️ 5. Backend & Data Pipeline Fixes

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Memory & Skill Scraping** | Fix pipeline failures. Restore accurate parsing, mapping, and database storage of user skills and contextual memory. |
| ⬜ | **Server Lifecycle & Persistence** | Prevent idle timeouts/crashes in PowerShell/Terminal environments. Process must remain alive until killed explicitly via `Ctrl + C`. |

- [ ] ⬜ **Memory & Skill Scraping**
- [ ] ⬜ **Server Lifecycle & Persistence**

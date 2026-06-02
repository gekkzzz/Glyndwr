# 🗺️ Project Roadmap: UI Overhaul & Feature Additions

### 🚦 Status Key
* ⬜ **Todo:** Work has not started
* 🚧 **In Progress:** Feature is actively being developed
* ✅ **Complete:** Feature is fully implemented and tested

---

## 🎨 1. Layout, UI Polish & Mobile Optimization

| Status | Feature | Description |
| :---: | :--- | :--- |
| 🚧 | **Page Stretching** | Fix layout of **Deep Research, Agents, Memory, and Forge** sections. Headers must span full width; remove horizontal squishing for a responsive design. |
| ⬜ | **Mobile-Friendly Responsiveness** | Audit and update the global CSS/layout system to ensure the entire application scales beautifully down to mobile viewport sizes. Optimize touch targets, fix overflow issues, and ensure a seamless mobile browsing experience. |
| ⬜ | **Settings Page Cleanup** | Fix alignment issues (e.g., hex color input spilling out of picker). Widen the settings container to prevent element overlapping. |
| ⬜ | **Theme Visibility Audit** | Audit all themes for text-contrast bugs. Fix the **Mabinogi theme** (dark text on dark backgrounds in code blocks) to ensure global readability. |
| ⬜ | **Loading Animation** | Replace the legacy spinning square with a modern **3D spinning cube** animation. |

---

## 🧭 2. Navigation & Sidebar Enhancements

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Collapsible Sidebar & Chat List** | Allow independent toggling of the main sidebar and conversation history to enable a distraction-free **"Focus Mode"**. |
| ⬜ | **Expandable Sidebar Labels** | Reveal text labels (e.g., "Notes", "Agents") next to icons upon hover or click. |

---

## 💬 3. Chat & Core AI Functions

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Chat Message Ordering Bug** | Fix chronological rendering. Prevent AI responses from floating to the top; enforce strict `[User] -> [AI] -> [User]` alternation. |
| ⬜ | **User Profile Pictures** | Support custom avatar uploads to globally replace the default person emoji in chat threads. |
| ⬜ | **AI Model Avatars** | Replace the generic `⊕` symbol with dynamic, text-based tags representing the active model (e.g., `GRK`, `LLM`). |
| ⬜ | **Model Compare Tool** | Finalize side-by-side prompt benchmarking to allow live performance evaluations between two models. |

---

## 📝 4. Notes & Documents ("Library" Overhaul)

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Rename "Library" to "Documents"** | Update all references, section headers, and associated iconography/emojis. |
| ⬜ | **Markdown Auto-Rendering (Notes)** | Instantly render markdown syntax (`##`, `**`, `*`) into stylized rich text within the **Notes** section. |
| ⬜ | **WYSIWYG Editing Toolbar** | Add an interactive rich-text formatting toolbar (Bold, Italics, etc.) directly in the browser interface. This allows desktop users to format text by clicking options like in Microsoft Word, and provides crucial editing capabilities for mobile users. |
| ⬜ | **OS-Aware Cross-Compatibility** | Implement user-agent/OS detection so editor keyboard shortcuts dynamically adjust based on the user's operating system (e.g., automatically listening for `Cmd + B` on macOS/iOS and `Ctrl + B` on Windows/Linux/Android). |
| ⬜ | **Document Export Engine** | Add formatting pipeline to export documents directly to **PDF** and **DOCX**. |
| ⬜ | **AI Dropdown Menu Fix** | Fix the UI component bug restricting available options in the Notes dropdown menu. |

---

## ⚙️ 5. Backend & Data Pipeline Fixes

| Status | Feature | Description |
| :---: | :--- | :--- |
| ⬜ | **Memory & Skill Scraping** | Fix pipeline failures. Restore accurate parsing, mapping, and database storage of user skills and contextual memory. |
| ⬜ | **Server Lifecycle & Persistence** | Prevent idle timeouts/crashes in PowerShell/Terminal environments. Process must remain alive until killed explicitly via `Ctrl + C`. |

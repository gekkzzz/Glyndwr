# UI/UX & Functional Feature: UI Overhaul, Component Fixes, and Feature Additions

## 1. Layout & UI Polish
- [ ] **Page Stretching:** Fix the layout of the **Deep Research, Agents, Memory, and Forge** sections. The headers do not currently span the full width of the page, and the overall content looks horizontally squished. Make these sections full-width/responsive.
- [ ] **Settings Page Cleanup:** Fix alignment issues on the Settings page. For example, the hex color code input field is spilling out of the color picker box. Make the settings container wider so all elements fit comfortably without overlapping.
- [ ] **Theme Visibility Audit:** Review all application themes. Fix text-contrast bugs in specific themes; for example, in the **Mabinogi theme**, code blocks use a dark background with dark text, making the code unreadable. Ensure code blocks have proper contrast in every theme.
- [ ] **Loading Animation:** Replace the current loading spinning square with a **3D spinning cube** animation.

## 2. Navigation & Sidebar Enhancements
- [ ] **Collapsible Chat List & Sidebar:** Add the ability to independently hide and unhide:
  1. The main application sidebar (containing Tools, Images, Docs, etc.).
  2. The chat history/conversation list.
  *This is to allow the user to enter a "focus mode" strictly for interacting with the AI.*
- [ ] **Expandable Sidebar Labels:** Allow users to hover over or click to extend the main sidebar so they can view the text labels next to the icons (e.g., displaying "Notes", "Agents", "Chats" next to their respective emojis/icons).

## 3. Chat & Core AI Functions
- [ ] **Chat Message Ordering Bug:** Fix the conversation flow rendering. Currently, AI responses are floating to the top instead of alternating correctly. Ensure the layout strictly follows a linear, chronological conversation history: `[User Input] -> [AI Response] -> [User Input] -> [AI Response]`.
- [ ] **User Profile Pictures:** Add a feature allowing users to upload a custom profile picture. This avatar should replace the default person emoji globally in the chat interface.
- [ ] **AI Model Avatars:** Change the AI avatar icon. Replace the current `⊕` symbol with a dynamic text-based tag or custom label representing the specific model being used (e.g., "GRK", "LLM", etc.).
- [ ] **Model Compare Tool:** Ensure the comparison tool is fully functional, allowing users to run side-by-side prompt comparisons between two different models to evaluate performance.

## 4. Notes & Documents ("Library" Overhaul)
- [ ] **Rename "Library" to "Documents":** Update the section name and its accompanying icon/emoji.
- [ ] **Rich Text / Markdown Editor Features:**
  - [ ] In the **Notes** section, implement auto-rendering for Markdown. When a user types `## Title`, `**bold**`, or `*italics*`, it should instantly transform into stylized rich text rather than staying as plain text with symbols.
  - [ ] In the **Documents** section, ensure standard keyboard shortcuts function correctly (e.g., pressing `Ctrl + B` or `Cmd + B` should automatically apply bold formatting to selected text) across file types like `.md` and `.txt`.
- [ ] **Document Export:** Add functionality to export documents to various formats, specifically **PDF** and **DOCX**.
- [ ] **AI Dropdown Menu Fix:** Fix the AI dropdown menu component within the notes section, as it is currently failing to display all available features.

## 5. Backend & Data Pipeline Fixes
- [ ] **Memory/Skill Scraping:** Investigate and fix the memory and skill scraping pipeline. It is currently broken and failing to capture/save user skills and contextual memory. Ensure data is being parsed, mapped, and stored correctly.
- [ ] **Server Lifecycle & Persistence:** Ensure the backend server running in the terminal/PowerShell remains fully persistent and does not crash or shut down unexpectedly under any idle conditions. The server process must stay alive continuously unless explicitly terminated by the user via a manual command (e.g., typing `Ctrl + C`).

/* ═══════════════════════════════════════════════════════════
   Glyndwr — app.js  v1.1.0
   Single-file SPA — vanilla JS, no framework
   ═══════════════════════════════════════════════════════════ */
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentConversationId: null,
  conversations: [],
  messages: [],
  currentModel: 'gpt-4o-mini',
  currentTheme: 'dragon',
  isStreaming: false,
  settings: {},
  availableModels: {},
  contextMenuTarget: null,
  compareHistory: { a: [], b: [] },
  currentSection: 'chat',
  notes: [],
  currentNoteId: null,
  noteSaveTimer: null,
  tasks: [],
  taskFilter: 'all',
  documents: [],
  currentDocId: null,
  docSaveTimer: null,
  calendarDate: new Date(),
  calendarEvents: {},
  memoryFilter: '',
  agentRunning: false,
  agentHistory: [],
  pwaInstallPrompt: null,
  currentEmailUid: null,
  currentEmailFolder: 'INBOX',
  pushSubscription: null,
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getAuthToken() { return localStorage.getItem('glyndwr_token') || ''; }
function getAuthHeaders() {
  const t = getAuthToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

// ─── API ──────────────────────────────────────────────────────────────────────
const API = {
  async get(path) {
    const r = await fetch(path, { headers: { ...getAuthHeaders() }, credentials: 'include' });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `POST ${path} → ${r.status}`);
    }
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `PUT ${path} → ${r.status}`);
    }
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE', headers: { ...getAuthHeaders() }, credentials: 'include' });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
    return r.json();
  },
  async streamPost(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `POST ${path} → ${r.status}`);
    }
    return r;
  },
};

function redirectToLogin() {
  localStorage.removeItem('glyndwr_token');
  localStorage.removeItem('glyndwr_user');
  window.location.href = '/login';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const icons = { info: '[i]', success: '[+]', error: '[!]', warning: '[~]' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '[i]'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fadeout'); setTimeout(() => toast.remove(), 300); }, duration);
  return toast;
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function setupMarked() {
  const renderer = new marked.Renderer();
  renderer.code = function (code, lang) {
    if (typeof code === 'object' && code !== null) { lang = code.lang || ''; code = code.text || ''; }
    lang = lang || '';
    const validLang = hljs.getLanguage(lang) ? lang : '';
    let highlighted;
    try {
      highlighted = validLang ? hljs.highlight(code, { language: validLang }).value : hljs.highlightAuto(code).value;
    } catch { highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${lang || 'text'}</span><button class="copy-code-btn" onclick="copyCode(this)">Copy</button></div><pre><code class="hljs language-${lang || 'text'}">${highlighted}</code></pre></div>`;
  };
  renderer.codespan = function (code) {
    if (typeof code === 'object' && code !== null) code = code.text || '';
    return `<code>${code}</code>`;
  };
  marked.setOptions({ renderer, breaks: true, gfm: true });
}

function renderMarkdown(text) {
  try {
    const raw = marked.parse(text || '');
    return DOMPurify.sanitize(raw, { ADD_TAGS: ['div', 'span', 'button'], ADD_ATTR: ['class', 'onclick', 'data-lang'], FORCE_BODY: true });
  } catch { return DOMPurify.sanitize(text || ''); }
}

window.copyCode = function (btn) {
  const code = btn.closest('.code-block-wrapper').querySelector('code').innerText;
  navigator.clipboard.writeText(code).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); });
};

// ─── Time Helpers ─────────────────────────────────────────────────────────────
function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = now - d;
  const day = 86400000;
  if (diff < day && d.getDate() === now.getDate()) return 'Today';
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function groupByDate(conversations) {
  const groups = {}, order = [];
  for (const conv of conversations) {
    const label = formatDate(conv.updated_at);
    if (!groups[label]) { groups[label] = []; order.push(label); }
    groups[label].push(conv);
  }
  return { groups, order };
}
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Section Navigation ───────────────────────────────────────────────────────
const TOOL_SECTIONS = new Set(['agent', 'research', 'memory', 'cookbook']);

function switchSection(name) {
  state.currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${name}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  // Highlight tools btn for tool sections
  const toolsBtn = document.getElementById('nav-tools-btn');
  if (toolsBtn) toolsBtn.classList.toggle('tools-active', TOOL_SECTIONS.has(name));
  switch (name) {
    case 'notes':    loadNotes(); break;
    case 'tasks':    loadTasks(); break;
    case 'documents': loadDocuments(); break;
    case 'email':    renderEmailSection(); break;
    case 'calendar': loadCalendarEvents(); break;
    case 'memory':   loadMemories(); break;
    case 'cookbook': renderCookbook(); break;
    case 'gallery':  if (typeof ImageEditor !== 'undefined') ImageEditor.loadGalleryList(); break;
  }
  if (typeof syncToolsCollapse === 'function') syncToolsCollapse(name);
}

// ─── Conversations ────────────────────────────────────────────────────────────
async function loadConversations() {
  try {
    state.conversations = await API.get('/api/chat/');
    renderSidebar();
  } catch (e) { console.error('Failed to load conversations:', e); }
}

function renderSidebar() {
  const list = document.getElementById('conversation-list');
  list.innerHTML = '';
  const pinned = state.conversations.filter(c => c.pinned);
  const unpinned = state.conversations.filter(c => !c.pinned);
  if (pinned.length) {
    const label = document.createElement('div');
    label.className = 'conv-group-label'; label.textContent = 'Pinned';
    list.appendChild(label);
    pinned.forEach(c => list.appendChild(makeConvItem(c)));
  }
  const { groups, order } = groupByDate(unpinned);
  for (const dateLabel of order) {
    const label = document.createElement('div');
    label.className = 'conv-group-label'; label.textContent = dateLabel;
    list.appendChild(label);
    groups[dateLabel].forEach(c => list.appendChild(makeConvItem(c)));
  }
  if (!state.conversations.length) {
    list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-faint);text-align:center">No conversations yet.<br>Start a new chat!</div>';
  }
}

function makeConvItem(conv) {
  const el = document.createElement('div');
  el.className = 'conv-item' + (conv.id === state.currentConversationId ? ' active' : '');
  el.dataset.id = conv.id;
  const preview = (conv.last_message || '').slice(0, 55);
  el.innerHTML = `
    <div class="conv-item-icon">${getProviderIcon(conv.model)}</div>
    <div class="conv-item-info">
      <div class="conv-item-title">${escHtml(conv.title)}${conv.pinned ? ' <span class="conv-pin-icon">[*]</span>' : ''}</div>
      <div class="conv-item-preview">${escHtml(preview)}</div>
    </div>
    <span class="conv-item-time">${formatDate(conv.updated_at) === 'Today' ? formatTime(conv.updated_at) : formatDate(conv.updated_at)}</span>
    <div class="conv-item-actions">
      <button class="conv-action-btn" data-action="pin" title="${conv.pinned ? 'Unpin' : 'Pin'}">[*]</button>
      <button class="conv-action-btn danger" data-action="delete" title="Delete">[x]</button>
    </div>`;
  el.addEventListener('click', (e) => { if (!e.target.closest('.conv-action-btn')) openConversation(conv.id); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, conv.id, conv.pinned); });
  el.querySelector('[data-action="pin"]').addEventListener('click', (e) => { e.stopPropagation(); togglePin(conv.id, conv.pinned); });
  el.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(conv.id); });
  return el;
}

function getProviderIcon(model) {
  if (!model) return '💬';
  const m = model.toLowerCase();
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return '<span class="model-tag">OAI</span>';
  if (m.startsWith('claude')) return '<span class="model-tag">ANT</span>';
  if (m.startsWith('gemini')) return '<span class="model-tag">GEM</span>';
  if (m.startsWith('deepseek')) return '<span class="model-tag">DSK</span>';
  // Groq only for models with Groq-specific naming (versatile, instant, 32768)
  if (/versatile|instant|32768|specdec/.test(m)) return '<span class="model-tag">GRQ</span>';
  // Everything else (llama3.2, mistral, gemma, phi, qwen…) is a local Ollama model
  return '<span class="model-tag">LLM</span>';
}

async function openConversation(id) {
  state.currentConversationId = id;
  document.querySelectorAll('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('messages-list').innerHTML = '';
  try {
    const conv = await API.get(`/api/chat/${id}`);
    state.messages = conv.messages || [];
    state.currentModel = conv.model || state.currentModel;
    document.getElementById('current-title').textContent = conv.title;
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    const sel = document.getElementById('model-select');
    if (sel.querySelector(`option[value="${conv.model}"]`)) sel.value = conv.model;
    updateSystemPromptBar(conv.system_prompt);
    const list = document.getElementById('messages-list');
    list.innerHTML = '';
    for (const msg of state.messages) { if (msg.role !== 'system') list.appendChild(makeMessageEl(msg)); }
    scrollToBottom(true);
    if (window.innerWidth <= 768) closeMobileSidebar();
  } catch (e) { showToast(`Failed to load conversation: ${e.message}`, 'error'); }
}

async function createConversation(initialMessage = null) {
  try {
    const model = document.getElementById('model-select').value || state.currentModel;
    const systemPrompt = state.settings['default_system_prompt'] || '';
    const conv = await API.post('/api/chat/', { title: 'New Chat', model, system_prompt: systemPrompt });
    state.conversations.unshift(conv);
    renderSidebar();
    await openConversation(conv.id);
    if (initialMessage) { document.getElementById('message-input').value = initialMessage; await sendMessage(); }
    return conv;
  } catch (e) { showToast(`Failed to create conversation: ${e.message}`, 'error'); return null; }
}

async function deleteConversation(id) {
  if (!confirm('Delete this conversation?')) return;
  try {
    await API.del(`/api/chat/${id}`);
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentConversationId === id) {
      state.currentConversationId = null;
      state.messages = [];
      document.getElementById('current-title').textContent = 'New Chat';
      document.getElementById('messages-list').innerHTML = '';
      document.getElementById('welcome-screen').style.display = '';
      document.getElementById('message-input').disabled = true;
      document.getElementById('send-btn').disabled = true;
      updateSystemPromptBar('');
    }
    renderSidebar();
    showToast('Deleted', 'success');
  } catch (e) { showToast(`Delete failed: ${e.message}`, 'error'); }
}

async function togglePin(id, currentlyPinned) {
  try {
    await API.put(`/api/chat/${id}`, { pinned: !currentlyPinned });
    await loadConversations();
    showToast(currentlyPinned ? 'Unpinned' : 'Pinned', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

// ─── Rename ───────────────────────────────────────────────────────────────────
function startRename() {
  if (!state.currentConversationId) return;
  const titleEl = document.getElementById('current-title');
  const input = document.createElement('input');
  input.id = 'rename-input'; input.value = titleEl.textContent; input.type = 'text';
  titleEl.style.display = 'none';
  titleEl.parentNode.insertBefore(input, titleEl);
  input.focus(); input.select();
  async function finish() {
    const newTitle = input.value.trim() || titleEl.textContent;
    input.remove(); titleEl.style.display = '';
    titleEl.textContent = newTitle;
    try { await API.post(`/api/chat/${state.currentConversationId}/rename`, { title: newTitle }); await loadConversations(); }
    catch (e) { showToast(`Rename failed: ${e.message}`, 'error'); }
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } if (e.key === 'Escape') { input.remove(); titleEl.style.display = ''; } });
  input.addEventListener('blur', finish);
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function showContextMenu(x, y, convId, isPinned) {
  state.contextMenuTarget = { convId, isPinned };
  const menu = document.getElementById('context-menu');
  document.getElementById('ctx-pin').textContent = isPinned ? '[*] Unpin' : '[*] Pin';
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
  menu.classList.remove('hidden');
}
function hideContextMenu() { document.getElementById('context-menu').classList.add('hidden'); state.contextMenuTarget = null; }

// ─── Message Rendering ────────────────────────────────────────────────────────
function makeMessageEl(msg) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.dataset.id = msg.id;
  const contentHtml = msg.role === 'assistant' ? renderMarkdown(msg.content) : `<span>${escHtml(msg.content).replace(/\n/g, '<br>')}</span>`;
  row.innerHTML = `
    <div class="message-avatar">${msg.role === 'user' ? '🧑' : '⊕'}</div>
    <div class="message-body">
      <div class="message-bubble">${contentHtml}</div>
      <div class="message-meta">
        <span class="message-time">${formatTime(msg.created_at)}</span>
        ${msg.model ? `<span class="message-model">${escHtml(msg.model)}</span>` : ''}
        <button class="copy-msg-btn" onclick="copyMessageContent(this)">Copy</button>
      </div>
    </div>`;
  return row;
}

window.copyMessageContent = function (btn) {
  const text = btn.closest('.message-body').querySelector('.message-bubble').innerText;
  navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); });
};

function makeTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant'; row.id = 'typing-indicator';
  row.innerHTML = `<div class="message-avatar">⊕</div><div class="message-body"><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`;
  return row;
}

// ─── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  if (state.isStreaming) return;
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content) return;
  if (!state.currentConversationId) { await createConversation(content); return; }

  const model = document.getElementById('model-select').value || state.currentModel;
  state.currentModel = model;
  input.value = ''; resizeTextarea(input); updateTokenCount('');

  state.isStreaming = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('message-input').disabled = true;

  const userMsg = { id: 'tmp-' + Date.now(), conversation_id: state.currentConversationId, role: 'user', content, model, created_at: new Date().toISOString() };
  state.messages.push(userMsg);
  const list = document.getElementById('messages-list');
  document.getElementById('welcome-screen').style.display = 'none';
  list.appendChild(makeMessageEl(userMsg));

  const typingEl = makeTypingIndicator();
  list.appendChild(typingEl);
  scrollToBottom();

  let systemPrompt = '';
  try { const conv = await API.get(`/api/chat/${state.currentConversationId}`); systemPrompt = conv.system_prompt || state.settings['default_system_prompt'] || ''; } catch {}

  const assistantRow = document.createElement('div');
  assistantRow.className = 'message-row assistant';
  assistantRow.innerHTML = `<div class="message-avatar">⊕</div><div class="message-body"><div class="message-bubble" id="streaming-bubble"></div><div class="message-meta"><span class="message-time">${formatTime(new Date().toISOString())}</span><span class="message-model">${escHtml(model)}</span><button class="copy-msg-btn" onclick="copyMessageContent(this)">Copy</button></div></div>`;

  let fullText = '', userScrolled = false;
  const messagesArea = document.getElementById('messages-area');
  const onScroll = () => { const { scrollTop, scrollHeight, clientHeight } = messagesArea; userScrolled = scrollHeight - scrollTop - clientHeight > 60; };
  messagesArea.addEventListener('scroll', onScroll);

  try {
    const resp = await API.streamPost(`/api/chat/${state.currentConversationId}/message`, { content, model, system_prompt: systemPrompt });
    typingEl.remove();
    list.appendChild(assistantRow);
    const bubble = document.getElementById('streaming-bubble');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) break;
          fullText += data.content || '';
          bubble.innerHTML = renderMarkdown(fullText);
          if (!userScrolled) scrollToBottom();
        } catch {}
      }
    }
    bubble.innerHTML = renderMarkdown(fullText);
    if (!userScrolled) scrollToBottom();
    state.messages.push({ id: 'tmp-asst-' + Date.now(), role: 'assistant', content: fullText, model, created_at: new Date().toISOString() });

    const autoRename = state.settings['auto_rename'] !== 'false';
    const isFirstExchange = state.messages.filter(m => m.role === 'user').length === 1;
    if (autoRename && isFirstExchange && state.currentConversationId) {
      try {
        const renamed = await API.post(`/api/chat/${state.currentConversationId}/rename`, {});
        if (renamed.title && renamed.title !== 'New Chat') document.getElementById('current-title').textContent = renamed.title;
        await loadConversations();
      } catch {}
    } else { await loadConversations(); }
    // Auto-extract memories after conversation (background, non-blocking)
    if (state.currentConversationId) extractMemoriesFromConversation(state.currentConversationId);
  } catch (e) {
    typingEl.remove();
    showToast(`Error: ${e.message}`, 'error');
    const tmpEl = list.querySelector(`[data-id="${userMsg.id}"]`);
    if (tmpEl) tmpEl.remove();
    state.messages = state.messages.filter(m => m.id !== userMsg.id);
    input.value = content;
  } finally {
    state.isStreaming = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('message-input').disabled = false;
    input.focus();
    messagesArea.removeEventListener('scroll', onScroll);
  }
}

function scrollToBottom(instant = false) {
  const area = document.getElementById('messages-area');
  if (instant) area.scrollTop = area.scrollHeight;
  else requestAnimationFrame(() => area.scrollTop = area.scrollHeight);
}
function resizeTextarea(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }
function updateTokenCount(text) {
  const el = document.getElementById('token-count');
  el.textContent = text.length ? `~${Math.ceil(text.length / 4)} tokens` : '';
}

// ─── Models ───────────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const data = await API.get('/api/models/');
    state.availableModels = data.providers || {};
    const selIds = ['model-select', 'compare-model-a', 'compare-model-b', 'agent-model-select', 'research-model-select'];
    selIds.forEach(id => { const el = document.getElementById(id); if (el) populateModelSelect(el); });
    populateSettingsDefaultModel();
    updateProviderStatus();
  } catch (e) { console.error('Failed to load models:', e); }
}

function populateModelSelect(sel) {
  if (!sel) return;
  const prevValue = sel.value;
  sel.innerHTML = '';
  const providers = state.availableModels;
  let hasAny = false;
  const order = ['openai', 'anthropic', 'groq', 'gemini', 'deepseek', 'openrouter', 'ollama'];
  const providerNames = { openai: 'OpenAI', anthropic: 'Anthropic', groq: 'Groq', gemini: 'Google Gemini', deepseek: 'DeepSeek', openrouter: 'OpenRouter', ollama: 'Ollama (Local)' };
  for (const provider of order) {
    const models = providers[provider];
    if (!models || !models.length) continue;
    const group = document.createElement('optgroup');
    group.label = providerNames[provider] || provider;
    for (const model of models) {
      const opt = document.createElement('option'); opt.value = model; opt.textContent = model;
      group.appendChild(opt); hasAny = true;
    }
    sel.appendChild(group);
  }
  for (const [provider, models] of Object.entries(providers)) {
    if (order.includes(provider) || !models || !models.length) continue;
    const group = document.createElement('optgroup'); group.label = provider;
    for (const model of models) { const opt = document.createElement('option'); opt.value = model; opt.textContent = model; group.appendChild(opt); hasAny = true; }
    sel.appendChild(group);
  }
  if (!hasAny) { const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'No models — configure API keys'; sel.appendChild(opt); }
  if (prevValue && sel.querySelector(`option[value="${prevValue}"]`)) sel.value = prevValue;
  else if (state.currentModel && sel.querySelector(`option[value="${state.currentModel}"]`)) sel.value = state.currentModel;
  else if (sel.options.length) { sel.selectedIndex = 0; if (sel.id === 'model-select') state.currentModel = sel.value; }
}

function populateSettingsDefaultModel() {
  const sel = document.getElementById('setting-default-model');
  if (!sel) return;
  sel.innerHTML = '';
  for (const [provider, models] of Object.entries(state.availableModels)) {
    for (const model of models) {
      const opt = document.createElement('option'); opt.value = model; opt.textContent = `${model} (${provider})`; sel.appendChild(opt);
    }
  }
  const def = state.settings['default_model'] || 'gpt-4o-mini';
  if (sel.querySelector(`option[value="${def}"]`)) sel.value = def;
}

function updateProviderStatus() {
  const container = document.getElementById('provider-status');
  if (!container) return;
  container.innerHTML = '';
  const providerNames = { openai: 'OpenAI', anthropic: 'Anthropic', groq: 'Groq', gemini: 'Gemini', deepseek: 'DeepSeek', openrouter: 'OpenRouter', ollama: 'Ollama' };
  const allProviders = ['openai', 'anthropic', 'groq', 'gemini', 'deepseek', 'openrouter', 'ollama'];
  let anyActive = false;
  for (const p of allProviders) {
    const models = state.availableModels[p];
    const active = models && models.length > 0;
    if (!active && p === 'ollama') continue;
    if (active) anyActive = true;
    const badge = document.createElement('div');
    badge.className = 'provider-badge';
    badge.innerHTML = `<div class="status-dot ${active ? 'active' : 'inactive'}"></div>${providerNames[p] || p}`;
    container.appendChild(badge);
  }
  const hint = document.getElementById('welcome-setup-hint');
  if (hint) hint.classList.toggle('hidden', anyActive);
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEMES = ['dragon','annwn','eryri','mabinogi','coed','mor','midnight','cyberpunk','retrowave','forest','ocean','terminal','amber','light','custom'];
function applyTheme(theme) {
  const body = document.body;
  THEMES.forEach(t => body.classList.remove(`theme-${t}`));
  body.classList.add(`theme-${theme}`);
  state.currentTheme = theme;
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === theme));
  // Persist
  saveSettingLocal('theme', theme).catch(() => {});
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    state.settings = await API.get('/api/settings/');
    applyTheme(state.settings['theme'] || 'dragon');
    const fontSize = state.settings['font_size'] || 'md';
    applyFontSize(fontSize);
    document.body.classList.toggle('compact', state.settings['compact'] === 'true' || state.settings['compact'] === true);
    if (state.settings['default_model']) state.currentModel = state.settings['default_model'];

    const histLimit = document.getElementById('setting-history-limit');
    if (histLimit && state.settings['history_limit']) histLimit.value = state.settings['history_limit'];
    const autoRename = document.getElementById('setting-auto-rename');
    if (autoRename) autoRename.value = state.settings['auto_rename'] === 'false' ? 'false' : 'true';
    const sysPEl = document.getElementById('setting-system-prompt');
    if (sysPEl && state.settings['default_system_prompt']) sysPEl.value = state.settings['default_system_prompt'];
    const fontSel = document.getElementById('setting-font-size');
    if (fontSel) fontSel.value = fontSize;
    const compactSel = document.getElementById('setting-compact');
    if (compactSel) compactSel.value = (state.settings['compact'] === 'true' || state.settings['compact'] === true) ? 'true' : 'false';
    if (state.settings['accent_color']) {
      document.documentElement.style.setProperty('--red', state.settings['accent_color']);
      const picker = document.getElementById('accent-color-picker');
      if (picker) picker.value = state.settings['accent_color'];
    }
    applyBgPattern(state.settings['bg_pattern'] || 'none');
    // Font + density (applied again in initAnimatedBackground but set early)
    if (state.settings['font_family']) applyFont(state.settings['font_family']);
    if (state.settings['density']) { document.body.classList.remove('density-compact','density-spacious'); if (state.settings['density']) document.body.classList.add(state.settings['density']); }

    // Email settings
    const emailKeys = ['email_imap_host','email_imap_port','email_imap_username','email_imap_password','email_smtp_host','email_smtp_port','email_smtp_username','email_smtp_password'];
    for (const key of emailKeys) {
      if (state.settings[key] !== undefined) {
        const fieldId = 'email-' + key.replace('email_', '').replace(/_/g, '-');
        const el = document.getElementById(fieldId);
        if (el) el.value = state.settings[key];
      }
    }

    // Tools settings
    const searxngEl = document.getElementById('setting-searxng-url');
    if (searxngEl && state.settings['searxng_url']) searxngEl.value = state.settings['searxng_url'];

    // CalDAV settings
    const caldavUrl = document.getElementById('caldav-url');
    if (caldavUrl && state.settings['caldav_url']) caldavUrl.value = state.settings['caldav_url'];
    const caldavUser = document.getElementById('caldav-username');
    if (caldavUser && state.settings['caldav_username']) caldavUser.value = state.settings['caldav_username'];
  } catch (e) { console.error('Failed to load settings:', e); }
}

function applyFontSize(size) { document.body.classList.remove('font-sm', 'font-md', 'font-lg'); document.body.classList.add(`font-${size}`); }
function applyBgPattern(pattern) {
  document.body.classList.remove('bg-dots', 'bg-grid', 'bg-noise');
  if (pattern && pattern !== 'none') document.body.classList.add(`bg-${pattern}`);
  document.querySelectorAll('.bg-pattern-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.pattern === pattern));
}

async function saveSettings() {
  // Core settings
  const payload = {
    theme: state.currentTheme,
    default_model: document.getElementById('setting-default-model')?.value || '',
    default_system_prompt: document.getElementById('setting-system-prompt')?.value || '',
    history_limit: document.getElementById('setting-history-limit')?.value || '20',
    auto_rename: document.getElementById('setting-auto-rename')?.value || 'true',
    font_size: document.getElementById('setting-font-size')?.value || 'md',
  };

  // Provider API keys — save to DB so no .env needed
  const providerFields = {
    openai_api_key: 'key-openai',
    anthropic_api_key: 'key-anthropic',
    groq_api_key: 'key-groq',
    gemini_api_key: 'key-gemini',
    deepseek_api_key: 'key-deepseek',
    openrouter_api_key: 'key-openrouter',
    ollama_host: 'key-ollama',
  };
  for (const [settingKey, elId] of Object.entries(providerFields)) {
    const el = document.getElementById(elId);
    if (el && el.value.trim()) payload[settingKey] = el.value.trim();
  }

  try {
    await API.put('/api/settings/', payload);
    state.settings = { ...state.settings, ...payload };
    applyFontSize(payload.font_size);
    showToast('Settings saved', 'success');
    closeModal('settings-overlay');
    // Reload model list so new provider keys take effect immediately
    await loadModels();
  } catch (e) { showToast(`Failed to save settings: ${e.message}`, 'error'); }
}

async function saveSettingLocal(key, value) {
  try { await API.put(`/api/settings/${key}`, { value }); state.settings[key] = value; } catch {}
}

async function saveEmailSettings() {
  const payload = {
    email_imap_host: document.getElementById('email-imap-host').value,
    email_imap_port: document.getElementById('email-imap-port').value,
    email_imap_username: document.getElementById('email-imap-username').value,
    email_imap_password: document.getElementById('email-imap-password').value,
    email_smtp_host: document.getElementById('email-smtp-host').value,
    email_smtp_port: document.getElementById('email-smtp-port').value,
    email_smtp_username: document.getElementById('email-smtp-username').value,
    email_smtp_password: document.getElementById('email-smtp-password').value,
  };
  try {
    await API.put('/api/settings/', payload);
    state.settings = { ...state.settings, ...payload };
    showToast('Email settings saved', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

async function saveToolsSettings() {
  const payload = { searxng_url: document.getElementById('setting-searxng-url').value };
  try {
    await API.put('/api/settings/', payload);
    state.settings = { ...state.settings, ...payload };
    showToast('Tool settings saved', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

async function saveCalDAVSettings() {
  const payload = {
    caldav_url: document.getElementById('caldav-url').value,
    caldav_username: document.getElementById('caldav-username').value,
    caldav_password: document.getElementById('caldav-password').value,
  };
  try {
    await API.put('/api/settings/', payload);
    state.settings = { ...state.settings, ...payload };
    showToast('CalDAV settings saved', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

// ─── System Prompt ────────────────────────────────────────────────────────────
function updateSystemPromptBar(prompt) {
  const bar = document.getElementById('system-prompt-bar');
  const preview = document.getElementById('system-prompt-preview');
  if (prompt) { bar.classList.add('visible'); preview.textContent = 'System: ' + prompt.slice(0, 100) + (prompt.length > 100 ? '…' : ''); }
  else bar.classList.remove('visible');
}

async function saveConvSystemPrompt() {
  if (!state.currentConversationId) return;
  const prompt = document.getElementById('conv-system-prompt').value;
  try {
    await API.put(`/api/chat/${state.currentConversationId}`, { system_prompt: prompt });
    updateSystemPromptBar(prompt);
    closeModal('sysprompt-overlay');
    showToast('System prompt updated', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

async function clearConversation() {
  if (!state.currentConversationId || !confirm('Clear all messages?')) return;
  try {
    await API.del(`/api/chat/${state.currentConversationId}/messages`);
    state.messages = [];
    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('welcome-screen').style.display = '';
    showToast('Cleared', 'success');
    await loadConversations();
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(overlayId) { document.getElementById(overlayId).classList.remove('hidden'); }
function closeModal(overlayId) { document.getElementById(overlayId).classList.add('hidden'); }
function initTabs(container) {
  container.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// ─── Provider Testing ─────────────────────────────────────────────────────────
window.testProvider = async function (provider) {
  const keyEl = document.getElementById(`key-${provider}`);
  const statusEl = document.getElementById(`status-${provider}`);
  if (!keyEl) return;
  const key = keyEl.value.trim();
  if (!key && provider !== 'ollama') { showToast('Enter an API key first', 'warning'); return; }
  if (statusEl) statusEl.innerHTML = '<span class="mini-spinner"></span>';
  try {
    const result = await API.post('/api/models/test', { provider, api_key: key, host: provider === 'ollama' ? key : undefined });
    if (statusEl) statusEl.innerHTML = result.ok ? '<span class="status-tag ok">Connected ✓</span>' : `<span class="status-tag fail">Failed ✗</span>`;
    if (result.ok) { showToast(`${provider} connection successful`, 'success'); await loadModels(); }
    else showToast(`${provider} failed: ${result.error || result.status}`, 'error');
  } catch (e) { if (statusEl) statusEl.innerHTML = '<span class="status-tag fail">Error</span>'; showToast(`Test failed: ${e.message}`, 'error'); }
};

// ─── Compare ──────────────────────────────────────────────────────────────────
async function sendCompare() {
  const input = document.getElementById('compare-input');
  const content = input.value.trim(); if (!content) return;
  const modelA = document.getElementById('compare-model-a').value;
  const modelB = document.getElementById('compare-model-b').value;
  if (!modelA || !modelB) { showToast('Select models for both panels', 'warning'); return; }
  input.value = '';
  state.compareHistory.a.push({ role: 'user', content });
  state.compareHistory.b.push({ role: 'user', content });
  appendCompareMessage('a', 'user', content);
  appendCompareMessage('b', 'user', content);
  await Promise.all([streamCompare('a', modelA, state.compareHistory.a), streamCompare('b', modelB, state.compareHistory.b)]);
}

function appendCompareMessage(pane, role, content) {
  const el = document.getElementById(`compare-messages-${pane}`);
  const div = document.createElement('div');
  div.className = `compare-msg ${role}`;
  div.innerHTML = role === 'user' ? `<strong>You:</strong> ${escHtml(content)}` : renderMarkdown(content);
  el.appendChild(div); el.scrollTop = el.scrollHeight; return div;
}

async function streamCompare(pane, model, messages) {
  const container = document.getElementById(`compare-messages-${pane}`);
  const responseDiv = document.createElement('div');
  responseDiv.className = 'compare-msg assistant'; container.appendChild(responseDiv);
  let fullText = '';
  try {
    const conv = await API.post('/api/chat/', { model, title: 'Compare' });
    const resp = await API.streamPost(`/api/chat/${conv.id}/message`, { content: messages[messages.length - 1].content, model });
    const reader = resp.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try { const data = JSON.parse(line.slice(6)); if (!data.done) { fullText += data.content || ''; responseDiv.innerHTML = renderMarkdown(fullText); container.scrollTop = container.scrollHeight; } } catch {}
      }
    }
    await API.del(`/api/chat/${conv.id}`);
    if (pane === 'a') state.compareHistory.a.push({ role: 'assistant', content: fullText });
    else state.compareHistory.b.push({ role: 'assistant', content: fullText });
  } catch (e) { responseDiv.textContent = `Error: ${e.message}`; }
}

// ─── File Attach ──────────────────────────────────────────────────────────────
function handleFileAttach(file) {
  if (!file) return;
  const input = document.getElementById('message-input');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => { input.value = `[Image: ${file.name}]\n` + input.value; resizeTextarea(input); };
    reader.readAsDataURL(file);
  } else if (file.size < 500 * 1024) {
    const reader = new FileReader();
    reader.onload = (e) => { const ext = file.name.split('.').pop(); input.value = `\`\`\`${ext}\n${e.target.result}\n\`\`\`\n` + input.value; resizeTextarea(input); };
    reader.readAsText(file);
  } else showToast('File too large. Max 500KB for text files.', 'warning');
}

// ─── Mobile ───────────────────────────────────────────────────────────────────
function openMobileSidebar() { document.getElementById('chat-sidebar').classList.add('mobile-open'); document.getElementById('sidebar-overlay').classList.add('visible'); }
function closeMobileSidebar() { document.getElementById('chat-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('visible'); }

// ═══════════════════════════════════════════════════════════
//  NOTES
// ═══════════════════════════════════════════════════════════
async function loadNotes() {
  try {
    state.notes = await API.get('/api/notes/');
    renderNotesList();
    if (state.notes.length && !state.currentNoteId) openNote(state.notes[0].id);
    else if (!state.notes.length) clearNoteEditor();
  } catch (e) { showToast(`Failed to load notes: ${e.message}`, 'error'); }
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  if (!state.notes.length) { list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-faint);text-align:center">No notes yet.<br>Click + to create one.</div>'; return; }
  for (const note of state.notes) {
    const card = document.createElement('div');
    card.className = 'note-card' + (note.id === state.currentNoteId ? ' active' : '');
    card.dataset.id = note.id;
    card.innerHTML = `<div class="note-card-title">${escHtml(note.title || 'Untitled')}</div><div class="note-card-preview">${escHtml((note.preview || '').slice(0, 80))}</div><div class="note-card-date">${formatDate(note.updated_at)}</div>`;
    card.addEventListener('click', () => openNote(note.id));
    list.appendChild(card);
  }
}

async function openNote(id) {
  state.currentNoteId = id; renderNotesList();
  try {
    const note = await API.get(`/api/notes/${id}`);
    document.getElementById('note-title-input').value = note.title || '';
    document.getElementById('note-content-textarea').value = note.content || '';
    document.getElementById('delete-note-btn').style.display = '';
    document.getElementById('note-save-status').textContent = '';
  } catch (e) { showToast(`Failed to load note: ${e.message}`, 'error'); }
}

function clearNoteEditor() {
  state.currentNoteId = null;
  document.getElementById('note-title-input').value = '';
  document.getElementById('note-content-textarea').value = '';
  document.getElementById('delete-note-btn').style.display = 'none';
  document.getElementById('note-save-status').textContent = '';
}

async function newNote() {
  try {
    const note = await API.post('/api/notes/', { title: 'Untitled', content: '' });
    state.notes.unshift({ id: note.id, title: note.title, preview: '', updated_at: note.updated_at, created_at: note.created_at });
    renderNotesList();
    await openNote(note.id);
    document.getElementById('note-title-input').focus();
    document.getElementById('note-title-input').select();
  } catch (e) { showToast(`Failed to create note: ${e.message}`, 'error'); }
}

function scheduleNoteSave() {
  if (state.noteSaveTimer) clearTimeout(state.noteSaveTimer);
  document.getElementById('note-save-status').textContent = 'Unsaved…';
  state.noteSaveTimer = setTimeout(saveNote, 500);
}

async function saveNote() {
  if (!state.currentNoteId) return;
  const title = document.getElementById('note-title-input').value;
  const content = document.getElementById('note-content-textarea').value;
  try {
    await API.put(`/api/notes/${state.currentNoteId}`, { title, content });
    document.getElementById('note-save-status').textContent = 'Saved';
    setTimeout(() => { const el = document.getElementById('note-save-status'); if (el) el.textContent = ''; }, 2000);
    const idx = state.notes.findIndex(n => n.id === state.currentNoteId);
    if (idx !== -1) { state.notes[idx].title = title; state.notes[idx].preview = content.slice(0, 120); renderNotesList(); }
  } catch { document.getElementById('note-save-status').textContent = 'Save failed'; }
}

async function deleteNote(id) {
  if (!id || !confirm('Delete this note?')) return;
  try {
    await API.del(`/api/notes/${id}`);
    state.notes = state.notes.filter(n => n.id !== id);
    clearNoteEditor(); renderNotesList();
    if (state.notes.length) openNote(state.notes[0].id);
    showToast('Note deleted', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  TASKS
// ═══════════════════════════════════════════════════════════
async function loadTasks() {
  try {
    state.tasks = await API.get('/api/tasks/');
    renderTasksList();
    scheduleTaskReminders();
  } catch (e) { showToast(`Failed to load tasks: ${e.message}`, 'error'); }
}

function renderTasksList() {
  const list = document.getElementById('tasks-list');
  list.innerHTML = '';
  const today = new Date().toISOString().slice(0, 10);
  let filtered = state.tasks;
  if (state.taskFilter === 'active') filtered = state.tasks.filter(t => !t.done);
  else if (state.taskFilter === 'done') filtered = state.tasks.filter(t => t.done);
  else if (state.taskFilter === 'overdue') filtered = state.tasks.filter(t => !t.done && t.due_date && t.due_date < today);

  const active = filtered.filter(t => !t.done);
  const done = filtered.filter(t => t.done);

  if (!filtered.length) { list.innerHTML = '<div style="padding:20px;font-size:13px;color:var(--text-faint);text-align:center">No tasks here.</div>'; return; }
  if (active.length) {
    if (state.taskFilter === 'all') { const lbl = document.createElement('div'); lbl.className = 'tasks-group-label'; lbl.textContent = 'Active'; list.appendChild(lbl); }
    active.forEach(t => list.appendChild(makeTaskItem(t)));
  }
  if (done.length) {
    const lbl = document.createElement('div'); lbl.className = 'tasks-group-label'; lbl.textContent = 'Completed'; list.appendChild(lbl);
    done.forEach(t => list.appendChild(makeTaskItem(t)));
  }
}

function makeTaskItem(task) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !task.done && task.due_date && task.due_date < today;
  const isDueToday = !task.done && task.due_date === today;
  const el = document.createElement('div');
  el.className = 'task-item' + (isOverdue ? ' overdue' : '');
  el.dataset.id = task.id;
  let dueBadge = '';
  if (task.due_date) {
    const dueClass = isOverdue ? 'due-badge overdue' : (isDueToday ? 'due-badge today' : 'due-badge');
    const dueLabel = isOverdue ? `⚠ ${task.due_date}` : (isDueToday ? `Today` : task.due_date);
    dueBadge = `<span class="${dueClass}">${dueLabel}</span>`;
  }
  el.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''} />
    <span class="task-text ${task.done ? 'completed' : ''}">${escHtml(task.text)}</span>
    ${dueBadge}
    <button class="task-delete-btn" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
    </button>`;
  el.querySelector('.task-checkbox').addEventListener('change', () => toggleTask(task.id, task.done));
  el.querySelector('.task-delete-btn').addEventListener('click', () => deleteTask(task.id));
  return el;
}

async function addTask(text, dueDate) {
  if (!text.trim()) return;
  try {
    const task = await API.post('/api/tasks/', { text: text.trim(), due_date: dueDate || null });
    state.tasks.unshift(task);
    renderTasksList();
  } catch (e) { showToast(`Failed to add task: ${e.message}`, 'error'); }
}

async function toggleTask(id, currentlyDone) {
  try {
    const updated = await API.put(`/api/tasks/${id}`, { done: !currentlyDone });
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx !== -1) state.tasks[idx] = updated;
    renderTasksList();
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

async function deleteTask(id) {
  try {
    await API.del(`/api/tasks/${id}`);
    state.tasks = state.tasks.filter(t => t.id !== id);
    renderTasksList();
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

function scheduleTaskReminders() {
  const advanceMin = parseInt(state.settings['reminder_advance'] || '30', 10);
  const now = new Date();
  for (const task of state.tasks) {
    if (task.done || !task.due_date) continue;
    const dueTime = new Date(task.due_date + 'T09:00:00'); // default 9am if no time
    const remindTime = new Date(dueTime.getTime() - advanceMin * 60000);
    const delay = remindTime - now;
    if (delay > 0 && delay < 24 * 3600000) {
      setTimeout(() => {
        showBrowserNotification('Task Due Soon', `"${task.text}" is due ${advanceMin > 0 ? `in ${advanceMin} min` : 'now'}`);
      }, delay);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  LIBRARY / DOCUMENTS
// ═══════════════════════════════════════════════════════════
let _docView = 'preview';   // 'preview' | 'source' | 'split'
let _docFmtFilter = '';

async function loadDocuments() {
  try {
    state.documents = await API.get('/api/documents/');
    renderDocList();
    if (state.documents.length && !state.currentDocId) {
      await openDoc(state.documents[0].id);
    } else if (!state.documents.length) {
      _showDocEmpty();
    }
  } catch (e) { showToast(`Failed to load documents: ${e.message}`, 'error'); }
}

function _showDocEmpty() {
  document.getElementById('doc-empty-state').style.display = '';
  document.getElementById('doc-workspace').style.display = 'none';
}

function _showDocWorkspace() {
  document.getElementById('doc-empty-state').style.display = 'none';
  document.getElementById('doc-workspace').style.display = 'flex';
}

function renderDocList() {
  const list = document.getElementById('doc-list');
  list.innerHTML = '';
  let docs = state.documents;
  if (_docFmtFilter) docs = docs.filter(d => d.format === _docFmtFilter);

  if (!docs.length) {
    list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-faint);text-align:center">No documents yet.<br>Click + to create one.</div>';
    return;
  }

  const fmtIcons = { markdown: 'MD', html: 'HTML', csv: 'CSV', plain: 'TXT' };
  for (const doc of docs) {
    const card = document.createElement('div');
    card.className = 'doc-card' + (doc.id === state.currentDocId ? ' active' : '');
    card.dataset.id = doc.id;
    card.innerHTML = `
      <div class="doc-card-icon">${fmtIcons[doc.format] || 'DOC'}</div>
      <div class="doc-card-info">
        <div class="doc-card-title">${escHtml(doc.title || 'Untitled')}</div>
        <div class="doc-card-meta">${formatDate(doc.updated_at)}</div>
      </div>`;
    card.addEventListener('click', () => openDoc(doc.id));
    list.appendChild(card);
  }
}

function _renderDocTabs() {
  const strip = document.getElementById('doc-tab-strip');
  strip.innerHTML = '';
  for (const doc of state.documents.slice(0, 5)) {
    const tab = document.createElement('div');
    tab.className = 'doc-open-tab' + (doc.id === state.currentDocId ? ' active' : '');
    tab.dataset.id = doc.id;
    tab.innerHTML = `<span>${escHtml(doc.title || 'Untitled')}</span>`;
    tab.addEventListener('click', () => openDoc(doc.id));
    strip.appendChild(tab);
  }
}

async function openDoc(id) {
  state.currentDocId = id;
  renderDocList();
  _renderDocTabs();
  _showDocWorkspace();
  try {
    const doc = await API.get(`/api/documents/${id}`);
    document.getElementById('doc-title-input').value = doc.title || '';
    document.getElementById('doc-content-textarea').value = doc.content || '';
    document.getElementById('doc-format-select').value = doc.format || 'markdown';
    document.getElementById('delete-doc-btn').style.display = '';
    document.getElementById('doc-save-status').textContent = '';
    _updateWordCount(doc.content || '');
    applyDocView(_docView);
  } catch (e) { showToast(`Failed to load document: ${e.message}`, 'error'); }
}

async function newDoc() {
  try {
    const doc = await API.post('/api/documents/', { title: 'Untitled', content: '', format: 'markdown' });
    state.documents.unshift(doc);
    renderDocList();
    await openDoc(doc.id);
    document.getElementById('doc-title-input').focus();
    document.getElementById('doc-title-input').select();
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

function scheduleDocSave() {
  if (state.docSaveTimer) clearTimeout(state.docSaveTimer);
  document.getElementById('doc-save-status').textContent = 'Unsaved…';
  state.docSaveTimer = setTimeout(saveDoc, 800);
  _updateDocPreviewLive();
  _updateLineNumbers();
  _updateWordCount(document.getElementById('doc-content-textarea').value);
}

async function saveDoc() {
  if (!state.currentDocId) return;
  const title = document.getElementById('doc-title-input').value;
  const content = document.getElementById('doc-content-textarea').value;
  const format = document.getElementById('doc-format-select').value;
  try {
    await API.put(`/api/documents/${state.currentDocId}`, { title, content, format });
    document.getElementById('doc-save-status').textContent = 'Saved';
    setTimeout(() => { const el = document.getElementById('doc-save-status'); if (el) el.textContent = ''; }, 1500);
    const idx = state.documents.findIndex(d => d.id === state.currentDocId);
    if (idx !== -1) {
      state.documents[idx].title = title;
      state.documents[idx].preview = content.slice(0, 120);
      renderDocList(); _renderDocTabs();
    }
  } catch { document.getElementById('doc-save-status').textContent = 'Save failed'; }
}

async function deleteDoc(id) {
  if (!id || !confirm('Delete this document?')) return;
  try {
    await API.del(`/api/documents/${id}`);
    state.documents = state.documents.filter(d => d.id !== id);
    state.currentDocId = null;
    renderDocList();
    if (state.documents.length) await openDoc(state.documents[0].id);
    else _showDocEmpty();
    showToast('Deleted', 'success');
  } catch (e) { showToast(`Failed: ${e.message}`, 'error'); }
}

// ── View switching ──────────────────────────────────────────
function applyDocView(view) {
  _docView = view;
  const sourcePane = document.getElementById('doc-source-pane');
  const previewPane = document.getElementById('doc-preview-panel');
  const body = document.getElementById('doc-editor-body');

  document.querySelectorAll('.doc-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  body.className = ''; // reset grid classes
  if (view === 'source') {
    sourcePane.style.display = 'flex';
    previewPane.style.display = 'none';
    body.classList.add('doc-view-source');
  } else if (view === 'preview') {
    sourcePane.style.display = 'none';
    previewPane.style.display = '';
    body.classList.add('doc-view-preview');
    _updateDocPreviewLive();
  } else { // split
    sourcePane.style.display = 'flex';
    previewPane.style.display = '';
    body.classList.add('doc-view-split');
    _updateDocPreviewLive();
  }
  _updateLineNumbers();
}

function _updateDocPreviewLive() {
  const content = document.getElementById('doc-content-textarea').value;
  const format = document.getElementById('doc-format-select').value;
  const preview = document.getElementById('doc-preview-panel');
  if (format === 'html') {
    preview.innerHTML = DOMPurify.sanitize(content);
  } else if (format === 'csv') {
    const rows = content.split('\n').filter(r => r.trim()).map(r => r.split(','));
    if (!rows.length) { preview.innerHTML = ''; return; }
    let html = '<div style="overflow:auto;height:100%"><table class="csv-preview-table">';
    rows.forEach((row, i) => {
      html += '<tr>' + row.map(cell => `<${i===0?'th':'td'}>${escHtml(cell.trim())}</${i===0?'th':'td'}>`).join('') + '</tr>';
    });
    preview.innerHTML = html + '</table></div>';
  } else {
    preview.innerHTML = renderMarkdown(content);
  }
}

function _updateLineNumbers() {
  const textarea = document.getElementById('doc-content-textarea');
  const lines = document.getElementById('doc-source-lines');
  const lineCount = textarea.value.split('\n').length;
  lines.innerHTML = Array.from({ length: lineCount }, (_, i) => `<div>${i + 1}</div>`).join('');
}

function _updateWordCount(text) {
  const el = document.getElementById('doc-word-count');
  if (!el) return;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  el.textContent = `${words} words · ${chars} chars`;
}

// ── AI assist ───────────────────────────────────────────────
async function runDocAI(action) {
  if (!state.currentDocId) return;
  const content = document.getElementById('doc-content-textarea').value;
  const model = document.getElementById('model-select').value || state.currentModel;
  if (!content.trim()) { showToast('Document is empty', 'warning'); return; }

  const bar = document.getElementById('doc-ai-bar');
  const statusEl = document.getElementById('doc-ai-status');
  const outputEl = document.getElementById('doc-ai-output');
  bar.style.display = 'flex';
  statusEl.textContent = `AI: ${action}…`;
  outputEl.textContent = '';

  try {
    const resp = await fetch(`/api/documents/${state.currentDocId}/ai`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, context: content, model }),
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.detail || 'AI error'); }
    const reader = resp.body.getReader(); const decoder = new TextDecoder();
    let result = ''; let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) break;
          if (data.error) throw new Error(data.error);
          result += data.content || '';
          outputEl.textContent = result.slice(0, 80) + (result.length > 80 ? '…' : '');
        } catch {}
      }
    }
    if (result) {
      document.getElementById('doc-content-textarea').value = result;
      scheduleDocSave();
      showToast(`Applied: ${action}`, 'success');
    }
  } catch (e) { showToast(`AI error: ${e.message}`, 'error'); }

  bar.style.display = 'none';
  outputEl.textContent = '';
}

// ═══════════════════════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════════════════════
function isEmailConfigured() {
  return !!(state.settings['email_imap_host'] && state.settings['email_imap_username']);
}

function renderEmailSection() {
  const banner = document.getElementById('email-setup-banner');
  const inbox = document.getElementById('email-inbox');
  if (isEmailConfigured()) { banner.style.display = 'none'; inbox.style.display = 'flex'; loadEmailInbox(); }
  else { banner.style.display = 'flex'; inbox.style.display = 'none'; }
}

async function loadEmailInbox(folder) {
  folder = folder || state.currentEmailFolder || 'INBOX';
  state.currentEmailFolder = folder;
  const list = document.getElementById('email-list');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div>';
  try {
    const data = await API.get(`/api/email/inbox?folder=${encodeURIComponent(folder)}&limit=50`);
    if (!data.configured) { list.innerHTML = `<div style="padding:20px;color:var(--text-muted);text-align:center">${escHtml(data.message || 'Not configured')}</div>`; return; }
    renderEmailList(data.messages || []);
    const countEl = document.getElementById('inbox-count');
    if (countEl) { const unread = (data.messages || []).filter(m => !m.seen).length; countEl.textContent = unread || ''; }
  } catch (e) { list.innerHTML = `<div style="padding:20px;color:var(--danger);text-align:center">Error: ${escHtml(e.message)}</div>`; }
}

function renderEmailList(messages) {
  const list = document.getElementById('email-list');
  list.innerHTML = '';
  if (!messages.length) { list.innerHTML = '<div style="padding:20px;color:var(--text-faint);text-align:center">No messages.</div>'; return; }
  for (const msg of messages) {
    const el = document.createElement('div');
    el.className = 'email-item' + (!msg.seen ? ' unread' : '');
    el.dataset.uid = msg.uid;
    el.innerHTML = `
      <div class="email-sender">${escHtml(msg.from.slice(0, 40))}<span class="email-date">${escHtml(msg.date.slice(0, 16))}</span></div>
      <div class="email-subject">${escHtml(msg.subject)}</div>`;
    el.addEventListener('click', () => openEmail(msg.uid));
    list.appendChild(el);
  }
}

async function openEmail(uid) {
  state.currentEmailUid = uid;
  const detailPanel = document.getElementById('email-detail-panel');
  const listPanel = document.getElementById('email-list-panel');
  detailPanel.style.display = 'flex';
  listPanel.style.display = 'none';
  document.getElementById('email-triage-result').style.display = 'none';
  document.getElementById('email-detail-body').innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading…</div>';
  try {
    const msg = await API.get(`/api/email/message/${uid}?folder=${encodeURIComponent(state.currentEmailFolder)}`);
    document.getElementById('email-detail-meta').innerHTML = `
      <div style="font-weight:600">${escHtml(msg.subject)}</div>
      <div style="font-size:12px;color:var(--text-muted)">From: ${escHtml(msg.from)} · ${escHtml(msg.date)}</div>`;
    const body = msg.body_text || '(No plain text body)';
    document.getElementById('email-detail-body').innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;padding:16px;margin:0">${escHtml(body)}</pre>`;
  } catch (e) { document.getElementById('email-detail-body').innerHTML = `<div style="padding:20px;color:var(--danger)">Error: ${escHtml(e.message)}</div>`; }
}

async function triageCurrentEmail() {
  if (!state.currentEmailUid) return;
  const body = document.getElementById('email-detail-body');
  const model = document.getElementById('model-select').value || 'gpt-4o-mini';
  const fromEl = document.querySelector('#email-detail-meta div:first-child');
  const subjectText = fromEl ? fromEl.textContent : '';
  const bodyText = body.textContent.slice(0, 2000);
  try {
    const result = await API.post('/api/email/triage', { subject: subjectText, from_: '', body_text: bodyText, model });
    const triageEl = document.getElementById('email-triage-result');
    triageEl.style.display = 'block';
    triageEl.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px;background:var(--bg-2);border-bottom:1px solid var(--border)">
        <span class="due-badge ${result.urgency === 'high' ? 'overdue' : (result.urgency === 'medium' ? 'today' : '')}">⚡ ${escHtml(result.urgency || 'medium')} urgency</span>
        <span class="due-badge"># ${escHtml(result.category || 'other')}</span>
        <span style="font-size:12px;color:var(--text-muted);flex:1">${escHtml(result.summary || '')}</span>
      </div>
      ${result.suggested_reply ? `<div style="padding:12px;font-size:12px;color:var(--text-muted)">Suggested reply:<br><em>${escHtml(result.suggested_reply)}</em></div>` : ''}`;
  } catch (e) { showToast(`Triage failed: ${e.message}`, 'error'); }
}

async function scanSubscriptions() {
  const btn = document.getElementById('scan-unsub-btn');
  const list = document.getElementById('unsub-list');
  btn.disabled = true; btn.textContent = 'Scanning…';
  list.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Scanning inbox…</div>';
  try {
    const res = await API.get('/api/email/subscriptions');
    renderUnsubList(res.subscriptions || []);
    document.getElementById('unsub-count').textContent = (res.subscriptions || []).length || '';
  } catch (e) { list.innerHTML = `<div style="padding:20px;color:var(--danger);text-align:center">Error: ${escHtml(e.message)}</div>`; }
  finally { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Scan for Subscriptions'; }
}

function renderUnsubList(subs) {
  const list = document.getElementById('unsub-list');
  if (!subs.length) { list.innerHTML = '<div style="padding:24px;color:var(--text-muted);text-align:center">No subscription emails found.</div>'; return; }
  list.innerHTML = subs.map(s => `
    <div class="unsub-item" data-id="${escHtml(s.id)}">
      <div class="unsub-item-info">
        <div class="unsub-sender">${escHtml(s.sender_name || s.sender_email)}</div>
        <div class="unsub-email">${escHtml(s.sender_email)}</div>
        <div class="unsub-meta">${s.count} email${s.count !== 1 ? 's' : ''}</div>
      </div>
      <div class="unsub-actions">
        ${s.unsubscribe_url ? `<a href="${escHtml(s.unsubscribe_url)}" target="_blank" class="btn btn-secondary btn-sm">Unsubscribe</a>` : ''}
        <button class="btn btn-danger btn-sm" onclick="markUnsubscribed('${escHtml(s.id)}', this)">Block</button>
      </div>
    </div>`).join('');
}

window.markUnsubscribed = async function (id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await API.post('/api/email/unsubscribe', { id });
    btn.closest('.unsub-item').style.opacity = '0.4';
    btn.textContent = 'Blocked';
    showToast('Sender blocked', 'success');
  } catch (e) { btn.disabled = false; btn.textContent = 'Block'; showToast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════════
async function loadCalendarEvents() {
  try {
    const month = `${state.calendarDate.getFullYear()}-${String(state.calendarDate.getMonth() + 1).padStart(2, '0')}`;
    const events = await API.get(`/api/calendar/events?month=${month}`);
    state.calendarEvents = {};
    for (const ev of events) {
      if (!state.calendarEvents[ev.date]) state.calendarEvents[ev.date] = [];
      state.calendarEvents[ev.date].push(ev);
    }
    // Also load from localStorage for backward compat
    const stored = JSON.parse(localStorage.getItem('glyndwr_calendar_events') || '{}');
    for (const [date, evs] of Object.entries(stored)) {
      if (!state.calendarEvents[date]) state.calendarEvents[date] = [];
      for (const ev of evs) state.calendarEvents[date].push({ title: ev.title || ev, source: 'local' });
    }
  } catch {
    const stored = JSON.parse(localStorage.getItem('glyndwr_calendar_events') || '{}');
    state.calendarEvents = {};
    for (const [date, evs] of Object.entries(stored)) {
      state.calendarEvents[date] = evs.map(ev => ({ title: ev.title || ev, source: 'local' }));
    }
  }
  renderCalendar();
}

function renderCalendar() {
  const d = state.calendarDate;
  const year = d.getFullYear(), month = d.getMonth();
  document.getElementById('calendar-title').textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date();
  for (let i = firstDay - 1; i >= 0; i--) grid.appendChild(makeCalDay(year, month - 1, daysInPrev - i, true));
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
    grid.appendChild(makeCalDay(year, month, day, false, isToday));
  }
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let nextDay = 1;
  for (let i = firstDay + daysInMonth; i < totalCells; i++) grid.appendChild(makeCalDay(year, month + 1, nextDay++, true));
}

function makeCalDay(year, month, day, otherMonth, isToday = false) {
  const cell = document.createElement('div');
  cell.className = 'cal-day' + (isToday ? ' today' : '') + (otherMonth ? ' other-month' : '');
  const num = document.createElement('div');
  num.className = 'cal-day-number'; num.textContent = day; cell.appendChild(num);
  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  for (const ev of (state.calendarEvents[dateKey] || []).slice(0, 3)) {
    const dot = document.createElement('div');
    dot.className = 'cal-event-dot'; dot.textContent = ev.title || ev;
    if (ev.color) dot.style.background = ev.color;
    cell.appendChild(dot);
  }
  if (!otherMonth) {
    cell.addEventListener('click', async () => {
      const title = prompt(`Add event for ${dateKey}:`);
      if (title && title.trim()) {
        try {
          await API.post('/api/calendar/events', { title: title.trim(), date: dateKey });
          await loadCalendarEvents();
        } catch {
          if (!state.calendarEvents[dateKey]) state.calendarEvents[dateKey] = [];
          state.calendarEvents[dateKey].push({ title: title.trim(), source: 'local' });
          localStorage.setItem('glyndwr_calendar_events', JSON.stringify(state.calendarEvents));
          renderCalendar();
        }
      }
    });
  }
  return cell;
}

async function syncCalDAV() {
  if (!state.settings['caldav_url']) {
    showToast('CalDAV not configured. Go to Settings → Calendar.', 'warning');
    openModal('settings-overlay');
    return;
  }
  showToast('Syncing CalDAV…', 'info');
  try {
    const result = await API.post('/api/calendar/sync', {});
    showToast(`Synced ${result.synced} events`, 'success');
    await loadCalendarEvents();
  } catch (e) { showToast(`Sync failed: ${e.message}`, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  MEMORY
// ═══════════════════════════════════════════════════════════
let _memoryCategoryFilter = '';

async function loadMemories() {
  const list = document.getElementById('memory-list');
  if (!list) return;
  const search = document.getElementById('memory-search')?.value || '';
  let url = '/api/memories/';
  if (search) url += `?search=${encodeURIComponent(search)}`;
  try {
    const items = await API.get(url);
    renderMemoryList(items);
  } catch (e) { list.innerHTML = `<div style="padding:20px;color:var(--text-faint);text-align:center">Failed to load: ${escHtml(e.message)}</div>`; }
}

function renderMemoryList(items) {
  const list = document.getElementById('memory-list');
  if (!list) return;
  let filtered = items;
  if (_memoryCategoryFilter) filtered = items.filter(m => m.category === _memoryCategoryFilter);
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:24px;font-size:13px;color:var(--text-faint);text-align:center">No memories yet.<br>Memories are extracted automatically when you chat,<br>or add one manually with the + button.</div>';
    return;
  }
  list.innerHTML = '';
  for (const mem of filtered) {
    const card = document.createElement('div');
    card.className = 'memory-card';
    const confPct = Math.min(100, mem.confidence || 100);
    const sourceLabel = mem.source && mem.source !== 'manual'
      ? `<span class="memory-source">from conversation</span>` : '';
    card.innerHTML = `
      <div class="memory-card-title">${escHtml(mem.title)}</div>
      <div class="memory-card-preview">${escHtml(mem.content)}</div>
      <div class="memory-card-meta">
        <span class="memory-category-badge">${escHtml(mem.category || 'general')}</span>
        <span class="memory-confidence">
          <div class="memory-conf-bar"><div class="memory-conf-fill" style="width:${confPct}%"></div></div>
          <span style="font-size:10px;color:var(--text-faint)">${confPct}%</span>
        </span>
        ${sourceLabel}
        <div class="memory-card-actions">
          <button class="memory-action-btn" onclick="openEditMemory('${escHtml(mem.id)}','${escHtml(mem.title.replace(/'/g,"\\x27"))}','${escHtml(mem.content.replace(/'/g,"\\x27"))}','${escHtml(mem.category || 'general')}')">Edit</button>
          <button class="memory-action-btn danger" onclick="deleteMemory('${escHtml(mem.id)}')">Delete</button>
        </div>
      </div>`;
    list.appendChild(card);
  }
}

window.openEditMemory = function(id, title, content, category) {
  document.getElementById('edit-mem-id').value = id;
  document.getElementById('edit-mem-title').value = title;
  document.getElementById('edit-mem-content').value = content;
  document.getElementById('edit-mem-category').value = category;
  openModal('edit-memory-overlay');
};

async function saveEditMemory() {
  const id = document.getElementById('edit-mem-id').value;
  const title = document.getElementById('edit-mem-title').value.trim();
  const content = document.getElementById('edit-mem-content').value.trim();
  const category = document.getElementById('edit-mem-category').value;
  if (!title || !content) { showToast('Title and content required', 'warning'); return; }
  try {
    await API.put(`/api/memories/${id}`, { title, content, category });
    closeModal('edit-memory-overlay');
    await loadMemories();
    showToast('Memory updated', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// Auto-extract memories from a completed conversation
async function extractMemoriesFromConversation(convId) {
  if (!convId || !state.settings['memory_auto_extract']) return;
  const model = state.settings['default_model'] || state.currentModel || 'gpt-4o-mini';
  try {
    const result = await API.post('/api/memories/extract', { conversation_id: convId, model });
    if (result.extracted > 0) {
      showToast(`${result.extracted} memory${result.extracted > 1 ? 's' : ''} saved from conversation`, 'success', 4000);
    }
  } catch { /* Silent fail — memory extraction is best-effort */ }
}

window.deleteMemory = async function(id) {
  if (!confirm('Delete this memory?')) return;
  try { await API.del(`/api/memories/${id}`); await loadMemories(); showToast('Memory deleted', 'success'); }
  catch (e) { showToast(e.message, 'error'); }
};

async function clearAllMemories() {
  if (!confirm('Clear all memories? This cannot be undone.')) return;
  try { await API.del('/api/memories/all'); await loadMemories(); showToast('Memories cleared', 'success'); }
  catch (e) { showToast(e.message, 'error'); }
}

async function saveMemory() {
  const title = document.getElementById('mem-title')?.value.trim();
  const content = document.getElementById('mem-content')?.value.trim();
  const category = document.getElementById('mem-category')?.value || 'general';
  if (!title || !content) { showToast('Title and content required', 'warning'); return; }
  try {
    await API.post('/api/memories/', { title, content, category, confidence: 100, source: 'manual' });
    closeModal('add-memory-overlay');
    document.getElementById('mem-title').value = '';
    document.getElementById('mem-content').value = '';
    await loadMemories();
    showToast('Memory saved', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
//  AGENT
// ═══════════════════════════════════════════════════════════
async function runAgent() {
  if (state.agentRunning) return;
  const input = document.getElementById('agent-input');
  const message = input.value.trim();
  if (!message) return;
  const model = document.getElementById('agent-model-select').value || state.currentModel;
  const tools = [];
  if (document.getElementById('tool-search').checked) tools.push('search');
  if (document.getElementById('tool-fetch').checked) tools.push('fetch');
  if (document.getElementById('tool-exec').checked) tools.push('exec');

  state.agentRunning = true;
  document.getElementById('agent-send-btn').disabled = true;
  input.value = '';

  const container = document.getElementById('agent-messages');
  const userMsg = document.createElement('div'); userMsg.className = 'agent-msg user';
  userMsg.innerHTML = `<div class="agent-msg-label">You</div><div class="agent-msg-content">${escHtml(message)}</div>`;
  container.appendChild(userMsg);

  const responseEl = document.createElement('div'); responseEl.className = 'agent-msg assistant';
  const labelEl = document.createElement('div'); labelEl.className = 'agent-msg-label'; labelEl.textContent = 'Agent';
  const contentEl = document.createElement('div'); contentEl.className = 'agent-msg-content';
  responseEl.appendChild(labelEl); responseEl.appendChild(contentEl); container.appendChild(responseEl);
  container.scrollTop = container.scrollHeight;

  let fullContent = '';

  try {
    const resp = await fetch('/api/tools/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model, history: state.agentHistory, tools }),
    });
    if (!resp.ok) throw new Error(`Agent error: ${resp.status}`);
    const reader = resp.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'chunk') { fullContent += data.content; contentEl.innerHTML = renderMarkdown(fullContent); }
          else if (data.type === 'tool_call') {
            const toolEl = document.createElement('div'); toolEl.className = 'agent-tool-call';
            toolEl.innerHTML = `<span class="agent-tool-name">⚙ ${escHtml(data.tool)}</span> <span class="agent-tool-args">${escHtml(JSON.stringify(data.args))}</span>`;
            responseEl.insertBefore(toolEl, contentEl);
          } else if (data.type === 'tool_result') {
            const resultEl = document.createElement('div'); resultEl.className = 'agent-tool-result';
            resultEl.innerHTML = `<details><summary>Result from ${escHtml(data.tool)}</summary><pre>${escHtml(data.result)}</pre></details>`;
            responseEl.insertBefore(resultEl, contentEl);
          } else if (data.type === 'status') {
            labelEl.textContent = `Agent — ${data.data}`;
          } else if (data.type === 'error') {
            contentEl.innerHTML += `<div style="color:var(--danger)">${escHtml(data.content)}</div>`;
          }
          container.scrollTop = container.scrollHeight;
        } catch {}
      }
    }
  } catch (e) { contentEl.innerHTML += `<div style="color:var(--danger)">Error: ${escHtml(e.message)}</div>`; }

  labelEl.textContent = 'Agent';
  state.agentHistory.push({ role: 'user', content: message });
  if (fullContent) state.agentHistory.push({ role: 'assistant', content: fullContent });
  state.agentRunning = false;
  document.getElementById('agent-send-btn').disabled = false;
}

// ═══════════════════════════════════════════════════════════
//  DEEP RESEARCH
// ═══════════════════════════════════════════════════════════
function _setPipelineStep(step, state) {
  const el = document.getElementById(`pipe-${step}`);
  if (!el) return;
  el.classList.remove('active', 'done');
  if (state === 'active') el.classList.add('active');
  if (state === 'done') el.classList.add('done');
}

async function runResearch() {
  const question = document.getElementById('research-input').value.trim();
  if (!question) return;
  const model = document.getElementById('research-model-select').value || state.currentModel;
  const numQueries = parseInt(document.getElementById('research-depth').value || '3', 10);

  document.getElementById('research-input').value = '';
  document.getElementById('research-pipeline').style.display = 'flex';
  document.getElementById('research-sources').style.display = 'none';
  document.getElementById('research-sources-list').innerHTML = '';
  document.getElementById('research-report').innerHTML = '';
  document.getElementById('research-btn').disabled = true;
  ['queries','search','read','synthesise'].forEach(s => _setPipelineStep(s, ''));
  _setPipelineStep('queries', 'active');

  let reportHtml = '';

  try {
    const resp = await fetch('/api/research/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ question, model, num_queries: numQueries }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `Research error ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'status') {
            const t = (event.data || '').toLowerCase();
            if (t.includes('quer')) { _setPipelineStep('queries', 'active'); }
            else if (t.includes('search')) { _setPipelineStep('queries', 'done'); _setPipelineStep('search', 'active'); }
            else if (t.includes('read') || t.includes('fetch')) { _setPipelineStep('search', 'done'); _setPipelineStep('read', 'active'); }
            else if (t.includes('synth') || t.includes('writ')) { _setPipelineStep('read', 'done'); _setPipelineStep('synthesise', 'active'); }
          } else if (event.type === 'queries') {
            _setPipelineStep('queries', 'done');
            _setPipelineStep('search', 'active');
          } else if (event.type === 'sources') {
            _setPipelineStep('search', 'done');
            _setPipelineStep('read', 'done');
            _setPipelineStep('synthesise', 'active');
            const sources = event.data;
            document.getElementById('research-sources').style.display = 'block';
            document.getElementById('research-sources-list').innerHTML = sources.map(s =>
              `<div class="research-source"><a href="${escHtml(s.url)}" target="_blank" rel="noopener">${escHtml(s.title || s.url)}</a></div>`
            ).join('');
          } else if (event.type === 'chunk') {
            reportHtml += event.data;
            document.getElementById('research-report').innerHTML = renderMarkdown(reportHtml);
          } else if (event.type === 'error') {
            showToast(`Research error: ${event.data}`, 'error');
          }
        } catch {}
      }
    }
    _setPipelineStep('synthesise', 'done');
  } catch (e) {
    showToast(`Research failed: ${e.message}`, 'error');
  }

  document.getElementById('research-btn').disabled = false;
}

// ═══════════════════════════════════════════════════════════
//  FORGE / COOKBOOK
// ═══════════════════════════════════════════════════════════
function renderCookbook() {
  renderCookbookModels();
}

// ── Forge hardware state ───────────────────────────────────
const _hwState = { vramGB: null, ramGB: null };

function scanHardware() {
  const info = {};
  info.ram = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown';
  info.cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : 'Unknown';
  info.platform = navigator.platform || navigator.userAgentData?.platform || 'Unknown';
  info.mobile = /Mobi|Android/i.test(navigator.userAgent);

  let vramGB = null;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgInfo) {
        info.gpu = gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) || '';
        const m = info.gpu.match(/(\d+)\s*GB/i);
        if (m) { vramGB = parseInt(m[1]); info.vram = `~${vramGB} GB`; }
        else info.vram = 'Unknown (check GPU specs)';
      }
    }
  } catch { info.vram = 'Unknown'; }

  if (navigator.deviceMemory) _hwState.ramGB = navigator.deviceMemory;
  if (vramGB) _hwState.vramGB = vramGB;

  const el = document.getElementById('hardware-info');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="hardware-grid">
      <div class="hw-item"><div class="hw-label">GPU</div><div class="hw-val">${escHtml(info.gpu || 'Unknown')}</div></div>
      <div class="hw-item"><div class="hw-label">VRAM</div><div class="hw-val">${escHtml(info.vram || 'Unknown')}</div></div>
      <div class="hw-item"><div class="hw-label">RAM</div><div class="hw-val">${escHtml(info.ram)}</div></div>
      <div class="hw-item"><div class="hw-label">CPU</div><div class="hw-val">${escHtml(info.cores)} · ${escHtml(info.platform)}</div></div>
    </div>
    <p class="form-hint" style="margin-top:10px">Browser APIs give approximate values. Use <strong>Enter manually</strong> if VRAM is wrong.</p>`;

  renderCookbookModels();
}

function applyManualHardware() {
  const gpu = document.getElementById('hw-gpu')?.value.trim();
  const vram = parseFloat(document.getElementById('hw-vram')?.value);
  const ram = parseFloat(document.getElementById('hw-ram')?.value);
  const cpu = document.getElementById('hw-cpu')?.value.trim();

  if (vram) _hwState.vramGB = vram;
  if (ram) _hwState.ramGB = ram;

  const el = document.getElementById('hardware-info');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="hardware-grid">
      <div class="hw-item"><div class="hw-label">GPU</div><div class="hw-val">${escHtml(gpu || 'Not specified')}</div></div>
      <div class="hw-item"><div class="hw-label">VRAM</div><div class="hw-val">${vram ? vram + ' GB' : 'Not specified'}</div></div>
      <div class="hw-item"><div class="hw-label">RAM</div><div class="hw-val">${ram ? ram + ' GB' : 'Not specified'}</div></div>
      <div class="hw-item"><div class="hw-label">CPU</div><div class="hw-val">${escHtml(cpu || 'Not specified')}</div></div>
    </div>`;

  document.getElementById('manual-hw-form').style.display = 'none';
  renderCookbookModels();
  showToast('Hardware updated', 'success');
}

// ── Model database (from llmfit patterns) ─────────────────
const FORGE_MODELS = [
  { name: 'Llama 3.2 1B',     ollama: 'llama3.2:1b',      size: 0.8,  vram: 2,  ram: 4,  tier: 'any',  tags: ['fast','tiny','chat'],           desc: 'Runs on virtually any device including phones. Great for quick tasks and testing.' },
  { name: 'Phi-4 Mini',       ollama: 'phi4-mini',         size: 2.5,  vram: 3,  ram: 8,  tier: 'any',  tags: ['reasoning','tiny','code'],       desc: "Microsoft's tiny but surprisingly capable reasoning model." },
  { name: 'Llama 3.2 3B',     ollama: 'llama3.2:3b',       size: 2,    vram: 4,  ram: 8,  tier: 'low',  tags: ['fast','balanced','chat'],        desc: 'Small but capable. Runs on integrated graphics or CPU.' },
  { name: 'Gemma 3 4B',       ollama: 'gemma3:4b',         size: 3,    vram: 4,  ram: 8,  tier: 'low',  tags: ['balanced','fast','multimodal'],  desc: "Google's latest small model with vision support." },
  { name: 'Mistral 7B',       ollama: 'mistral',           size: 4.5,  vram: 6,  ram: 16, tier: 'mid',  tags: ['balanced','fast','chat'],        desc: 'Excellent instruction following and speed. A solid all-rounder.' },
  { name: 'Llama 3.1 8B',     ollama: 'llama3.1:8b',       size: 5,    vram: 8,  ram: 16, tier: 'mid',  tags: ['balanced','code','reasoning'],   desc: 'Sweet spot for most tasks. Needs 8 GB+ VRAM or a fast CPU.' },
  { name: 'Gemma 2 9B',       ollama: 'gemma2:9b',         size: 6,    vram: 10, ram: 16, tier: 'mid',  tags: ['balanced','safe','fast'],        desc: "Google's compact but strong model with good safety alignment." },
  { name: 'Llama 3.1 70B Q4', ollama: 'llama3.1:70b-q4',  size: 40,   vram: 24, ram: 48, tier: 'high', tags: ['frontier','reasoning','code'],   desc: 'Near-frontier quality at 4-bit quantisation. Requires a high-end GPU.' },
  { name: 'Qwen 2.5 14B',     ollama: 'qwen2.5:14b',       size: 9,    vram: 12, ram: 24, tier: 'high', tags: ['reasoning','code','multilingual'],'desc': 'Strong multilingual model. Great for coding and complex reasoning.' },
  { name: 'DeepSeek-R1 7B',   ollama: 'deepseek-r1:7b',    size: 5,    vram: 8,  ram: 16, tier: 'mid',  tags: ['reasoning','math','code'],       desc: 'Thinking model with chain-of-thought. Good reasoning at 7B scale.' },
  { name: 'DeepSeek-R1 32B',  ollama: 'deepseek-r1:32b',   size: 20,   vram: 24, ram: 32, tier: 'high', tags: ['reasoning','math','code'],       desc: 'Strong reasoning model. Rivals GPT-4o on benchmarks. Needs 24 GB VRAM.' },
  { name: 'Gemma 3 27B',      ollama: 'gemma3:27b',        size: 17,   vram: 20, ram: 32, tier: 'high', tags: ['balanced','vision','long-ctx'],  desc: 'Strong multimodal model with vision support and long context.' },
  { name: 'Llama 3.3 70B',    ollama: 'llama3.3:70b',      size: 40,   vram: 48, ram: 64, tier: 'pro',  tags: ['frontier','reasoning','code'],   desc: 'Near-frontier performance. Needs dual GPUs or 48 GB+ VRAM.' },
  { name: 'Qwen 2.5 72B',     ollama: 'qwen2.5:72b',       size: 45,   vram: 48, ram: 64, tier: 'pro',  tags: ['reasoning','multilingual','code'],'desc': 'One of the strongest open models. Requires workstation hardware.' },
];

const TIER_LABELS = { any: 'Any hardware', low: 'Low-end', mid: 'Mid-range', high: 'High-end', pro: 'Workstation' };
const TIER_COLORS = { any: 'var(--success)', low: '#4a9038', mid: '#2a8ab8', high: '#7055dd', pro: 'var(--red)' };

let _forgeTierFilter = '';
let _forgeSearch = '';

function _modelFits(m) {
  if (!_hwState.vramGB) return true; // no hardware info → show all
  return m.vram <= _hwState.vramGB;
}

function renderCookbookModels() {
  const el = document.getElementById('cookbook-model-list');
  if (!el) return;

  let models = FORGE_MODELS;
  if (_forgeTierFilter) models = models.filter(m => m.tier === _forgeTierFilter);
  if (_forgeSearch) {
    const q = _forgeSearch.toLowerCase();
    models = models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.tags.some(t => t.includes(q)) ||
      m.desc.toLowerCase().includes(q)
    );
  }

  if (!models.length) {
    el.innerHTML = '<div style="grid-column:1/-1;padding:20px;color:var(--text-faint);text-align:center">No models match your filter.</div>';
    return;
  }

  el.innerHTML = models.map(m => {
    const fits = _modelFits(m);
    const fitClass = fits ? 'recommended' : '';
    const fitBadge = _hwState.vramGB
      ? (fits
        ? `<span class="hw-fit-badge hw-fit-good">Fits your GPU</span>`
        : `<span class="hw-fit-badge hw-fit-tight">Needs ${m.vram} GB VRAM</span>`)
      : '';
    return `
    <div class="cookbook-model-card ${fitClass}">
      <div class="cookbook-model-header">
        <div>
          <div class="cookbook-model-name">${escHtml(m.name)}</div>
          ${fitBadge}
        </div>
        <span class="hw-fit-badge" style="background:color-mix(in srgb,${TIER_COLORS[m.tier]} 15%,transparent);color:${TIER_COLORS[m.tier]};border:1px solid ${TIER_COLORS[m.tier]}">${TIER_LABELS[m.tier]}</span>
      </div>
      <div class="cookbook-model-desc">${escHtml(m.desc)}</div>
      <div class="cookbook-model-specs">
        <span><strong>Size:</strong> ${m.size} GB</span>
        <span><strong>VRAM:</strong> ${m.vram} GB+</span>
        <span><strong>RAM:</strong> ${m.ram} GB+</span>
      </div>
      <div class="cookbook-model-tags">${m.tags.map(t => `<span class="cookbook-model-tag">${t}</span>`).join('')}</div>
      <div class="cookbook-model-action">ollama pull ${escHtml(m.ollama)}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  WEB PUSH / NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
async function setupPWA() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) { console.warn('SW registration failed:', e); }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.pwaInstallPrompt = e;
    const btn = document.getElementById('install-pwa-btn');
    if (btn) { btn.style.display = ''; btn.onclick = () => { e.prompt(); state.pwaInstallPrompt = null; btn.style.display = 'none'; }; }
    const hint = document.getElementById('pwa-install-hint');
    if (hint) hint.textContent = 'Glyndwr can be installed as an app on your device.';
  });
}

async function enableNotifications() {
  const statusEl = document.getElementById('notification-status');
  if (!('Notification' in window)) { if (statusEl) statusEl.textContent = 'Notifications not supported in this browser.'; return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { if (statusEl) statusEl.textContent = 'Permission denied.'; return; }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (statusEl) statusEl.textContent = 'In-app notifications enabled (background push not available in this browser).';
    showBrowserNotification('Glyndwr', 'Notifications enabled!');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const keyData = await API.get('/api/notifications/vapid-public-key');
    if (!keyData.public_key) {
      if (statusEl) statusEl.textContent = 'Server VAPID key not available. Install cryptography package.';
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.public_key),
    });
    state.pushSubscription = sub;
    const subJson = sub.toJSON();
    await API.post('/api/notifications/subscribe', { endpoint: subJson.endpoint, keys: subJson.keys });
    if (statusEl) statusEl.textContent = '✓ Push notifications enabled!';
    showToast('Push notifications enabled', 'success');
  } catch (e) {
    if (statusEl) statusEl.textContent = `Failed: ${e.message}`;
    // Fall back to basic notifications
    showBrowserNotification('Glyndwr', 'Basic notifications enabled!');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function showBrowserNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/static/icon.svg' });
  }
}

async function sendTestNotification() {
  try {
    const result = await API.post('/api/notifications/test', { title: 'Glyndwr Test', body: 'Push notifications are working!' });
    if (result.sent > 0) showToast(`Test notification sent to ${result.sent} device(s)`, 'success');
    else {
      showBrowserNotification('Glyndwr Test', 'Push notifications are working!');
      showToast('Sent as in-app notification (no push subscriptions found)', 'info');
    }
  } catch (e) {
    showBrowserNotification('Glyndwr Test', 'Test notification');
    showToast(`Push error: ${e.message}`, 'warning');
  }
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
async function checkServerHealth() {
  try {
    const r = await fetch('/health', { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      document.getElementById('server-offline-banner').classList.remove('visible');
      return true;
    }
  } catch {}
  document.getElementById('server-offline-banner').classList.add('visible');
  document.getElementById('app-spinner').style.display = 'none';
  return false;
}

async function checkAuth() {
  const token = getAuthToken();
  if (!token) { redirectToLogin(); return false; }
  try {
    const r = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!r.ok) { redirectToLogin(); return false; }
    const user = await r.json();
    state.currentUser = user;
    updateUserDisplay(user);
    return true;
  } catch { return false; }
}

function updateUserDisplay(user) {
  if (!user) return;
  const initial = (user.username || '?')[0].toUpperCase();
  const avatar = document.getElementById('nav-user-avatar');
  if (avatar) { avatar.textContent = initial; avatar.title = user.username; }
  // Account tab
  const accName = document.getElementById('account-username');
  if (accName) accName.textContent = user.username;
  const accAvatar = document.getElementById('account-avatar');
  if (accAvatar) accAvatar.textContent = initial;
  const roleBadge = document.getElementById('account-role-badge');
  if (roleBadge) roleBadge.textContent = user.is_admin ? 'admin' : 'user';
  // Show admin tab
  if (user.is_admin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
}

async function init() {
  setupMarked();
  await setupPWA();

  try {
    const serverOk = await checkServerHealth();
    if (!serverOk) return;

    const authed = await checkAuth();
    if (!authed) return;

    await loadSettings();
    await loadModels();
    await loadConversations();

    document.querySelectorAll('.modal').forEach(modal => initTabs(modal));

    try { bindEvents(); } catch(e) { console.error('bindEvents error:', e); }
    try { bindExtendedEvents(); } catch(e) { console.error('bindExtendedEvents error:', e); }

    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('input-hint')?.classList.remove('hidden');

    renderCookbookModels();
    try { initAnimatedBackground(); } catch(e) { console.error('initAnimatedBackground error:', e); }
  } finally {
    // Always hide the spinner — even if something above crashed
    const spinner = document.getElementById('app-spinner');
    if (spinner) spinner.style.display = 'none';
  }
}

function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Tools — collapsible inline section
  const toolsToggle = document.getElementById('nav-tools-toggle');
  const toolsCollapse = document.getElementById('nav-tools-collapse');
  const TOOL_SECTIONS = new Set(['agent','research','memory','cookbook']);

  function toggleToolsCollapse() {
    const isOpen = toolsCollapse.classList.contains('open');
    toolsCollapse.classList.toggle('open', !isOpen);
    toolsToggle.classList.toggle('tools-open', !isOpen);
  }

  toolsToggle?.addEventListener('click', toggleToolsCollapse);

  // Keep tools open when a tool section is active
  function syncToolsCollapse(section) {
    if (TOOL_SECTIONS.has(section)) {
      toolsCollapse.classList.add('open');
      toolsToggle.classList.add('tools-open');
    }
  }

  document.getElementById('nav-settings-btn').addEventListener('click', () => {
    populateSettingsDefaultModel();
    // Populate saved provider keys from DB settings
    const providerFields = {
      openai_api_key: 'key-openai', anthropic_api_key: 'key-anthropic',
      groq_api_key: 'key-groq', gemini_api_key: 'key-gemini',
      deepseek_api_key: 'key-deepseek', openrouter_api_key: 'key-openrouter',
      ollama_host: 'key-ollama',
    };
    for (const [k, elId] of Object.entries(providerFields)) {
      const el = document.getElementById(elId);
      if (el && state.settings[k]) el.value = state.settings[k];
    }
    openModal('settings-overlay');
  });

  // Chat
  document.getElementById('new-chat-btn').addEventListener('click', () => createConversation());
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  const msgInput = document.getElementById('message-input');
  msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  msgInput.addEventListener('input', () => { resizeTextarea(msgInput); updateTokenCount(msgInput.value); });
  msgInput.addEventListener('focus', () => document.getElementById('input-hint').classList.remove('hidden'));
  document.getElementById('model-select').addEventListener('change', async (e) => {
    state.currentModel = e.target.value;
    if (state.currentConversationId) try { await API.put(`/api/chat/${state.currentConversationId}`, { model: e.target.value }); } catch {}
  });
  document.getElementById('clear-btn').addEventListener('click', clearConversation);
  document.getElementById('rename-btn').addEventListener('click', startRename);
  document.getElementById('compare-btn')?.addEventListener('click', () => {
    state.compareHistory = { a: [], b: [] };
    document.getElementById('compare-messages-a').innerHTML = '';
    document.getElementById('compare-messages-b').innerHTML = '';
    openModal('compare-overlay');
  });
  document.getElementById('compare-send-btn').addEventListener('click', sendCompare);
  document.getElementById('compare-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCompare(); } });

  // Settings
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('save-email-settings-btn').addEventListener('click', saveEmailSettings);
  document.getElementById('save-tools-settings-btn').addEventListener('click', saveToolsSettings);
  document.getElementById('save-caldav-btn').addEventListener('click', saveCalDAVSettings);
  document.getElementById('enable-notifications-btn').addEventListener('click', enableNotifications);
  document.getElementById('test-notification-btn').addEventListener('click', sendTestNotification);

  // Email setup banner
  document.getElementById('email-setup-btn').addEventListener('click', () => {
    openModal('settings-overlay');
    document.querySelectorAll('#settings-modal .modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#settings-modal .modal-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('#settings-modal [data-tab="tab-email-settings"]').classList.add('active');
    document.getElementById('tab-email-settings').classList.add('active');
  });

  // System prompt
  document.getElementById('edit-system-prompt-btn').addEventListener('click', async () => {
    if (!state.currentConversationId) return;
    const conv = await API.get(`/api/chat/${state.currentConversationId}`);
    document.getElementById('conv-system-prompt').value = conv.system_prompt || '';
    openModal('sysprompt-overlay');
  });
  document.getElementById('save-sysprompt-btn').addEventListener('click', saveConvSystemPrompt);

  // Theme
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.addEventListener('click', () => {
      applyTheme(s.dataset.theme);
      document.documentElement.style.removeProperty('--red');
      const picker = document.getElementById('accent-color-picker');
      if (picker) { const computed = getComputedStyle(document.body).getPropertyValue('--red').trim(); picker.value = computed || '#e06c75'; }
    });
  });
  const accentPicker = document.getElementById('accent-color-picker');
  if (accentPicker) {
    accentPicker.addEventListener('input', (e) => document.documentElement.style.setProperty('--red', e.target.value));
    accentPicker.addEventListener('change', (e) => { document.documentElement.style.setProperty('--red', e.target.value); saveSettingLocal('accent_color', e.target.value); });
  }
  document.querySelectorAll('.bg-pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => { applyBgPattern(btn.dataset.pattern); saveSettingLocal('bg_pattern', btn.dataset.pattern); });
  });
  document.getElementById('setting-font-size')?.addEventListener('change', (e) => applyFontSize(e.target.value));
  document.getElementById('setting-compact')?.addEventListener('change', (e) => document.body.classList.toggle('compact', e.target.value === 'true'));

  // Modals
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
  });

  // File attach
  document.getElementById('attach-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { handleFileAttach(f); e.target.value = ''; } });
  const chatMain = document.getElementById('chat-main');
  chatMain.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag-over'); });
  chatMain.addEventListener('dragleave', (e) => { if (!chatMain.contains(e.relatedTarget)) document.body.classList.remove('drag-over'); });
  chatMain.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) handleFileAttach(f); });

  // Quick prompts
  document.querySelectorAll('.welcome-prompt-btn').forEach(btn => btn.addEventListener('click', () => createConversation(btn.dataset.prompt)));

  // Context menu
  document.getElementById('ctx-pin').addEventListener('click', async () => { if (!state.contextMenuTarget) return; hideContextMenu(); await togglePin(state.contextMenuTarget.convId, state.contextMenuTarget.isPinned); });
  document.getElementById('ctx-rename').addEventListener('click', async () => { if (!state.contextMenuTarget) return; const { convId } = state.contextMenuTarget; hideContextMenu(); if (convId !== state.currentConversationId) await openConversation(convId); startRename(); });
  document.getElementById('ctx-delete').addEventListener('click', async () => { if (!state.contextMenuTarget) return; const { convId } = state.contextMenuTarget; hideContextMenu(); await deleteConversation(convId); });

  // Notes
  document.getElementById('new-note-btn').addEventListener('click', newNote);
  document.getElementById('note-title-input').addEventListener('input', scheduleNoteSave);
  document.getElementById('note-content-textarea').addEventListener('input', scheduleNoteSave);
  document.getElementById('delete-note-btn').addEventListener('click', () => deleteNote(state.currentNoteId));

  // Tasks
  const taskInput = document.getElementById('task-input');
  const taskDue = document.getElementById('task-due-date');
  document.getElementById('add-task-btn').addEventListener('click', () => { addTask(taskInput.value, taskDue.value); taskInput.value = ''; taskDue.value = ''; });
  taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addTask(taskInput.value, taskDue.value); taskInput.value = ''; taskDue.value = ''; } });
  document.querySelectorAll('.task-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.task-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.taskFilter = tab.dataset.filter;
      renderTasksList();
    });
  });

  // Documents / Library
  document.getElementById('new-doc-btn').addEventListener('click', newDoc);
  document.getElementById('new-doc-empty-btn')?.addEventListener('click', newDoc);
  document.getElementById('doc-title-input').addEventListener('input', scheduleDocSave);
  document.getElementById('doc-content-textarea').addEventListener('input', scheduleDocSave);
  document.getElementById('doc-content-textarea').addEventListener('scroll', () => {
    // sync line numbers scroll
    const ta = document.getElementById('doc-content-textarea');
    const ln = document.getElementById('doc-source-lines');
    if (ln) ln.scrollTop = ta.scrollTop;
  });
  document.getElementById('doc-format-select').addEventListener('change', () => { scheduleDocSave(); _updateDocPreviewLive(); });
  document.getElementById('delete-doc-btn').addEventListener('click', () => deleteDoc(state.currentDocId));
  document.querySelectorAll('.doc-view-btn').forEach(btn => {
    btn.addEventListener('click', () => applyDocView(btn.dataset.view));
  });
  document.querySelectorAll('.doc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.doc-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _docFmtFilter = btn.dataset.fmt;
      renderDocList();
    });
  });
  document.getElementById('doc-ai-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('doc-ai-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#doc-ai-btn')) document.getElementById('doc-ai-menu')?.classList.add('hidden');
    if (!e.target.closest('#context-menu')) hideContextMenu();
  });
  document.querySelectorAll('#doc-ai-menu .dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('doc-ai-menu').classList.add('hidden');
      runDocAI(item.dataset.action);
    });
  });

  // Email
  document.getElementById('compose-btn')?.addEventListener('click', () => openModal('compose-overlay'));
  document.getElementById('compose-send-email-btn')?.addEventListener('click', async () => {
    const to = document.getElementById('compose-to').value;
    const subject = document.getElementById('compose-subject').value;
    const body = document.getElementById('compose-body').value;
    if (!to || !subject) { showToast('Fill in To and Subject', 'warning'); return; }
    try { await API.post('/api/email/send', { to, subject, body }); showToast('Email sent', 'success'); closeModal('compose-overlay'); }
    catch (e) { showToast(`Send failed: ${e.message}`, 'error'); }
  });
  document.getElementById('refresh-inbox-btn')?.addEventListener('click', () => loadEmailInbox(state.currentEmailFolder));
  document.getElementById('email-back-btn')?.addEventListener('click', () => {
    document.getElementById('email-detail-panel').style.display = 'none';
    document.getElementById('email-list-panel').style.display = 'flex';
  });
  document.getElementById('email-triage-single-btn')?.addEventListener('click', triageCurrentEmail);
  document.getElementById('email-reply-btn')?.addEventListener('click', () => {
    openModal('compose-overlay');
  });
  document.querySelectorAll('.email-folder').forEach(f => {
    f.addEventListener('click', () => {
      document.querySelectorAll('.email-folder').forEach(x => x.classList.remove('active'));
      f.classList.add('active');
      const folder = f.dataset.folder;
      document.getElementById('email-folder-title').textContent = f.textContent.trim().replace(/\d+$/, '').trim();
      if (folder === 'unsubscribe') {
        document.getElementById('email-list').style.display = 'none';
        document.getElementById('unsub-panel').style.display = 'flex';
        document.getElementById('email-detail-panel').style.display = 'none';
        document.getElementById('email-list-panel').style.display = 'flex';
      } else {
        document.getElementById('email-list').style.display = '';
        document.getElementById('unsub-panel').style.display = 'none';
        loadEmailInbox(folder === 'INBOX' ? 'INBOX' : folder);
      }
    });
  });
  document.getElementById('scan-unsub-btn')?.addEventListener('click', scanSubscriptions);

  // Calendar
  document.getElementById('cal-prev').addEventListener('click', () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1); loadCalendarEvents(); });
  document.getElementById('cal-next').addEventListener('click', () => { state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1); loadCalendarEvents(); });
  document.getElementById('cal-today').addEventListener('click', () => { state.calendarDate = new Date(); loadCalendarEvents(); });
  document.getElementById('cal-sync-btn').addEventListener('click', syncCalDAV);
  document.getElementById('cal-add-event').addEventListener('click', () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const title = prompt(`Add event for today (${dateKey}):`);
    if (title && title.trim()) {
      API.post('/api/calendar/events', { title: title.trim(), date: dateKey })
        .then(() => loadCalendarEvents())
        .catch(() => { if (!state.calendarEvents[dateKey]) state.calendarEvents[dateKey] = []; state.calendarEvents[dateKey].push({ title: title.trim() }); localStorage.setItem('glyndwr_calendar_events', JSON.stringify(state.calendarEvents)); renderCalendar(); });
    }
  });

  // Agent
  document.getElementById('agent-send-btn').addEventListener('click', runAgent);
  document.getElementById('agent-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent(); } });
  document.getElementById('agent-clear-btn').addEventListener('click', () => { state.agentHistory = []; document.getElementById('agent-messages').innerHTML = ''; });

  // Research
  document.getElementById('research-btn').addEventListener('click', runResearch);
  document.getElementById('research-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runResearch(); } });

  // Cookbook
  document.getElementById('scan-hardware-btn').addEventListener('click', scanHardware);

  // Memory
  document.getElementById('memory-search').addEventListener('input', () => loadMemories());
  document.getElementById('clear-memories-btn').addEventListener('click', clearAllMemories);
  document.getElementById('add-memory-btn')?.addEventListener('click', () => openModal('add-memory-overlay'));
  document.getElementById('save-memory-btn')?.addEventListener('click', saveMemory);
  document.querySelectorAll('.memory-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.memory-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _memoryCategoryFilter = btn.dataset.cat || '';
      loadMemories();
    });
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(o => closeModal(o.id));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); if (state.currentSection !== 'chat') switchSection('chat'); createConversation(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); openModal('shortcuts-overlay'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.currentSection === 'notes') saveNote();
      else if (state.currentSection === 'documents') saveDoc();
      else if (document.getElementById('settings-overlay') && !document.getElementById('settings-overlay').classList.contains('hidden')) saveSettings();
    }
    if (e.key === '?' && !e.target.closest('input, textarea, select')) { e.preventDefault(); openModal('shortcuts-overlay'); }
  });

  // Clipboard paste
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) { handleFileAttach(f); e.preventDefault(); break; } }
    }
  });

  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
}

// ═══════════════════════════════════════════════════════════
//  EXTENDED EVENTS (auth, themes, gallery, account, admin,
//  shortcuts, mobile nav, animated bg)
// ═══════════════════════════════════════════════════════════
function bindExtendedEvents() {

  // Forge — manual hardware entry
  document.getElementById('manual-hw-btn')?.addEventListener('click', () => {
    const f = document.getElementById('manual-hw-form');
    if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('cancel-manual-hw-btn')?.addEventListener('click', () => {
    document.getElementById('manual-hw-form').style.display = 'none';
  });
  document.getElementById('apply-manual-hw-btn')?.addEventListener('click', applyManualHardware);

  // Forge — tier filter buttons
  document.querySelectorAll('.forge-filter-btn[data-tier]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.forge-filter-btn[data-tier]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _forgeTierFilter = btn.dataset.tier;
      renderCookbookModels();
    });
  });

  // Forge — search
  document.getElementById('forge-search')?.addEventListener('input', (e) => {
    _forgeSearch = e.target.value.trim().toLowerCase();
    renderCookbookModels();
  });

  // Memory — edit save
  document.getElementById('save-edit-memory-btn')?.addEventListener('click', saveEditMemory);

  // Settings — memory auto-extract toggle
  document.getElementById('setting-memory-extract')?.addEventListener('change', (e) => {
    saveSettingLocal('memory_auto_extract', e.target.checked ? 'true' : 'false').catch(() => {});
  });

  // Compare button in tools collapse
  document.getElementById('compare-nav-btn')?.addEventListener('click', () => {
    state.compareHistory = { a: [], b: [] };
    document.getElementById('compare-messages-a').innerHTML = '';
    document.getElementById('compare-messages-b').innerHTML = '';
    openModal('compare-overlay');
  });

  // ── Hamburger ──────────────────────────────────────────
  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    const sb = document.getElementById('chat-sidebar');
    if (sb.classList.contains('mobile-open')) closeMobileSidebar();
    else openMobileSidebar();
  });

  // ── User avatar → account settings tab ────────────────
  document.getElementById('nav-user-avatar')?.addEventListener('click', () => {
    openModal('settings-overlay');
    const tab = document.querySelector('#settings-modal [data-tab="tab-account"]');
    if (tab) tab.click();
  });

  // ── Logout ─────────────────────────────────────────────
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders(), credentials: 'include' }); } catch {}
    redirectToLogin();
  });

  // ── Change password ────────────────────────────────────
  document.getElementById('change-password-btn')?.addEventListener('click', async () => {
    const cur = document.getElementById('pw-current').value;
    const nw = document.getElementById('pw-new').value;
    const conf = document.getElementById('pw-confirm').value;
    const errEl = document.getElementById('pw-error');
    errEl.style.display = 'none';
    if (nw !== conf) { errEl.textContent = 'New passwords do not match.'; errEl.style.display = ''; return; }
    if (nw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = ''; return; }
    try {
      await API.post('/api/auth/change-password', { current_password: cur, new_password: nw });
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
      showToast('Password changed successfully', 'success');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  });

  // ── Admin tab: load users ──────────────────────────────
  document.querySelector('[data-tab="tab-admin"]')?.addEventListener('click', loadAdminUsers);

  document.getElementById('add-user-btn')?.addEventListener('click', () => {
    const form = document.getElementById('add-user-form');
    if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('cancel-add-user-btn')?.addEventListener('click', () => {
    document.getElementById('add-user-form').style.display = 'none';
  });
  document.getElementById('create-user-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const isAdmin = document.getElementById('new-user-admin').checked;
    if (!username || !password) { showToast('Username and password required', 'warning'); return; }
    try {
      await API.post('/api/users/', { username, password, is_admin: isAdmin });
      document.getElementById('new-username').value = '';
      document.getElementById('new-user-password').value = '';
      document.getElementById('new-user-admin').checked = false;
      document.getElementById('add-user-form').style.display = 'none';
      await loadAdminUsers();
      showToast(`User "${username}" created`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── Theme: custom creator ──────────────────────────────
  const customColorIds = ['c-bg','c-fg','c-panel','c-panel2','c-border','c-accent','c-muted','c-codebg'];
  customColorIds.forEach(id => {
    document.getElementById(id)?.addEventListener('input', previewCustomTheme);
  });
  document.getElementById('apply-custom-theme-btn')?.addEventListener('click', applyCustomTheme);

  // ── Theme: animated background ─────────────────────────
  document.querySelectorAll('.bg-pattern-btn[data-anim]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bg-pattern-btn[data-anim]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setAnimatedBackground(btn.dataset.anim);
      saveSettingLocal('animated_bg', btn.dataset.anim).catch(() => {});
    });
  });

  // ── Font selector ──────────────────────────────────────
  document.querySelectorAll('.font-btn[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFont(btn.dataset.font);
      saveSettingLocal('font_family', btn.dataset.font).catch(() => {});
    });
  });

  // ── Density selector ──────────────────────────────────
  document.getElementById('setting-density')?.addEventListener('change', (e) => {
    document.body.classList.remove('density-compact', 'density-spacious');
    if (e.target.value) document.body.classList.add(e.target.value);
    saveSettingLocal('density', e.target.value).catch(() => {});
  });

  // ── Accent reset ───────────────────────────────────────
  document.getElementById('reset-accent-btn')?.addEventListener('click', () => {
    document.documentElement.style.removeProperty('--red');
    saveSettingLocal('accent_color', '').catch(() => {});
    showToast('Accent color reset', 'info');
  });

  // ── Shortcuts tab ──────────────────────────────────────
  document.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startShortcutCapture(btn));
  });
  document.getElementById('reset-shortcuts-btn')?.addEventListener('click', () => {
    localStorage.removeItem('glyndwr_shortcuts');
    showToast('Shortcuts reset to defaults', 'success');
  });

  // ── Mobile swipe gestures ──────────────────────────────
  initSwipeGestures();

  // ── Gallery section nav ────────────────────────────────
  document.querySelector('.nav-item[data-section="gallery"]')?.addEventListener('click', () => {
    if (typeof ImageEditor !== 'undefined') ImageEditor.loadGalleryList();
  });
}

// ── Admin users ────────────────────────────────────────────
async function loadAdminUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-faint)">Loading…</td></tr>';
  try {
    const users = await API.get('/api/users/');
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(u.username)}</td>
        <td><span class="role-badge">${u.is_admin ? 'admin' : 'user'}</span></td>
        <td style="font-size:11px;color:var(--text-faint)">${formatDate(u.created_at)}</td>
        <td>
          <div class="user-actions">
            <button class="btn btn-secondary btn-sm" onclick="toggleAdminRole('${escHtml(u.id)}', ${!!u.is_admin})">${u.is_admin ? 'Demote' : 'Promote'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${escHtml(u.id)}', '${escHtml(u.username)}')">Delete</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (e) { tbody.innerHTML = `<tr><td colspan="4" style="color:var(--red)">${escHtml(e.message)}</td></tr>`; }
}

window.toggleAdminRole = async function(id, currentlyAdmin) {
  try {
    await API.put(`/api/users/${id}`, { is_admin: !currentlyAdmin });
    await loadAdminUsers();
    showToast('Role updated', 'success');
  } catch (e) { showToast(e.message, 'error'); }
};

window.deleteUser = async function(id, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  try {
    await API.del(`/api/users/${id}`);
    await loadAdminUsers();
    showToast(`User "${name}" deleted`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
};

// ── Custom theme ────────────────────────────────────────────
function previewCustomTheme() {
  const get = id => document.getElementById(id)?.value || '';
  document.documentElement.style.setProperty('--c-bg', get('c-bg'));
  document.documentElement.style.setProperty('--c-fg', get('c-fg'));
  document.documentElement.style.setProperty('--c-panel', get('c-panel'));
  document.documentElement.style.setProperty('--c-panel2', get('c-panel2'));
  document.documentElement.style.setProperty('--c-border', get('c-border'));
  document.documentElement.style.setProperty('--c-accent', get('c-accent'));
  document.documentElement.style.setProperty('--c-muted', get('c-muted'));
  document.documentElement.style.setProperty('--c-codebg', get('c-codebg'));
  // Update preview bar
  const pb = id => document.getElementById(id);
  if (pb('prev-bg')) pb('prev-bg').style.background = get('c-bg');
  if (pb('prev-panel')) pb('prev-panel').style.background = get('c-panel');
  if (pb('prev-accent')) pb('prev-accent').style.background = get('c-accent');
  if (pb('prev-fg')) pb('prev-fg').style.background = get('c-fg');
  // Update custom swatch preview
  const d1 = document.getElementById('custom-swatch-dot1');
  const d2 = document.getElementById('custom-swatch-dot2');
  const d3 = document.getElementById('custom-swatch-dot3');
  if (d1) d1.style.background = get('c-accent');
  if (d2) d2.style.background = get('c-fg');
  if (d3) d3.style.background = get('c-panel');
  const lbl = document.getElementById('custom-swatch-label');
  if (lbl) { lbl.style.background = get('c-panel'); lbl.style.color = get('c-fg'); }
  const swatch = document.getElementById('custom-theme-swatch');
  if (swatch) swatch.querySelector('.swatch-preview').style.background = get('c-bg');
}

function applyCustomTheme() {
  previewCustomTheme();
  applyTheme('custom');
  // Save custom colors to localStorage for persistence
  const customData = {};
  ['c-bg','c-fg','c-panel','c-panel2','c-border','c-accent','c-muted','c-codebg'].forEach(id => {
    customData[id] = document.getElementById(id)?.value || '';
  });
  localStorage.setItem('glyndwr_custom_theme', JSON.stringify(customData));
  showToast('Custom theme applied', 'success');
}

function restoreCustomTheme() {
  const saved = localStorage.getItem('glyndwr_custom_theme');
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
      document.documentElement.style.setProperty(`--${id}`, val);
    });
    previewCustomTheme();
  } catch {}
}

// ── Font ────────────────────────────────────────────────────
function applyFont(font) {
  document.body.classList.remove('font-mono', 'font-sans', 'font-serif');
  if (font) document.body.classList.add(`font-${font}`);
}

// ── Animated Background ─────────────────────────────────────
let _animFrame = null;
let _animType = 'none';
let _animNodes = [];

function initAnimatedBackground() {
  const saved = state.settings['animated_bg'] || localStorage.getItem('glyndwr_animated_bg') || 'none';
  const fontSaved = state.settings['font_family'] || 'mono';
  const densitySaved = state.settings['density'] || '';
  applyFont(fontSaved);
  if (densitySaved) document.body.classList.add(densitySaved);
  restoreCustomTheme();
  setAnimatedBackground(saved);
  // Mark active button
  document.querySelectorAll('.bg-pattern-btn[data-anim]').forEach(b =>
    b.classList.toggle('active', b.dataset.anim === saved)
  );
}

function setAnimatedBackground(type) {
  _animType = type;
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.body.classList.toggle('bg-canvas-on', type !== 'none');
  if (type === 'none') return;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  });
  _animNodes = [];
  if (type === 'synapse') _startSynapse(canvas, ctx);
  else if (type === 'rain') _startRain(canvas, ctx);
  else if (type === 'stars') _startStars(canvas, ctx);
  else if (type === 'sparkles') _startSparkles(canvas, ctx);
  else if (type === 'embers') _startEmbers(canvas, ctx);
}

function _accentColor() {
  return getComputedStyle(document.body).getPropertyValue('--red').trim() || '#cc2800';
}

function _startSynapse(canvas, ctx) {
  const N = 40;
  for (let i = 0; i < N; i++) _animNodes.push({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
    pulse: Math.random() * Math.PI * 2, r: Math.random() * 2 + 1,
  });
  function draw() {
    if (_animType !== 'synapse') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = _accentColor();
    _animNodes.forEach(n => {
      n.x += n.vx; n.y += n.vy; n.pulse += 0.018;
      if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    });
    for (let i = 0; i < _animNodes.length; i++) for (let j = i+1; j < _animNodes.length; j++) {
      const dx = _animNodes[i].x - _animNodes[j].x, dy = _animNodes[i].y - _animNodes[j].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 160) {
        ctx.beginPath(); ctx.moveTo(_animNodes[i].x, _animNodes[i].y); ctx.lineTo(_animNodes[j].x, _animNodes[j].y);
        ctx.strokeStyle = col + Math.round(0.18 * (1 - d/160) * 255).toString(16).padStart(2,'0');
        ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
    _animNodes.forEach(n => {
      const g = 0.5 + 0.5 * Math.sin(n.pulse);
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * g, 0, Math.PI*2);
      ctx.fillStyle = col + Math.round(0.5 * g * 255).toString(16).padStart(2,'0');
      ctx.fill();
    });
    _animFrame = requestAnimationFrame(draw);
  }
  draw();
}

function _startRain(canvas, ctx) {
  const drops = Array.from({length: 80}, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    speed: 2 + Math.random() * 4, length: 10 + Math.random() * 20, opacity: 0.1 + Math.random() * 0.3,
  }));
  function draw() {
    if (_animType !== 'rain') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = _accentColor();
    drops.forEach(d => {
      d.y += d.speed;
      if (d.y > canvas.height) { d.y = -d.length; d.x = Math.random() * canvas.width; }
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.length);
      ctx.strokeStyle = col + Math.round(d.opacity * 255).toString(16).padStart(2,'0');
      ctx.lineWidth = 1; ctx.stroke();
    });
    _animFrame = requestAnimationFrame(draw);
  }
  draw();
}

function _startStars(canvas, ctx) {
  const stars = Array.from({length: 120}, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3, opacity: Math.random(), phase: Math.random() * Math.PI * 2,
  }));
  function draw() {
    if (_animType !== 'stars') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = _accentColor();
    const t = Date.now() / 2000;
    stars.forEach(s => {
      const op = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t + s.phase));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = col + Math.round(op * 255).toString(16).padStart(2,'0');
      ctx.fill();
    });
    _animFrame = requestAnimationFrame(draw);
  }
  draw();
}

function _startSparkles(canvas, ctx) {
  const sparks = Array.from({length: 50}, () => _newSparkle(canvas));
  function _newSparkle(c) {
    return { x: Math.random()*c.width, y: Math.random()*c.height, r: Math.random()*3+1, life: Math.random(), speed: 0.005+Math.random()*0.01 };
  }
  function draw() {
    if (_animType !== 'sparkles') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = _accentColor();
    sparks.forEach((s,i) => {
      s.life += s.speed;
      if (s.life > 1) { sparks[i] = _newSparkle(canvas); return; }
      const op = Math.sin(s.life * Math.PI);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * op, 0, Math.PI*2);
      ctx.fillStyle = col + Math.round(op * 200).toString(16).padStart(2,'0');
      ctx.fill();
    });
    _animFrame = requestAnimationFrame(draw);
  }
  draw();
}

function _startEmbers(canvas, ctx) {
  const embers = Array.from({length: 60}, () => ({
    x: Math.random()*canvas.width, y: canvas.height + Math.random()*100,
    vx: (Math.random()-0.5)*0.8, vy: -(0.5+Math.random()*1.5),
    r: Math.random()*2+0.5, life: Math.random(), opacity: 0.2+Math.random()*0.6,
  }));
  function draw() {
    if (_animType !== 'embers') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const col = _accentColor();
    embers.forEach(e => {
      e.x += e.vx; e.y += e.vy; e.life -= 0.003;
      if (e.y < -10 || e.life <= 0) { e.y = canvas.height + 10; e.x = Math.random()*canvas.width; e.life = 1; }
      const op = e.life * e.opacity;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
      ctx.fillStyle = col + Math.round(op * 255).toString(16).padStart(2,'0');
      ctx.fill();
    });
    _animFrame = requestAnimationFrame(draw);
  }
  draw();
}

// ── Shortcut capture ────────────────────────────────────────
function startShortcutCapture(btn) {
  btn.classList.add('listening');
  btn.textContent = 'Press key…';
  function onKey(e) {
    e.preventDefault(); e.stopPropagation();
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (!['Control','Shift','Alt','Meta'].includes(e.key)) parts.push(e.key.toUpperCase());
    const combo = parts.join('+');
    btn.classList.remove('listening');
    btn.textContent = 'Edit';
    const action = btn.dataset.action;
    const display = document.getElementById(`sk-${action}`) || btn.previousElementSibling;
    if (display) display.innerHTML = parts.map(k => `<kbd>${escHtml(k)}</kbd>`).join('+');
    const shortcuts = JSON.parse(localStorage.getItem('glyndwr_shortcuts') || '{}');
    shortcuts[action] = combo;
    localStorage.setItem('glyndwr_shortcuts', JSON.stringify(shortcuts));
    document.removeEventListener('keydown', onKey, true);
    showToast(`Shortcut set: ${combo}`, 'success');
  }
  document.addEventListener('keydown', onKey, true);
  // Cancel on blur
  setTimeout(() => {
    if (btn.classList.contains('listening')) {
      btn.classList.remove('listening');
      btn.textContent = 'Edit';
      document.removeEventListener('keydown', onKey, true);
    }
  }, 5000);
}

// ── Mobile swipe gestures ───────────────────────────────────
function initSwipeGestures() {
  let touchStartX = 0, touchStartY = 0;
  const SWIPE_THRESHOLD = 60;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0 && touchStartX < 30) {
      // Swipe right from left edge → open sidebar
      openMobileSidebar();
    } else if (dx < 0) {
      // Swipe left → close sidebar
      closeMobileSidebar();
      // Dismiss open modals
      if (Math.abs(dx) > 100) {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(o => closeModal(o.id));
      }
    }
  }, { passive: true });
}

// ─── Start ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

/* ================================================
   NexusChat — Full App
   Theme  : Perplexity dark
   Layout : Claude-style centered
   Logo   : Valknut (3 interlocked triangles)
   API    : Groq (free)
   ================================================

   ⚠️  PASTE YOUR GROQ API KEY ON LINE 16
   Get it free at: https://console.groq.com
   ================================================ */

const GROQ_API_KEY = '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';

/* ── CONFIG ─────────────────────────── */
const CFG = {
  URL:         'https://api.groq.com/openai/v1/chat/completions',
  MODEL:       'llama-3.1-8b-instant',
  MAX_TOKENS:  1024,
  RATE_LIMIT:  8,
  RATE_WIN:    60000,
  MAX_CHARS:   2000,
  MAX_HIST:    20,
};

/* ── STORAGE ─────────────────────────── */
const K = {
  USERS: 'nx_users',
  CHATS: u => `nx_chats_${u}`,
  MSGS:  u => `nx_msgs_${u}`,
};

const db = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ── STATE ───────────────────────────── */
let S = {
  user:      null,
  chatId:    null,
  chats:     {},
  msgs:      {},
  loading:   false,
  lastMsg:   '',
  rates:     [],
  drawerOpen: false,
  menuOpen:   false,
};

/* ── HELPERS ─────────────────────────── */
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hash = p => btoa(unescape(encodeURIComponent(p)));

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function fmtDate(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Today';
  if (d.toDateString() === new Date(n-86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => el.className = '', 2800);
}

function getRates() {
  const now = Date.now();
  S.rates = S.rates.filter(t => now - t < CFG.RATE_WIN);
  return { used: S.rates.length, ok: S.rates.length < CFG.RATE_LIMIT, pct: Math.min(1, S.rates.length / CFG.RATE_LIMIT) };
}

/* ── VALKNUT SVG ─────────────────────── */
/* The exact 3-interlocked-triangles logo from the image */
function valknutSVG(size = 26, color = 'white') {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Top triangle (outer outline, open bottom-left) -->
    <path d="M50 8 L24 56 L30 56 L50 20 L70 56 L76 56 Z" fill="${color}"/>
    <!-- Top triangle bottom bar -->
    <path d="M20 56 L80 56 L80 63 L20 63 Z" fill="${color}"/>

    <!-- Bottom-left triangle -->
    <path d="M18 66 L44 66 L44 73 L18 73 Z" fill="${color}" opacity="0.8"/>
    <path d="M10 73 L48 73 L48 80 L10 80 Z" fill="${color}" opacity="0.8"/>
    <path d="M24 56 L30 56 L18 73 L10 73 Z" fill="${color}" opacity="0.8"/>

    <!-- Bottom-right triangle -->
    <path d="M56 66 L82 66 L82 73 L56 73 Z" fill="${color}" opacity="0.8"/>
    <path d="M52 73 L90 73 L90 80 L52 80 Z" fill="${color}" opacity="0.8"/>
    <path d="M70 56 L76 56 L82 73 L76 73 Z" fill="${color}" opacity="0.8"/>

    <!-- Center fill between triangles -->
    <path d="M38 63 L62 63 L62 66 L38 66 Z" fill="${color}"/>
  </svg>`;
}

/* ── MARKDOWN ────────────────────────── */
function md(text) {
  let t = esc(text);
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  t = t.replace(/`([^`]+)`/g,        '<code>$1</code>');
  t = t.replace(/\*\*(.+?)\*\*/g,    '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g,        '<em>$1</em>');
  t = t.split('\n\n').map(p => `<p>${p.replace(/\n/g,'<br/>')}</p>`).join('');
  return t;
}

/* ── PERSIST ─────────────────────────── */
const saveChats = () => db.set(K.CHATS(S.user), S.chats);
const saveMsgs  = () => db.set(K.MSGS(S.user),  S.msgs);

function loadUser() {
  S.chats = db.get(K.CHATS(S.user), {});
  S.msgs  = db.get(K.MSGS(S.user),  {});
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function renderAuth(mode = 'login', err = '') {
  document.getElementById('root').innerHTML = `
  <div class="auth-screen">

    <!-- LEFT PANEL -->
    <div class="auth-left">
      <div class="auth-logo-big">
        ${valknutSVG(56, 'white')}
        <span>NexusChat</span>
      </div>
      <p class="auth-tagline">Fast, free AI powered by Groq. Your conversations, your history.</p>
      <div class="auth-features">
        <div class="auth-feature"><span class="auth-feature-icon">⚡</span> Ultra-fast Groq inference</div>
        <div class="auth-feature"><span class="auth-feature-icon">🔒</span> Secure login & history</div>
        <div class="auth-feature"><span class="auth-feature-icon">🛡️</span> Rate limiting built-in</div>
      </div>
    </div>

    <!-- RIGHT PANEL -->
    <div class="auth-right">
      <div class="auth-card">
        <div class="auth-card-title">${mode === 'login' ? 'Welcome back' : 'Create account'}</div>
        <div class="auth-card-sub">${mode === 'login' ? 'Sign in to continue' : 'Takes less than a minute'}</div>

        <div class="auth-tabs">
          <div class="auth-tab ${mode==='login'?'active':''}" id="tab-in">Sign in</div>
          <div class="auth-tab ${mode==='register'?'active':''}" id="tab-up">Register</div>
        </div>

        ${err ? `<div class="auth-error">⚠ ${err}</div>` : ''}

        <div class="field">
          <label>Username</label>
          <input type="text" id="au" placeholder="e.g. alex_nova" autocomplete="username"/>
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="ap" placeholder="Min. 6 characters"
            autocomplete="${mode==='login'?'current-password':'new-password'}"/>
        </div>
        ${mode === 'register' ? `
        <div class="field">
          <label>Confirm password</label>
          <input type="password" id="ap2" placeholder="Re-enter password"/>
        </div>` : ''}

        <button class="auth-btn" id="abtn">
          ${mode === 'login' ? 'Sign in →' : 'Create account →'}
        </button>
      </div>
    </div>
  </div>`;

  document.getElementById('tab-in').onclick = () => renderAuth('login');
  document.getElementById('tab-up').onclick = () => renderAuth('register');
  document.getElementById('ap').addEventListener('keydown', e => { if (e.key==='Enter') doAuth(mode); });
  document.getElementById('abtn').onclick = () => doAuth(mode);
}

function doAuth(mode) {
  const user = document.getElementById('au').value.trim();
  const pass = document.getElementById('ap').value;
  const users = db.get(K.USERS, {});

  if (!user || !pass) { renderAuth(mode, 'Please fill in all fields.'); return; }

  if (mode === 'login') {
    if (!users[user] || users[user].p !== hash(pass)) {
      renderAuth(mode, 'Wrong username or password.'); return;
    }
    startSession(user);
  } else {
    const p2 = document.getElementById('ap2')?.value;
    if (pass !== p2)      { renderAuth(mode, 'Passwords do not match.'); return; }
    if (user.length < 3)  { renderAuth(mode, 'Username needs 3+ characters.'); return; }
    if (pass.length < 6)  { renderAuth(mode, 'Password needs 6+ characters.'); return; }
    if (users[user])      { renderAuth(mode, 'Username already taken.'); return; }
    users[user] = { p: hash(pass), created: Date.now() };
    db.set(K.USERS, users);
    startSession(user);
  }
}

function startSession(user) {
  S.user = user;
  loadUser();
  renderApp();
  toast(`Welcome, ${user}!`, 'ok');
}

function signOut() {
  S = { user:null, chatId:null, chats:{}, msgs:{}, loading:false, lastMsg:'', rates:[], drawerOpen:false, menuOpen:false };
  renderAuth();
}

/* ══════════════════════════════════════
   APP SHELL
══════════════════════════════════════ */
function renderApp() {
  document.getElementById('root').innerHTML = `
  <div class="app" id="app">

    <!-- DRAWER OVERLAY -->
    <div class="drawer-overlay" id="overlay"></div>

    <!-- HISTORY DRAWER -->
    <div class="drawer" id="drawer">
      <div class="drawer-head">
        <span class="drawer-title">Chat history</span>
        <button class="drawer-close" id="drawer-close">✕</button>
      </div>
      <button class="drawer-new" id="drawer-new">＋ New conversation</button>
      <div class="drawer-list" id="drawer-list"></div>
    </div>

    <!-- TOP BAR -->
    <div class="topbar">
      <div class="topbar-left">
        <button style="background:transparent;border:none;cursor:pointer;padding:4px;color:#666;font-size:18px;line-height:1;" id="menu-btn" title="History">☰</button>
        ${valknutSVG(24, 'white')}
        <span class="brand-name">NexusChat</span>
      </div>
      <div class="topbar-right">
        <div class="rl-wrap">
          <div class="rl-track"><div class="rl-fill ok" id="rl-fill" style="width:0%"></div></div>
          <span class="rl-text" id="rl-text">0/${CFG.RATE_LIMIT}</span>
        </div>
        <span class="model-pill">llama-3.1-8b-instant</span>
        <div class="user-avatar" id="avatar-btn">
          ${S.user[0].toUpperCase()}
          <div class="user-menu" id="user-menu">
            <div class="user-menu-item" style="font-size:12px;color:#444;padding-bottom:4px;border-bottom:1px solid #1e1e1e;margin-bottom:4px;cursor:default;">${S.user}</div>
            <div class="user-menu-item danger" id="signout-btn">Sign out</div>
          </div>
        </div>
      </div>
    </div>

    <!-- MESSAGES -->
    <div class="messages-wrap" id="msgs-wrap">
      <div class="messages-inner" id="msgs"></div>
    </div>

    <!-- INPUT -->
    <div class="input-area">
      <div class="input-inner">
        <div id="rl-warn"></div>
        <div class="input-shell">
          <textarea id="input" placeholder="Ask anything…" rows="1"></textarea>
          <button class="send-btn" id="send-btn">↑</button>
        </div>
        <div class="input-footer">
          <span class="char-count" id="char-count">0 / ${CFG.MAX_CHARS}</span>
          <span class="input-hint">Enter to send · Shift+Enter new line</span>
        </div>
      </div>
    </div>

  </div>`;

  /* Wire events */
  document.getElementById('menu-btn').onclick    = toggleDrawer;
  document.getElementById('overlay').onclick     = closeDrawer;
  document.getElementById('drawer-close').onclick= closeDrawer;
  document.getElementById('drawer-new').onclick  = () => { newChat(); closeDrawer(); };
  document.getElementById('avatar-btn').onclick  = e => { e.stopPropagation(); toggleMenu(); };
  document.getElementById('signout-btn').onclick = signOut;
  document.getElementById('send-btn').onclick    = sendMsg;
  document.addEventListener('click', () => { if (S.menuOpen) closeMenu(); }, { once: false });

  const ta = document.getElementById('input');
  ta.addEventListener('input', () => {
    document.getElementById('char-count').textContent = `${ta.value.length} / ${CFG.MAX_CHARS}`;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });

  renderDrawer();
  updateRateBar();

  /* Load most recent chat or show welcome */
  const sorted = Object.keys(S.chats).sort((a,b) => S.chats[b].u - S.chats[a].u);
  if (sorted.length) loadChat(sorted[0]);
  else renderMessages();
}

/* ── DRAWER ──────────────────────────── */
function toggleDrawer() {
  S.drawerOpen = !S.drawerOpen;
  document.getElementById('drawer').classList.toggle('open', S.drawerOpen);
  document.getElementById('overlay').classList.toggle('open', S.drawerOpen);
}

function closeDrawer() {
  S.drawerOpen = false;
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

function toggleMenu() {
  S.menuOpen = !S.menuOpen;
  document.getElementById('user-menu').classList.toggle('open', S.menuOpen);
}

function closeMenu() {
  S.menuOpen = false;
  document.getElementById('user-menu')?.classList.remove('open');
}

function renderDrawer() {
  const list = document.getElementById('drawer-list');
  if (!list) return;

  const sorted = Object.keys(S.chats).sort((a,b) => S.chats[b].u - S.chats[a].u);
  if (!sorted.length) {
    list.innerHTML = `<div class="no-chats">No chats yet.<br/>Start a new conversation!</div>`;
    return;
  }

  /* Group by date */
  const groups = {};
  sorted.forEach(id => {
    const label = fmtDate(S.chats[id].u);
    if (!groups[label]) groups[label] = [];
    groups[label].push(id);
  });

  list.innerHTML = Object.entries(groups).map(([label, ids]) => `
    <div class="drawer-section-label">${label}</div>
    ${ids.map(id => `
      <div class="chat-row ${id === S.chatId ? 'active' : ''}" data-id="${id}">
        <div class="chat-row-content">
          <div class="chat-row-title">${S.chats[id].title || 'New conversation'}</div>
        </div>
        <button class="chat-row-del" data-del="${id}">✕</button>
      </div>`).join('')}
  `).join('');

  list.querySelectorAll('.chat-row').forEach(el => {
    el.onclick = e => {
      if (e.target.closest('[data-del]')) return;
      loadChat(el.dataset.id);
      closeDrawer();
    };
  });

  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (confirm('Delete this chat?')) deleteChat(btn.dataset.del);
    };
  });
}

/* ── CHAT MANAGEMENT ─────────────────── */
function newChat() {
  const id = uid();
  S.chats[id] = { title: 'New conversation', c: Date.now(), u: Date.now() };
  S.msgs[id]  = [];
  saveChats(); saveMsgs();
  loadChat(id);
}

function loadChat(id) {
  S.chatId = id;
  if (!S.msgs[id]) S.msgs[id] = [];
  renderDrawer();
  renderMessages();
}

function deleteChat(id) {
  delete S.chats[id];
  delete S.msgs[id];
  saveChats(); saveMsgs();
  if (S.chatId === id) {
    const rem = Object.keys(S.chats).sort((a,b) => S.chats[b].u - S.chats[a].u);
    S.chatId = rem[0] || null;
  }
  renderDrawer();
  renderMessages();
}

/* ── MESSAGES ────────────────────────── */
function renderMessages() {
  const area = document.getElementById('msgs');
  if (!area) return;

  const list = S.chatId ? (S.msgs[S.chatId] || []) : [];

  if (!list.length) {
    area.innerHTML = `
      <div class="welcome">
        <div class="welcome-logo">${valknutSVG(52, 'white')}</div>
        <div class="welcome-title">How can I help?</div>
        <div class="welcome-sub">Powered by Groq — fast, free AI responses.</div>
        <div class="suggestions">
          <button class="suggestion" onclick="suggest('Explain machine learning simply')">Explain machine learning</button>
          <button class="suggestion" onclick="suggest('Write a Python function to sort a list')">Python snippet</button>
          <button class="suggestion" onclick="suggest('Give me 5 startup ideas for 2025')">Startup ideas</button>
          <button class="suggestion" onclick="suggest('What are REST API best practices?')">REST API tips</button>
          <button class="suggestion" onclick="suggest('How does quantum computing work?')">Quantum computing</button>
          <button class="suggestion" onclick="suggest('Write a short motivational quote')">Motivational quote</button>
        </div>
      </div>`;
    return;
  }

  area.innerHTML = list.map(m => {
    if (m.role === 'error') return `
      <div class="error-row">
        ⚠ ${esc(m.content)}
        <button class="retry-btn" onclick="retry()">↺ Retry</button>
      </div>`;

    if (m.role === 'user') return `
      <div class="msg user">
        <div class="user-bubble">${esc(m.content)}</div>
        <div class="msg-time">${fmtTime(m.ts)}</div>
      </div>`;

    return `
      <div class="msg assistant">
        <div class="msg-row">
          <div class="msg-icon">${valknutSVG(26, 'white')}</div>
          <div class="msg-body">
            <div class="msg-name">NexusAI</div>
            <div class="msg-text">${md(m.content)}</div>
            <div class="msg-time">${fmtTime(m.ts)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  /* Thinking indicator */
  if (S.loading) {
    area.innerHTML += `
      <div class="msg assistant">
        <div class="msg-row">
          <div class="msg-icon thinking">${valknutSVG(26, 'white')}</div>
          <div class="msg-body">
            <div class="msg-name">NexusAI <span class="thinking-label">· thinking…</span></div>
            <div class="typing-dots">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  const wrap = document.getElementById('msgs-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

/* ── RATE BAR ────────────────────────── */
function updateRateBar() {
  const { used, pct } = getRates();
  const fill = document.getElementById('rl-fill');
  const text = document.getElementById('rl-text');
  const warn = document.getElementById('rl-warn');
  if (!fill) return;

  fill.style.width = (pct * 100) + '%';
  fill.className = 'rl-fill ' + (pct < 0.6 ? 'ok' : pct < 0.9 ? 'warn' : 'full');
  text.textContent = `${used}/${CFG.RATE_LIMIT}`;

  if (pct >= 1)    warn.innerHTML = `<div class="rl-warning">⚠ Rate limit reached. Wait a moment before sending more messages.</div>`;
  else if (pct >= 0.75) warn.innerHTML = `<div class="rl-warning">⚠ Approaching rate limit (${used}/${CFG.RATE_LIMIT} per minute).</div>`;
  else warn.innerHTML = '';
}

/* ── SEND ────────────────────────────── */
async function sendMsg() {
  const ta   = document.getElementById('input');
  const text = ta.value.trim();
  if (!text || S.loading) return;

  /* Guard checks */
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
    toast('Paste your Groq API key in app.js line 16!', 'err'); return;
  }
  if (text.length > CFG.MAX_CHARS) {
    toast(`Too long — max ${CFG.MAX_CHARS} chars.`, 'err'); return;
  }
  if (!getRates().ok) {
    toast('Rate limit reached. Wait a moment.', 'err'); return;
  }

  if (!S.chatId) newChat();

  /* Clear input */
  ta.value = '';
  ta.style.height = 'auto';
  document.getElementById('char-count').textContent = `0 / ${CFG.MAX_CHARS}`;

  /* Add message, strip previous errors */
  S.msgs[S.chatId] = (S.msgs[S.chatId] || []).filter(m => m.role !== 'error');
  S.msgs[S.chatId].push({ role:'user', content:text, ts:Date.now() });

  /* Auto-title from first message */
  if (S.msgs[S.chatId].length === 1) {
    S.chats[S.chatId].title = text.slice(0, 48) + (text.length > 48 ? '…' : '');
  }
  S.chats[S.chatId].u = Date.now();

  saveChats(); saveMsgs();
  S.rates.push(Date.now());
  updateRateBar();
  renderMessages();
  renderDrawer();

  await callGroq(text);
}

/* ── GROQ API ────────────────────────── */
async function callGroq(userText) {
  S.lastMsg  = userText;
  S.loading  = true;
  renderMessages();

  const btn = document.getElementById('send-btn');
  if (btn) btn.disabled = true;

  try {
    const history = (S.msgs[S.chatId] || [])
      .filter(m => m.role !== 'error')
      .slice(-CFG.MAX_HIST)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch(CFG.URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:      CFG.MODEL,
        max_tokens: CFG.MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: `You are NexusAI, a helpful and intelligent AI assistant inside NexusChat.
Be concise, clear, and friendly. Use markdown for code blocks and formatting.
The user's name is ${S.user}.`,
          },
          ...history,
        ],
      }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw Object.assign(new Error(e.error?.message || `HTTP ${res.status}`), { status: res.status });
    }

    const data  = await res.json();
    const reply = data.choices?.[0]?.message?.content || '(no response)';

    S.msgs[S.chatId].push({ role:'assistant', content:reply, ts:Date.now() });
    S.chats[S.chatId].u = Date.now();
    saveChats(); saveMsgs();

  } catch (err) {
    let msg = 'Something went wrong. Please try again.';
    if (err.status === 401)     msg = 'Invalid API key. Check your Groq key in app.js.';
    else if (err.status === 429) msg = 'Groq rate limit hit. Wait a moment.';
    else if (err.status === 503) msg = 'Groq is temporarily unavailable. Try again soon.';
    else if (!navigator.onLine) msg = 'No internet connection.';
    else if (err.message)       msg = err.message;

    S.msgs[S.chatId].push({ role:'error', content:msg, ts:Date.now() });
    saveMsgs();
    toast('Error: ' + msg.slice(0, 55), 'err');

  } finally {
    S.loading = false;
    const b = document.getElementById('send-btn');
    if (b) b.disabled = false;
    renderMessages();
    updateRateBar();
    renderDrawer();
  }
}

/* ── GLOBAL HELPERS ──────────────────── */
window.suggest = text => {
  if (!S.chatId) newChat();
  const ta = document.getElementById('input');
  if (ta) { ta.value = text; ta.dispatchEvent(new Event('input')); }
  sendMsg();
};

window.retry = () => {
  if (!S.chatId || !S.lastMsg) return;
  S.msgs[S.chatId] = S.msgs[S.chatId].filter(m => m.role !== 'error');
  saveMsgs();
  callGroq(S.lastMsg);
};

/* ── BOOT ────────────────────────────── */
renderAuth();
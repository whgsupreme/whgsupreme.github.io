/* ===== js/1-theme.js ===== */
// ---------- 主题切换 ----------
const root = document.documentElement;
document.getElementById('theme-btn').onclick = () => {
  root.dataset.theme = localStorage.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
};

/* ===== js/2-login.js ===== */
// ---------- 解密 ----------
const SITE = location.host;
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const getKey = () => sessionStorage.siteKey || localStorage.siteKey;

async function aesKey(raw) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}
async function decrypt(enc, key) {
  const [iv, ct] = enc.split('.').map(unb64);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
}
const decryptText = async (enc) => new TextDecoder().decode(await decrypt(enc, await aesKey(unb64(getKey()))));

async function sha256hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function login(user, pass, remember) {
  const auth = await fetch('/auth.json').then((r) => r.json());
  const siteTitle = document.body.dataset.site;
  const entry = auth.users[await sha256hex(`${siteTitle}:${user}`)];
  if (!entry) throw new Error('账号或密码错误');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(entry.salt), iterations: auth.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let raw;
  try { raw = await decrypt(entry.key, kek); } catch { throw new Error('账号或密码错误'); }
  (remember ? localStorage : sessionStorage).siteKey = b64(raw);
}

function logout() {
  delete localStorage.siteKey;
  delete sessionStorage.siteKey;
  location.reload();
}

async function unlock() {
  const locked = document.getElementById('locked');
  if (!locked) return init(); // 未开启登录 / 公开页面
  if (!getKey()) return showLogin();
  try {
    const html = await decryptText(locked.dataset.enc);
    document.getElementById('login').remove();
    locked.outerHTML = html;
    document.body.classList.remove('locked');
    document.body.classList.add('unlocking');
    const h1 = document.querySelector('main h1');
    if (h1 && location.pathname !== '/') document.title = `${h1.textContent} · ${document.title}`;
    init();
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch {
    // 密码已更换，旧的记住状态失效
    delete localStorage.siteKey;
    delete sessionStorage.siteKey;
    root.classList.remove('has-key');
    showLogin();
  }
}

function showLogin() {
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-err');
  form.user.focus();
  const eye = document.getElementById('toggle-pass');
  eye.onclick = () => {
    const show = form.pass.type === 'password';
    form.pass.type = show ? 'text' : 'password';
    eye.classList.toggle('on', show);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.firstElementChild.textContent = '验证中…';
    err.textContent = '';
    try {
      await login(form.user.value.trim(), form.pass.value, form.remember.checked);
      await unlock();
    } catch (ex) {
      err.textContent = ex.message || '登录失败';
      form.pass.value = '';
      form.pass.focus();
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
    } finally {
      btn.disabled = false;
      btn.firstElementChild.textContent = '登 录';
    }
  };
}

document.getElementById('logout-btn')?.addEventListener('click', logout);

/* ===== js/3-page.js ===== */
// ---------- 页面功能（解锁后初始化） ----------
function init() {
  // 问候语
  const greet = document.getElementById('greet');
  if (greet) {
    const h = new Date().getHours();
    greet.textContent = h < 5 ? '🌙 夜深了，注意休息' : h < 11 ? '☀️ 早上好' : h < 13 ? '🍱 中午好' : h < 18 ? '☕ 下午好' : '🌙 晚上好';
  }
  document.getElementById('hero-search')?.addEventListener('click', open);
  if (installEvt) document.getElementById('install-btn')?.removeAttribute('hidden');

  // 加密图片：登录后解密显示
  document.querySelectorAll('img[data-enc-src]').forEach(async (img) => {
    try {
      const enc = await fetch(img.dataset.encSrc).then((r) => r.text());
      const [iv, ct] = enc.split('.').map(unb64);
      const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(unb64(getKey())), ct);
      img.src = URL.createObjectURL(new Blob([buf], { type: img.dataset.type }));
    } catch { img.alt = '图片加载失败'; }
  });

  // 阅读进度条
  const bar = document.getElementById('progress');
  if (bar) {
    const upd = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    };
    addEventListener('scroll', upd, { passive: true });
    upd();
  }

  // 图片点击放大
  const lb = document.getElementById('lightbox');
  document.querySelectorAll('.prose img').forEach((img) => {
    img.onclick = () => {
      lb.innerHTML = `<img src="${img.src}" alt="">`;
      lb.hidden = false;
      requestAnimationFrame(() => lb.classList.add('show'));
    };
  });
  lb.onclick = () => { lb.classList.remove('show'); setTimeout(() => (lb.hidden = true), 200); };

  // 回到顶部
  const top = document.getElementById('to-top');
  const onScroll = () => top.classList.toggle('show', scrollY > 600);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  top.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

  // 标题 # 链接：点击复制本节地址
  document.querySelectorAll('.prose .anchor').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      history.replaceState(null, '', a.getAttribute('href'));
      a.closest('h2, h3').scrollIntoView({ behavior: 'smooth' });
      navigator.clipboard?.writeText(location.href).then(() => toast('已复制本节链接'));
    };
  });

  // 记录最近浏览（搜索框为空时显示）
  const h1 = document.querySelector('.post-hero h1');
  if (h1) {
    const recent = JSON.parse(localStorage.recent || '[]').filter((r) => r.url !== location.pathname);
    recent.unshift({ url: location.pathname, title: h1.textContent });
    localStorage.recent = JSON.stringify(recent.slice(0, 6));
  }

  initFeatures(); // 收藏、阅读位置、搜索高亮等，见 6-features.js

  // 代码复制
  document.querySelectorAll('.code .copy').forEach((btn) => {
    btn.onclick = async () => {
      await navigator.clipboard.writeText(btn.closest('.code').querySelector('code').innerText);
      btn.textContent = '已复制 ✓';
      setTimeout(() => (btn.textContent = '复制'), 1500);
    };
  });

  // 目录高亮
  const tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) tocLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    document.querySelectorAll('.prose h2, .prose h3').forEach((h) => obs.observe(h));
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

/* ===== js/4-search.js ===== */
// ---------- 搜索 ----------
const box = document.getElementById('search');
const input = document.getElementById('search-input');
const list = document.getElementById('search-results');
let index = null, active = 0;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hl = (s, words) => words.reduce((acc, w) => acc.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'), esc(s));

async function loadIndex() {
  const data = await fetch('/search.json').then((r) => r.json());
  return data.enc ? JSON.parse(await decryptText(data.enc)) : data;
}

async function open() {
  if (document.getElementById('login')) return document.querySelector('#login-form input')?.focus(); // 未登录不能搜索
  box.classList.remove('hidden');
  input.focus();
  input.select();
  index ||= await loadIndex();
  render();
}
const close = () => box.classList.add('hidden');

function render() {
  const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  active = 0;
  if (!words.length) {
    const recent = JSON.parse(localStorage.recent || '[]');
    const fav = JSON.parse(localStorage.favs || '[]');
    const items = recent.length ? recent : index.slice(0, 6).map((p) => ({ url: `/posts/${p.slug}/`, title: p.title }));
    const group = (name, arr) => (arr.length ? `<li class="group">${name}</li>` + arr.map((r) => `<li><a href="${r.url}"><b>${esc(r.title)}</b></a></li>`).join('') : '');
    list.innerHTML = group('⭐ 收藏', fav) + group(recent.length ? '最近浏览' : '最新文章', items.filter((r) => !fav.some((f) => f.url === r.url)));
    list.querySelector('li:not(.group)')?.classList.add('active');
    return;
  }
  const results = [];
  for (const p of index) {
    const full = p.sections.map((s) => s.title + ' ' + s.text).join(' ').toLowerCase();
    const title = p.title.toLowerCase(), tags = (p.tags.join(' ') + ' ' + (p.cat || '')).toLowerCase(), desc = p.description.toLowerCase();
    let score = 0;
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (tags.includes(w) ? 5 : 0) + (desc.includes(w) ? 3 : 0) + (full.includes(w) ? 1 : 0);
      if (!s) { score = 0; break; }
      score += s;
    }
    if (!score) continue;
    // 找到最匹配的小节，直接跳过去
    let best = null, bestScore = 0;
    for (const s of p.sections) {
      const st = s.title.toLowerCase(), tx = s.text.toLowerCase();
      const sc = words.reduce((a, w) => a + (st.includes(w) ? 3 : 0) + (tx.includes(w) ? 1 : 0), 0);
      if (sc > bestScore) { best = s; bestScore = sc; }
    }
    let snip = p.description;
    if (best) {
      const tx = best.text, pos = tx.toLowerCase().indexOf(words.find((w) => tx.toLowerCase().includes(w)) ?? '\0');
      if (pos >= 0) snip = (pos > 30 ? '…' : '') + tx.slice(Math.max(0, pos - 30), pos + 80);
      else if (tx) snip = tx.slice(0, 100);
    }
    results.push({ p, score, snip, sec: best?.id ? best : null });
  }
  results.sort((a, b) => b.score - a.score);
  list.innerHTML = results.length
    ? `<li class="group">找到 ${results.length} 篇</li>` + results.map(({ p, snip, sec }, i) => `<li class="${i === 0 ? 'active' : ''}"><a href="/posts/${p.slug}/?q=${encodeURIComponent(input.value.trim())}${sec ? '#' + encodeURIComponent(sec.id) : ''}"><b>${hl(p.title, words)}</b>${sec ? `<em>› ${hl(sec.title, words)}</em>` : ''}<span>${hl(snip || '', words)}</span><small>${p.cat ? esc(p.cat) + ' · ' : ''}${p.date} ${p.tags.map((t) => '#' + esc(t)).join(' ')}</small></a></li>`).join('')
    : '<li class="empty">没有找到相关内容<br><small>换个关键词试试，多个词用空格分开</small></li>';
}

function move(d) {
  const items = list.querySelectorAll('li a');
  if (!items.length) return;
  items[active]?.parentElement.classList.remove('active');
  active = (active + d + items.length) % items.length;
  items[active].parentElement.classList.add('active');
  items[active].scrollIntoView({ block: 'nearest' });
}

document.getElementById('search-btn').onclick = open;
box.onclick = (e) => e.target === box && close();
input.oninput = render;
input.onkeydown = (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'Enter' && e.isComposing) return; // 中文输入法选词时的回车不触发打开
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter') list.querySelectorAll('li a')[active]?.click();
  else if (e.key === 'Escape') close();
};
// 在同一篇文章内跳到小节时，关闭搜索框
list.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); open(); }
});

/* ===== js/5-pwa.js ===== */
// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  const b = document.getElementById('install-btn');
  if (b) b.hidden = false;
});
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'install-btn' || !installEvt) return;
  installEvt.prompt();
  if ((await installEvt.userChoice).outcome === 'accepted') e.target.hidden = true;
  installEvt = null;
});
addEventListener('appinstalled', () => toast('已安装到桌面 🎉'));

/* ===== js/6-features.js ===== */
// ---------- 收藏、随便看看、搜索词高亮、阅读位置、快捷键 ----------
// initFeatures() 在页面解锁后由 3-page.js 的 init() 调用

const favs = {
  get: () => JSON.parse(localStorage.favs || '[]'),
  set: (v) => (localStorage.favs = JSON.stringify(v)),
};

function initFeatures() {
  initFavButton();
  renderFavPanel();
  document.getElementById('random-btn')?.addEventListener('click', randomPost);
  highlightQuery();
  readingPosition();
}

// ⭐ 收藏：存在本机浏览器里
function initFavButton() {
  const btn = document.getElementById('fav-btn');
  if (!btn) return;
  const { url, title, cat } = btn.dataset;
  const sync = () => {
    const on = favs.get().some((f) => f.url === url);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.querySelector('.star').textContent = on ? '★' : '☆';
    btn.querySelector('.fav-text').textContent = on ? '已收藏' : '收藏';
  };
  btn.onclick = () => {
    const list = favs.get();
    const on = list.some((f) => f.url === url);
    favs.set(on ? list.filter((f) => f.url !== url) : [{ url, title, cat }, ...list]);
    sync();
    toast(on ? '已取消收藏' : '已收藏 ⭐ 首页和搜索框里可以快速找到');
  };
  sync();
}

function renderFavPanel() {
  const panel = document.getElementById('favs');
  const list = favs.get();
  if (!panel || !list.length) return;
  panel.hidden = false;
  panel.querySelector('.fav-list').innerHTML = list
    .map((f) => `<li><a href="${f.url}"><span>${esc((f.cat || '').split(' ')[0])}</span>${esc(f.title)}</a></li>`).join('');
}

// 🎲 随便看看
async function randomPost() {
  let slugs = document.getElementById('random-btn')?.dataset.slugs?.split(',');
  if (!slugs) { index ||= await loadIndex(); slugs = index.map((p) => p.slug); }
  const others = slugs.filter((s) => location.pathname !== `/posts/${s}/`);
  if (others.length) location.href = `/posts/${others[Math.floor(Math.random() * others.length)]}/`;
}

// 🔍 从搜索结果点进来时，高亮文章里的关键词
function highlightQuery() {
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  const prose = document.querySelector('.prose');
  if (!q || !prose) return;
  history.replaceState(null, '', location.pathname + location.hash); // 去掉地址栏里的 ?q=
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const has = new RegExp(re.source, 'i'); // 不带 g 的版本，避免 test() 记住上次位置漏匹配
  while (walker.nextNode()) if (has.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  let count = 0;
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    node.nodeValue.split(re).forEach((part, i) => {
      if (i % 2) { const m = document.createElement('mark'); m.className = 'hit'; m.textContent = part; frag.append(m); count++; }
      else if (part) frag.append(part);
    });
    node.replaceWith(frag);
  }
  if (!count) return;
  if (!location.hash) document.querySelector('mark.hit')?.scrollIntoView({ block: 'center' });
  toast(`找到 ${count} 处「${q}」，按 Esc 清除高亮`);
  addEventListener('keydown', function clear(e) {
    if (e.key !== 'Escape' || !document.getElementById('search').classList.contains('hidden')) return;
    document.querySelectorAll('mark.hit').forEach((m) => m.replaceWith(m.textContent));
    prose.normalize();
    removeEventListener('keydown', clear);
  });
}

// 📖 记住长文章读到哪了
function readingPosition() {
  if (!document.querySelector('.post-hero')) return;
  const key = 'pos:' + location.pathname;
  const saved = +localStorage[key] || 0;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  if (saved > 600 && !location.hash && !document.querySelector('mark.hit') && saved < maxScroll()) {
    const pill = document.createElement('button');
    pill.className = 'resume';
    pill.textContent = `📖 跳到上次读到的位置（${Math.round((saved / maxScroll()) * 100)}%）`;
    pill.onclick = () => { scrollTo({ top: saved, behavior: 'smooth' }); pill.remove(); };
    document.body.append(pill);
    setTimeout(() => pill.remove(), 8000);
  }
  let t;
  addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (scrollY > maxScroll() * 0.92) delete localStorage[key]; // 读完了就不再提示
      else if (scrollY > 300) localStorage[key] = Math.round(scrollY);
    }, 300);
  }, { passive: true });
}

// ⌨️ 快捷键
const SHORTCUTS = [
  ['/ 或 Ctrl+K', '搜索'],
  ['F', '收藏 / 取消收藏当前文章'],
  ['R', '随便看看'],
  ['T', '切换暗色 / 亮色'],
  ['H', '回到首页'],
  ['?', '显示这个快捷键列表'],
  ['Esc', '关闭弹窗 / 清除搜索高亮'],
];

function toggleHelp() {
  let el = document.getElementById('kbd-help');
  if (el) return el.remove();
  el = document.createElement('div');
  el.id = 'kbd-help';
  el.className = 'kbd-help';
  el.innerHTML = `<div class="kbd-box"><h3>⌨️ 快捷键</h3><table>${SHORTCUTS.map(([k, d]) => `<tr><td>${k.split(' 或 ').map((x) => `<kbd>${x}</kbd>`).join(' 或 ')}</td><td>${d}</td></tr>`).join('')}</table><p>在输入框里打字时快捷键不生效</p></div>`;
  el.onclick = (e) => e.target === el && el.remove();
  document.body.append(el);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (document.getElementById('login')) return; // 未登录时不响应
  const k = e.key.toLowerCase();
  if (e.key === '?') toggleHelp();
  else if (e.key === 'Escape') document.getElementById('kbd-help')?.remove();
  else if (k === 'f') document.getElementById('fav-btn')?.click();
  else if (k === 'r') randomPost();
  else if (k === 't') document.getElementById('theme-btn').click();
  else if (k === 'h') location.href = '/';
});

/* ===== js/9-start.js ===== */
// ---------- 启动（放在最后，确保上面所有功能都已加载） ----------
unlock().then(() => {
  // 桌面图标长按菜单里的「搜索笔记」
  if (new URLSearchParams(location.search).has('search') && !document.getElementById('login')) open();
});

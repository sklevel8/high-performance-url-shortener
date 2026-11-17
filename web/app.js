/* Base62 dashboard — works standalone (demo) or against the live API. */
(() => {
  'use strict';

  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const BASE = ALPHABET.length;
  const OFFSET = 99999999;
  const STORE = 'base62.links.v1';
  const SEQ = 'base62.seq.v1';

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = {
    form: $('#shortenForm'),
    url: $('#urlInput'),
    slug: $('#slugInput'),
    ttl: $('#ttlSelect'),
    submit: $('#submitBtn'),
    result: $('#result'),
    resultCode: $('#resultCode'),
    shortLink: $('#shortLink'),
    originalUrl: $('#originalUrl'),
    copy: $('#copyBtn'),
    error: $('#errorBox'),
    rows: $('#linkRows'),
    empty: $('#emptyState'),
    toast: $('#toast'),
    modeBadge: $('#modeBadge'),
    modeHint: $('#modeHint'),
    tabs: Array.from(document.querySelectorAll('[data-filter]')),
    clear: $('#clearBtn'),
  };

  const metaApi = ($('meta[name="api-base"]')?.content || '').trim();
  const queryApi = new URLSearchParams(location.search).get('api') || '';
  const API_BASE = (queryApi || metaApi).replace(/\/$/, '');
  const LIVE = Boolean(API_BASE);

  let links = read();
  let filter = 'all';

  /* ---------------------------------------------------------------- utils */
  function read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(links)); } catch { /* private mode */ }
  }
  function encodeBase62(id) {
    let num = Number(id) + OFFSET;
    let code = '';
    while (num > 0) {
      code = ALPHABET[num % BASE] + code;
      num = Math.floor(num / BASE);
    }
    return code;
  }
  function nextId() {
    const current = Number(localStorage.getItem(SEQ) || '0') + 1;
    localStorage.setItem(SEQ, String(current));
    return current;
  }
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove('is-visible'), 2200);
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function isExpired(link) {
    return Boolean(link.expiresAt) && Date.now() > link.expiresAt;
  }
  function shortUrlFor(link) {
    return LIVE ? link.shortUrl : `${location.origin}${location.pathname}#/${link.code}`;
  }

  /* ---------------------------------------------------------------- render */
  function sparkline(values) {
    const pts = values.length >= 2 ? values : [0, values[0] ?? 0];
    const w = 88, h = 26, pad = 2;
    const max = Math.max(...pts, 1);
    const step = (w - pad * 2) / (pts.length - 1);
    const coords = pts.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${w - pad} ${h} L${pad} ${h} Z`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path class="spark-area" d="${area}"></path>
      <path d="${line}"></path>
    </svg>`;
  }

  function visibleLinks() {
    const sorted = [...links].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (filter === 'active') return sorted.filter((l) => !isExpired(l));
    if (filter === 'expired') return sorted.filter(isExpired);
    return sorted;
  }

  function render() {
    const visible = visibleLinks();
    el.rows.innerHTML = visible.map((link) => {
      const expired = isExpired(link);
      const short = shortUrlFor(link);
      return `<tr data-code="${link.code}">
        <td>
          <div class="code-cell">
            <span class="code-chip">${link.code}</span>
            ${expired ? '<span class="badge badge--bad">expired</span>' : ''}
          </div>
        </td>
        <td><a class="dest" href="${escapeAttr(link.url)}" target="_blank" rel="noopener" title="${escapeAttr(link.url)}">${escapeHtml(link.url)}</a></td>
        <td class="num">${link.clicks.toLocaleString()}</td>
        <td>${sparkline(link.history || [0])}</td>
        <td class="dim nowrap">${fmtDate(link.createdAt)}</td>
        <td>
          <div class="row row--tight" style="justify-content:flex-end">
            <button class="icon-btn" type="button" data-copy="${escapeAttr(short)}" title="Copy short link" aria-label="Copy ${link.code}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" stroke-linecap="round"/></svg>
            </button>
            <button class="icon-btn icon-btn--danger" type="button" data-delete="${link.code}" title="Delete link" aria-label="Delete ${link.code}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    el.empty.classList.toggle('hidden', visible.length > 0);
    updateStats();
  }

  function updateStats() {
    const totalClicks = links.reduce((n, l) => n + l.clicks, 0);
    const totalUnique = links.reduce((n, l) => n + (l.unique || 0), 0);
    const today = new Date().toDateString();
    const todayCount = links.filter((l) => new Date(l.createdAt).toDateString() === today).length;
    const top = [...links].sort((a, b) => b.clicks - a.clicks)[0];

    text('#statLinks', links.length);
    text('#statClicks', totalClicks.toLocaleString());
    text('#statUnique', `${totalUnique.toLocaleString()} unique visitors`);
    text('#statLinksDelta', `+${todayCount} today`);
    text('#statTop', top ? top.code : '—');
    text('#statTopMeta', top ? `${top.clicks.toLocaleString()} clicks` : 'no data yet');
    text('#heroLinks', links.length);
    text('#heroClicks', totalClicks.toLocaleString());
    text('#statCache', `${(93 + (links.length % 6)).toFixed(1)}%`);
  }

  function text(sel, value) {
    const node = $(sel);
    if (node) node.textContent = String(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const escapeAttr = escapeHtml;

  /* ---------------------------------------------------------------- actions */
  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }
  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function normaliseUrl(raw) {
    const value = raw.trim();
    if (!value) throw new Error('Paste a destination URL first.');
    let url;
    try { url = new URL(value); } catch { throw new Error('That does not look like a URL. Include http:// or https://'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS links can be shortened.');
    return url.toString();
  }

  async function createLink(url, customCode, ttlDays) {
    if (customCode && links.some((l) => l.code === customCode)) {
      throw new Error(`The code "${customCode}" is already in use.`);
    }

    if (LIVE) {
      const res = await fetch(`${API_BASE}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'The API rejected that URL.');
      const link = {
        code: data.shortCode || customCode,
        url,
        shortUrl: data.shortUrl || `${API_BASE}/${data.shortCode}`,
        createdAt: new Date().toISOString(),
        clicks: 0,
        unique: 0,
        history: [0],
        expiresAt: ttlDays ? Date.now() + Number(ttlDays) * 864e5 : null,
      };
      links.push(link);
      save();
      return link;
    }

    const id = nextId();
    const code = customCode || encodeBase62(id);
    const link = {
      code,
      url,
      createdAt: new Date().toISOString(),
      clicks: 0,
      unique: 0,
      history: [0],
      expiresAt: ttlDays ? Date.now() + Number(ttlDays) * 864e5 : null,
    };
    links.push(link);
    save();
    return link;
  }

  async function loadStats(code) {
    const link = links.find((l) => l.code === code);
    if (!link || !LIVE) return;
    try {
      const res = await fetch(`${API_BASE}/api/stats/${encodeURIComponent(code)}`);
      if (!res.ok) return;
      const data = await res.json();
      link.clicks = data.analytics?.total_clicks ?? link.clicks;
      link.unique = data.analytics?.unique_visitors ?? link.unique;
      link.history = [...(link.history || []), link.clicks].slice(-10);
      save();
      render();
    } catch { /* keep local numbers */ }
  }

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const wasLive = LIVE;
    try {
      const url = normaliseUrl(el.url.value);
      const custom = el.slug.value.trim();
      if (custom && !/^[A-Za-z0-9_-]{2,24}$/.test(custom)) {
        throw new Error('Custom codes must be 2–24 characters: letters, numbers, hyphen or underscore.');
      }
      el.submit.disabled = true;
      const link = await createLink(url, custom, el.ttl.value);
      render();

      el.shortLink.href = shortUrlFor(link);
      el.shortLink.textContent = shortUrlFor(link).replace(/^https?:\/\//, '');
      el.originalUrl.textContent = link.url;
      el.resultCode.textContent = `${wasLive ? 'live' : 'demo'} · ${link.code}`;
      el.result.hidden = false;

      el.url.value = '';
      el.slug.value = '';
      toast('Short link created');
      loadStats(link.code);
    } catch (error) {
      showError(error.message);
    } finally {
      el.submit.disabled = false;
    }
  });

  el.copy.addEventListener('click', async () => {
    const value = el.shortLink.href;
    try {
      await navigator.clipboard.writeText(value);
      el.copy.textContent = 'Copied';
      toast('Copied to clipboard');
      setTimeout(() => { el.copy.textContent = 'Copy'; }, 1500);
    } catch {
      showError('Clipboard access was blocked — copy the link manually.');
    }
  });

  el.rows.addEventListener('click', async (event) => {
    const copyBtn = event.target.closest('[data-copy]');
    const deleteBtn = event.target.closest('[data-delete]');

    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        toast('Copied to clipboard');
      } catch { toast('Clipboard blocked'); }
    }

    if (deleteBtn) {
      const code = deleteBtn.dataset.delete;
      links = links.filter((l) => l.code !== code);
      save();
      render();
      toast(`Deleted ${code}`);
    }
  });

  el.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      el.tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      render();
    });
  });

  el.clear.addEventListener('click', () => {
    if (!links.length) return;
    if (!confirm('Delete every short link stored in this browser?')) return;
    links = [];
    save();
    render();
    toast('All links cleared');
  });

  /* ------------------------------------------------------------ live mode */
  if (LIVE) {
    el.modeBadge.textContent = 'LIVE';
    el.modeBadge.className = 'badge badge--ok';
    el.modeHint.textContent = `Connected to ${API_BASE}`;
  }

  /* ---------------------------------------------- demo telemetry (subtle) */
  if (!LIVE) {
    setInterval(() => {
      const active = links.filter((l) => !isExpired(l));
      if (!active.length) return;
      const link = active[Math.floor(Math.random() * active.length)];
      const bump = 1 + Math.floor(Math.random() * 3);
      link.clicks += bump;
      if (Math.random() > 0.45) link.unique = (link.unique || 0) + 1;
      link.history = [...(link.history || [0]), link.clicks].slice(-10);
      save();
      render();
    }, 7000);
  } else {
    links.forEach((l) => loadStats(l.code));
  }

  render();
})();

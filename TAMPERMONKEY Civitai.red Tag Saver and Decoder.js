// ==UserScript==
// @name         Civitai.red Tag Saver + Tag Decoder (Combined)
// @namespace    Civitai-red-Combined
// @version      2.0
// @description  Tag Saver dropdown (folders/sort/search/scroll-fix) + Tag Decoder (numbers to English badge + panel). Both in one script for civitai.red.
// @author       BAR
// @match        https://civitai.red/*
// @match        http://civitai.red/*
// @match        https://www.civitai.red/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
'use strict';
/* Single top-level guard: never run in iframes, never run twice */
try { if (window.top !== window.self) return; } catch (e) { return; }
if (window.__civitCombinedLoaded) return;
window.__civitCombinedLoaded = true;
/* Claim the legacy single-script flags too, so old installs alongside won't double-render */
window.__civitTagsaverLoaded = true;
window.__civitDecoderLoaded = true;

/* ============================================================
   MODULE 1 — TAG SAVER (v1.5: folders + sorting + scroll fix)
   Own function scope: no name clashes with decoder below.
   ============================================================ */
function initTagSaver() {
  /* (inner top-frame + singleton guards live on the outer combined wrapper) */

  const STORE_KEY = 'civitai_tag_presets_v1';
  const FOLDER_KEY = 'civitai_tag_folders_v1';
  const PREFS_KEY = 'civitai_tag_prefs_v1';
  const BTN_ID = 'civit-tagsaver-btn';
  const MENU_ID = 'civit-tagsaver-menu';
  const UNCAT = '__uncat__';

  /* ---------- storage ---------- */
  const uid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  function loadPresets() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      // migrate: add id / folderId / usage fields
      let dirty = false;
      arr.forEach(p => {
        if (!p.id) { p.id = uid(); dirty = true; }
        if (!('folderId' in p)) { p.folderId = null; dirty = true; }
        if (typeof p.usageCount !== 'number') { p.usageCount = 0; dirty = true; }
        if (!('lastUsed' in p)) { p.lastUsed = p.savedAt || null; dirty = true; }
      });
      if (dirty) { try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch {} }
      return arr;
    } catch { return []; }
  }
  function savePresets(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); }

  function loadFolders() {
    try {
      const raw = localStorage.getItem(FOLDER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(f => f && f.id && f.name) : [];
    } catch { return []; }
  }
  function saveFolders(list) { localStorage.setItem(FOLDER_KEY, JSON.stringify(list)); }

  function loadPrefs() {
    const defaults = { sortBy: 'name-asc', folderSort: 'name-asc', search: '', collapsed: {}, saveFolderId: null };
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return { ...defaults };
      const p = JSON.parse(raw);
      return { ...defaults, ...(p || {}) };
    } catch { return { ...defaults }; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
  }

  /* ---------- url helpers ---------- */
  function getCurrentTags() {
    return new URLSearchParams(location.search).get('tags') || '';
  }
  function applyTags(tagsValue, presetId) {
    if (presetId) {
      try {
        const list = loadPresets();
        const p = list.find(x => x.id === presetId);
        if (p) {
          p.usageCount = (p.usageCount || 0) + 1;
          p.lastUsed = new Date().toISOString();
          savePresets(list);
        }
      } catch {}
    }
    const url = new URL(location.href);
    if (tagsValue && tagsValue.trim()) url.searchParams.set('tags', tagsValue.trim());
    else url.searchParams.delete('tags');
    location.href = url.toString();
  }

  /* ---------- toolbar lookup ---------- */
  function findWrapper() {
    let w = document.querySelector('.-Hp08W_filtersWrapper');
    if (w) return w;
    let filtersBtn = null;
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent.trim() === 'Filters') { filtersBtn = b; break; }
    }
    if (filtersBtn) {
      let el = filtersBtn.parentElement;
      for (let i = 0; i < 5 && el; i++) {
        const kids = [...el.children].map(c => c.textContent.trim());
        if (kids.some(t => t.startsWith('Everyone'))) return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  /* ---------- ui ---------- */
  function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
    document.getElementById(BTN_ID)?.setAttribute('aria-expanded', 'false');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const SORTS = [
    { v: 'name-asc', label: 'Name A→Z' },
    { v: 'name-desc', label: 'Name Z→A' },
    { v: 'newest', label: 'Newest first' },
    { v: 'oldest', label: 'Oldest first' },
    { v: 'most-used', label: 'Most used' },
    { v: 'recent-used', label: 'Recently used' },
  ];
  const FOLDER_SORTS = [
    { v: 'name-asc', label: 'Folders A→Z' },
    { v: 'name-desc', label: 'Folders Z→A' },
    { v: 'newest', label: 'Folders newest' },
    { v: 'manual', label: 'Folders manual' },
  ];

  function sortItems(list, sortBy) {
    const a = [...list];
    switch (sortBy) {
      case 'name-desc': a.sort((x, y) => String(y.name).localeCompare(String(x.name))); break;
      case 'newest': a.sort((x, y) => new Date(y.savedAt || 0) - new Date(x.savedAt || 0)); break;
      case 'oldest': a.sort((x, y) => new Date(x.savedAt || 0) - new Date(y.savedAt || 0)); break;
      case 'most-used': a.sort((x, y) => (y.usageCount || 0) - (x.usageCount || 0) || String(x.name).localeCompare(String(y.name))); break;
      case 'recent-used': a.sort((x, y) => new Date(y.lastUsed || y.savedAt || 0) - new Date(x.lastUsed || x.savedAt || 0)); break;
      case 'name-asc':
      default: a.sort((x, y) => String(x.name).localeCompare(String(y.name))); break;
    }
    return a;
  }

  function sortFolders(folders, mode) {
    const a = [...folders];
    if (mode === 'name-desc') a.sort((x, y) => String(y.name).localeCompare(String(x.name)));
    else if (mode === 'newest') a.sort((x, y) => new Date(y.createdAt || 0) - new Date(x.createdAt || 0));
    else if (mode === 'manual') { /* keep creation order */ }
    else a.sort((x, y) => String(x.name).localeCompare(String(y.name)));
    return a;
  }

  function folderName(folders, folderId) {
    if (!folderId) return 'Uncategorized';
    return folders.find(f => f.id === folderId)?.name || 'Uncategorized';
  }

  function buildMenu(anchorBtn, opts = {}) {
    const prevScroll = opts.scrollTop ?? document.querySelector(`#${MENU_ID} [data-ts-list]`)?.scrollTop ?? 0;
    closeMenu();
    anchorBtn.setAttribute('aria-expanded', 'true');
    let presets = loadPresets();
    let folders = loadFolders();
    let prefs = loadPrefs();
    const current = getCurrentTags();
    const search = (opts.search ?? prefs.search ?? '').toLowerCase();

    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.style.cssText = [
      'position:fixed', 'z-index:99999', 'min-width:320px', 'max-width:360px',
      'max-height:min(80vh,640px)', 'display:flex', 'flex-direction:column', 'overflow:hidden',
      'background:#1f2937', 'color:#f3f4f6', 'border:1px solid #374151',
      'border-radius:12px', 'box-shadow:0 12px 32px rgba(0,0,0,.5)',
      'padding:10px', 'font-size:13px', 'font-family:inherit'
    ].join(';');
    // isolate scrolling: capture-phase, non-passive, so page gallery wheel-hijack can't steal it
    const isolateScroll = (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      const box = menu.querySelector('[data-ts-list]');
      if (box) box.scrollTop += (e.deltaY || 0) + (e.deltaX || 0);
    };
    menu.addEventListener('wheel', isolateScroll, { passive: false, capture: true });
    menu.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });

    const cur = document.createElement('div');
    cur.style.cssText = 'padding:4px 6px 8px;color:#9ca3af;word-break:break-all;';
    cur.innerHTML = `Current <b style="color:#e5e7eb">tags=</b><code style="color:#93c5fd">${current ? escapeHtml(current) : '(none — showing All)'}</code>`;
    menu.appendChild(cur);

    // --- save row: name + folder + Save ---
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    const input = document.createElement('input');
    input.placeholder = 'Name this tag set…';
    input.value = '';
    input.style.cssText = 'flex:1;min-width:0;background:#111827;border:1px solid #374151;color:#f3f4f6;border-radius:8px;padding:7px 9px;outline:none;';
    const folderPick = document.createElement('select');
    folderPick.title = 'Folder to save into';
    folderPick.style.cssText = 'max-width:120px;background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:8px;padding:7px 4px;outline:none;cursor:pointer;';
    const refillFolderPick = () => {
      folderPick.innerHTML = '';
      const o0 = document.createElement('option');
      o0.value = ''; o0.textContent = '📁 Uncategorized';
      folderPick.appendChild(o0);
      sortFolders(folders, prefs.folderSort).forEach(f => {
        const o = document.createElement('option');
        o.value = f.id; o.textContent = '📁 ' + f.name;
        folderPick.appendChild(o);
      });
      folderPick.value = prefs.saveFolderId || '';
      if (![...folderPick.options].some(o => o.value === folderPick.value)) folderPick.value = '';
    };
    refillFolderPick();
    folderPick.onchange = () => { prefs.saveFolderId = folderPick.value || null; savePrefs(prefs); };
    folderPick.onclick = e => e.stopPropagation();
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'background:#2563eb;border:none;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;white-space:nowrap;';
    const doSave = () => {
      const name = input.value.trim() || `Set ${presets.length + 1} (${current || 'All'})`;
      if (!current) { alert('No tags selected — open a tag first (URL has no ?tags=). Saving "All" is allowed.'); }
      const list = loadPresets();
      const existing = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const folderId = folderPick.value || null;
      if (existing >= 0) {
        if (!confirm(`"${name}" already exists. Overwrite it?`)) return;
        list[existing] = { ...list[existing], tags: current, savedAt: new Date().toISOString(), folderId };
      } else {
        list.push({ id: uid(), name, tags: current, savedAt: new Date().toISOString(), folderId, usageCount: 0, lastUsed: null });
      }
      savePresets(list);
      buildMenu(anchorBtn, { search });
      refreshBtnLabel();
    };
    saveBtn.onclick = doSave;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); e.stopPropagation(); });
    row.appendChild(input);
    row.appendChild(folderPick);
    row.appendChild(saveBtn);
    menu.appendChild(row);

    // --- toolbar row: search + sort + folder-sort + new folder ---
    const tools = document.createElement('div');
    tools.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    const searchInput = document.createElement('input');
    searchInput.placeholder = '🔍 Search…';
    searchInput.value = opts.search ?? prefs.search ?? '';
    searchInput.style.cssText = 'flex:1;min-width:0;background:#111827;border:1px solid #374151;color:#f3f4f6;border-radius:8px;padding:6px 9px;outline:none;';
    searchInput.onclick = e => e.stopPropagation();
    searchInput.oninput = () => {
      const q = searchInput.value;
      prefs.search = q; savePrefs(prefs);
      // live re-render but keep focus
      buildMenu(anchorBtn, { search: q, keepFocus: true });
      const el = document.querySelector(`#${MENU_ID} [data-ts-search]`);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
    searchInput.setAttribute('data-ts-search', '1');
    searchInput.addEventListener('keydown', e => e.stopPropagation());

    const sortSel = document.createElement('select');
    sortSel.title = 'Sort presets';
    sortSel.style.cssText = 'max-width:118px;background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:8px;padding:6px 4px;outline:none;cursor:pointer;';
    SORTS.forEach(s => {
      const o = document.createElement('option');
      o.value = s.v; o.textContent = s.label;
      if (prefs.sortBy === s.v) o.selected = true;
      sortSel.appendChild(o);
    });
    sortSel.onchange = () => { prefs.sortBy = sortSel.value; savePrefs(prefs); buildMenu(anchorBtn, { search }); };
    sortSel.onclick = e => e.stopPropagation();

    const newFolderBtn = document.createElement('button');
    newFolderBtn.textContent = '+ 📁';
    newFolderBtn.title = 'New folder';
    newFolderBtn.style.cssText = 'background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:8px;padding:6px 9px;cursor:pointer;white-space:nowrap;';
    newFolderBtn.onclick = (e) => {
      e.stopPropagation();
      const name = prompt('Folder name:');
      if (!name || !name.trim()) return;
      const fl = loadFolders();
      if (fl.some(f => f.name.toLowerCase() === name.trim().toLowerCase())) { alert('A folder with that name already exists.'); return; }
      fl.push({ id: uid(), name: name.trim(), createdAt: new Date().toISOString() });
      saveFolders(fl);
      buildMenu(anchorBtn, { search });
    };
    tools.appendChild(searchInput);
    tools.appendChild(sortSel);
    tools.appendChild(newFolderBtn);
    menu.appendChild(tools);

    // second row: folder sort + expand/collapse all
    const tools2 = document.createElement('div');
    tools2.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;align-items:center;';
    const fsortSel = document.createElement('select');
    fsortSel.title = 'Sort folders';
    fsortSel.style.cssText = 'background:#111827;border:1px solid #374151;color:#9ca3af;border-radius:8px;padding:5px 4px;outline:none;cursor:pointer;font-size:12px;';
    FOLDER_SORTS.forEach(s => {
      const o = document.createElement('option');
      o.value = s.v; o.textContent = s.label;
      if (prefs.folderSort === s.v) o.selected = true;
      fsortSel.appendChild(o);
    });
    fsortSel.onchange = () => { prefs.folderSort = fsortSel.value; savePrefs(prefs); buildMenu(anchorBtn, { search }); };
    fsortSel.onclick = e => e.stopPropagation();
    const counts = document.createElement('span');
    const nf = folders.length, np = presets.length;
    counts.style.cssText = 'flex:1;color:#6b7280;font-size:11px;text-align:right;';
    counts.textContent = `${np} saved · ${nf} folder${nf === 1 ? '' : 's'}`;
    const expAll = document.createElement('button');
    expAll.textContent = 'Expand';
    expAll.title = 'Expand all folders';
    expAll.style.cssText = 'background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:11px;text-decoration:underline;';
    expAll.onclick = (e) => {
      e.stopPropagation();
      prefs.collapsed = {}; savePrefs(prefs);
      buildMenu(anchorBtn, { search });
    };
    const colAll = document.createElement('button');
    colAll.textContent = 'Collapse';
    colAll.title = 'Collapse all folders';
    colAll.style.cssText = 'background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:11px;text-decoration:underline;';
    colAll.onclick = (e) => {
      e.stopPropagation();
      prefs.collapsed = prefs.collapsed || {};
      folders.forEach(f => prefs.collapsed[f.id] = true);
      prefs.collapsed[UNCAT] = true;
      savePrefs(prefs);
      buildMenu(anchorBtn, { search });
    };
    tools2.appendChild(fsortSel);
    tools2.appendChild(counts);
    tools2.appendChild(expAll);
    tools2.appendChild(colAll);
    menu.appendChild(tools2);

    // --- preset list grouped by folder ---
    const listBox = document.createElement('div');
    listBox.setAttribute('data-ts-list', '1');
    listBox.tabIndex = 0;
    listBox.style.cssText = 'flex:1 1 auto;min-height:120px;max-height:46vh;overflow-y:scroll;overscroll-behavior:contain;touch-action:pan-y;position:relative;display:block;padding-right:2px;scrollbar-width:thin;outline:none;';
    listBox.addEventListener('wheel', (e) => {
      e.stopPropagation();
      const d = (e.deltaY || 0) + (e.deltaX || 0);
      const canUp = listBox.scrollTop > 0;
      const canDown = listBox.scrollTop + listBox.clientHeight < listBox.scrollHeight - 1;
      if ((d < 0 && canUp) || (d > 0 && canDown)) {
        if (e.cancelable) e.preventDefault();
        listBox.scrollTop += d;
      }
    }, { passive: false, capture: true });;

    const q = search.trim().toLowerCase();
    const filtered = q
      ? presets.filter(p => (p.name + ' ' + (p.tags || '') + ' ' + folderName(folders, p.folderId)).toLowerCase().includes(q))
      : presets;

    if (!presets.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#9ca3af;padding:12px 6px;text-align:center;';
      empty.textContent = 'No saved tag sets yet. Filter by a tag, then Save it here.';
      listBox.appendChild(empty);
    } else if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#9ca3af;padding:12px 6px;text-align:center;';
      empty.textContent = `No matches for "${search}".`;
      listBox.appendChild(empty);
    } else {
      const orderedFolders = [...sortFolders(folders, prefs.folderSort), { id: null, name: 'Uncategorized', _uncat: true }];
      const isSearching = !!q;
      orderedFolders.forEach(f => {
        const fid = f.id || null;
        const key = fid || UNCAT;
        let items = filtered.filter(p => (p.folderId || null) === fid);
        if (!items.length) return;
        items = sortItems(items, prefs.sortBy);
        const collapsed = !isSearching && !!(prefs.collapsed && prefs.collapsed[key]);

        const section = document.createElement('div');
        section.style.cssText = 'background:#111827;border:1px solid #2b3547;border-radius:10px;overflow:hidden;margin:0 0 8px;';;;

        // header
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:pointer;user-select:none;background:#0f1622;';
        const caret = document.createElement('span');
        caret.style.cssText = 'color:#9ca3af;width:14px;text-align:center;flex-shrink:0;';
        caret.textContent = collapsed ? '▸' : '▾';
        const title = document.createElement('span');
        title.style.cssText = 'flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        title.innerHTML = `📁 ${escapeHtml(f._uncat ? 'Uncategorized' : f.name)} <span style="color:#6b7280;font-weight:400">(${items.length})</span>`;
        head.appendChild(caret);
        head.appendChild(title);

        if (!f._uncat) {
          const rn = document.createElement('button');
          rn.textContent = '✎'; rn.title = 'Rename folder';
          rn.style.cssText = 'background:transparent;border:none;color:#9ca3af;cursor:pointer;padding:2px 5px;font-size:12px;';
          rn.onclick = (e) => {
            e.stopPropagation();
            const nn = prompt('Rename folder:', f.name);
            if (!nn || !nn.trim() || nn.trim() === f.name) return;
            const fl = loadFolders();
            if (fl.some(x => x.id !== f.id && x.name.toLowerCase() === nn.trim().toLowerCase())) { alert('A folder with that name already exists.'); return; }
            const t = fl.find(x => x.id === f.id); if (t) t.name = nn.trim();
            saveFolders(fl); buildMenu(anchorBtn, { search }); refreshBtnLabel();
          };
          const del = document.createElement('button');
          del.textContent = '✕'; del.title = 'Delete folder (keeps presets — moves them to Uncategorized)';
          del.style.cssText = 'background:transparent;border:none;color:#9ca3af;cursor:pointer;padding:2px 5px;font-size:12px;';
          del.onmouseenter = () => del.style.color = '#f87171';
          del.onmouseleave = () => del.style.color = '#9ca3af';
          del.onclick = (e) => {
            e.stopPropagation();
            if (!confirm(`Delete folder "${f.name}"?\nPresets inside move to Uncategorized (not deleted).`)) return;
            let fl = loadFolders(); fl = fl.filter(x => x.id !== f.id); saveFolders(fl);
            const pl = loadPresets();
            pl.forEach(p => { if (p.folderId === f.id) p.folderId = null; });
            savePresets(pl);
            prefs.collapsed = prefs.collapsed || {}; delete prefs.collapsed[f.id]; savePrefs(prefs);
            buildMenu(anchorBtn, { search }); refreshBtnLabel();
          };
          head.appendChild(rn);
          head.appendChild(del);
        }
        head.onclick = () => {
          prefs.collapsed = prefs.collapsed || {};
          prefs.collapsed[key] = !collapsed;
          savePrefs(prefs);
          buildMenu(anchorBtn, { search });
        };
        section.appendChild(head);

        if (!collapsed) {
          const body = document.createElement('div');
          body.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px;';
          items.forEach(p => body.appendChild(renderItem(p)));
          section.appendChild(body);
        }
        listBox.appendChild(section);
      });
    }
    menu.appendChild(listBox);

    function renderItem(p) {
      const item = document.createElement('div');
      const active = p.tags === current;
      item.style.cssText = `display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:8px;cursor:pointer;border:1px solid ${active ? '#2563eb' : 'transparent'};background:${active ? '#1e3a8a55' : '#1f2937'};`;
      item.title = `Load tags=${p.tags || '(none)'}`;

      const label = document.createElement('span');
      label.style.cssText = 'flex:1;min-width:0;overflow:hidden;';
      const used = p.usageCount ? ` · ▶${p.usageCount}` : '';
      label.innerHTML = `<b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</b><code style="color:#93c5fd;font-size:11px;word-break:break-all;">${escapeHtml(p.tags || '(All)')}</code><span style="color:#6b7280;font-size:10px;">${escapeHtml(folderName(folders, p.folderId))}${escapeHtml(used)}</span>`;

      const load = document.createElement('button');
      load.textContent = 'Load';
      load.style.cssText = 'background:#374151;border:none;color:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font-weight:600;flex-shrink:0;';
      load.onclick = (e) => { e.stopPropagation(); applyTags(p.tags, p.id); };

      const edit = document.createElement('button');
      edit.textContent = '✎'; edit.title = 'Rename / move to folder / edit tags';
      edit.style.cssText = 'background:transparent;border:none;color:#9ca3af;border-radius:6px;padding:5px 6px;cursor:pointer;flex-shrink:0;';
      edit.onclick = (e) => {
        e.stopPropagation();
        openEditor(item, p);
      };

      const del = document.createElement('button');
      del.textContent = '✕'; del.title = 'Delete';
      del.style.cssText = 'background:transparent;border:none;color:#9ca3af;border-radius:6px;padding:5px 8px;cursor:pointer;flex-shrink:0;';
      del.onmouseenter = () => del.style.color = '#f87171';
      del.onmouseleave = () => del.style.color = '#9ca3af';
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${p.name}"?`)) return;
        const list = loadPresets().filter(x => x.id !== p.id);
        savePresets(list);
        buildMenu(anchorBtn, { search }); refreshBtnLabel();
      };

      item.onclick = () => applyTags(p.tags, p.id);
      item.appendChild(label);
      item.appendChild(load);
      item.appendChild(edit);
      item.appendChild(del);
      return item;
    }

    function openEditor(itemEl, p) {
      itemEl.innerHTML = '';
      itemEl.style.cursor = 'default';
      itemEl.onclick = null;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:6px;min-width:0;';
      const nameIn = document.createElement('input');
      nameIn.value = p.name;
      nameIn.style.cssText = 'background:#0b1220;border:1px solid #374151;color:#fff;border-radius:6px;padding:6px 8px;outline:none;width:100%;box-sizing:border-box;';
      nameIn.onclick = e => e.stopPropagation();
      const tagsIn = document.createElement('input');
      tagsIn.value = p.tags || '';
      tagsIn.placeholder = 'tags (comma/space separated ids)';
      tagsIn.style.cssText = 'background:#0b1220;border:1px solid #374151;color:#93c5fd;border-radius:6px;padding:6px 8px;outline:none;width:100%;box-sizing:border-box;font-family:monospace;font-size:11px;';
      tagsIn.onclick = e => e.stopPropagation();
      const fsel = document.createElement('select');
      fsel.style.cssText = 'background:#0b1220;border:1px solid #374151;color:#e5e7eb;border-radius:6px;padding:6px;outline:none;cursor:pointer;';
      fsel.onclick = e => e.stopPropagation();
      const o0 = document.createElement('option');
      o0.value = ''; o0.textContent = '📁 Uncategorized';
      fsel.appendChild(o0);
      sortFolders(loadFolders(), loadPrefs().folderSort).forEach(f => {
        const o = document.createElement('option');
        o.value = f.id; o.textContent = '📁 ' + f.name;
        fsel.appendChild(o);
      });
      fsel.value = p.folderId || '';
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;';
      const ok = document.createElement('button');
      ok.textContent = 'Save';
      ok.style.cssText = 'flex:1;background:#2563eb;border:none;color:#fff;border-radius:6px;padding:6px;cursor:pointer;font-weight:700;';
      ok.onclick = (e) => {
        e.stopPropagation();
        const nn = nameIn.value.trim();
        if (!nn) { alert('Name cannot be empty.'); return; }
        const list = loadPresets();
        if (list.some(x => x.id !== p.id && x.name.toLowerCase() === nn.toLowerCase())) { alert('Another preset already uses that name.'); return; }
        const t = list.find(x => x.id === p.id);
        if (t) { t.name = nn; t.tags = tagsIn.value.trim(); t.folderId = fsel.value || null; }
        savePresets(list);
        buildMenu(anchorBtn, { search }); refreshBtnLabel();
      };
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'flex:1;background:#374151;border:none;color:#fff;border-radius:6px;padding:6px;cursor:pointer;';
      cancel.onclick = (e) => { e.stopPropagation(); buildMenu(anchorBtn, { search }); };
      [nameIn, tagsIn].forEach(el => el.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') ok.click();
        if (e.key === 'Escape') buildMenu(anchorBtn, { search });
      }));
      btnRow.appendChild(ok);
      btnRow.appendChild(cancel);
      wrap.appendChild(nameIn);
      wrap.appendChild(tagsIn);
      wrap.appendChild(fsel);
      wrap.appendChild(btnRow);
      itemEl.appendChild(wrap);
      nameIn.focus(); nameIn.select();
    }

    // footer: clear + export/import
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:6px;margin-top:8px;align-items:center;';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear tags (All)';
    clearBtn.style.cssText = 'flex:1;background:#374151;border:none;color:#fff;border-radius:8px;padding:6px;cursor:pointer;';
    clearBtn.onclick = () => applyTags('');
    const expBtn = document.createElement('button');
    expBtn.textContent = '⤓';
    expBtn.title = 'Export JSON (presets + folders)';
    expBtn.style.cssText = 'background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:8px;padding:6px 9px;cursor:pointer;';
    expBtn.onclick = () => {
      const payload = JSON.stringify({ app: 'civitai-tag-saver', version: 2, exportedAt: new Date().toISOString(), presets: loadPresets(), folders: loadFolders(), prefs: { sortBy: loadPrefs().sortBy, folderSort: loadPrefs().folderSort } }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'civitai-tag-presets.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const impLabel = document.createElement('label');
    impLabel.textContent = '⤒';
    impLabel.title = 'Import JSON (supports old v1 array format too)';
    impLabel.style.cssText = 'background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:8px;padding:6px 9px;cursor:pointer;';
    const impFile = document.createElement('input');
    impFile.type = 'file'; impFile.accept = '.json,application/json'; impFile.style.display = 'none';
    impFile.onchange = () => {
      const f = impFile.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          let arr, fl = null;
          if (Array.isArray(data)) { arr = data; } // v1 legacy
          else if (data && Array.isArray(data.presets)) { arr = data.presets; fl = data.folders; }
          else throw 0;
          if (!arr.every(x => x && typeof x.name === 'string')) throw 0;
          const mode = confirm('Replace everything? OK = Replace, Cancel = Merge with existing.') ? 'replace' : 'merge';
          if (mode === 'replace') {
            savePresets(arr.map(x => ({ id: x.id || uid(), name: x.name, tags: x.tags || '', savedAt: x.savedAt || new Date().toISOString(), folderId: x.folderId || null, usageCount: x.usageCount || 0, lastUsed: x.lastUsed || null })));
            if (Array.isArray(fl)) saveFolders(fl.filter(x => x && x.id && x.name));
          } else {
            const cur = loadPresets();
            const names = new Set(cur.map(x => x.name.toLowerCase()));
            arr.forEach(x => {
              if (!names.has(String(x.name).toLowerCase())) {
                cur.push({ id: x.id || uid(), name: x.name, tags: x.tags || '', savedAt: x.savedAt || new Date().toISOString(), folderId: x.folderId || null, usageCount: x.usageCount || 0, lastUsed: x.lastUsed || null });
              }
            });
            savePresets(cur);
            if (Array.isArray(fl)) {
              const cf = loadFolders();
              const fn = new Set(cf.map(x => x.name.toLowerCase()));
              fl.forEach(x => { if (x && x.name && !fn.has(String(x.name).toLowerCase())) cf.push({ id: x.id || uid(), name: x.name, createdAt: x.createdAt || new Date().toISOString() }); });
              saveFolders(cf);
            }
          }
          buildMenu(anchorBtn, { search }); refreshBtnLabel();
        } catch { alert('Invalid preset JSON file.'); }
      };
      r.readAsText(f);
    };
    impLabel.appendChild(impFile);
    foot.appendChild(clearBtn);
    foot.appendChild(expBtn);
    foot.appendChild(impLabel);
    foot.style.flexShrink = '0';
    menu.appendChild(foot);
    // restore scroll (search typing resets to top, other re-renders keep position)
    try { listBox.scrollTop = opts.keepFocus ? 0 : prevScroll; } catch {}

    // position under button (fixed => viewport coords, stays put on page scroll)
    const r = anchorBtn.getBoundingClientRect();
    const menuW = 360;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
    const top = Math.min(r.bottom + 8, Math.max(8, window.innerHeight - 200));
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    document.body.appendChild(menu);
    // clamp list height to what actually fits on screen
    try {
      const avail = window.innerHeight - menu.getBoundingClientRect().top - 16;
      const footH = foot.getBoundingClientRect().height || 40;
      listBox.style.maxHeight = Math.max(140, Math.min(460, avail - footH - 150)) + 'px';
    } catch {}

    if (!opts.keepFocus) {
      const si = menu.querySelector('[data-ts-search]');
      // don't steal focus on open — only after user types (handled above)
    }

    setTimeout(() => document.addEventListener('click', outside, { once: true }), 0);
    function outside(e) {
      if (!menu.isConnected) return;
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) {
        document.addEventListener('click', outside, { once: true });
        return;
      }
      try {
        const p = loadPrefs();
        const si = menu.querySelector('[data-ts-search]');
        if (si) { p.search = si.value; savePrefs(p); }
      } catch {}
      closeMenu();
    }
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeMenu(); document.removeEventListener('keydown', esc); }
    });
  }

  function refreshBtnLabel() {
    const label = document.querySelector(`#${BTN_ID} [data-ts-label]`);
    if (label) {
      const n = loadPresets().length;
      const nf = loadFolders().length;
      const cur = getCurrentTags();
      label.textContent = n ? `Tags ★ (${n}${nf ? ' · ' + nf + '📁' : ''})` : 'Tags ★';
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.title = cur ? `Saved tag sets — current tags=${cur}` : 'Saved tag sets — currently All';
    }
  }

  function inject() {
    if (document.getElementById(BTN_ID)) { refreshBtnLabel(); return true; }
    const wrapper = findWrapper();
    if (!wrapper) return false;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.className = 'flex items-center gap-1 rounded-3xl border-none text-sm font-semibold text-gray-8 dark:text-white h-8 px-2 bg-transparent hover:bg-gray-2 data-[expanded=true]:bg-gray-2 dark:hover:bg-dark-5 dark:data-[expanded=true]:bg-dark-4';
    btn.style.cssText = 'cursor:pointer;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v-6"/><path d="M9 10l3 3 3-3"/><path d="M3 4h18v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z"/></svg>
      <span data-ts-label>Tags ★</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      if (document.getElementById(MENU_ID)) closeMenu();
      else buildMenu(btn);
    };
    wrapper.appendChild(btn);
    refreshBtnLabel();
    return true;
  }

  function safeInject() { try { return inject(); } catch (err) { console.warn('[tagsaver]', err); return false; } }
  function scheduleRetries() {
    [400, 1200, 2500, 5000].forEach(ms =>
      setTimeout(() => { try { safeInject(); } catch {} }, ms));
  }
  let navHooked = false;
  function hookNavigation() {
    if (navHooked) return; navHooked = true;
    const fire = () => {
      scheduleRetries();
      setTimeout(() => { try { refreshBtnLabel(); } catch {} }, 600);
    };
    ['pushState', 'replaceState'].forEach(fn => {
      try {
        const orig = history[fn];
        if (typeof orig === 'function') {
          history[fn] = function (...a) { const r = orig.apply(this, a); setTimeout(fire, 0); return r; };
        }
      } catch {}
    });
    window.addEventListener('popstate', fire);
    window.addEventListener('hashchange', fire);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { safeInject(); scheduleRetries(); hookNavigation(); }, { once: true });
  } else {
    safeInject(); scheduleRetries(); hookNavigation();
  }

}
initTagSaver();

/* ============================================================
   MODULE 2 — TAG DECODER (v1.0.0: numbers -> English)
   Deferred until DOM is ready because it touches document.head/body
   on load, while this script runs at document-start.
   ============================================================ */
function initTagDecoder() {

'use strict';

const CACHE_KEY = 'civitai_tag_name_cache_v1';
const cache = loadCache();
function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {} }

// verified examples: 5146=sex, 5248=realistic, 116155=flat chest,
// 4213=medium breasts, 115521=small breasts, 5784=large breasts
Object.assign(cache, {
  '5146': 'sex', '5248': 'realistic', '116155': 'flat chest',
  '4213': 'medium breasts', '115521': 'small breasts', '5784': 'large breasts'
});

async function fetchName(id) {
  id = String(id);
  if (cache[id]) return cache[id];
  try {
    const u = `${location.origin}/api/trpc/tag.getById?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22id%22%3A${encodeURIComponent(id)}%7D%7D%7D`;
    const r = await fetch(u);
    const j = await r.json();
    const name = j?.[0]?.result?.data?.json?.name;
    if (name) { cache[id] = name; saveCache(); return name; }
  } catch {}
  return null;
}

async function searchByName(query, limit = 8) {
  try {
    const input = encodeURIComponent(JSON.stringify({ query, limit }));
    const u = `${location.origin}/api/trpc/tag.getAll?batch=1&input=%7B%220%22%3A%7B%22json%22%3A${input}%7D%7D`;
    const r = await fetch(u);
    const j = await r.json();
    return j?.[0]?.result?.data?.json?.items?.slice(0, limit) || [];
  } catch { return []; }
}

function getIdsFromURL() {
  const m = location.search.match(/[?&]tags=([^&]+)/);
  if (!m) return [];
  return decodeURIComponent(m[1]).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
}

/* ---------- styles ---------- */
const st = document.createElement('style');
st.textContent = `
#civ-decode-badge{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:4px 12px;border-radius:999px;
 background:linear-gradient(90deg,#ff2fb3,#7b2ff7);color:#fff;font-size:12.5px;font-weight:800;max-width:44vw;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-family:Inter,system-ui,sans-serif}
#civ-decode-fab{position:fixed;left:16px;bottom:16px;z-index:999999;width:52px;height:52px;border-radius:50%;
 font-size:24px;border:3px solid #fff;cursor:pointer;background:linear-gradient(135deg,#ffd32f,#ff2fb3);
 box-shadow:0 8px 30px rgba(255,47,179,.5)}
#civ-decode-panel{position:fixed;left:16px;bottom:78px;z-index:1000000;width:300px;max-height:66vh;overflow:auto;
 background:rgba(15,15,25,.97);color:#fff;border:1px solid #ff2fb3;border-radius:14px;padding:14px;
 font-family:Inter,system-ui,sans-serif;font-size:13px;box-shadow:0 12px 50px rgba(0,0,0,.6);display:none}
#civ-decode-panel.open{display:block}
#civ-decode-panel .tagrow{display:flex;align-items:center;gap:8px;background:#1d1d2b;border-radius:10px;padding:7px 9px;margin:6px 0}
#civ-decode-panel code{background:#000;padding:2px 7px;border-radius:6px;color:#ffd32f;font-weight:800}
#civ-decode-panel button{cursor:pointer;border:0;border-radius:8px;font-weight:800;padding:6px 10px}
#civ-decode-panel input{width:100%;padding:8px;border-radius:8px;border:1px solid #555;background:#222;color:#fff;margin-top:6px;box-sizing:border-box}
`;
document.head.appendChild(st);

/* ---------- floating button + panel ---------- */
const fab = document.createElement('button');
fab.id = 'civ-decode-fab';
fab.title = 'Tag decoder — click to see what the numbers mean';
fab.textContent = '🏷️';
document.body.appendChild(fab);

const panel = document.createElement('div');
panel.id = 'civ-decode-panel';
panel.innerHTML = `
  <div style="font-weight:900;font-size:14px">🏷️ Tag Decoder</div>
  <div id="cdd-current" style="opacity:.85;margin:6px 0">Reading URL…</div>
  <div id="cdd-list"></div>
  <div style="margin-top:8px;font-weight:800">🔍 Look up anything</div>
  <input id="cdd-search" placeholder="type ID (4213) or name (sex)…">
  <div id="cdd-results"></div>
  <div style="opacity:.6;font-size:11px;margin-top:8px">Tip: click the pink badge in the filter bar to open this too.</div>`;
document.body.appendChild(panel);

fab.onclick = () => { panel.classList.toggle('open'); refresh(); };
let searchT;
panel.querySelector('#cdd-search').addEventListener('input', (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => doSearch(e.target.value.trim()), 350);
});
panel.querySelector('#cdd-search').addEventListener('keydown', (e) => e.stopPropagation());

async function doSearch(q) {
  const box = panel.querySelector('#cdd-results');
  if (!q) { box.innerHTML = ''; return; }
  if (/^\d[\d,\s]*$/.test(q)) {
    // ID -> name
    const ids = q.split(/[\s,]+/).filter(Boolean).slice(0, 10);
    box.innerHTML = 'looking up…';
    const rows = [];
    for (const id of ids) {
      const n = await fetchName(id);
      rows.push(`<div class="tagrow"><code>${id}</code><span style="flex:1">= <b>${n || '(not found)'}</b></span><button data-copy="${id}">copy</button></div>`);
    }
    box.innerHTML = rows.join('');
  } else {
    // name -> IDs
    box.innerHTML = 'searching…';
    const items = await searchByName(q);
    if (!items.length) { box.innerHTML = '<div style="opacity:.6">no matches</div>'; return; }
    box.innerHTML = items.map(t => `<div class="tagrow"><code>${t.id}</code><span style="flex:1">${t.name}</span><button data-use="${t.id}">use</button></div>`).join('');
  }
  box.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = '✓'; });
  box.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('tags', b.dataset.use);
    location.href = url.toString();
  });
}

async function refresh() {
  const ids = getIdsFromURL();
  const cur = panel.querySelector('#cdd-current');
  const list = panel.querySelector('#cdd-list');
  if (!ids.length) {
    cur.textContent = 'No ?tags= in this URL. Try a tag feed, or search below.';
    list.innerHTML = '';
    updateBadge([]);
    return;
  }
  cur.innerHTML = `This page: <code style="background:#000;padding:2px 6px;border-radius:6px;color:#ffd32f">tags=${ids.join(',')}</code>`;
  list.innerHTML = ids.map(id => `<div class="tagrow"><code>${id}</code><span style="flex:1">= <i>…</i></span></div>`).join('');
  const pairs = [];
  const rows = [...list.children];
  for (let i = 0; i < ids.length; i++) {
    const name = await fetchName(ids[i]);
    pairs.push({ id: ids[i], name: name || '(unknown)' });
    rows[i].querySelector('span').innerHTML = `= <b>${name || '(unknown tag)'}</b>`;
  }
  updateBadge(pairs);
}

/* ---------- inline pink badge in filter bar ---------- */
function updateBadge(pairs) {
  let badge = document.getElementById('civ-decode-badge');
  const anchor = document.querySelector('button[title="Followed"]')
    || document.querySelector('button[title="Everyone"]')
    || [...document.querySelectorAll('button')].find(b => ['Followed', 'Everyone'].includes((b.innerText || '').trim()));
  if (!anchor || !anchor.parentElement) return;
  if (!pairs.length) { badge?.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'civ-decode-badge';
    badge.title = 'Decoded by Tag Decoder — click to open';
    badge.onclick = () => { panel.classList.add('open'); refresh(); };
    anchor.parentElement.appendChild(badge);
  }
  const names = pairs.map(p => p.name).join(' + ');
  badge.textContent = `🏷️ ${names}`;
  badge.title = pairs.map(p => `${p.id} = ${p.name}`).join('\n') + '\n\nClick for decoder panel';
}

// init + watch SPA navigation
let lastUrl = location.href;
refresh();
setInterval(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; refresh(); }
  if (!document.getElementById('civ-decode-badge')) refresh();
}, 1500);

}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { try { initTagDecoder(); } catch (e) { console.warn('[civit-combined][decoder]', e); } }, { once: true });
} else {
  try { initTagDecoder(); } catch (e) { console.warn('[civit-combined][decoder]', e); }
}
})();

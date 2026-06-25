let appState = { categories: {}, autoGroup: false, customColors: [], sortBy: 'recent', viewMode: 'list', recentSearches: [], targetWindowId: null, searchSource: null };
let editingGroupName = null; let draggedTabId = null; let draggedGroupName = null;
let activeSelectedHex = null; let activeSelectedEmoji = null;
let currentSearchQuery = ''; let searchDebounce = null;
let searchFocused = false; let selectMode = false;
let pendingGroupTabIds = null; let selectableIds = [];
const selectedTabIds = new Set();

const DEFAULT_CATEGORIES = { 'Development': { color: 'green', keywords: ['github.com', 'stackoverflow.com'] }, 'Google': { color: 'blue', keywords: ['google.com'] } };
const EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "🥹", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🫣", "🤗", "🫡", "🤔", "🤭", "🤫", "🤥", "😶", "🫥", "😐", "🫤", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🫨", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"];

function staggerIn(elements) {
    elements.forEach((el, i) => {
        el.style.animationDelay = `${Math.min(i, 14) * 28}ms`; el.classList.add('anim-in');
        el.addEventListener('animationend', function handler() { el.classList.remove('anim-in'); el.style.animationDelay = ''; el.removeEventListener('animationend', handler); });
    });
}
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function isSearchExperience() { return searchFocused || !!currentSearchQuery || selectedTabIds.size > 0; }

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
function getContrastYIQ(hexcolor) {
    if (!hexcolor) return 'white'; hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(char => char + char).join('');
    if (hexcolor.length !== 6) return 'white';
    const r = parseInt(hexcolor.substr(0, 2), 16), g = parseInt(hexcolor.substr(2, 2), 16), b = parseInt(hexcolor.substr(4, 2), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 150) ? '#111827' : 'white';
}

const CHECK_SVG = '<svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="2 7.5 5.5 11 12 3"></polyline></svg>';
const GRIP_SVG = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11" r="1.3"/><circle cx="7.5" cy="11" r="1.3"/></svg>';
function checkboxHTML(tabId) { const checked = selectedTabIds.has(tabId) ? ' checked' : ''; return `<span class="tab-checkbox${checked}" data-id="${tabId}">${CHECK_SVG}</span>`; }

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paramWinId = urlParams.get('windowId');
    const paramAction = urlParams.get('action');
    const paramSearch = urlParams.get('search');
    const paramFocusSearch = urlParams.get('focusSearch');
    
    appState.searchSource = urlParams.get('source');

    if (paramWinId === 'all') {
        appState.targetWindowId = 'all';
    } else if (paramWinId) {
        appState.targetWindowId = parseInt(paramWinId);
    } else { 
        const currentWin = await chrome.windows.getCurrent(); 
        appState.targetWindowId = currentWin.id; 
    }

    chrome.storage.local.get(['categories', 'autoGroup', 'customColors', 'sortBy', 'viewMode'], async (result) => {
        appState.categories = result.categories || DEFAULT_CATEGORIES;
        appState.autoGroup = result.autoGroup || false;
        appState.customColors = result.customColors || [];
        appState.sortBy = result.sortBy || 'recent';
        appState.viewMode = result.viewMode || 'list';

        initEmojiPicker();
        setupInnerEvents();
        
        if (paramSearch) {
            document.getElementById('search-input').value = decodeURIComponent(paramSearch);
            currentSearchQuery = decodeURIComponent(paramSearch).toLowerCase();
            document.getElementById('search-clear').classList.remove('hidden');
            searchFocused = true;
        }

        if (paramFocusSearch) {
            searchFocused = true;
            setTimeout(() => document.getElementById('search-input').focus(), 150);
        }
        
        await renderInnerUI();
        if (paramAction === 'create') openModal(null);
    });
});

function openMenu(anchorEl, items) {
    document.querySelectorAll('.popup-menu, .menu-backdrop').forEach(el => el.remove());
    const rect = anchorEl.getBoundingClientRect();
    const backdrop = document.createElement('div'); backdrop.className = 'menu-backdrop'; backdrop.onclick = () => document.querySelectorAll('.popup-menu, .menu-backdrop').forEach(el => el.remove());
    const menu = document.createElement('div'); menu.className = 'popup-menu';
    items.forEach(it => {
        const btn = document.createElement('button'); btn.className = 'popup-menu-item ' + (it.danger ? 'danger' : '') + (it.active ? ' active' : ''); btn.innerHTML = it.label;
        btn.onclick = () => { backdrop.remove(); menu.remove(); it.onClick(); };
        menu.appendChild(btn);
    });
    document.body.appendChild(backdrop); document.body.appendChild(menu);
    let top = rect.bottom + 6, left = rect.left;
    if (left + menu.offsetWidth > window.innerWidth - 8) left = (rect.right - menu.offsetWidth);
    menu.style.top = `${Math.max(8, top)}px`; menu.style.left = `${Math.max(8, left)}px`;
}

async function runSync(showOverlay = false) {
    const overlay = document.getElementById('sync-overlay');
    if (showOverlay) overlay.classList.remove('hidden');
    try {
        if (appState.autoGroup) {
            await new Promise(resolve => { chrome.runtime.sendMessage({ action: "runAutoGroup" }, () => resolve()); });
        }
        if (showOverlay) await new Promise(resolve => setTimeout(resolve, 800));
        await renderInnerUI();
    } catch (e) { console.error('Sync failed:', e); } finally {
        if (showOverlay) { overlay.classList.add('fade-out'); setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('fade-out'); }, 300); }
    }
}

function exitSearch() {
    clearTimeout(searchDebounce); searchFocused = false; currentSearchQuery = '';
    const input = document.getElementById('search-input'); if (input) { input.value = ''; input.blur(); }
    document.getElementById('search-clear').classList.add('hidden'); 
    
    if (appState.searchSource === 'dashboard' || appState.targetWindowId === 'all') {
        window.location.href = 'popup.html';
    } else {
        window.history.replaceState({}, document.title, "inner.html?windowId=" + appState.targetWindowId);
        renderInnerUI();
    }
}

function setupInnerEvents() {
    document.getElementById('back-to-dash').addEventListener('click', () => {
        if (isSearchExperience()) exitSearch(); else window.location.href = 'popup.html';
    });

    document.getElementById('avatar-btn').addEventListener('click', (e) => {
        openMenu(e.currentTarget, [
            { label: `View: ${appState.viewMode === 'list' ? 'Grid' : 'List'}`, onClick: () => {
                appState.viewMode = appState.viewMode === 'list' ? 'cards' : 'list';
                chrome.storage.local.set({ viewMode: appState.viewMode });
                renderInnerUI();
            }},
            { label: `Auto Group: ${appState.autoGroup ? 'On' : 'Off'}`, onClick: async () => {
                if(appState.autoGroup) { document.getElementById('alert-modal').classList.remove('hidden'); } 
                else { appState.autoGroup = true; await chrome.storage.local.set({ autoGroup: true }); await runSync(false); }
            }},
            { label: 'Sync now', onClick: () => runSync(true) },
            { label: 'Create New Group', onClick: () => openModal(null) }
        ]);
    });

    const searchInput = document.getElementById('search-input'), searchClear = document.getElementById('search-clear');
    searchInput.addEventListener('focus', () => { searchFocused = true; renderInnerUI(); });
    
    searchInput.addEventListener('blur', () => {
        searchFocused = false;
        if (!currentSearchQuery && selectedTabIds.size === 0) {
            setTimeout(() => { 
                if (!searchFocused && !currentSearchQuery && selectedTabIds.size === 0) {
                    if (appState.searchSource === 'dashboard' || appState.targetWindowId === 'all') window.location.href = 'popup.html';
                    else renderInnerUI(); 
                }
            }, 120);
        }
    });
    
    searchInput.addEventListener('input', (e) => {
        const raw = e.target.value; searchClear.classList.toggle('hidden', raw.trim().length === 0);
        clearTimeout(searchDebounce); searchDebounce = setTimeout(() => { currentSearchQuery = raw.trim().toLowerCase(); renderInnerUI(); }, 80);
    });
    
    searchClear.addEventListener('click', () => { 
        clearTimeout(searchDebounce); searchInput.value = ''; currentSearchQuery = ''; searchClear.classList.add('hidden'); searchInput.focus(); renderInnerUI(); 
    });

    document.getElementById('sort-btn').addEventListener('click', (e) => {
        e.preventDefault(); 
        const SORT_LABELS = { recent: 'Recent', oldest: 'Oldest', az: 'Title A–Z', za: 'Title Z–A' };
        openMenu(e.currentTarget, Object.keys(SORT_LABELS).map(key => ({ label: SORT_LABELS[key], active: appState.sortBy === key, onClick: () => { appState.sortBy = key; chrome.storage.local.set({ sortBy: key }); renderInnerUI(); } })));
    });
    document.getElementById('sort-btn').addEventListener('mousedown', e => e.preventDefault());

    document.getElementById('groups-container').addEventListener('mousedown', (e) => {
        if (isSearchExperience() && e.target.closest('.search-tab-item, .search-head, .recent-row')) { e.preventDefault(); }
    });

    document.addEventListener('keydown', (e) => {
        const modalOpen = !document.getElementById('modal').classList.contains('hidden') || !document.getElementById('alert-modal').classList.contains('hidden');
        if (modalOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            if (isSearchExperience()) exitSearch(); else window.location.href = 'popup.html';
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) {
            e.preventDefault();
            searchFocused = true; renderInnerUI(); requestAnimationFrame(() => document.getElementById('search-input').focus());
        }
    });

    document.getElementById('select-all-btn').addEventListener('click', () => {
        const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedTabIds.has(id));
        selectableIds.forEach(id => { allSelected ? selectedTabIds.delete(id) : selectedTabIds.add(id); });
        renderInnerUI();
    });

    document.getElementById('search-move').addEventListener('click', (e) => {
        if (selectedTabIds.size === 0) return;
        const items = Object.entries(appState.categories).map(([name, data]) => ({ 
            label: `${data.emoji ? data.emoji + ' ' : ''}${escapeHtml(name)}`, 
            onClick: async () => {
                const tabsToMove = [...selectedTabIds];
                const currentWin = await chrome.windows.getCurrent();
                await chrome.tabs.move(tabsToMove, { windowId: currentWin.id, index: -1 });

                const expectedTitle = data.emoji ? `${data.emoji} ${name}` : name;
                const existing = await chrome.tabGroups.query({ windowId: currentWin.id, title: expectedTitle });
                if (existing.length > 0) await chrome.tabs.group({ groupId: existing[0].id, tabIds: tabsToMove });
                else {
                    const gId = await chrome.tabs.group({ tabIds: tabsToMove });
                    await chrome.tabGroups.update(gId, { title: expectedTitle, color: data.color });
                }
                selectMode = false; selectedTabIds.clear(); if(isSearchExperience()) exitSearch(); else renderInnerUI();
            }
        }));
        items.push({ label: 'Ungroup', danger: true, onClick: async () => {
            await chrome.tabs.ungroup([...selectedTabIds]); selectMode = false; selectedTabIds.clear(); renderInnerUI();
        }});
        openMenu(e.currentTarget, items);
    });

    document.getElementById('search-new').addEventListener('click', () => { if (selectedTabIds.size > 0) { pendingGroupTabIds = [...selectedTabIds]; openModal(null); } });

    document.getElementById('alert-cancel').addEventListener('click', () => document.getElementById('alert-modal').classList.add('hidden'));
    document.getElementById('alert-confirm').addEventListener('click', async () => {
        document.getElementById('alert-modal').classList.add('hidden'); appState.autoGroup = false; await chrome.storage.local.set({ autoGroup: false });
        
        const qOpts = appState.targetWindowId === 'all' ? {} : { windowId: appState.targetWindowId };
        const allTabs = await chrome.tabs.query(qOpts);
        const grouped = allTabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map(t => t.id);
        if(grouped.length > 0) await chrome.tabs.ungroup(grouped);
        renderInnerUI();
    });

    document.getElementById('modal-backdrop-close').addEventListener('click', closeModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click', saveGroup);
    document.getElementById('modal-delete').addEventListener('click', deleteCurrentGroup);
    document.getElementById('emoji-trigger').addEventListener('click', () => {
        const picker = document.getElementById('emoji-picker-view'), settings = document.getElementById('modal-settings-view');
        if (picker.classList.contains('hidden')) { picker.classList.remove('hidden'); settings.classList.add('hidden'); } else { picker.classList.add('hidden'); settings.classList.remove('hidden'); }
    });
    document.querySelectorAll('#default-colors-container .color-dot').forEach(dot => dot.addEventListener('click', (e) => selectColorDot(e.target)));

    document.getElementById('modal-custom-color').addEventListener('input', (e) => {
        document.getElementById('color-helper-text').classList.add('hidden'); let val = e.target.value.trim(); if (!val.startsWith('#') && val.length > 0) val = '#' + val;
        const preview = document.getElementById('hex-preview');
        if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(val)) preview.style.backgroundColor = val; else preview.style.backgroundColor = 'transparent';
    });

    document.getElementById('add-custom-color-btn').addEventListener('click', () => {
        const helperText = document.getElementById('color-helper-text'); helperText.classList.add('hidden');
        let val = document.getElementById('modal-custom-color').value.trim(); if (!val.startsWith('#') && val.length > 0) val = '#' + val;
        if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(val)) {
            if (!appState.customColors.some(c => c.toUpperCase() === val.toUpperCase())) {
                appState.customColors.push(val); chrome.storage.local.set({ customColors: appState.customColors }, () => { renderCustomColors(); selectColorDot(document.querySelector(`.custom-color-dot[data-custom-hex="${val}"]`)); document.getElementById('modal-custom-color').value = ''; document.getElementById('hex-preview').style.backgroundColor = 'transparent'; });
            } else { helperText.textContent = "Color already added."; helperText.classList.remove('hidden'); }
        } else { helperText.textContent = "Valid Hex required."; helperText.classList.remove('hidden'); }
    });
}

async function renderInnerUI() {
    try {
        const container = document.getElementById('groups-container');
        const inSearch = isSearchExperience();
        
        document.body.classList.toggle('search-mode', inSearch);
        document.body.classList.toggle('view-cards', appState.viewMode === 'cards');

        container.innerHTML = '';
        
        const queryOpts = appState.targetWindowId === 'all' ? {} : { windowId: appState.targetWindowId };
        const allTabs = await chrome.tabs.query(queryOpts);
        const validTabs = allTabs.filter(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));

        if (inSearch) {
            let matchedTabs = validTabs;
            if (currentSearchQuery) {
                matchedTabs = validTabs.filter(t => (t.title && t.title.toLowerCase().includes(currentSearchQuery)) || (t.url && t.url.toLowerCase().includes(currentSearchQuery)));
            }
            matchedTabs = sortTabs(matchedTabs);
            selectableIds = matchedTabs.map(t => t.id);
            const total = matchedTabs.length;
            
            const selCount = selectedTabIds.size;
            const headHTML = `<div class="search-head">${selCount > 0 ? `<span class="sel-count"><strong>${selCount}</strong>/${total} SELECTED</span><button class="sel-clear" onclick="selectedTabIds.clear(); renderInnerUI();">✕ CLEAR</button>` : `<span class="sel-count sel-count-muted">${total} TAB${total !== 1 ? 'S' : ''}</span>`}</div>`;

            if (total === 0) container.innerHTML = `${headHTML}<div class="search-empty-state" style="text-align:center; padding: 40px; color:#9CA3AF; font-size: 13px;">No tabs found for "${escapeHtml(currentSearchQuery)}"</div>`;
            else container.innerHTML = `${headHTML}<div class="tab-list">${matchedTabs.map(tab => createSearchTabHTML(tab, currentSearchQuery)).join('')}</div>`;

            attachSearchEvents();
            staggerIn([...container.querySelectorAll('.search-tab-item')]);
            updateActionBar();
            return;
        }

        const chromeGroups = await chrome.tabGroups.query(queryOpts);
        const groupedTabsIds = new Set();

        for (const [name, data] of Object.entries(appState.categories)) {
            const expectedTitle = data.emoji ? `${data.emoji} ${name}` : name;
            const matchingGroups = chromeGroups.filter(g => g.title === expectedTitle);
            let groupTabs = [], groupId = null, isCollapsed = false;

            if (matchingGroups.length > 0) {
                groupId = matchingGroups[0].id; isCollapsed = matchingGroups[0].collapsed;
                groupTabs.push(...validTabs.filter(t => t.groupId === groupId));
            }
            if (groupTabs.length === 0) continue;
            groupTabs.forEach(t => groupedTabsIds.add(t.id));
            
            // FIX: Always render groups with the full width design
            container.innerHTML += createGroupHTML(name, data.color, sortTabs(groupTabs), false, groupId, isCollapsed, groupTabs.some(t => t.active));
        }

        for (const g of chromeGroups) {
            let groupTabs = validTabs.filter(t => t.groupId === g.id);
            if (groupTabs.length === 0 || groupedTabsIds.has(groupTabs[0].id)) continue;
            groupTabs.forEach(t => groupedTabsIds.add(t.id));
            container.innerHTML += createGroupHTML(g.title || "Group", g.color, sortTabs(groupTabs), false, g.id, g.collapsed, groupTabs.some(t => t.active));
        }

        const ungroupedTabs = validTabs.filter(t => !groupedTabsIds.has(t.id));
        if (ungroupedTabs.length > 0) container.innerHTML += createGroupHTML('Untitled', null, sortTabs(ungroupedTabs), true);

        if (container.innerHTML === '') container.innerHTML = '<div style="text-align:center; color:#9CA3AF; padding: 40px; font-size:13px;">No tabs found.</div>';
        
        staggerIn([...container.querySelectorAll('.group-section')]);
        attachTabEvents();
        selectableIds = selectMode ? [...container.querySelectorAll('.tab-item.ungrouped')].map(el => parseInt(el.dataset.id)) : [];
        updateActionBar();

    } catch (e) {
        console.error("Inner UI Render Error:", e);
        document.getElementById('groups-container').innerHTML = `<div style="color:red; padding: 20px; font-size: 12px; font-weight: bold;">Error loading window details.</div>`;
    }
}

function sortTabs(tabs) {
    const arr = [...tabs];
    switch (appState.sortBy) {
        case 'oldest': arr.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0)); break;
        case 'az': arr.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
        case 'za': arr.sort((a, b) => (b.title || '').localeCompare(a.title || '')); break;
        case 'recent': default: arr.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)); break;
    }
    return arr;
}

function updateActionBar() {
    const bar = document.getElementById('search-bar');
    const open = selectedTabIds.size > 0;
    bar.classList.toggle('hidden', !open);
    
    const move = document.getElementById('search-move'), neu = document.getElementById('search-new');
    if (move) move.disabled = !open; if (neu) neu.disabled = !open;

    const box = document.getElementById('select-all-box');
    if (box) box.classList.toggle('checked', selectableIds.length > 0 && selectableIds.every(id => selectedTabIds.has(id)));
}

function createSearchTabHTML(tab, query) {
    let displayTitle = escapeHtml(tab.title || tab.url);
    if (query) { const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'); displayTitle = displayTitle.replace(regex, '<span class="search-highlight">$1</span>'); }
    return `<div class="search-tab-item${selectedTabIds.has(tab.id) ? ' row-selected' : ''}${tab.active ? ' is-active' : ''}" data-id="${tab.id}">${checkboxHTML(tab.id)}${tab.active ? '<span class="active-dot"></span>' : ''}<span class="tab-title">${displayTitle}</span><div class="tab-action-area"><span class="tab-age">${getTimeAgo(tab.lastAccessed)}</span></div></div>`;
}

function createTabHTML(tab, isUngrouped = false) {
    const groupClass = isUngrouped ? 'ungrouped' : 'grouped';
    const selecting = isUngrouped && selectMode, draggable = selecting ? 'false' : 'true';
    const selectedCls = selecting && selectedTabIds.has(tab.id) ? ' row-selected' : '';
    const leftControl = selecting ? checkboxHTML(tab.id) : `<span class="drag-handle">${GRIP_SVG}</span>`;
    return `<div class="tab-item ${groupClass}${selectedCls}${tab.active ? ' is-active' : ''}" draggable="${draggable}" data-id="${tab.id}">${leftControl}${tab.active ? '<span class="active-dot"></span>' : ''}<span class="tab-title">${escapeHtml(tab.title || tab.url)}</span><div class="tab-action-area"><span class="tab-age">${getTimeAgo(tab.lastAccessed)}</span>${!isUngrouped ? `<button class="btn-delete-tab" data-id="${tab.id}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="pointer-events:none;"><path d="M1.5 3.5H12.5M4.5 3.5V2C4.5 1.17157 5.17157 0.5 6 0.5H8C8.82843 0.5 9.5 1.17157 9.5 2V3.5M5.5 6.5V10.5M8.5 6.5V10.5M2.5 3.5V11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H9.5C10.6046 13.5 11.5 12.6046 11.5 11.5V3.5"/></svg></button>` : ''}</div></div>`;
}

function createTabCardHTML(tab, isUngrouped = false) {
    const groupClass = isUngrouped ? 'ungrouped' : 'grouped';
    const selecting = isUngrouped && selectMode, draggable = selecting ? 'false' : 'true';
    const leftControl = selecting ? checkboxHTML(tab.id) : `<span class="drag-handle">${GRIP_SVG}</span>`;
    const fav = tab.favIconUrl && /^https?:/.test(tab.favIconUrl) ? `<img class="card-favicon" src="${escapeHtml(tab.favIconUrl)}">` : `<span class="card-favicon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></span>`;
    return `<div class="tab-item card ${groupClass}${selecting && selectedTabIds.has(tab.id) ? ' row-selected' : ''}${tab.active ? ' is-active' : ''}" draggable="${draggable}" data-id="${tab.id}"><div class="card-top">${leftControl}${!isUngrouped ? `<button class="btn-delete-tab" data-id="${tab.id}"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="pointer-events:none;"><path d="M1.5 3.5H12.5M4.5 3.5V2C4.5 1.17157 5.17157 0.5 6 0.5H8C8.82843 0.5 9.5 1.17157 9.5 2V3.5M5.5 6.5V10.5M8.5 6.5V10.5M2.5 3.5V11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H9.5C10.6046 13.5 11.5 12.6046 11.5 11.5V3.5"/></svg></button>` : ''}</div>${fav}<div class="card-title">${escapeHtml(tab.title || tab.url)}</div><div class="card-age">${getTimeAgo(tab.lastAccessed)}</div></div>`;
}

// FIX 3: HTML string properly formats collapsed vs expanded for BOTH states
function createGroupHTML(name, color, tabs, isUngrouped = false, groupId = null, isCollapsed = false, hasActiveTab = false) {
    const tabsHTML = tabs.map(tab => appState.viewMode === 'cards' ? createTabCardHTML(tab, isUngrouped) : createTabHTML(tab, isUngrouped)).join('');
    const groupData = appState.categories[name];
    let customStyles = '', emojiDisplay = '';
    if (groupData) {
        if (groupData.customHex) customStyles = `background-color: ${groupData.customHex}; color: ${getContrastYIQ(groupData.customHex)};`;
        if (groupData.emoji) emojiDisplay = `<span class="pill-emoji">${groupData.emoji}</span>`;
    }
    const reorderHandle = `<span class="group-drag-handle" draggable="true" data-group-name="${escapeHtml(name)}">${GRIP_SVG}</span>`;
    
    let headerHTML = '';
    if (isUngrouped) {
        headerHTML = `<div class="ungrouped-header"><span>${name} (${tabs.length})</span><button class="select-toggle${selectMode ? ' active' : ''}">Select</button></div>`;
    } else if (groupId) {
        const activeDot = hasActiveTab ? '<span class="active-dot" title="Current tab is in this group"></span>' : '';
        const chevron = isCollapsed 
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg>` 
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        const rightSide = isCollapsed ? `COLLAPSED ${chevron}` : chevron;

        headerHTML = `
            ${reorderHandle}
            <div class="group-title-pill full-width bg-${color}" data-name="${name}" style="${customStyles}">
                <div class="pill-left">${emojiDisplay} ${name} (${tabs.length}) ${activeDot}</div>
                <div class="collapsed-meta group-toggle-btn" data-group-id="${groupId}" data-collapsed="${isCollapsed}">
                    ${rightSide}
                </div>
            </div>`;
    }
    
    return `<div class="group-section ${isCollapsed ? 'is-collapsed' : ''}" data-group-name="${escapeHtml(name)}"><div class="group-header">${headerHTML}</div><div class="tab-list ${appState.viewMode === 'cards' ? 'tab-grid' : ''}" style="${isCollapsed ? 'display: none;' : ''}">${tabs.length===0 ? '<div class="empty-group-helper" style="font-size:12px; color:#9CA3AF; text-align:center; padding:16px; border:1px dashed #E5E7EB; border-radius:8px;">Drag tabs here</div>' : tabsHTML}</div></div>`;
}

function attachSearchEvents() {
    document.querySelectorAll('.search-tab-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const tabId = parseInt(e.currentTarget.dataset.id);
            if (e.target.closest('.tab-checkbox')) { 
                if(selectedTabIds.has(tabId)) selectedTabIds.delete(tabId); else selectedTabIds.add(tabId);
                renderInnerUI(); return; 
            }
            await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
        });
    });
}

function attachTabEvents() {
    document.querySelectorAll('.group-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); const groupId = parseInt(e.currentTarget.dataset.groupId);
            if (groupId) { await chrome.tabGroups.update(groupId, { collapsed: e.currentTarget.dataset.collapsed !== 'true' }); renderInnerUI(); }
        });
    });

    document.querySelectorAll('.select-toggle').forEach(btn => {
        btn.addEventListener('click', () => { selectMode = !selectMode; if (!selectMode) selectedTabIds.clear(); renderInnerUI(); });
    });

    document.querySelectorAll('.tab-item.card').forEach(card => {
        card.addEventListener('click', async (e) => {
            if (e.target.closest('.tab-checkbox') || e.target.closest('.btn-delete-tab') || e.target.closest('.drag-handle')) return;
            if (selectMode && card.classList.contains('ungrouped')) {
                const id = parseInt(card.dataset.id); if (selectedTabIds.has(id)) selectedTabIds.delete(id); else selectedTabIds.add(id); renderInnerUI(); return;
            }
            const tabId = parseInt(card.dataset.id); await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
        });
    });

    document.querySelectorAll('.tab-item.ungrouped:not(.card)').forEach(item => {
        if (!selectMode) return;
        item.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-tab')) return;
            const id = parseInt(item.dataset.id); if (selectedTabIds.has(id)) selectedTabIds.delete(id); else selectedTabIds.add(id); renderInnerUI();
        });
    });

    document.querySelectorAll('.tab-item[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', (e) => { draggedTabId = parseInt(item.dataset.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => item.style.opacity = '0.4', 0); });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; draggedTabId = null; document.querySelectorAll('.group-section').forEach(c => c.classList.remove('drag-over', 'reorder-before', 'reorder-after')); });
    });

    document.querySelectorAll('.group-drag-handle').forEach(handle => {
        handle.addEventListener('dragstart', (e) => { draggedGroupName = handle.dataset.groupName; e.dataTransfer.effectAllowed = 'move'; const section = handle.closest('.group-section'); if (section) setTimeout(() => section.classList.add('group-dragging'), 0); });
        handle.addEventListener('dragend', () => { draggedGroupName = null; document.querySelectorAll('.group-section').forEach(c => c.classList.remove('drag-over', 'reorder-before', 'reorder-after', 'group-dragging')); });
    });

    document.querySelectorAll('.group-section').forEach(section => {
        section.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedGroupName) {
                section.classList.remove('drag-over'); if (section.classList.contains('is-ungrouped') || section.dataset.groupName === draggedGroupName) return;
                const rect = section.getBoundingClientRect(); const after = (e.clientY - rect.top) > rect.height / 2;
                section.classList.toggle('reorder-after', after); section.classList.toggle('reorder-before', !after);
            } else if (draggedTabId) section.classList.add('drag-over');
        });
        section.addEventListener('dragleave', () => section.classList.remove('drag-over', 'reorder-before', 'reorder-after'));

        section.addEventListener('drop', async (e) => {
            e.preventDefault(); const targetGroup = section.dataset.groupName;
            if (draggedGroupName) {
                const placeAfter = section.classList.contains('reorder-after'); section.classList.remove('reorder-before', 'reorder-after');
                if (!section.classList.contains('is-ungrouped') && targetGroup !== draggedGroupName) {
                    const names = Object.keys(appState.categories), from = names.indexOf(draggedGroupName);
                    if(from >= 0) {
                        names.splice(from, 1); let to = names.indexOf(targetGroup); if (to < 0) to = names.length; if (placeAfter) to += 1; names.splice(to, 0, draggedGroupName);
                        const rebuilt = {}; names.forEach(n => rebuilt[n] = appState.categories[n]); appState.categories = rebuilt;
                        await chrome.storage.local.set({ categories: appState.categories });
                        renderInnerUI();
                    }
                }
                draggedGroupName = null; return;
            }

            section.classList.remove('drag-over');
            if (draggedTabId) {
                if (targetGroup && targetGroup !== 'Untitled') {
                    const currentWin = await chrome.windows.getCurrent();
                    await chrome.tabs.move(draggedTabId, { windowId: currentWin.id, index: -1 });

                    const groupData = appState.categories[targetGroup], expectedTitle = groupData.emoji ? `${groupData.emoji} ${targetGroup}` : targetGroup;
                    const existingGroups = await chrome.tabGroups.query({ windowId: currentWin.id, title: expectedTitle });
                    if (existingGroups.length > 0) await chrome.tabs.group({ groupId: existingGroups[0].id, tabIds: [draggedTabId] });
                    else { const gId = await chrome.tabs.group({ tabIds: [draggedTabId] }); await chrome.tabGroups.update(gId, { title: expectedTitle, color: groupData.color }); }
                } else if (targetGroup === 'Untitled') {
                    await chrome.tabs.ungroup(draggedTabId); 
                }
                if (currentSearchQuery) { document.getElementById('search-input').value = ''; currentSearchQuery = ''; document.getElementById('search-clear').classList.add('hidden'); }
                renderInnerUI();
            }
        });
    });

    document.querySelectorAll('.btn-delete-tab').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); const tabId = parseInt(e.currentTarget.dataset.id);
            await chrome.tabs.ungroup(tabId); renderInnerUI();
        });
    });

    document.querySelectorAll('.group-title-pill').forEach(pill => {
        pill.addEventListener('click', (e) => { if (e.target.closest('.group-toggle-btn')) return; if (pill.dataset.name) openModal(pill.dataset.name); });
    });
}

function initEmojiPicker() {
    const grid = document.getElementById('emoji-grid-container');
    grid.innerHTML = EMOJIS.map(emoji => `<div class="emoji-item">${emoji}</div>`).join('');
    grid.querySelectorAll('.emoji-item').forEach(item => {
        item.addEventListener('click', (e) => {
            activeSelectedEmoji = e.target.textContent; updateEmojiUI();
            document.getElementById('emoji-picker-view').classList.add('hidden');
            document.getElementById('modal-settings-view').classList.remove('hidden');
        });
    });
}
function updateEmojiUI() {
    const svg = document.getElementById('default-smiley-svg'), span = document.getElementById('selected-emoji-display');
    if (activeSelectedEmoji) { svg.classList.add('hidden'); span.textContent = activeSelectedEmoji; span.classList.remove('hidden'); } 
    else { svg.classList.remove('hidden'); span.classList.add('hidden'); }
}
function renderCustomColors() {
    const container = document.getElementById('custom-colors-container');
    container.innerHTML = appState.customColors.map((hex, index) => `<div class="color-dot custom-color-dot" data-color="grey" data-custom-hex="${hex}" style="background-color: ${hex};"><div class="custom-color-delete" data-index="${index}">&times;</div></div>`).join('');
    container.querySelectorAll('.custom-color-dot').forEach(dot => { dot.addEventListener('click', (e) => { if (e.target.classList.contains('custom-color-delete')) return; selectColorDot(dot); }); });
    container.querySelectorAll('.custom-color-delete').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); appState.customColors.splice(parseInt(e.target.dataset.index), 1); chrome.storage.local.set({ customColors: appState.customColors }, () => { renderCustomColors(); selectColorDot(document.querySelector('.color-dot.bg-green')); }); });
    });
}

function openModal(groupName) {
    editingGroupName = groupName; const groupData = groupName ? appState.categories[groupName] : null, fromSelection = !groupName && pendingGroupTabIds && pendingGroupTabIds.length;
    document.getElementById('modal-title-text').textContent = groupName ? 'Edit' : (fromSelection ? `New Group · ${pendingGroupTabIds.length} tab${pendingGroupTabIds.length !== 1 ? 's' : ''}` : 'Add Group');
    document.getElementById('modal-save').textContent = groupName ? 'Update' : (fromSelection ? 'Create Group' : 'Save');
    document.getElementById('modal-name').value = groupName || ''; document.getElementById('modal-keywords').value = groupData && groupData.keywords ? groupData.keywords.join(', ') : '';
    document.getElementById('modal-custom-color').value = ''; document.getElementById('hex-preview').style.backgroundColor = 'transparent'; document.getElementById('color-helper-text').classList.add('hidden');
    document.getElementById('emoji-picker-view').classList.add('hidden'); document.getElementById('modal-settings-view').classList.remove('hidden');

    activeSelectedEmoji = groupData && groupData.emoji ? groupData.emoji : null; updateEmojiUI(); renderCustomColors();

    if (groupData && groupData.customHex) {
        const targetDot = document.querySelector(`.custom-color-dot[data-custom-hex="${groupData.customHex}"]`);
        if (targetDot) selectColorDot(targetDot); else { selectColorDot(document.querySelector('.color-dot.bg-green')); activeSelectedHex = groupData.customHex; const inputCont = document.getElementById('modal-input-container'); inputCont.style.backgroundColor = groupData.customHex; inputCont.style.color = getContrastYIQ(groupData.customHex); }
    } else { const mappedColor = document.querySelector(`.color-dot.bg-${groupData ? groupData.color : 'green'}`); selectColorDot(mappedColor || document.querySelector('.color-dot.bg-green')); }
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); editingGroupName = null; activeSelectedHex = null; activeSelectedEmoji = null; pendingGroupTabIds = null; }

function selectColorDot(dotElement) {
    if (!dotElement) return;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected')); dotElement.classList.add('selected');
    const inputCont = document.getElementById('modal-input-container');
    if (dotElement.dataset.customHex) {
        activeSelectedHex = dotElement.dataset.customHex; inputCont.style.backgroundColor = activeSelectedHex; inputCont.style.color = getContrastYIQ(activeSelectedHex); inputCont.className = `full-width-input-container`;
    } else { activeSelectedHex = null; inputCont.style.backgroundColor = ''; inputCont.style.color = ''; inputCont.className = `full-width-input-container bg-${dotElement.dataset.color}`; }
}

async function saveGroup() {
    let name = document.getElementById('modal-name').value.trim(); const keywordsStr = document.getElementById('modal-keywords').value.trim();
    if (!name) { alert("Please provide a Group Name"); return; }

    const emojiRegex = /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)\s*(.+)$/u;
    const match = name.match(emojiRegex); if (match) { activeSelectedEmoji = match[1]; name = match[2]; }

    let typedHex = document.getElementById('modal-custom-color').value.trim();
    if (!typedHex.startsWith('#') && typedHex.length > 0) typedHex = '#' + typedHex;
    if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(typedHex)) {
        activeSelectedHex = typedHex; if (!appState.customColors.some(c => c.toUpperCase() === typedHex.toUpperCase())) appState.customColors.push(typedHex);
    }

    const keywords = keywordsStr ? keywordsStr.split(',').map(k => k.trim()).filter(k => k) : [];
    const selectedDot = document.querySelector('.color-dot.selected'), color = selectedDot ? selectedDot.dataset.color : 'grey';
    const customHex = activeSelectedHex, emoji = activeSelectedEmoji, newExpectedTitle = emoji ? `${emoji} ${name}` : name;

    const currentWin = await chrome.windows.getCurrent();

    if (editingGroupName) {
        const oldData = appState.categories[editingGroupName], oldExpectedTitle = oldData && oldData.emoji ? `${oldData.emoji} ${editingGroupName}` : editingGroupName;
        if (editingGroupName !== name) delete appState.categories[editingGroupName];
        const groups = await chrome.tabGroups.query({ windowId: appState.targetWindowId === 'all' ? currentWin.id : appState.targetWindowId, title: oldExpectedTitle });
        if (groups.length > 0) await chrome.tabGroups.update(groups[0].id, { title: newExpectedTitle, color: color });
    } else {
        const groups = await chrome.tabGroups.query({ windowId: appState.targetWindowId === 'all' ? currentWin.id : appState.targetWindowId, title: newExpectedTitle });
        if (groups.length > 0) await chrome.tabGroups.update(groups[0].id, { color: color });
    }

    appState.categories[name] = { color, keywords, customHex, emoji };
    await chrome.storage.local.set({ categories: appState.categories, customColors: appState.customColors });

    const tabsToGroup = (!editingGroupName && pendingGroupTabIds && pendingGroupTabIds.length) ? [...pendingGroupTabIds] : null;
    if (tabsToGroup) {
        
        await chrome.tabs.move(tabsToGroup, { windowId: currentWin.id, index: -1 });

        const existing = await chrome.tabGroups.query({ windowId: currentWin.id, title: newExpectedTitle });
        if (existing.length > 0) { await chrome.tabs.group({ groupId: existing[0].id, tabIds: tabsToGroup }); await chrome.tabGroups.update(existing[0].id, { color }); } 
        else { const gId = await chrome.tabs.group({ tabIds: tabsToGroup }); await chrome.tabGroups.update(gId, { title: newExpectedTitle, color }); }
        selectMode = false; selectedTabIds.clear(); searchFocused = false; currentSearchQuery = '';
        const input = document.getElementById('search-input'); if (input) input.value = ''; document.getElementById('search-clear').classList.add('hidden');
    }

    closeModal(); renderInnerUI();
}

async function deleteCurrentGroup() {
    if (editingGroupName && appState.categories[editingGroupName]) {
        const oldData = appState.categories[editingGroupName], expectedTitle = oldData && oldData.emoji ? `${oldData.emoji} ${editingGroupName}` : editingGroupName;
        delete appState.categories[editingGroupName];
        await chrome.storage.local.set({ categories: appState.categories });

        const currentWin = await chrome.windows.getCurrent();
        const groups = await chrome.tabGroups.query({ windowId: appState.targetWindowId === 'all' ? currentWin.id : appState.targetWindowId, title: expectedTitle });
        if (groups.length > 0) {
            const tabs = await chrome.tabs.query({ groupId: groups[0].id });
            const tabIds = tabs.map(t => t.id); if (tabIds.length > 0) await chrome.tabs.ungroup(tabIds);
        }
        closeModal(); renderInnerUI();
    } else { closeModal(); }
}
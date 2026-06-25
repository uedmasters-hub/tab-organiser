let appState = {
    categories: {}, autoGroup: false, customColors: [], sortBy: 'recent', viewMode: 'list', recentSearches: [],
    currentView: 'dashboard',
    activeWindowId: null
};

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
function isSearchExperience() { return searchFocused || !!currentSearchQuery; }

// FIX: Safe URL parser to prevent 'new URL()' from crashing the entire app
function getDomain(url) {
    if (!url) return 'Unknown';
    try { return new URL(url).hostname || url; } catch (e) { return url; }
}

const CHECK_SVG = '<svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="2 7.5 5.5 11 12 3"></polyline></svg>';
const GRIP_SVG = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11" r="1.3"/><circle cx="7.5" cy="11" r="1.3"/></svg>';

function checkboxHTML(tabId) {
    const checked = selectedTabIds.has(tabId) ? ' checked' : '';
    return `<span class="tab-checkbox${checked}" data-id="${tabId}" role="checkbox" aria-checked="${selectedTabIds.has(tabId)}">${CHECK_SVG}</span>`;
}

/* --- VIEW ROUTER --- */
function navigateTo(view, windowId = null) {
    appState.currentView = view;
    if (windowId) appState.activeWindowId = windowId;

    if (view === 'inner') {
        document.body.classList.add('show-inner');
        renderInnerUI();
    } else {
        document.body.classList.remove('show-inner');
        renderDashboard();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadState();
        initEmojiPicker();
        setupEventListeners();

        const currentWin = await chrome.windows.getCurrent();
        appState.activeWindowId = currentWin.id;

        const didFirstRun = await firstRunIfNeeded();
        if (!didFirstRun) navigateTo('dashboard');

        const { pendingFocus } = await chrome.storage.local.get('pendingFocus');
        if (pendingFocus) {
            await chrome.storage.local.remove('pendingFocus');
            navigateTo('inner', appState.activeWindowId);
            setTimeout(() => document.getElementById('search-input').focus(), 300);
        }
    } catch (error) { console.error("Initialization Error: ", error); }
});

async function loadState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['categories', 'autoGroup', 'customColors', 'sortBy', 'viewMode', 'recentSearches'], (result) => {
            appState.categories = (!result.categories || Object.keys(result.categories).length === 0) ? DEFAULT_CATEGORIES : result.categories;
            appState.autoGroup = result.autoGroup || false;
            appState.customColors = result.customColors || [];
            appState.sortBy = result.sortBy || 'recent';
            appState.viewMode = result.viewMode || 'list';
            appState.recentSearches = result.recentSearches || [];
            resolve();
        });
    });
}

function setupEventListeners() {
    document.getElementById('back-to-dash').addEventListener('click', () => navigateTo('dashboard'));
    document.getElementById('fab-create').addEventListener('click', () => openModal(null));

    const avatarMenuLogic = (e) => {
        openMenu(e.currentTarget, [
            { 
                label: `Auto Group: ${appState.autoGroup ? 'On' : 'Off'}`, 
                onClick: async () => {
                    if (appState.autoGroup) {
                        document.getElementById('alert-modal').classList.remove('hidden');
                    } else {
                        appState.autoGroup = true;
                        await chrome.storage.local.set({ autoGroup: true });
                        await runSync(false);
                    }
                } 
            },
            { label: 'Sync now', onClick: () => runSync(false) },
            { label: 'Create New Group', onClick: () => openModal(null) }
        ]);
    };

    document.getElementById('avatar-btn').addEventListener('click', avatarMenuLogic);
    document.getElementById('avatar-inner-btn').addEventListener('click', avatarMenuLogic);

    const searchInput = document.getElementById('search-input');
    const dashSearch = document.getElementById('dash-search-input');
    const searchClear = document.getElementById('search-clear');

    const handleInput = (e) => {
        const raw = e.target.value;
        if (raw.trim().length > 0 && e.target === searchInput) searchClear.classList.remove('hidden'); 
        else if (e.target === searchInput) searchClear.classList.add('hidden');
        
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => { currentSearchQuery = raw.trim().toLowerCase(); renderInnerUI(); }, 80);
    };

    searchInput.addEventListener('input', handleInput);
    dashSearch.addEventListener('input', (e) => {
        if(e.target.value.trim().length > 0) {
            navigateTo('inner', appState.activeWindowId);
            document.getElementById('search-input').value = e.target.value;
            handleInput(e);
            setTimeout(() => document.getElementById('search-input').focus(), 350);
        }
    });

    searchInput.addEventListener('focus', () => { searchFocused = true; renderInnerUI(); });
    searchInput.addEventListener('blur', () => {
        searchFocused = false;
        if (currentSearchQuery) pushRecentSearch(currentSearchQuery);
        if (!currentSearchQuery && selectedTabIds.size === 0) setTimeout(() => { if (!searchFocused && !currentSearchQuery && selectedTabIds.size === 0) renderInnerUI(); }, 120);
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); exitSearch(); } 
        else if (e.key === 'Enter') pushRecentSearch(currentSearchQuery);
    });
    searchClear.addEventListener('click', () => {
        clearTimeout(searchDebounce); searchInput.value = ''; currentSearchQuery = ''; searchClear.classList.add('hidden'); searchInput.focus(); renderInnerUI();
    });

    document.getElementById('select-all-btn').addEventListener('click', toggleSelectAll);
    document.getElementById('search-move').addEventListener('click', (e) => {
        if (selectedTabIds.size === 0) return;
        openMenu(e.currentTarget, groupMenuItems(async (name) => {
            await moveTabsToCategory([...selectedTabIds], name);
            selectMode = false; clearSelection();
            if (isSearchExperience()) exitSearch(); else renderInnerUI();
        }));
    });
    document.getElementById('search-new').addEventListener('click', () => {
        if (selectedTabIds.size === 0) return;
        pendingGroupTabIds = [...selectedTabIds]; openModal(null);
    });

    document.getElementById('sort-btn').addEventListener('click', (e) => {
        openMenu(e.currentTarget, Object.keys(SORT_LABELS).map(key => ({
            label: SORT_LABELS[key], active: appState.sortBy === key,
            onClick: () => { appState.sortBy = key; chrome.storage.local.set({ sortBy: key }); renderInnerUI(); }
        })));
    });
    document.getElementById('view-btn').addEventListener('click', () => {
        appState.viewMode = appState.viewMode === 'list' ? 'cards' : 'list';
        chrome.storage.local.set({ viewMode: appState.viewMode }); renderInnerUI();
    });

    document.getElementById('alert-cancel').addEventListener('click', () => document.getElementById('alert-modal').classList.add('hidden'));
    document.getElementById('alert-confirm').addEventListener('click', async () => {
        document.getElementById('alert-modal').classList.add('hidden');
        appState.autoGroup = false; await chrome.storage.local.set({ autoGroup: false });
        const allTabs = await chrome.tabs.query({ windowId: appState.activeWindowId });
        for (const tab of allTabs) if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) await chrome.tabs.ungroup(tab.id);
        renderInnerUI();
    });

    document.getElementById('modal-backdrop-close').addEventListener('click', closeModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click', saveGroup);
    document.getElementById('modal-delete').addEventListener('click', deleteCurrentGroup);
    document.getElementById('emoji-trigger').addEventListener('click', () => {
        const picker = document.getElementById('emoji-picker-view'), settings = document.getElementById('modal-settings-view');
        if (picker.classList.contains('hidden')) { picker.classList.remove('hidden'); settings.classList.add('hidden'); } 
        else { picker.classList.add('hidden'); settings.classList.remove('hidden'); }
    });
    document.querySelectorAll('#default-colors-container .color-dot').forEach(dot => dot.addEventListener('click', (e) => selectColorDot(e.target)));
}

/* ==========================================
   VIEW 1: DASHBOARD RENDER LOGIC
========================================== */
async function renderDashboard() {
    try {
        document.getElementById('dash-search-input').value = '';
        const container = document.getElementById('windows-grid-container');
        
        // FIX: Removed strict filter to prevent 0-window crashes, and safely fallback missing tabs.
        const allWindows = await chrome.windows.getAll({ populate: true });
        const windows = allWindows.filter(w => w.tabs && w.tabs.length > 0);
        
        windows.sort((a,b) => (a.id === appState.activeWindowId ? -1 : (b.id === appState.activeWindowId ? 1 : 0)));

        const count = windows.length;
        const gridType = count > 4 ? 'more' : count.toString();
        
        const colors = ['win-bg-1', 'win-bg-2', 'win-bg-3', 'win-bg-4'];
        let gridHTML = `<div class="dash-grid" data-count="${gridType}">`;

        for (let i = 0; i < Math.min(count, 4); i++) {
            const win = windows[i];
            const tabCount = win.tabs.length;
            const colorCls = colors[i % colors.length];
            
            if (count > 4 && i === 3) {
                const remaining = windows.slice(3).reduce((acc, w) => acc + (w.tabs ? w.tabs.length : 0), 0);
                gridHTML += `
                <button class="win-card ${colorCls} win-card-more">
                    <div class="win-more-count">+${remaining}</div>
                    <div class="win-more-label">Tabs in other windows</div>
                </button>`;
                break;
            }

            const pTab = win.tabs.find(t => t.active) || win.tabs.find(t => t.favIconUrl) || win.tabs[0];
            let previewHTML = '';
            if (gridType === '1' || (gridType === '3' && i === 1)) {
                previewHTML = `<div class="win-preview">${pTab && pTab.favIconUrl ? `<img src="${escapeHtml(pTab.favIconUrl)}" style="width:32px; height:32px; border-radius:4px; opacity:0.8;">` : '<div style="color:rgba(0,0,0,0.3); font-size: 11px;">No Preview</div>'}</div>`;
            }

            gridHTML += `
            <button class="win-card ${colorCls}" data-winid="${win.id}">
                <div class="win-card-top">
                    <div class="win-title">Window ${i+1}</div>
                    <div class="win-kebab" data-winid="${win.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </div>
                </div>
                ${previewHTML}
                <div class="win-card-bottom">
                    <div class="win-count">${tabCount}</div>
                    <div class="win-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></div>
                </div>
            </button>`;
        }
        gridHTML += `</div>`;
        
        // Handle Edge Case where NO valid windows exist
        container.innerHTML = count > 0 ? gridHTML : '<div style="text-align:center; color:#9CA3AF; padding: 30px 10px; font-size: 13px;">No standard windows available.</div>';

        const allTabs = windows.flatMap(w => w.tabs || []).filter(t => t.url && !t.url.startsWith('chrome'));
        allTabs.sort((a,b) => (b.lastAccessed||0) - (a.lastAccessed||0));
        const favTabs = allTabs.slice(0, 5);
        
        document.getElementById('favorites-container').innerHTML = favTabs.length > 0 ? favTabs.map(t => `
            <div class="fav-item" data-tabid="${t.id}" data-winid="${t.windowId}">
                <svg class="fav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
                <div class="fav-text" title="${escapeHtml(t.url)}">${escapeHtml(getDomain(t.url))}</div>
                <div class="fav-time">${getTimeAgo(t.lastAccessed)}</div>
            </div>
        `).join('') : '<div style="text-align:center; color:#9CA3AF; font-size: 12px;">No recent tabs.</div>';

        bindDashboardEvents();
        staggerIn([...container.querySelectorAll('.win-card')]);
        
    } catch (error) {
        console.error("Fatal Dashboard Error:", error);
        document.getElementById('windows-grid-container').innerHTML = `<div style="color:red; padding: 20px; font-size: 12px; font-weight: bold;">Error loading dashboard. Check console.</div>`;
    }
}

function bindDashboardEvents() {
    document.querySelectorAll('.win-card[data-winid]').forEach(card => {
        card.addEventListener('click', (e) => {
            if(e.target.closest('.win-kebab')) return;
            navigateTo('inner', parseInt(card.dataset.winid));
        });
    });

    document.querySelectorAll('.win-kebab').forEach(k => {
        k.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenu(e.currentTarget, [
                { label: 'Merge into current', onClick: () => alert("Merge logic pending...") },
                { label: 'Close window', danger: true, onClick: async () => {
                    await chrome.windows.remove(parseInt(k.dataset.winid));
                    renderDashboard();
                }}
            ]);
        });
    });

    document.querySelectorAll('.fav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const tId = parseInt(e.currentTarget.dataset.tabid);
            const wId = parseInt(e.currentTarget.dataset.winid);
            await chrome.tabs.update(tId, {active: true});
            await chrome.windows.update(wId, {focused: true});
        });
    });
}

/* ==========================================
   VIEW 2: INNER WINDOW RENDER LOGIC
========================================== */
async function renderInnerUI() {
    try {
        const container = document.getElementById('groups-container');
        const inSearch = isSearchExperience();
        document.getElementById('inner-view').classList.toggle('search-mode', inSearch);
        document.getElementById('inner-view').classList.toggle('view-cards', appState.viewMode === 'cards');
        const enteringSearch = inSearch && !wasSearchActive;

        container.innerHTML = '';
        
        const allTabs = await chrome.tabs.query({ windowId: appState.activeWindowId });
        const validTabs = allTabs.filter(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));

        const allWins = await chrome.windows.getAll();
        const bcWinIdx = allWins.findIndex(w => w.id === appState.activeWindowId) + 1;
        document.getElementById('inner-window-title').textContent = `Window ${bcWinIdx > 0 ? bcWinIdx : 'Active'} - ${allTabs.length} Tabs`;

        updateToolbar();

        if (inSearch) {
            const matchedTabs = sortTabs(currentSearchQuery ? validTabs.filter(t => (t.title && t.title.toLowerCase().includes(currentSearchQuery)) || (t.url && t.url.toLowerCase().includes(currentSearchQuery))) : validTabs);
            selectableIds = matchedTabs.map(t => t.id);
            const total = matchedTabs.length;
            const headHTML = `<div class="search-head">${selectionHeadInner(total)}</div>`;

            if (total === 0) container.innerHTML = `${headHTML}<div class="search-empty-state">No tabs found for "${escapeHtml(currentSearchQuery)}"</div>`;
            else container.innerHTML = `${headHTML}<div class="tab-list">${matchedTabs.map(tab => createSearchTabHTML(tab, currentSearchQuery)).join('')}</div>`;

            bindSearchRows(); updateActionBar();
            if (enteringSearch) staggerIn([...container.children, ...container.querySelectorAll('.search-tab-item')]);
            wasSearchActive = true; return;
        }

        wasSearchActive = false;

        const chromeGroups = await chrome.tabGroups.query({ windowId: appState.activeWindowId });
        const groupedTabsIds = new Set();

        for (const [name, data] of Object.entries(appState.categories)) {
            const expectedTitle = data.emoji ? `${data.emoji} ${name}` : name;
            const matchingGroups = chromeGroups.filter(g => g.title === expectedTitle);
            let groupTabs = [], groupId = null, isCollapsed = false;

            if (matchingGroups.length > 0) {
                groupId = matchingGroups[0].id;
                isCollapsed = matchingGroups[0].collapsed;
                groupTabs.push(...validTabs.filter(t => t.groupId === groupId));
            }
            if (groupTabs.length === 0) continue;
            groupTabs.forEach(t => groupedTabsIds.add(t.id));
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

        if (container.innerHTML === '') container.innerHTML = '<div style="text-align:center; color:#888; margin-top:50px;">No tabs found.</div>';
        
        const countEl = document.getElementById('tab-count');
        if (countEl) countEl.textContent = `${validTabs.length} tab${validTabs.length !== 1 ? 's' : ''}`;

        staggerIn([...container.querySelectorAll('.group-section')]);
        attachTabEventListeners();
        selectableIds = selectMode ? [...container.querySelectorAll('.tab-item.ungrouped')].map(el => parseInt(el.dataset.id)) : [];
        updateActionBar();

    } catch (e) {
        console.error("Inner UI Render Error:", e);
        document.getElementById('groups-container').innerHTML = `<div style="color:red; padding: 20px; font-size: 12px; font-weight: bold;">Error loading window details.</div>`;
    }
}

/* --- RENDER HELPERS --- */
const SORT_LABELS = { recent: 'Recent', oldest: 'Oldest', az: 'Title A–Z', za: 'Title Z–A' };
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

const LIST_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
const GRID_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>';

function updateToolbar() {
    const label = document.getElementById('sort-label');
    if (label) label.textContent = SORT_LABELS[appState.sortBy] || 'Recent';
    const viewBtn = document.getElementById('view-btn');
    if (viewBtn) viewBtn.innerHTML = appState.viewMode === 'cards' ? LIST_ICON : GRID_ICON;
}

function selectionHeadInner(total) {
    const n = selectedTabIds.size;
    if (n > 0) return `<span class="sel-count"><strong>${n}</strong>/${total} SELECTED</span><button class="sel-clear">✕ CLEAR</button>`;
    return `<span class="sel-count sel-count-muted">${total} TAB${total !== 1 ? 'S' : ''}</span>`;
}

function bindSelectionHead() {
    const clear = document.querySelector('.search-head .sel-clear');
    if (clear) clear.addEventListener('click', () => { clearSelection(); renderInnerUI(); });
}

function bindSearchRows() {
    document.querySelectorAll('.search-tab-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const tabId = parseInt(e.currentTarget.dataset.id);
            if (e.target.closest('.tab-checkbox')) { toggleTabSelection(tabId); return; }
            const tab = await chrome.tabs.get(tabId);
            await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(tab.windowId, { focused: true });
        });
    });
}

function createSearchTabHTML(tab, query) {
    const ageString = getTimeAgo(tab.lastAccessed);
    let displayTitle = escapeHtml(tab.title || tab.url);
    if (query) { const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'); displayTitle = displayTitle.replace(regex, '<span class="search-highlight">$1</span>'); }
    const selectedCls = selectedTabIds.has(tab.id) ? ' row-selected' : '', activeCls = tab.active ? ' is-active' : '', activeDot = tab.active ? '<span class="active-dot" title="Current tab"></span>' : '';
    return `<div class="search-tab-item${selectedCls}${activeCls}" data-id="${tab.id}">${checkboxHTML(tab.id)}${activeDot}<span class="tab-title" title="${escapeHtml(tab.url)}">${displayTitle}</span><div class="tab-action-area"><span class="tab-age">${ageString}</span></div></div>`;
}

function createTabHTML(tab, isUngrouped = false) {
    const ageString = getTimeAgo(tab.lastAccessed), groupClass = isUngrouped ? 'ungrouped' : 'grouped';
    const selecting = isUngrouped && selectMode, leftControl = selecting ? checkboxHTML(tab.id) : `<span class="drag-handle">${GRIP_SVG}</span>`;
    const draggable = selecting ? 'false' : 'true', selectedCls = selecting && selectedTabIds.has(tab.id) ? ' row-selected' : '';
    const activeCls = tab.active ? ' is-active' : '', activeDot = tab.active ? '<span class="active-dot" title="Current tab"></span>' : '';
    return `<div class="tab-item ${groupClass}${selectedCls}${activeCls}" draggable="${draggable}" data-id="${tab.id}">${leftControl}${activeDot}<span class="tab-title" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title || tab.url)}</span><div class="tab-action-area"><span class="tab-age">${ageString}</span>${!isUngrouped ? `<button class="btn-delete-tab" data-id="${tab.id}" title="Remove"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 3.5H12.5M4.5 3.5V2C4.5 1.17157 5.17157 0.5 6 0.5H8C8.82843 0.5 9.5 1.17157 9.5 2V3.5M5.5 6.5V10.5M8.5 6.5V10.5M2.5 3.5V11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H9.5C10.6046 13.5 11.5 12.6046 11.5 11.5V3.5"/></svg></button>` : ''}</div></div>`;
}

function createGroupHTML(name, color, tabs, isUngrouped = false, groupId = null, isCollapsed = false, hasActiveTab = false) {
    const cards = appState.viewMode === 'cards';
    let tabsHTML = tabs.map(tab => cards ? createTabCardHTML(tab, isUngrouped) : createTabHTML(tab, isUngrouped)).join('');
    const groupData = appState.categories[name];
    if (tabs.length === 0 && !isUngrouped) tabsHTML = `<div class="empty-group-helper">Blank group. Drag tabs here to add.</div>`;

    let customStyles = '', emojiDisplay = '';
    if (groupData) {
        if (groupData.customHex) customStyles = `background-color: ${groupData.customHex}; color: ${getContrastYIQ(groupData.customHex)};`;
        if (groupData.emoji) emojiDisplay = `<span class="pill-emoji">${groupData.emoji}</span>`;
    }
    const reorderHandle = `<span class="group-drag-handle" title="Drag to reorder" draggable="true" data-group-name="${escapeHtml(name)}">${GRIP_SVG}</span>`;
    let headerHTML = '';

    if (isUngrouped) {
        const active = selectMode ? ' active' : '';
        headerHTML = `<div class="ungrouped-header"><div class="ungrouped-label">${name} (${tabs.length})</div><button class="select-toggle${active}" title="Select multiple" aria-pressed="${selectMode}"><span class="tab-checkbox${selectMode ? ' checked' : ''}">${CHECK_SVG}</span><span class="select-toggle-label">Select</span></button></div>`;
    } else if (isCollapsed && groupId) {
        const activeDot = hasActiveTab ? '<span class="active-dot" title="Current tab is in this group"></span>' : '';
        headerHTML = `${reorderHandle}<div class="group-title-pill full-width bg-${color}" data-name="${name}" style="${customStyles}"><div class="pill-left">${emojiDisplay} ${name} (${tabs.length}) ${activeDot}</div><div class="collapsed-meta group-toggle-btn" data-group-id="${groupId}" data-collapsed="true">COLLAPSED<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div></div>`;
    } else {
        headerHTML = `${groupId ? reorderHandle : ''}<div class="group-title-pill bg-${color}" data-name="${name}" style="${customStyles}">${emojiDisplay} ${name} (${tabs.length})</div>${groupId ? `<button class="group-toggle-btn" data-group-id="${groupId}" data-collapsed="false" title="Collapse Group"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"></polyline></svg></button>` : ''}`;
    }
    return `<div class="group-section ${isCollapsed ? 'is-collapsed' : ''} ${isUngrouped ? 'is-ungrouped' : ''}" data-group-name="${escapeHtml(name)}"><div class="group-header">${headerHTML}</div><div class="tab-list ${appState.viewMode === 'cards' ? 'tab-grid' : ''}" style="${isCollapsed ? 'display: none;' : ''}">${tabsHTML}</div></div>`;
}

function createTabCardHTML(tab, isUngrouped = false) {
    const ageString = getTimeAgo(tab.lastAccessed), groupClass = isUngrouped ? 'ungrouped' : 'grouped';
    const selecting = isUngrouped && selectMode, draggable = selecting ? 'false' : 'true';
    const selectedCls = selecting && selectedTabIds.has(tab.id) ? ' row-selected' : '', activeCls = tab.active ? ' is-active' : '';
    const leftControl = selecting ? checkboxHTML(tab.id) : `<span class="drag-handle">${GRIP_SVG}</span>`;
    const fav = tab.favIconUrl && /^https?:/.test(tab.favIconUrl) ? `<img class="card-favicon" src="${escapeHtml(tab.favIconUrl)}" alt="">` : `<span class="card-favicon card-favicon-fallback">${tab.active ? '' : ''}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></span>`;
    return `<div class="tab-item card ${groupClass}${selectedCls}${activeCls}" draggable="${draggable}" data-id="${tab.id}"><div class="card-top">${leftControl}${!isUngrouped ? `<button class="btn-delete-tab" data-id="${tab.id}" title="Remove"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="pointer-events:none;"><path d="M1.5 3.5H12.5M4.5 3.5V2C4.5 1.17157 5.17157 0.5 6 0.5H8C8.82843 0.5 9.5 1.17157 9.5 2V3.5M5.5 6.5V10.5M8.5 6.5V10.5M2.5 3.5V11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H9.5C10.6046 13.5 11.5 12.6046 11.5 11.5V3.5"/></svg></button>` : ''}</div>${fav}<div class="card-title" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title || tab.url)}</div><div class="card-age">${ageString}</div></div>`;
}

function attachTabEventListeners() {
    document.querySelectorAll('.group-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); const groupId = parseInt(e.currentTarget.dataset.groupId);
            if (groupId) { 
                const isCurrentlyCollapsed = e.currentTarget.dataset.collapsed === 'true';
                await chrome.tabGroups.update(groupId, { collapsed: !isCurrentlyCollapsed }); 
                renderInnerUI(); 
            }
        });
    });

    document.querySelectorAll('.select-toggle').forEach(btn => {
        btn.addEventListener('click', () => { selectMode = !selectMode; if (!selectMode) clearSelection(); renderInnerUI(); });
    });

    if (appState.viewMode === 'cards') {
        document.querySelectorAll('.tab-item.card').forEach(card => {
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.tab-checkbox') || e.target.closest('.btn-delete-tab') || e.target.closest('.drag-handle')) return;
                if (selectMode && card.classList.contains('ungrouped')) return;
                const tabId = parseInt(card.dataset.id); const tab = await chrome.tabs.get(tabId);
                await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(tab.windowId, { focused: true });
            });
        });
    }

    document.querySelectorAll('.tab-item.ungrouped').forEach(item => {
        if (!selectMode) return;
        item.addEventListener('click', (e) => { if (e.target.closest('.btn-delete-tab')) return; toggleTabSelection(parseInt(item.dataset.id)); });
    });

    document.querySelectorAll('.tab-item[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', (e) => { draggedTabId = parseInt(item.dataset.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => item.style.opacity = '0.4', 0); });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; draggedTabId = null; document.querySelectorAll('.group-section').forEach(c => c.classList.remove('drag-over', 'reorder-before', 'reorder-after')); });
    });

    document.querySelectorAll('.group-drag-handle').forEach(handle => {
        handle.addEventListener('dragstart', (e) => {
            draggedGroupName = handle.dataset.groupName; e.dataTransfer.effectAllowed = 'move';
            const section = handle.closest('.group-section'); if (section) setTimeout(() => section.classList.add('group-dragging'), 0);
        });
        handle.addEventListener('dragend', () => { draggedGroupName = null; document.querySelectorAll('.group-section').forEach(c => c.classList.remove('drag-over', 'reorder-before', 'reorder-after', 'group-dragging')); });
    });

    document.querySelectorAll('.group-section').forEach(section => {
        section.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedGroupName) {
                section.classList.remove('drag-over');
                if (section.classList.contains('is-ungrouped') || section.dataset.groupName === draggedGroupName) return;
                const rect = section.getBoundingClientRect(); const after = (e.clientY - rect.top) > rect.height / 2;
                section.classList.toggle('reorder-after', after); section.classList.toggle('reorder-before', !after);
            } else if (draggedTabId) section.classList.add('drag-over');
        });
        section.addEventListener('dragleave', () => section.classList.remove('drag-over', 'reorder-before', 'reorder-after'));

        section.addEventListener('drop', async (e) => {
            e.preventDefault(); const targetGroup = section.dataset.groupName;
            if (draggedGroupName) {
                const placeAfter = section.classList.contains('reorder-after');
                section.classList.remove('reorder-before', 'reorder-after');
                if (!section.classList.contains('is-ungrouped') && targetGroup !== draggedGroupName) {
                    moveCategoryOrder(draggedGroupName, targetGroup, placeAfter);
                    await chrome.storage.local.set({ categories: appState.categories }); await applyGroupOrderToChrome(); renderInnerUI();
                }
                draggedGroupName = null; return;
            }

            section.classList.remove('drag-over');
            if (draggedTabId) {
                if (targetGroup && targetGroup !== 'Untitled') {
                    const groupData = appState.categories[targetGroup], expectedTitle = groupData.emoji ? `${groupData.emoji} ${targetGroup}` : targetGroup;
                    const existingGroups = await chrome.tabGroups.query({ windowId: appState.activeWindowId, title: expectedTitle });
                    if (existingGroups.length > 0) await chrome.tabs.group({ groupId: existingGroups[0].id, tabIds: [draggedTabId] });
                    else {
                        const gId = await chrome.tabs.group({ tabIds: [draggedTabId] });
                        await chrome.tabGroups.update(gId, { title: expectedTitle, color: groupData.color });
                    }
                    await clearManualUngroupTab(draggedTabId);
                } else if (targetGroup === 'Untitled') {
                    await chrome.tabs.ungroup(draggedTabId); await markManualUngroupTab(draggedTabId);
                }
                if (currentSearchQuery) { document.getElementById('search-input').value = ''; currentSearchQuery = ''; document.getElementById('search-clear').classList.add('hidden'); }
                renderInnerUI();
            }
        });
    });

    document.querySelectorAll('.btn-delete-tab').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); const tabId = parseInt(e.currentTarget.dataset.id);
            await chrome.tabs.ungroup(tabId); await markManualUngroupTab(tabId); renderInnerUI();
        });
    });

    document.querySelectorAll('.group-title-pill').forEach(pill => {
        pill.addEventListener('click', (e) => { if (e.target.closest('.group-toggle-btn')) return; if (pill.dataset.name) openModal(pill.dataset.name); });
    });
}

function openModal(groupName) {
    editingGroupName = groupName; const groupData = groupName ? appState.categories[groupName] : null, fromSelection = !groupName && pendingGroupTabIds && pendingGroupTabIds.length;
    document.getElementById('modal-title-text').textContent = groupName ? 'Edit' : (fromSelection ? `New Group · ${pendingGroupTabIds.length} tab${pendingGroupTabIds.length !== 1 ? 's' : ''}` : 'Add Group');
    document.getElementById('modal-save').textContent = groupName ? 'Update' : (fromSelection ? 'Create Group' : 'Save');
    document.getElementById('modal-name').value = groupName || '';
    document.getElementById('modal-keywords').value = groupData && groupData.keywords ? groupData.keywords.join(', ') : '';
    document.getElementById('modal-custom-color').value = ''; document.getElementById('hex-preview').style.backgroundColor = 'transparent'; document.getElementById('color-helper-text').classList.add('hidden');
    document.getElementById('emoji-picker-view').classList.add('hidden'); document.getElementById('modal-settings-view').classList.remove('hidden');

    activeSelectedEmoji = groupData && groupData.emoji ? groupData.emoji : null; updateEmojiUI(); renderCustomColors();

    if (groupData && groupData.customHex) {
        const targetDot = document.querySelector(`.custom-color-dot[data-custom-hex="${groupData.customHex}"]`);
        if (targetDot) selectColorDot(targetDot);
        else {
            selectColorDot(document.querySelector('.color-dot.bg-green')); activeSelectedHex = groupData.customHex;
            const inputCont = document.getElementById('modal-input-container'); inputCont.style.backgroundColor = groupData.customHex; inputCont.style.color = getContrastYIQ(groupData.customHex);
        }
    } else {
        const mappedColor = document.querySelector(`.color-dot.bg-${groupData ? groupData.color : 'green'}`);
        selectColorDot(mappedColor || document.querySelector('.color-dot.bg-green'));
    }
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
        activeSelectedHex = typedHex;
        if (!appState.customColors.some(c => c.toUpperCase() === typedHex.toUpperCase())) appState.customColors.push(typedHex);
    }

    const keywords = keywordsStr ? keywordsStr.split(',').map(k => k.trim()).filter(k => k) : [];
    const selectedDot = document.querySelector('.color-dot.selected'), color = selectedDot ? selectedDot.dataset.color : 'grey';
    const customHex = activeSelectedHex, emoji = activeSelectedEmoji, newExpectedTitle = emoji ? `${emoji} ${name}` : name;

    if (editingGroupName) {
        const oldData = appState.categories[editingGroupName], oldExpectedTitle = oldData && oldData.emoji ? `${oldData.emoji} ${editingGroupName}` : editingGroupName;
        if (editingGroupName !== name) delete appState.categories[editingGroupName];
        const groups = await chrome.tabGroups.query({ windowId: appState.activeWindowId, title: oldExpectedTitle });
        if (groups.length > 0) await chrome.tabGroups.update(groups[0].id, { title: newExpectedTitle, color: color });
    } else {
        const groups = await chrome.tabGroups.query({ windowId: appState.activeWindowId, title: newExpectedTitle });
        if (groups.length > 0) await chrome.tabGroups.update(groups[0].id, { color: color });
    }

    appState.categories[name] = { color, keywords, customHex, emoji };
    
    await chrome.storage.local.set({ categories: appState.categories, customColors: appState.customColors });
    chrome.runtime.sendMessage({ action: "refreshMenus" });

    const tabsToGroup = (!editingGroupName && pendingGroupTabIds && pendingGroupTabIds.length) ? [...pendingGroupTabIds] : null;
    if (tabsToGroup) {
        const existing = await chrome.tabGroups.query({ windowId: appState.activeWindowId, title: newExpectedTitle });
        if (existing.length > 0) { await chrome.tabs.group({ groupId: existing[0].id, tabIds: tabsToGroup }); await chrome.tabGroups.update(existing[0].id, { color }); } 
        else { const gId = await chrome.tabs.group({ tabIds: tabsToGroup }); await chrome.tabGroups.update(gId, { title: newExpectedTitle, color }); }
        selectMode = false; clearSelection(); searchFocused = false; currentSearchQuery = '';
        const input = document.getElementById('search-input'); if (input) input.value = '';
        document.getElementById('search-clear').classList.add('hidden');
    }

    if (tabsToGroup) await applyGroupOrderToChrome();
    closeModal(); 
    if (appState.currentView === 'inner') renderInnerUI(); else renderDashboard();
}

async function deleteCurrentGroup() {
    if (editingGroupName && appState.categories[editingGroupName]) {
        const oldData = appState.categories[editingGroupName];
        const expectedTitle = oldData && oldData.emoji ? `${oldData.emoji} ${editingGroupName}` : editingGroupName;
        
        delete appState.categories[editingGroupName];
        await chrome.storage.local.set({ categories: appState.categories });

        const groups = await chrome.tabGroups.query({ windowId: appState.activeWindowId, title: expectedTitle });
        if (groups.length > 0) {
            const tabs = await chrome.tabs.query({ groupId: groups[0].id });
            const tabIds = tabs.map(t => t.id);
            if (tabIds.length > 0) await chrome.tabs.ungroup(tabIds);
        }
        closeModal(); 
        if (appState.currentView === 'inner') renderInnerUI(); else renderDashboard();
    } else {
        closeModal();
    }
}

// --- GLOBAL UTILS ---
function openMenu(anchorEl, items) {
    closeMenu();
    const rect = anchorEl.getBoundingClientRect();
    const backdrop = document.createElement('div');
    backdrop.className = 'menu-backdrop'; backdrop.addEventListener('click', closeMenu);

    const menu = document.createElement('div'); menu.className = 'popup-menu';
    items.forEach(it => {
        const btn = document.createElement('button');
        btn.className = 'popup-menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '');
        btn.innerHTML = it.label;
        btn.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.onClick(); });
        menu.appendChild(btn);
    });

    document.body.appendChild(backdrop); document.body.appendChild(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let top = rect.bottom + 6, left = rect.left;
    
    if (left + mw > window.innerWidth - 8) left = (rect.right - mw);
    if (top + mh > window.innerHeight - 8) {
        top = rect.top - mh - 6;
        if (top < 8) top = window.innerHeight - mh - 8;
    }
    
    menu.style.top = `${top}px`; menu.style.left = `${Math.max(8, left)}px`;
}
function closeMenu() { document.querySelectorAll('.popup-menu, .menu-backdrop').forEach(el => el.remove()); }

async function firstRunIfNeeded() {
    const { hasOnboarded } = await chrome.storage.local.get(['hasOnboarded']);
    if (hasOnboarded) return false;
    appState.autoGroup = true;
    await chrome.storage.local.set({ hasOnboarded: true, autoGroup: true });
    await runSync(true);
    return true;
}

async function runSync(showOverlay = false) {
    const overlay = document.getElementById('sync-overlay');
    if (showOverlay) overlay.classList.remove('hidden');

    try {
        const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        let stateChanged = false;
        const emojiRegex = /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)\s*(.+)$/u;

        for (const g of existingGroups) {
            if (!g.title) continue;
            let found = false;
            for (const [catName, catData] of Object.entries(appState.categories)) {
                const expectedTitle = catData.emoji ? `${catData.emoji} ${catName}` : catName;
                if (g.title === expectedTitle || g.title === catName) { found = true; break; }
            }
            if (!found) {
                let importName = g.title, importEmoji = null;
                const match = importName.match(emojiRegex);
                if (match) { importEmoji = match[1]; importName = match[2]; }
                appState.categories[importName] = { color: g.color, keywords: [], customHex: null, emoji: importEmoji };
                stateChanged = true;
            }
        }
        
        if (appState.autoGroup) {
            try {
                await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: "runAutoGroup" }, () => {
                        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
                        resolve();
                    });
                });
            } catch (e) {}
        }
        if (stateChanged) await chrome.storage.local.set({ categories: appState.categories });
        if (showOverlay) await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (appState.currentView === 'inner') renderInnerUI(); else renderDashboard();
    } catch (e) {
        console.error('Sync failed:', e);
    } finally {
        if (showOverlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('fade-out'); }, 380);
        }
    }
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
function pushRecentSearch(q) {
    const query = (q || '').trim(); if (!query) return;
    appState.recentSearches = [query, ...appState.recentSearches.filter(s => s.toLowerCase() !== query.toLowerCase())].slice(0, 6);
    chrome.storage.local.set({ recentSearches: appState.recentSearches });
}
function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `Inactive since ${weeks} weeks`;
}
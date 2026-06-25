let appState = { categories: {}, autoGroup: false };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadState();
        await renderDashboard();
        setupDashboardEvents();
    } catch (error) { console.error("Dashboard error:", error); }
});

async function loadState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['categories', 'autoGroup'], (result) => {
            appState.categories = result.categories || {};
            appState.autoGroup = result.autoGroup || false;
            resolve();
        });
    });
}

function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function getDomain(url) { if (!url || !url.startsWith('http')) return 'Internal Page'; try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'Unknown'; } }
function getTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function renderDashboard() {
    const container = document.getElementById('windows-grid-container');
    const currentWin = await chrome.windows.getCurrent();
    const allWindows = await chrome.windows.getAll({ populate: true });
    
    const windows = allWindows.filter(w => w.tabs && w.tabs.length > 0);
    windows.sort((a,b) => (a.id === currentWin.id ? -1 : (b.id === currentWin.id ? 1 : 0)));

    const count = windows.length;
    const gridType = count > 4 ? 'more' : count.toString();
    const colors = ['win-bg-1', 'win-bg-2', 'win-bg-3', 'win-bg-4'];
    let gridHTML = `<div class="dash-grid" data-count="${gridType}">`;

    for (let i = 0; i < Math.min(count, 4); i++) {
        const win = windows[i];
        const colorCls = colors[i % colors.length];
        
        if (count > 4 && i === 3) {
            const remaining = windows.slice(3).reduce((acc, w) => acc + w.tabs.length, 0);
            gridHTML += `<button class="win-card ${colorCls} win-card-more" data-winid="${win.id}"><div class="win-more-count">+${remaining}</div><div class="win-more-label">Tabs hidden</div></button>`;
            break;
        }

        const pTab = win.tabs.find(t => t.active && !t.url.startsWith('chrome')) || win.tabs.find(t => !t.url.startsWith('chrome')) || win.tabs[0];
        let previewHTML = '';
        if (gridType === '1' || (gridType === '3' && i === 1)) {
            previewHTML = `<div class="win-preview">${pTab && pTab.favIconUrl ? `<img src="${escapeHtml(pTab.favIconUrl)}">` : '<div style="color:rgba(0,0,0,0.3); font-size:11px; font-weight:600;">No Preview</div>'}</div>`;
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
                <div class="win-count">${win.tabs.length}</div>
                <div class="win-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></div>
            </div>
        </button>`;
    }
    gridHTML += `</div>`;
    container.innerHTML = count > 0 ? gridHTML : '<div style="text-align:center; color:#9CA3AF; font-size:13px; padding:20px;">No open windows.</div>';

    const allTabs = windows.flatMap(w => w.tabs).filter(t => t.url && !t.url.startsWith('chrome'));
    allTabs.sort((a,b) => (b.lastAccessed||0) - (a.lastAccessed||0));
    const favTabs = allTabs.slice(0, 5);
    
    document.getElementById('favorites-container').innerHTML = favTabs.length > 0 ? favTabs.map((t, idx) => {
        const delay = idx * 30;
        return `
        <div class="fav-item anim-in" style="animation-delay: ${delay}ms;" data-tabid="${t.id}" data-winid="${t.windowId}">
            <svg class="fav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
            <div class="fav-text" title="${escapeHtml(t.url)}">${escapeHtml(getDomain(t.url))}</div>
            <div class="fav-time">${getTimeAgo(t.lastAccessed)}</div>
        </div>`;
    }).join('') : '<div style="color:#9CA3AF; font-size:12px;">No recent tabs.</div>';

    bindGridEvents();
}

function bindGridEvents() {
    document.querySelectorAll('.win-card[data-winid]').forEach(card => {
        card.addEventListener('click', (e) => {
            if(e.target.closest('.win-kebab')) return;
            window.location.href = `inner.html?windowId=${card.dataset.winid}`;
        });
    });

    document.querySelectorAll('.win-kebab').forEach(k => {
        k.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenu(e.currentTarget, [
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

function setupDashboardEvents() {
    document.getElementById('fab-create').addEventListener('click', async () => {
        const win = await chrome.windows.getCurrent();
        window.location.href = `inner.html?windowId=${win.id}&action=create`;
    });

    // FIX 3: Event propagation strict handling
    document.getElementById('avatar-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const data = await chrome.storage.local.get('autoGroup');
        const isAuto = data.autoGroup || false;
        
        openMenu(e.currentTarget, [
            { label: `Auto Group: ${isAuto ? 'On' : 'Off'}`, onClick: async () => {
                await chrome.storage.local.set({ autoGroup: !isAuto });
                appState.autoGroup = !isAuto;
                if(!isAuto) await runSync(false);
            }},
            { label: 'Sync now', onClick: () => runSync(true) },
            { label: 'Settings', onClick: () => alert("Settings coming soon") }
        ]);
    });

    const dashSearch = document.getElementById('dash-search-input');
    dashSearch.addEventListener('focus', () => window.location.href = `inner.html?windowId=all&focusSearch=true&source=dashboard`);
    dashSearch.addEventListener('click', () => window.location.href = `inner.html?windowId=all&focusSearch=true&source=dashboard`);
    dashSearch.addEventListener('keypress', async (e) => {
        if(e.key === 'Enter' && e.target.value.trim() !== '') {
            window.location.href = `inner.html?windowId=all&search=${encodeURIComponent(e.target.value)}&source=dashboard`;
        }
    });
}

function openMenu(anchorEl, items) {
    document.querySelectorAll('.popup-menu, .menu-backdrop').forEach(el => el.remove());
    const rect = anchorEl.getBoundingClientRect();
    const backdrop = document.createElement('div'); backdrop.className = 'menu-backdrop'; backdrop.onclick = () => document.querySelectorAll('.popup-menu, .menu-backdrop').forEach(el => el.remove());
    const menu = document.createElement('div'); menu.className = 'popup-menu';
    items.forEach(it => {
        const btn = document.createElement('button'); btn.className = 'popup-menu-item ' + (it.danger ? 'danger' : ''); btn.innerHTML = it.label;
        btn.onclick = () => { backdrop.remove(); menu.remove(); it.onClick(); };
        menu.appendChild(btn);
    });
    document.body.appendChild(backdrop); document.body.appendChild(menu);
    let top = rect.bottom + 6, left = rect.left;
    if (left + menu.offsetWidth > window.innerWidth - 8) left = (rect.right - menu.offsetWidth);
    menu.style.top = `${top}px`; menu.style.left = `${Math.max(8, left)}px`;
}

async function runSync(showOverlay = false) {
    const overlay = document.getElementById('sync-overlay');
    if (showOverlay) overlay.classList.remove('hidden');

    try {
        if (appState.autoGroup) {
            await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: "runAutoGroup" }, () => resolve());
            });
        }
        if (showOverlay) await new Promise(resolve => setTimeout(resolve, 800));
        await renderDashboard();
    } catch (e) {
        console.error('Sync failed:', e);
    } finally {
        if (showOverlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('fade-out'); }, 300);
        }
    }
}
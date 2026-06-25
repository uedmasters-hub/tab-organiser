let appState = { categories: {}, autoGroup: false, favorites: [] };

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadState();
        await renderDashboard();
        setupDashboardEvents();
    } catch (error) { console.error("Dashboard error:", error); }
});

async function loadState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['categories', 'autoGroup', 'favorites'], (result) => {
            appState.categories = result.categories || {};
            appState.autoGroup = result.autoGroup || false;
            appState.favorites = result.favorites || [];
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

    const favHTML = appState.favorites.length > 0 ? appState.favorites.map((f, idx) => {
        const fallbackIcon = `<svg class="fav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        const iconHTML = f.favIconUrl ? `<img class="fav-icon-img" src="${escapeHtml(f.favIconUrl)}" onerror="this.style.display='none'">` : fallbackIcon;
        return `
        <div class="fav-item anim-in" style="animation-delay: ${idx * 30}ms;" data-url="${escapeHtml(f.url)}">
            ${iconHTML}
            <div class="fav-text" title="${escapeHtml(f.title)}">${escapeHtml(getDomain(f.url))}</div>
            <button class="fav-remove-btn" title="Remove" data-url="${escapeHtml(f.url)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>`;
    }).join('') : '<div style="color:#9CA3AF; font-size:12px;">No favorites added yet.</div>';
    
    document.getElementById('favorites-container').innerHTML = favHTML;

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
            if(e.target.closest('.fav-remove-btn')) return;
            const targetUrl = item.dataset.url;
            const tabs = await chrome.tabs.query({});
            const openTab = tabs.find(t => t.url === targetUrl);
            
            if (openTab) {
                await chrome.tabs.update(openTab.id, { active: true });
                await chrome.windows.update(openTab.windowId, { focused: true });
            } else {
                await chrome.tabs.create({ url: targetUrl });
            }
        });
    });

    document.querySelectorAll('.fav-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            appState.favorites = appState.favorites.filter(f => f.url !== url);
            await chrome.storage.local.set({ favorites: appState.favorites });
            renderDashboard();
        });
    });
}

function setupDashboardEvents() {
    document.getElementById('fab-create').addEventListener('click', async () => {
        const win = await chrome.windows.getCurrent();
        window.location.href = `inner.html?windowId=${win.id}&action=create`;
    });

    document.getElementById('group-favs-btn')?.addEventListener('click', async () => {
        if (appState.favorites.length === 0) return;
        const currentWin = await chrome.windows.getCurrent();
        const tabIds = [];
        
        for (const f of appState.favorites) {
            const tab = await chrome.tabs.create({ url: f.url, windowId: currentWin.id, active: false });
            tabIds.push(tab.id);
        }
        
        const gId = await chrome.tabs.group({ tabIds, windowId: currentWin.id });
        await chrome.tabGroups.update(gId, { title: "Favorites", color: "yellow" });
        window.location.href = `inner.html?windowId=${currentWin.id}`;
    });

    // FIX: Flawless Avatar menu binding
    document.getElementById('avatar-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.currentTarget, [
            { label: `Auto Group: ${appState.autoGroup ? 'On' : 'Off'}`, onClick: async () => {
                appState.autoGroup = !appState.autoGroup;
                await chrome.storage.local.set({ autoGroup: appState.autoGroup });
                if(appState.autoGroup) await runSync(false);
            }},
            { label: 'Sync now', onClick: () => runSync(true) },
            { label: 'Settings', onClick: () => alert("Settings coming soon") }
        ]);
    });

    // FIX: Click anywhere in the pill to open global search
    const dashSearchBox = document.querySelector('.search-box');
    dashSearchBox.addEventListener('click', (e) => {
        if (e.target.closest('#avatar-btn')) return; // let avatar handle itself
        window.location.href = `inner.html?windowId=all&focusSearch=true&source=dashboard`;
    });

    const dashSearchInput = document.getElementById('dash-search-input');
    dashSearchInput.addEventListener('keypress', async (e) => {
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
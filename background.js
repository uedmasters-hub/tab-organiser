// Default categories
const DEFAULT_CATEGORIES = {
    'Development': { color: 'green', keywords: ['github.com', 'stackoverflow.com'] },
    'Google': { color: 'blue', keywords: ['google.com'] }
};

// Initialize on install AND startup; seed defaults once.
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['categories'], (result) => {
        if (!result.categories) {
            chrome.storage.local.set({ categories: DEFAULT_CATEGORIES, autoGroup: false });
        }
        rebuildContextMenu();
    });
});
chrome.runtime.onStartup.addListener(() => rebuildContextMenu());

// Build "Move to Group" from the tab groups that ACTUALLY exist right now.
// This way phantom/empty categories never appear, and each item carries the
// real group id so the move can't target the wrong (or a duplicate) group.
let _menuRebuildTimer = null;
function rebuildContextMenu() {
    clearTimeout(_menuRebuildTimer);
    _menuRebuildTimer = setTimeout(async () => {
        try {
            const groups = await chrome.tabGroups.query({});
            await new Promise(res => chrome.contextMenus.removeAll(res));
            chrome.contextMenus.create({ id: "move_to_group_parent", title: "Move to Group", contexts: ["all"] });

            const titled = groups.filter(g => g.title && g.title.trim());
            if (titled.length === 0) {
                chrome.contextMenus.create({
                    id: "move_none", parentId: "move_to_group_parent",
                    title: "No groups yet", enabled: false, contexts: ["all"]
                });
                return;
            }
            for (const g of titled) {
                chrome.contextMenus.create({
                    id: `movegrp_${g.id}`,
                    parentId: "move_to_group_parent",
                    title: g.title,
                    contexts: ["all"]
                });
            }
        } catch (e) {
            console.error("rebuildContextMenu failed:", e);
        }
    }, 120);
}

// Keep the menu in lockstep with the real groups.
chrome.tabGroups.onCreated.addListener(rebuildContextMenu);
chrome.tabGroups.onUpdated.addListener(rebuildContextMenu);
chrome.tabGroups.onRemoved.addListener(rebuildContextMenu);

// Move the right-clicked tab into the chosen live group (by id — bulletproof).
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // 1. Double check the tab and ID are strictly valid
    if (!tab || typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) return;

    const id = info.menuItemId;
    if (typeof id !== 'string' || !id.startsWith('move_') || id === 'move_to_group_parent') return;

    try {
        const groupName = id.replace("move_", "");
        const { categories } = await chrome.storage.local.get('categories');
        const groupData = categories ? categories[groupName] : null;
        const expectedTitle = groupData && groupData.emoji ? `${groupData.emoji} ${groupName}` : groupName;

        const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
        const targetGroup = existingGroups.find(g => g.title === expectedTitle);

        // 2. Wrap the API call in an extra safety check
        const tabId = tab.id;
        
        if (targetGroup) {
            // Only move if it's not already in the target group
            if (tab.groupId !== targetGroup.id) {
                await chrome.tabs.group({ groupId: targetGroup.id, tabIds: [tabId] });
            }
        } else {
            // Create a new group
            const groupId = await chrome.tabs.group({ tabIds: [tabId] });
            await chrome.tabGroups.update(groupId, { 
                title: expectedTitle, 
                color: groupData ? groupData.color : 'grey' 
            });
        }
        await clearManualUngroup(tabId);
    } catch (error) {
        // This catch block prevents the 'Unchecked runtime.lastError' in the console
        console.warn("Operation cancelled: Tab may have closed or invalid state.", error);
    }
});

// ----- Manual placement memory -----
// Tabs the user explicitly ungrouped should not be re-grouped by auto-group
// while they stay on the same site. Stored as { [tabId]: hostname }.
function hostnameOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

async function markManualUngroup(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const { manualUngroup = {} } = await chrome.storage.local.get('manualUngroup');
        manualUngroup[tabId] = hostnameOf(tab.url);
        await chrome.storage.local.set({ manualUngroup });
    } catch (e) { /* tab gone */ }
}

async function clearManualUngroup(tabId) {
    try {
        const { manualUngroup = {} } = await chrome.storage.local.get('manualUngroup');
        if (manualUngroup[tabId] !== undefined) {
            delete manualUngroup[tabId];
            await chrome.storage.local.set({ manualUngroup });
        }
    } catch (e) { /* ignore */ }
}

// Listen for Auto-Group toggle and Category changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.autoGroup && changes.autoGroup.newValue === true) {
        runAutoGroup();
    }
    if (changes.categories) {
        rebuildContextMenu();
    }
});

// ============================================================
//  STRONG MATCHING ENGINE
//  Scores each tab against every category using Title /
//  Description / Meta keywords / og:site_name / URL, then
//  assigns it to the BEST-scoring category above a threshold.
// ============================================================

// Runs INSIDE the page (must be self-contained — no outer references).
function extractPageMeta() {
    const pick = (sel, attr = 'content') => {
        const el = document.querySelector(sel);
        if (!el) return '';
        return (el.getAttribute(attr) || el.textContent || '').trim();
    };
    return {
        title: (document.title || '').trim(),
        description: pick('meta[name="description"]') || pick('meta[property="og:description"]'),
        keywords: pick('meta[name="keywords"]'),
        siteName: pick('meta[property="og:site_name"]'),
        ogTitle: pick('meta[property="og:title"]'),
        heading: (document.querySelector('h1') ? document.querySelector('h1').textContent : '').trim().slice(0, 140)
    };
}

// Best-effort cache (cleared whenever the service worker restarts).
const metaCache = new Map(); // key: `${tabId}::${url}` -> meta object

// Drop stale cache entries when tabs close or navigate.
chrome.tabs.onRemoved.addListener((tabId) => {
    for (const key of metaCache.keys()) {
        if (key.startsWith(`${tabId}::`)) metaCache.delete(key);
    }
    clearManualUngroup(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        for (const key of metaCache.keys()) {
            if (key.startsWith(`${tabId}::`)) metaCache.delete(key);
        }
        // Note: manualUngroup is keyed by hostname and compared at group time,
        // so SPA URL changes won't wrongly re-group; no clearing needed here.
    }
});

async function getTabMeta(tab) {
    const key = `${tab.id}::${tab.url}`;
    if (metaCache.has(key)) return metaCache.get(key);

    const fallback = {
        title: tab.title || '',
        description: '',
        keywords: '',
        siteName: '',
        ogTitle: '',
        heading: ''
    };

    // Never wake a discarded tab or scrape one that hasn't finished loading —
    // just use the title we already have.
    if (tab.discarded || tab.status !== 'complete') {
        metaCache.set(key, fallback);
        return fallback;
    }

    try {
        const injection = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageMeta
        });
        const meta = (injection && injection[0] && injection[0].result) ? injection[0].result : fallback;
        metaCache.set(key, meta);
        return meta;
    } catch (e) {
        // Restricted page (Web Store, PDF viewer) or host permission missing.
        metaCache.set(key, fallback);
        return fallback;
    }
}

// Field importance. Domain/URL and the page title are the strongest signals.
const FIELD_WEIGHTS = {
    hostname: 3,
    url: 3,
    siteName: 2.5,
    title: 2,
    ogTitle: 2,
    heading: 1.5,
    keywords: 1.5,
    description: 1
};

// Minimum score required to actually move a tab into a group.
const MATCH_THRESHOLD = 2;

function buildSearchFields(tab, meta) {
    let hostname = '';
    try { hostname = new URL(tab.url).hostname.toLowerCase(); } catch (e) { /* opaque url */ }
    return {
        hostname,
        url: (tab.url || '').toLowerCase(),
        siteName: (meta.siteName || '').toLowerCase(),
        title: (meta.title || tab.title || '').toLowerCase(),
        ogTitle: (meta.ogTitle || '').toLowerCase(),
        heading: (meta.heading || '').toLowerCase(),
        keywords: (meta.keywords || '').toLowerCase(),
        description: (meta.description || '').toLowerCase()
    };
}

function keywordMatchesField(keyword, fieldName, fieldValue) {
    if (!fieldValue) return false;
    const kw = keyword.toLowerCase().trim();
    if (!kw) return false;

    const looksLikeDomain = kw.includes('.') || kw.includes('/');

    // Domain-style keys (github.com) → plain substring anywhere.
    if (looksLikeDomain) return fieldValue.includes(kw);

    // URLs are token soup, so substring is fine there ("react" in "react.dev").
    if (fieldName === 'url' || fieldName === 'hostname') return fieldValue.includes(kw);

    // For human-readable text, require a word boundary so "go" doesn't match
    // "google" and inflate the score.
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return re.test(fieldValue);
}

function scoreCategory(fields, keywords) {
    if (!keywords || keywords.length === 0) return 0;

    let score = 0;
    const matchedKeywords = new Set();

    for (const [fieldName, weight] of Object.entries(FIELD_WEIGHTS)) {
        const value = fields[fieldName];
        if (!value) continue;
        for (const kw of keywords) {
            if (keywordMatchesField(kw, fieldName, value)) {
                score += weight;
                matchedKeywords.add(kw.toLowerCase().trim());
            }
        }
    }

    // Topical bonus: matching several distinct keywords is a stronger signal
    // than one keyword echoing across many fields.
    if (matchedKeywords.size > 1) score += (matchedKeywords.size - 1) * 0.5;

    return score;
}

// Returns { name, data, score } for the best category, or null.
function findBestCategory(fields, categoryEntries) {
    let best = null;
    let bestScore = 0;
    for (const [name, data] of categoryEntries) {
        const s = scoreCategory(fields, data.keywords);
        if (s > bestScore) {
            bestScore = s;
            best = { name, data, score: s };
        }
    }
    return (best && bestScore >= MATCH_THRESHOLD) ? best : null;
}

// Auto-group logic
async function runAutoGroup() {
    try {
        const { categories, autoGroup, manualUngroup = {} } = await chrome.storage.local.get(['categories', 'autoGroup', 'manualUngroup']);
        if (!autoGroup) return;

        const tabs = await chrome.tabs.query({ currentWindow: true });
        const NONE = chrome.tabGroups.TAB_GROUP_ID_NONE;

        // Only auto-group tabs that are:
        //  - http/https (readable), AND
        //  - currently UNGROUPED (never move a tab out of a group the user chose), AND
        //  - not explicitly ungrouped by the user at this URL.
        const groupableTabs = tabs.filter(t =>
            t.url && /^https?:/i.test(t.url) &&
            t.groupId === NONE &&
            manualUngroup[t.id] !== hostnameOf(t.url)
        );

        if (groupableTabs.length === 0) return;

        // Pull metadata for every tab in parallel (each call is independently guarded).
        const metaList = await Promise.all(groupableTabs.map(t => getTabMeta(t)));

        const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        const categoryEntries = Object.entries(categories);

        for (let i = 0; i < groupableTabs.length; i++) {
            const tab = groupableTabs[i];
            const fields = buildSearchFields(tab, metaList[i]);

            const best = findBestCategory(fields, categoryEntries);
            if (!best) continue;

            const expectedTitle = best.data.emoji ? `${best.data.emoji} ${best.name}` : best.name;
            const targetGroup = existingGroups.find(g => g.title === expectedTitle);

            if (targetGroup) {
                await chrome.tabs.group({ groupId: targetGroup.id, tabIds: [tab.id] });
            } else {
                const newGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
                await chrome.tabGroups.update(newGroupId, {
                    title: expectedTitle,
                    color: best.data.color
                });
                existingGroups.push(await chrome.tabGroups.get(newGroupId));
            }
        }
    } catch (error) {
        console.error("Error running auto-group:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "runAutoGroup") {
        runAutoGroup();
        sendResponse({ status: "done" });
    }
});

// --- KEYBOARD SHORTCUTS ---
// _execute_action opens the popup automatically. For "focus-search" we set a
// flag the popup reads on load, then try to open the popup programmatically.
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "focus-search") {
        try {
            await chrome.storage.local.set({ pendingFocus: true });
            if (chrome.action.openPopup) {
                await chrome.action.openPopup();
            }
        } catch (e) {
            console.warn("focus-search: could not open popup automatically:", e);
        }
        return;
    }

    if (command === "group-active-tab") {
        // Score the active tab and drop it into its best-matching group — no popup needed.
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !/^https?:/i.test(tab.url || '')) return;

            const { categories } = await chrome.storage.local.get('categories');
            const meta = await getTabMeta(tab);
            const fields = buildSearchFields(tab, meta);
            const best = findBestCategory(fields, Object.entries(categories || {}));
            if (!best) return;

            const expectedTitle = best.data.emoji ? `${best.data.emoji} ${best.name}` : best.name;
            const existing = await chrome.tabGroups.query({ windowId: tab.windowId, title: expectedTitle });
            if (existing.length > 0) {
                await chrome.tabs.group({ groupId: existing[0].id, tabIds: [tab.id] });
            } else {
                const gId = await chrome.tabs.group({ tabIds: [tab.id] });
                await chrome.tabGroups.update(gId, { title: expectedTitle, color: best.data.color });
            }
        } catch (e) {
            console.error("group-active-tab failed:", e);
        }
        return;
    }

    if (command === "ungroup-active-tab") {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                await chrome.tabs.ungroup(tab.id);
                await markManualUngroup(tab.id);
            }
        } catch (e) {
            console.error("ungroup-active-tab failed:", e);
        }
        return;
    }
});
# TabOS ⚡️
**A Premium Workspace & Tab Manager for Google Chrome**

TabOS is a meticulously designed browser extension that brings order to your digital workspace. Inspired by modern, minimalist design, it offers a centralized dashboard to manage multiple windows, intelligently group tabs, and save your most important resources with a dedicated favorites system.

---

## ✨ Key Features

### 🖥️ Unified Multi-Window Dashboard
* **Workspace Overview:** Visualize all open browser windows as a responsive grid, complete with tab counts and active-tab previews.
* **Global Search:** Instantly search across *every* open window simultaneously to find the exact tab you need.
* **Cross-Window Routing:** Extension gracefully handles cross-window grouping and tab movement without breaking native Chrome APIs.

### ⭐ Smart Favorite System
* **Quick Tagging:** Hover over any tab and click the star icon to save it to your Favorites.
* **Dashboard Access:** Favorites are pinned directly to your dashboard for quick access. 
* **Group All:** A single click on the dashboard bundles all your saved favorites into a fresh Tab Group in your current window.
* **Smart Focus:** Clicking a favorite will jump to it if it's already open, or launch a new tab if it's closed.

### 🗂️ Advanced Tab Management (Inner Workspace)
* **Custom Tab Groups:** Create groups with custom Hex colors and an integrated Emoji picker.
* **Auto-Grouping:** Set keywords/URLs for groups. When "Auto Group" is toggled on, tabs organize themselves automatically.
* **Multi-Select Action Bar:** Select multiple tabs via checkboxes to bulk-group, move, or ungroup them.
* **Fluid Drag & Drop:** Manually drag to reorder individual tabs, or drag entire group headers to rearrange your workspace.
* **View Modes:** Toggle instantly between a compact **List View** and a visual **Card View**.

### 🎨 Premium UI/UX
* **Elastic Search Header:** A slick, minimalist header that adapts to your screen and cleanly hides redundant actions when searching.
* **Hover-to-Reveal:** Clutter-free interface where secondary actions (favorite, delete, drag handles) gracefully appear only on hover.
* **Staggered Animations:** Smooth, cascading entry animations for a native app feel.

---

## 📂 File Architecture

To prevent browser height-collapse bugs and keep logic clean, TabOS uses a decoupled 2-page architecture:

* **Manifest & Background**
  * `manifest.json`: Defines permissions (`tabs`, `tabGroups`, `storage`, `contextMenus`, `windows`).
  * `background.js`: Handles context menu interactions and background auto-grouping rules.
* **Dashboard View (Default Popup)**
  * `popup.html` / `dashboard.css` / `dashboard.js`
* **Window Manager View**
  * `inner.html` / `inner.css` / `inner.js`

---

## 🚀 Installation Instructions

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click the **Load unpacked** button.
5. Select the folder containing the TabOS files.
6. Pin TabOS to your extension bar for easy access!

---

## ⌨️ Shortcuts & Navigation

* **Quick Search:** Press `Ctrl/Cmd + Shift + F` while the extension is open to instantly focus the search bar.
* **Exit Search:** Press `Esc` to cleanly exit search mode. Pressing `Esc` again will route you back to the Dashboard.
* **Context Menu:** Right-click anywhere on a webpage to quickly send the active tab to any of your pre-defined TabOS groups.

---

## 🛠️ Troubleshooting

* **Ghost Groups?** If groups keep reappearing after you delete them natively in Chrome, turn off **Auto Group** in the TabOS Avatar menu, or delete the group via the TabOS edit modal.
* **Syncing:** If windows feel out of sync, click the Avatar menu and select **Sync Now** to manually reconcile Chrome's native groups with your TabOS storage.
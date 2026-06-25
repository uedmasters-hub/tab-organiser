# Publishing an Update — Tab Organiser

This release adds page-metadata auto-grouping, multi-select, group reordering,
and keyboard shortcuts. That means **new permissions**, so this update behaves
differently from a normal cosmetic update — read the "Permission impact" section
before you submit.

---

## 0. Before you package

- [ ] **Bump the version.** `manifest.json` is now `1.2`. Every upload to the
      store must have a higher version than what is currently live. If `1.2` is
      already published, use `1.3`, etc.
- [ ] **Confirm icons exist.** The current `manifest.json` declares no `icons`
      block. The Web Store requires a 128×128 store icon, and a toolbar icon is
      strongly recommended. If your live listing already has icons, you're fine;
      otherwise add an `icons` block (16/32/48/128) and `action.default_icon`
      before submitting.
- [ ] **Smoke-test locally** (see section 1).

## 1. Test locally first (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Verify:
   - Auto Group sorts tabs using title/description/meta, not just URL.
   - Multi-select from Untitled header and from search → **New Group** works.
   - Drag a group by its grip to reorder; the real Chrome tab strip reorders,
     groups first then loose tabs.
   - Shortcuts (after assigning them — see section 4).
5. Use the **Errors** button on the card to confirm there are no service-worker
   errors.

## 2. Package the ZIP

Zip the **contents** of this folder (not the parent folder). The archive's root
must contain `manifest.json` directly.

```
# from inside the extension folder:
zip -r ../tab-organiser-1.2.zip . -x "*.DS_Store" -x "PUBLISHING.md"
```

Include: `manifest.json`, `popup.html`, `popup.js`, `popup.css`,
`background.js`, and your icon files. You can exclude `PUBLISHING.md`.

## 3. Upload on the Developer Dashboard

1. Go to the **Chrome Web Store Developer Dashboard**
   (`https://chrome.google.com/webstore/devconsole`).
2. Open the existing **Tab Organiser** item.
3. **Package → Upload new package** → choose `tab-organiser-1.2.zip`.
4. Fill the **Privacy practices** tab (now required — you read page content):
   - Justify **scripting** + **host permissions**: "Reads the page title and
     meta description/keywords on open tabs to automatically sort them into the
     user's groups. Runs locally; no page content leaves the browser."
   - Justify **tabs**/**tabGroups**: managing and grouping the user's tabs.
   - Set data-use answers honestly (no collection / no sale / no transfer if the
     extension keeps everything local, which it does).
   - If asked for a privacy policy URL and you don't have one, add a short page
     stating data stays on-device.
5. Update the **store listing** description to mention the new auto-grouping,
   multi-select, reordering, and shortcuts (optional but good for review).
6. **Submit for review.**

## 4. Keyboard shortcuts (important)

`suggested_key` values are only *hints*. Chrome will silently refuse to assign a
combo that conflicts with a built-in or another extension (this is why
`Ctrl+Shift+O` never worked — it's Chrome's Bookmark Manager).

Current suggestions:
- **Open Tab Organiser:** `Ctrl+Shift+E` (Mac `⌘+Shift+E`)
- **Open + focus search:** `Ctrl+Shift+F` (Mac `⌘+Shift+F`)

Tell users (and verify yourself) they can view/rebind any of these at:

```
chrome://extensions/shortcuts
```

If a suggested key shows as unassigned there, it conflicted — pick another.

## 5. Permission impact — READ THIS

This update **increases permissions** (adds `scripting`, broad
`host_permissions` for http/https, and `commands`). Consequences:

- **Longer review.** Permission increases, especially broad host access, get
  more scrutiny and can take longer to approve.
- **Existing users are auto-disabled until they re-accept.** When an update adds
  host permissions, Chrome **disables the extension for current users** and shows
  a "needs new permissions" prompt; they must click to re-enable. Expect some
  drop-off and a support question or two. This is normal Chrome behavior, not a
  bug.
- **New install warning** changes to "Read and change your data on all
  websites."

### Optional: avoid the auto-disable

If the forced re-grant is a concern, you can move host access to
`optional_host_permissions` and request it at runtime with
`chrome.permissions.request()` the first time the user enables Auto Group. That
keeps the base install quiet and only prompts users who actually use metadata
grouping. It's a moderate refactor (the auto-group code must check/await the
permission) — worth it if retention matters. Ask if you want this wired up.

## 6. After it goes live

- Watch the dashboard for review status and any policy notes.
- Consider a staged rollout (the dashboard lets you release to a percentage of
  users) so you can catch issues before 100%.
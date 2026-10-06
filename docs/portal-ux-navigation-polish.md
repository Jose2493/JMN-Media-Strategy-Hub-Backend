# JMN Media Partner: UX and navigation handoff

Branch: `codex/portal-ux-navigation-polish`, isolated from latest `origin/main`
(`82368a4`). PR #30 is not part of this branch. No API contract, schema,
authentication, content-approval or publishing implementation was changed.

## Ownership and route inventory

SuiteDash owns the actual sidebar, logged-in identity, page assignments, native
Projects/Files/Billing/Messages screens and start-page setting. This repository
owns module presentation and these existing standalone/embed targets:

| Destination | Custom module target | SuiteDash destination |
| --- | --- | --- |
| Home | `/client-home.html` | Existing client Home/Start Page; retain its assignments |
| Strategy Session | `/strategist.html` | Existing page `https://portal.jmnmedia.com/portal/dashboard/view/173775` |
| Social Center | `/social-command-center.html` | Existing page `https://portal.jmnmedia.com/portal/dashboard/view/174976` |
| Design Studio | `/design-studio.html` | Existing Design Studio Portal Page; restricted assignments only |
| Projects | Native SuiteDash destination | Existing Projects menu/action |
| Media & Deliverables | Native SuiteDash files/shared deliverables | Existing assigned files/deliverables page |
| Billing & Documents | Native SuiteDash billing/documents | Existing billing/document destination/group |
| Messages | Native SuiteDash messages | Existing messages destination |

The two numeric page URLs are retained from the existing Home code. Home,
Design Studio and native destination IDs are not in this repo: select their
existing pages/actions in SuiteDash; do not invent IDs. PR #30's Media Library
route is intentionally excluded. All custom targets keep their current
bootstrap-fragment generation and permission checks. Do not link clients
directly to a Vercel page without the existing SuiteDash session integration.

## SuiteDash configuration (manual; staging/test assignment first)

1. Open the profile flyout → **Custom Menus**, then choose **Client**. Record the
   current order, page assignments, Circle restrictions and Start Page before editing.
2. Use **+** to add a top-level **Direct Link to Portal Page** for Home,
   Strategy Session and Social Center. Select the existing assigned pages above.
   Keep **Open In New Tab** off. Retain the existing working links during verification.
3. Add Design Studio using its existing Portal Page. Keep that page's assignments
   unchanged; enable visibility only for the existing authorized **Circles**.
   If permission is assigned individually and cannot be mirrored accurately by
   Circles, retain its assignment-driven Dynamic Pages Menu entry until that
   visibility mapping is resolved. Never show it to every Client role as a shortcut.
   The template authorization API stays authoritative even when a link is visible.
4. Rename/reorder the existing native destinations rather than creating replacement
   applications: Projects; Media & Deliverables (existing shared-files action/page);
   Billing & Documents (existing billing/document group); Messages (existing messages).
5. Drag the top-level items into this exact order:
   **Home → Strategy Session → Social Center → Design Studio (authorized clients only)
   → Projects → Media & Deliverables → Billing & Documents → Messages**.
6. Keep Home as the assigned after-login **Start Page**. Use **Standard** Page display
   to retain one SuiteDash shell/sidebar. Avoid Bare/Focus for ordinary destinations,
   which would remove the navigation needed to move between modules.
7. In each custom page editor, reduce the embed block's side padding to zero and
   remove redundant wrapper borders/background cards. Apply the sizing snippet below
   to its existing iframe. Keep SuiteDash's outside page spacing small and consistent.
8. Test with an authorized and unauthorized client: every new link opens the right
   page, session exchange still succeeds, and Design Studio stays unavailable to the
   unauthorized client. Test desktop and a phone before removing any old access.
9. Only after verification, use **Hide from Dynamic Pages Menu** on the Home,
   Strategy Session, Social Center and authorized Design Studio pages that now have
   functioning top-level links. This removes duplicate **My Pages → Client Portal →
   [module]** entries without unassigning their pages. Hide the old empty group only
   when no other client page still depends on it.

SuiteDash advanced Custom Menus may require Thrive/Pinnacle. Account plan and the
existing page IDs/assignment configuration must be confirmed by the portal admin.
References: [Custom Menus](https://help.suitedash.com/article/158-custom-menus),
[Portal Page settings](https://help.suitedash.com/article/53-creating-a-portal-page).

## Exact parent embed adjustment

On the existing iframe, set `id="jmn-module"`, `title` to the module name,
`referrerpolicy="no-referrer"`, and remove fixed-height, border and max-height
styles. Keep its existing authenticated `src` generation **exactly as it is**.
Keep any existing sandbox policy; it must already permit the current module's
scripts/session behavior. Do not add `scrolling="no"`: overflow remains usable if
the parent script is not supported or has not loaded.

Place this after that iframe in a SuiteDash HTML/custom-JS block that permits scripts:

```html
<style>
  #jmn-module { display:block; width:100%; height:320px; border:0; margin:0; }
</style>
<script>
(() => {
  const frame = document.getElementById('jmn-module');
  if (!frame || location.origin !== 'https://portal.jmnmedia.com') return;
  const moduleOrigin = new URL(frame.src).origin;
  // Replace with the reviewed PREVIEW origin for testing, then the approved
  // production module origin only through your separate release process.
  const approvedModuleOrigin = 'https://REVIEWED-PREVIEW-HOST.vercel.app';
  if (moduleOrigin !== approvedModuleOrigin) return;
  const display = {
    contactName: '', // optional: existing SuiteDash display name, safely serialized
    designStudioVisible: false, // true only in the already authorized page/Circle
    links: {
      // projects: 'https://portal.jmnmedia.com/portal/...',
      // media: 'https://portal.jmnmedia.com/portal/...',
      // design: 'https://portal.jmnmedia.com/portal/dashboard/view/EXISTING_ID'
    }
  };
  function initialize() {
    frame.contentWindow.postMessage({
      type:'jmn:portal-init', version:1,
      viewportHeight:Math.max(240, innerHeight - 80), display
    }, approvedModuleOrigin);
  }
  window.addEventListener('message', event => {
    if (event.origin !== approvedModuleOrigin || event.source !== frame.contentWindow
        || event.data?.version !== 1) return;
    if (event.data.type === 'jmn:portal-ready') initialize();
    if (event.data.type === 'jmn:portal-height'
        && Number.isInteger(event.data.height)
        && event.data.height >= 160 && event.data.height <= 100000) {
      frame.style.height = event.data.height + 'px';
    }
  });
  frame.addEventListener('load', initialize);
  window.addEventListener('resize', initialize);
  initialize();
})();
</script>
```

This code touches only its own iframe. Both sides check source + exact origin.
No wildcard targets, credential payloads or cross-origin parent DOM access exist.
The initial 320px is a loading fallback, not a fixed final content height. Heights
follow the content and shrink after panels close. Strategy retains one deliberately
bounded conversation scroll area and Design Studio retains its canvas working
surface. No layout message participates in the authentication handshake.

For Home, optional display data enables verified native Projects/Media links and
the Design Studio card. Values must be serialized safely by SuiteDash's existing
template tools; do not paste an unescaped merge value into JavaScript. With no
configuration, Home uses “Welcome back,” keeps the two known working portal links,
provides truthful menu directions for Projects/Media and hides Design Studio.
It displays no invented project counts, approval metrics or connection status.

## QA routes and limitations

Preview-only fictional visual routes:
`/api/qa/portal?page=home`, `?page=social`, `?page=strategy`, `?page=design`.
They reject production, credentials, mutations and additional query parameters.
Their CSP blocks all fetch connections; a document-local inert adapter supplies
fictional response data, leaving the real module session/publishing code unchanged.
Design QA uses the actual layout/controls with a fictional preview image; its
artwork engine/export is deliberately not loaded. No real client data is used.

Live SuiteDash sidebar visibility, editor-script support, parent padding and actual
phone keyboard/scroll behavior require a staging SuiteDash page with this snippet.
They cannot be verified from a Vercel child page or a local fixture alone.

## Recorded verification — 2026-10-06

Final non-production deployment:
`https://jmn-media-strategy-hub-backend-plxdikj1j-jmn-media.vercel.app`
(Vercel READY, productionUrl null).

| Check | Result |
| --- | --- |
| Desktop 1280 × 900: Home, Social Center, Strategy, Design layout | PASS |
| Mobile 390 × 844: all four pages, widths and stacking | PASS |
| Mobile Home → Social Center fictional module entry | PASS; remained on Preview |
| Social order: account → direction → content → publishing → analytics | PASS |
| Social review dialog on mobile | PASS; read-only fictional media |
| Home/Social extra auto-scroll panels | None detected |
| Strategy mobile conversation drawer open/close | PASS |
| Strategy composer + footer remain inside 844px viewport | PASS; footer bottom ~835px |
| Horizontal overflow | None beyond the viewport on inspected pages |
| Browser warning/error logs on inspected fixtures | None |
| Resize security/source checks, growth/shrink, excluded modal | PASS; automated VM tests |
| Real SuiteDash parent resize/sidebar/permission configuration | MANUAL VERIFICATION REQUIRED |
| Design artwork engine/template/export | Not exercised; fixture tests presentation only |

Full automated suite: **167 tests; 166 passed, 0 failed, 1 skipped**.
The existing FFmpeg integration test skips when FFmpeg/the Linux font path is
unavailable on this Windows test shell. The baseline is latest main, excluding
PR #30's separate tests. JavaScript syntax checks and `git diff --check` passed.

Changed files: Home HTML/CSS/JS; stylesheet/script integration in Social,
Strategy and Design HTML; `portal-shell.css`, `portal-workspaces.css`,
`portal-embed.js`; Preview-only `api/qa/portal.js` and
`lib/portalPreviewPage.js`; `tests/portal-polish.test.js`; this handoff.

The application APIs, auth/session scripts, company scoping, schemas, permission
checks, original downloads, Approved Content, drafts/scheduling and publishing
logic were not changed. No production endpoint/data/navigation/configuration was
mutated. No social content was scheduled or published. PR #30 was not modified.

**READY FOR REVIEW**, with SuiteDash integration testing still required before rollout.

/*!
 * Lumina web chat widget loader — tiny vanilla JS, zero framework deps.
 * Usage: <script src="https://<app-domain>/widget.js" data-org="sunrise-bakery" defer></script>
 * MASTER_PLAN.md §4.D "web chat widget" / design brief "Web chat widget".
 *
 * Namespaces every class with `lw-` and every id with `lw-` so it can be
 * dropped onto any third-party site without colliding with the host's CSS.
 * The iframe (the actual chat UI) is created lazily on first open.
 */
(function () {
  "use strict";
  if (window.__localosWidgetLoaded) return;
  window.__localosWidgetLoaded = true;

  var currentScript = document.currentScript;
  var org = currentScript && currentScript.getAttribute("data-org");
  if (!org) {
    console.warn("[Lumina widget] missing data-org attribute — widget not mounted.");
    return;
  }

  var origin;
  try {
    origin = new URL(currentScript.src).origin;
  } catch {
    console.warn("[Lumina widget] could not resolve widget origin.");
    return;
  }

  var TEASER_TEXT = "Questions? We usually reply in minutes.";
  var TEASER_DELAY_MS = 8000;
  var DISMISS_KEY = "lw_teaser_dismissed_" + org;
  // Approximates the app's --primary token (oklch(0.54 0.21 277)) and
  // DEMO_BUSINESS_BRAIN.brand_kit.primary_color — a plain hex is required
  // here since this script runs on arbitrary third-party pages that don't
  // load Lumina's CSS custom properties.
  var BRAND = "#6D5EF3";

  var css =
    "#lw-fab{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:9999px;" +
    "background:" + BRAND + ";border:none;box-shadow:0 6px 20px rgba(0,0,0,.22);cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:0;" +
    "transition:transform 150ms ease;}" +
    "#lw-fab:hover{transform:scale(1.05);}" +
    "#lw-fab:focus-visible{outline:2px solid #fff;outline-offset:2px;}" +
    "#lw-fab svg{position:absolute;transition:opacity 200ms ease,transform 200ms ease;}" +
    "#lw-fab .lw-icon-chat{opacity:1;transform:rotate(0deg) scale(1);}" +
    "#lw-fab .lw-icon-close{opacity:0;transform:rotate(-45deg) scale(.6);}" +
    "#lw-fab.lw-open .lw-icon-chat{opacity:0;transform:rotate(45deg) scale(.6);}" +
    "#lw-fab.lw-open .lw-icon-close{opacity:1;transform:rotate(0deg) scale(1);}" +
    "#lw-badge{position:fixed;bottom:56px;right:16px;min-width:18px;height:18px;padding:0 4px;" +
    "border-radius:9999px;background:#ef4444;color:#fff;font:600 11px/18px system-ui,sans-serif;" +
    "text-align:center;z-index:2147483001;display:none;transform:scale(0);" +
    "transition:transform 200ms cubic-bezier(.34,1.3,.64,1);}" +
    "#lw-badge.lw-show{display:block;transform:scale(1);}" +
    "#lw-teaser{position:fixed;bottom:86px;right:20px;max-width:240px;padding:10px 32px 10px 14px;" +
    "border-radius:14px;background:#fff;color:#16161f;font:500 13px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.16);z-index:2147483000;cursor:pointer;opacity:0;" +
    "transform:translateY(6px);transition:opacity 200ms ease,transform 200ms ease;pointer-events:none;}" +
    "#lw-teaser.lw-show{opacity:1;transform:translateY(0);pointer-events:auto;}" +
    "#lw-teaser button{position:absolute;top:6px;right:6px;width:20px;height:20px;border:none;" +
    "background:transparent;color:#8a8a99;font-size:14px;line-height:1;cursor:pointer;border-radius:9999px;}" +
    "#lw-teaser button:hover{background:#f1f1f5;}" +
    "@media (prefers-color-scheme: dark){#lw-teaser{background:#232330;color:#f5f5f7;}" +
    "#lw-teaser button:hover{background:#32323f;}}" +
    "#lw-panel{position:fixed;bottom:86px;right:20px;width:380px;height:560px;max-height:calc(100vh - 106px);" +
    "border-radius:16px;overflow:hidden;box-shadow:0 20px 48px rgba(0,0,0,.28);z-index:2147483000;" +
    "opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;" +
    "transition:opacity 200ms ease,transform 200ms ease;background:transparent;}" +
    "#lw-panel.lw-show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}" +
    "#lw-panel iframe{width:100%;height:100%;border:0;display:block;}" +
    "@media (max-width:480px){#lw-panel{top:0;left:0;right:0;bottom:0;width:100%;height:100%;" +
    "max-height:100%;border-radius:0;}}" +
    "@media (prefers-reduced-motion: reduce){#lw-fab,#lw-fab svg,#lw-badge,#lw-teaser,#lw-panel{transition:none!important;}}";

  var style = document.createElement("style");
  style.id = "lw-widget-inline-styles";
  style.textContent = css;
  document.head.appendChild(style);

  var CHAT_ICON =
    '<svg class="lw-icon-chat" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var CLOSE_ICON =
    '<svg class="lw-icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';

  var fab = document.createElement("button");
  fab.id = "lw-fab";
  fab.type = "button";
  fab.setAttribute("aria-label", "Open chat");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = CHAT_ICON + CLOSE_ICON;

  var badge = document.createElement("div");
  badge.id = "lw-badge";
  badge.setAttribute("aria-hidden", "true");

  var teaser = document.createElement("div");
  teaser.id = "lw-teaser";
  teaser.setAttribute("role", "button");
  teaser.tabIndex = 0;
  teaser.innerHTML = TEASER_TEXT + '<button type="button" aria-label="Dismiss">×</button>';

  var panel = document.createElement("div");
  panel.id = "lw-panel";

  document.body.appendChild(fab);
  document.body.appendChild(badge);
  document.body.appendChild(teaser);
  document.body.appendChild(panel);

  var open = false;
  var unread = 0;
  var iframeCreated = false;

  function setBadge(count) {
    unread = count;
    badge.textContent = String(count);
    badge.classList.toggle("lw-show", count > 0 && !open);
  }

  function ensureIframe() {
    if (iframeCreated) return;
    iframeCreated = true;
    var iframe = document.createElement("iframe");
    iframe.src = origin + "/widget/" + encodeURIComponent(org);
    iframe.title = "Chat";
    panel.appendChild(iframe);
  }

  function setOpen(next) {
    open = next;
    fab.classList.toggle("lw-open", open);
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    panel.classList.toggle("lw-show", open);
    if (open) {
      ensureIframe();
      hideTeaser(true);
      setBadge(0);
    }
  }

  function hideTeaser(persist) {
    teaser.classList.remove("lw-show");
    if (persist) {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* storage disabled — teaser just won't persist dismissal, harmless */
      }
    }
  }

  fab.addEventListener("click", function () {
    setOpen(!open);
  });

  teaser.addEventListener("click", function () {
    setOpen(true);
  });
  teaser.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  });
  teaser.querySelector("button").addEventListener("click", function (event) {
    event.stopPropagation();
    hideTeaser(true);
  });

  var alreadyDismissed = false;
  try {
    alreadyDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    /* storage disabled — teaser always shows once per page load */
  }

  if (!alreadyDismissed) {
    setTimeout(function () {
      if (!open) teaser.classList.add("lw-show");
    }, TEASER_DELAY_MS);
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.source !== "localos-widget") return;
    if (data.type === "message" && !open) {
      setBadge(unread + 1);
    }
  });
})();

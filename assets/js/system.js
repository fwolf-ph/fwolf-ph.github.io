(() => {
  document.body.classList.add("bit-mode");

  function escapeMarkdownUrl(url) {
    const trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
    return trimmed;
  }

  function appendInlineMarkdown(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const token = match[0];
      if (token.startsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        parent.append(strong);
      } else if (token.startsWith("`")) {
        const code = document.createElement("code");
        code.textContent = token.slice(1, -1);
        parent.append(code);
      } else {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const safeUrl = escapeMarkdownUrl(linkMatch[2]);
          if (safeUrl) {
            const link = document.createElement("a");
            link.textContent = linkMatch[1];
            link.href = safeUrl;
            if (/^https?:\/\//i.test(safeUrl)) {
              link.target = "_blank";
              link.rel = "noopener noreferrer";
            }
            parent.append(link);
          } else {
            parent.append(document.createTextNode(linkMatch[1]));
          }
        }
      }
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.append(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderMarkdown(markdown, target) {
    target.replaceChildren();
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let paragraphLines = [];

    function flushParagraph() {
      if (paragraphLines.length === 0) return;
      const paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, paragraphLines.join(" "));
      target.append(paragraph);
      paragraphLines = [];
    }

    for (let index = 0; index < lines.length;) {
      const line = lines[index].trim();
      if (!line) {
        flushParagraph();
        index++;
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        const headingElement = document.createElement(`h${heading[1].length}`);
        appendInlineMarkdown(headingElement, heading[2]);
        target.append(headingElement);
        index++;
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        flushParagraph();
        const list = document.createElement("ul");
        while (index < lines.length) {
          const itemMatch = lines[index].trim().match(/^[-*]\s+(.+)$/);
          if (!itemMatch) break;
          const item = document.createElement("li");
          appendInlineMarkdown(item, itemMatch[1]);
          list.append(item);
          index++;
        }
        target.append(list);
        continue;
      }

      paragraphLines.push(line);
      index++;
    }
    flushParagraph();
  }

  async function loadMarkdownInto(filePath, targetElementId) {
    const target = document.getElementById(targetElementId);
    if (!target) return;
    target.classList.add("markdown-feed");
    target.setAttribute("aria-busy", "true");
    target.textContent = "LADE MARKDOWN …";

    try {
      const response = await fetch(filePath, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const markdown = await response.text();
      if (!markdown.trim()) throw new Error("Leere Markdown-Datei");
      renderMarkdown(markdown, target);
    } catch (_) {
      target.replaceChildren();
      const fallback = document.createElement("p");
      fallback.className = "markdown-fallback";
      fallback.textContent = "FEHLER // MARKDOWN-DATEI KONNTE NICHT GELADEN WERDEN.";
      target.append(fallback);
      const detail = document.createElement("p");
      detail.className = "markdown-fallback-detail";
      detail.textContent = document.location.protocol === "file:"
        ? `Quelle: ${filePath} — Bei direktem Öffnen über file:// ist fetch() nicht verfügbar. Starte einen lokalen HTTP-Server, z. B. mit "python3 -m http.server".`
        : `Quelle: ${filePath} — Prüfe Datei, HTTP-Status und Pfad.`;
      target.append(detail);
    } finally {
      target.removeAttribute("aria-busy");
    }
  }

  window.loadMarkdownInto = loadMarkdownInto;

  function initMarkdownFeeds() {
    document.querySelectorAll("[data-markdown-file]").forEach(target => {
      target.hidden = false;
      target.removeAttribute("hidden");
      const filePath = target.dataset.markdownFile;
      if (!target.id) {
        target.textContent = "FEHLER // MARKDOWN-ZIEL ENTHÄLT KEINE ID.";
        return;
      }
      loadMarkdownInto(filePath, target.id);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMarkdownFeeds, { once: true });
  } else {
    initMarkdownFeeds();
  }

  function normalizeSidebarMenuOrder() {
    document.querySelectorAll(".launcher-sidebar").forEach(sidebar => {
      const changelogLink = sidebar.querySelector('a[href="changelog.html"]');
      const impressumLink = sidebar.querySelector('a[href="impressum.html"]');
      if (changelogLink && impressumLink && changelogLink.nextElementSibling !== impressumLink) {
        sidebar.insertBefore(changelogLink, impressumLink);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizeSidebarMenuOrder, { once: true });
  } else {
    normalizeSidebarMenuOrder();
  }

  function updateSystemClock() {
    const now = new Date();
    const time = document.getElementById("system-time");
    const date = document.getElementById("system-date");
    if (time) {
      time.textContent = new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(now);
    }
    if (date) {
      date.textContent = new Intl.DateTimeFormat("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(now);
    }
  }

  function detectBrowserName() {
    const userAgent = navigator.userAgent;
    if (/EdgA?\/|EdgiOS\//i.test(userAgent)) return "Microsoft Edge";
    if (/OPR\/|Opera/i.test(userAgent)) return "Opera";
    if (/Firefox\/|FxiOS\//i.test(userAgent)) return "Mozilla Firefox";
    if (/CriOS\//i.test(userAgent)) return "Google Chrome";
    if (/Chromium\//i.test(userAgent)) return "Chromium";
    if (/Chrome\//i.test(userAgent)) return "Google Chrome";
    if (/MSIE|Trident\//i.test(userAgent)) return "Internet Explorer";
    if (/Safari\//i.test(userAgent)) return "Safari";
    if (/AppleWebKit\//i.test(userAgent)) return "WebKit-Browser";
    return "Unbekannter Browser";
  }

  updateSystemClock();
  window.setInterval(updateSystemClock, 1000);

  const browserName = document.getElementById("browser-name");
  if (browserName) browserName.textContent = detectBrowserName();

  const projectSubnav = document.getElementById("projects-subnav");
  const projectToggle = document.getElementById("nav-projects-toggle");
  const drawerTitle = document.getElementById("launcher-window-title");
  const projectTiles = [...document.querySelectorAll("#launcher-projects [data-project-category]")];
  const subItems = [...document.querySelectorAll("[data-project-sub]")];
  const isProjectPage = document.location.pathname.endsWith("/projekte.html");
  const category = new URLSearchParams(document.location.search).get("category");

  function applyCategory(selectedCategory) {
    if (drawerTitle) {
      drawerTitle.textContent = selectedCategory === "tum"
        ? "APP-DRAWER // PROJEKTE > PHYSIK TUM"
        : selectedCategory === "sonstiges"
          ? "APP-DRAWER // PROJEKTE > SONSTIGES"
          : "APP-DRAWER // PROJEKTE";
    }

    projectTiles.forEach(tile => {
      const shouldShow = selectedCategory === "all" ||
        tile.dataset.projectCategory === selectedCategory;
      tile.hidden = !shouldShow;
    });

    subItems.forEach(item => {
      const isActive = item.dataset.projectSub === selectedCategory;
      item.classList.toggle("active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }

  if (projectSubnav) {
    if (isProjectPage) {
      projectSubnav.hidden = false;
      projectToggle?.setAttribute("aria-expanded", "true");
      applyCategory(category === "tum" || category === "sonstiges" ? category : "all");
    } else {
      projectSubnav.hidden = true;
      projectToggle?.setAttribute("aria-expanded", "false");
    }
  }

  if (projectToggle && isProjectPage) {
    projectToggle.addEventListener("click", event => {
      event.preventDefault();
      const willOpen = projectSubnav.hidden;
      projectSubnav.hidden = !willOpen;
      projectToggle.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) applyCategory("all");
    });
  }
})();

(() => {
  const themeKey = "theoLernappBitMode";

  function setBitMode(darkMode) {
    document.body.classList.add("bit-mode");
    document.body.classList.toggle("theme-dark", darkMode);
    const themeButton = document.getElementById("theme-btn");
    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(darkMode));
      themeButton.textContent = darkMode
        ? "Light 1-Bit: Schwarz auf Weiß"
        : "Dark 1-Bit: Weiß auf Schwarz";
    }
  }

  function loadBitMode() {
    try {
      return localStorage.getItem(themeKey) !== "light";
    } catch (_) {
      return true;
    }
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

  setBitMode(loadBitMode());
  updateSystemClock();
  window.setInterval(updateSystemClock, 1000);

  const browserName = document.getElementById("browser-name");
  if (browserName) browserName.textContent = detectBrowserName();

  document.querySelectorAll("[data-theme-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const darkMode = !document.body.classList.contains("theme-dark");
      setBitMode(darkMode);
      try {
        localStorage.setItem(themeKey, darkMode ? "dark" : "light");
      } catch (_) {
        // Theme switching still works when browser storage is unavailable.
      }
    });
  });

  // Projects navigation & drawer filter logic
  function initProjectNavigation() {
    const projectSubnav = document.getElementById("projects-subnav");
    const projectToggleBtn = document.getElementById("nav-projects-toggle");
    const drawerTitle = document.getElementById("launcher-window-title");
    const projectTiles = document.querySelectorAll("#launcher-projects [data-project-category]");

    if (!projectSubnav && !projectToggleBtn) return;

    // Filter project tiles in drawer if on index page
    function applyCategory(category) {
      if (drawerTitle) {
        if (category === "tum") {
          drawerTitle.textContent = "APP-DRAWER // PROJEKTE > PHYSIK TUM";
        } else if (category === "sonstiges") {
          drawerTitle.textContent = "APP-DRAWER // PROJEKTE > SONSTIGES";
        } else {
          drawerTitle.textContent = "APP-DRAWER // PROJEKTE";
        }
      }

      if (projectTiles.length > 0) {
        projectTiles.forEach(tile => {
          const cat = tile.getAttribute("data-project-category");
          const shouldShow = (category === "all") || (cat === category);
          tile.hidden = !shouldShow;
          tile.style.display = shouldShow ? "" : "none";
        });
      }

      // Update active states on subnav items
      const subItems = document.querySelectorAll("[data-project-sub]");
      subItems.forEach(item => {
        const itemCat = item.getAttribute("data-project-sub");
        if (itemCat === category) {
          item.classList.add("active");
          item.setAttribute("aria-current", "page");
        } else {
          item.classList.remove("active");
          item.removeAttribute("aria-current");
        }
      });
    }

    // Check URL search params for category
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get("category");

    const isProjectPage = window.location.pathname.endsWith("index.html") ||
                          window.location.pathname.endsWith("/") ||
                          window.location.pathname === "" ||
                          window.location.pathname.endsWith("physik4.html") ||
                          window.location.pathname.endsWith("drohne.html");

    // Expand subnav on project-related pages or if category param is present
    if (projectSubnav) {
      const isExpanded = isProjectPage || !!categoryParam;
      projectSubnav.hidden = !isExpanded;
      if (projectToggleBtn) {
        projectToggleBtn.setAttribute("aria-expanded", String(isExpanded));
      }
    }

    if (categoryParam === "tum" || categoryParam === "sonstiges") {
      applyCategory(categoryParam);
    } else if (projectTiles.length > 0) {
      // Default on index page: all projects shown or default category
      // As requested: "Wenn man direkt auf den Hauptpunkt „PROJEKTE“ klickt, werden entweder alle Projekte gemeinsam angezeigt oder das Untermenü klappt auf und zeigt standardmäßig „Physik TUM“ an"
      // We keep all visible by default when category=all or without category, with drawer title "APP-DRAWER // PROJEKTE"
      applyCategory("all");
    }

    // Toggle subnav when clicking main PROJEKTE button
    if (projectToggleBtn) {
      projectToggleBtn.addEventListener("click", (e) => {
        const isIndex = window.location.pathname.endsWith("index.html") ||
                        window.location.pathname.endsWith("/") ||
                        window.location.pathname === "";
        if (!isIndex) {
          // If we are on another page (e.g. fotografie, impressum), clicking PROJEKTE navigates to index.html
          window.location.href = "index.html";
          return;
        }

        e.preventDefault();
        if (projectSubnav) {
          const willOpen = projectSubnav.hidden;
          projectSubnav.hidden = !willOpen;
          projectToggleBtn.setAttribute("aria-expanded", String(willOpen));
        }
        applyCategory("all");
      });
    }

    // Subitem clicks
    document.querySelectorAll("[data-project-sub]").forEach(subBtn => {
      subBtn.addEventListener("click", (e) => {
        const targetCategory = subBtn.getAttribute("data-project-sub");
        const isIndex = window.location.pathname.endsWith("index.html") ||
                        window.location.pathname.endsWith("/") ||
                        window.location.pathname === "";

        if (!isIndex) {
          // Navigate to index.html with query parameter
          window.location.href = `index.html?category=${encodeURIComponent(targetCategory)}`;
          return;
        }

        e.preventDefault();
        applyCategory(targetCategory);
        // Update URL query string without reloading
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("category", targetCategory);
        window.history.pushState({}, "", newUrl);
      });
    });
  }

  initProjectNavigation();
})();

(() => {
  document.body.classList.add("bit-mode");

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

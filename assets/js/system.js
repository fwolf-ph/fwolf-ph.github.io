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
})();

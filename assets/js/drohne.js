(() => {
  const droneReadmeContent = document.getElementById("drone-readme-content");
    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value)
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function stripVideoContent(markdown) {
      const videoAssetOrFile = /(?:https?:\/\/github\.com\/[^\s<>"')]+\/assets\/[^\s<>"')]*|https?:\/\/user-images\.githubusercontent\.com\/[^\s<>"')]+|(?:https?:\/\/)?[^\s<>"')]+\.(?:mp4|webm|mov)(?:[?#][^\s<>"')]*)?)/i;

      return markdown
        .replace(/<video\b[^>]*>[\s\S]*?<\/video\s*>/gi, "")
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "")
        .replace(/<source\b[^>]*\/?\s*>/gi, "")
        .replace(/<\/?(?:video|iframe|source)\b[^>]*>/gi, "")
        .split(/\r?\n/)
        .filter(line => !videoAssetOrFile.test(line))
        .join("\n");
    }

    function safeReadmeUrl(value, baseUrl) {
      try {
        const url = new URL(value, baseUrl);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
      } catch (_) {
        return null;
      }
    }

    function renderReadmeInline(text, baseUrl) {
      const tokenPattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      let output = "";
      let cursor = 0;
      let match;

      while ((match = tokenPattern.exec(text)) !== null) {
        output += escapeHtml(text.slice(cursor, match.index));
        if (match[1] !== undefined) {
          output += `<code>${escapeHtml(match[1])}</code>`;
        } else if (match[2] !== undefined) {
          output += `<strong>${escapeHtml(match[2])}</strong>`;
        } else {
          const href = safeReadmeUrl(match[4], baseUrl);
          output += href
            ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${renderReadmeInline(match[3], baseUrl)}</a>`
            : escapeHtml(match[0]);
        }
        cursor = tokenPattern.lastIndex;
      }
      return output + escapeHtml(text.slice(cursor));
    }

    function renderReadmeMarkdown(markdown, baseUrl) {
      const lines = stripVideoContent(markdown).split(/\r?\n/);
      const output = [];
      let paragraph = [];
      let list = [];
      let code = [];
      let inCodeBlock = false;

      const flushParagraph = () => {
        if (paragraph.length) {
          output.push(`<p>${renderReadmeInline(paragraph.join(" "), baseUrl)}</p>`);
          paragraph = [];
        }
      };
      const flushList = () => {
        if (list.length) {
          output.push(`<ul>${list.map(item => `<li>${renderReadmeInline(item, baseUrl)}</li>`).join("")}</ul>`);
          list = [];
        }
      };

      for (const line of lines) {
        if (/^\s*```/.test(line)) {
          if (inCodeBlock) {
            output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
            code = [];
            inCodeBlock = false;
          } else {
            flushParagraph();
            flushList();
            inCodeBlock = true;
          }
          continue;
        }
        if (inCodeBlock) {
          code.push(line);
          continue;
        }

        const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
        if (heading) {
          flushParagraph();
          flushList();
          const level = heading[1].length;
          output.push(`<h${level}>${renderReadmeInline(heading[2], baseUrl)}</h${level}>`);
          continue;
        }

        const listItem = line.match(/^\s*[-*]\s+(.+)$/);
        if (listItem) {
          flushParagraph();
          list.push(listItem[1]);
          continue;
        }
        if (!line.trim()) {
          flushParagraph();
          flushList();
          continue;
        }
        flushList();
        paragraph.push(line.trim());
      }

      if (inCodeBlock) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      flushParagraph();
      flushList();
      return output.join("\n");
    }

    const droneReadmeSources = [
      {
        url: "https://raw.githubusercontent.com/fwolf-ph/PPO-Algorithmus-zur-Drohnensteuerung/main/README.md",
        baseUrl: "https://github.com/fwolf-ph/PPO-Algorithmus-zur-Drohnensteuerung/blob/main/README.md"
      },
      {
        url: "https://raw.githubusercontent.com/fwolf-ph/PPO-Algorithmus-zur-Drohnensteuerung/master/README.md",
        baseUrl: "https://github.com/fwolf-ph/PPO-Algorithmus-zur-Drohnensteuerung/blob/master/README.md"
      }
    ];
    let droneReadmeLoaded = false;
    let droneReadmeLoading = false;

    async function fetchDroneReadme() {
      let lastError;
      for (const source of droneReadmeSources) {
        try {
          const response = await fetch(source.url, { cache: "no-cache" });
          if (!response.ok) {
            lastError = new Error(`README request failed: ${response.status}`);
            continue;
          }
          return { markdown: await response.text(), baseUrl: source.baseUrl };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("README could not be loaded.");
    }

    async function loadDroneReadme() {
      if (droneReadmeLoaded || droneReadmeLoading) return;
      droneReadmeLoading = true;
      droneReadmeContent.textContent = "LADE README.MD …";
      try {
        const { markdown, baseUrl } = await fetchDroneReadme();
        const rendered = renderReadmeMarkdown(markdown, baseUrl);
        droneReadmeContent.innerHTML = rendered || "<p>Die README enthält keine darstellbaren Textinhalte.</p>";
        droneReadmeLoaded = true;
      } catch (_) {
        droneReadmeContent.innerHTML =
          "<p>Die Projekt-README konnte nicht geladen werden. Öffne das Repository über „Auf GitHub ansehen“.</p>";
      } finally {
        droneReadmeLoading = false;
      }
    }

  void loadDroneReadme();
})();

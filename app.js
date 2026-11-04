/*
  Insomnia Dev — Shared page script
  Handles: nav marquee, all-in-one downloader, page transition
  Dipakai oleh: beranda.html, tools.html, req.html, info.html, ...
*/
(function () {
  "use strict";

  /* =========================================================
     A. NAV AUTO-SCROLL
     ========================================================= */
  (function initMarquee() {
    var viewport = document.getElementById("navViewport");
    var track    = document.getElementById("navTrack");
    if (!viewport || !track) return;

    function setupMarquee() {
      // hapus clone lama
      var oldClones = track.querySelectorAll(".nav__link[data-clone='1']");
      for (var c = 0; c < oldClones.length; c++) oldClones[c].remove();

      track.classList.remove("is-scrolling");

      var singleWidth = track.scrollWidth;
      var viewWidth   = viewport.clientWidth;

      // Clone kalau overflow, atau paksa overflow kalau kurang lebar
      if (singleWidth > viewWidth + 2) {
        var originals = track.querySelectorAll(".nav__link");
        for (var i = 0; i < originals.length; i++) {
          var clone = originals[i].cloneNode(true);
          clone.setAttribute("data-clone", "1");
          clone.setAttribute("aria-hidden", "true");
          clone.setAttribute("tabindex", "-1");
          track.appendChild(clone);
        }
      } else {
        track.style.minWidth = (viewWidth + 40) + "px";
        var originals2 = track.querySelectorAll(".nav__link");
        for (var j = 0; j < originals2.length; j++) {
          var clone2 = originals2[j].cloneNode(true);
          clone2.setAttribute("data-clone", "1");
          clone2.setAttribute("aria-hidden", "true");
          clone2.setAttribute("tabindex", "-1");
          track.appendChild(clone2);
        }
      }

      void track.offsetWidth;
      track.classList.add("is-scrolling");
    }

    requestAnimationFrame(setupMarquee);

    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        track.style.minWidth = "";
        setupMarquee();
      }, 180);
    });

    var resumeTimer = null;
    track.addEventListener("touchstart", function () {
      track.style.animationPlayState = "paused";
      clearTimeout(resumeTimer);
    }, { passive: true });

    track.addEventListener("touchend", function () {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () {
        track.style.animationPlayState = "";
      }, 1400);
    }, { passive: true });
  })();

  /* =========================================================
     B. DOWNLOADER
     ========================================================= */
  (function initDownloader() {
    var form = document.getElementById("dlForm");
    if (!form) return;

    var yearEl = document.getElementById("y");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function detectPlatform(url) {
      if (!url) return null;
      var u = String(url).toLowerCase();
      if (u.includes("tiktok.com")) return "TikTok";
      if (u.includes("instagram.com")) return "Instagram";
      if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
      if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
      if (u.includes("twitter.com") || u.includes("x.com")) return "Twitter";
      if (u.includes("pinterest.com") || u.includes("pin.it")) return "Pinterest";
      if (u.includes("threads.net")) return "Threads";
      if (u.includes("spotify.com")) return "Spotify";
      return null;
    }

    function extractMediaList(payload) {
      var items = [];
      var seen = new Set();
      function add(label, url, type) {
        if (!url || typeof url !== "string") return;
        if (!/^https?:\/\//i.test(url)) return;
        if (url.indexOf("allinonedownloader.com") !== -1) return;
        if (seen.has(url)) return;
        seen.add(url);
        items.push({ label: label || "Download", url: url, type: type || "" });
      }
      function walk(obj, depth) {
        if (depth > 6) return;
        if (!obj || typeof obj !== "object") return;
        for (var k in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          var v = obj[k];
          if (typeof v === "string" && /^https?:\/\//i.test(v)) add(k, v);
          else if (v && typeof v === "object") walk(v, depth + 1);
        }
      }
      if (Array.isArray(payload.medias)) {
        for (var i = 0; i < payload.medias.length; i++) {
          var m = payload.medias[i];
          if (typeof m === "string") add("Media", m);
          else if (m && typeof m === "object")
            add(m.label || m.quality || m.type || m.name, m.url || m.link || m.src, m.type);
        }
      }
      if (Array.isArray(payload.links)) {
        for (var j = 0; j < payload.links.length; j++) {
          var l = payload.links[j];
          if (typeof l === "string") add("Link", l);
          else if (l && typeof l === "object")
            add(l.label || l.name || l.quality, l.url || l.link || l.src, l.type);
        }
      }
      if (Array.isArray(payload.downloads)) {
        for (var d = 0; d < payload.downloads.length; d++) {
          var x = payload.downloads[d];
          if (x && typeof x === "object")
            add(x.label || x.quality || x.type, x.url || x.link, x.type);
        }
      }
      if (Array.isArray(payload.images)) {
        for (var p = 0; p < payload.images.length; p++) {
          var im = payload.images[p];
          if (typeof im === "string") add("Gambar " + (p + 1), im, "image");
          else if (im && im.url) add(im.label || "Gambar " + (p + 1), im.url, "image");
        }
      }
      if (payload.urls && typeof payload.urls === "object" && !Array.isArray(payload.urls)) {
        for (var key in payload.urls) {
          if (!Object.prototype.hasOwnProperty.call(payload.urls, key)) continue;
          var uv = payload.urls[key];
          if (typeof uv === "string") add(key, uv);
          else if (uv && uv.url) add(key, uv.url);
        }
      }
      add("Video", payload.video || payload.video_url, "video");
      add("Audio", payload.audio || payload.audio_url || payload.music || payload.music_url, "audio");
      add("Gambar", payload.image_url || (payload.type === "image" ? payload.image : null), "image");
      if (items.length === 0) walk(payload, 0);
      return items;
    }

    function renderResult(raw) {
      var result = document.getElementById("dlResult");
      if (!result) return;

      var payload = raw;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        if (payload.data && typeof payload.data === "object") payload = payload.data;
        if (payload.result && typeof payload.result === "object") payload = payload.result;
      }

      var thumb = null, title = "";
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        thumb = payload.thumbnail || payload.thumb || payload.cover ||
                payload.image || payload.poster || payload.preview || null;
        title = payload.title || payload.name || payload.desc ||
                payload.description || payload.caption || "";
      }

      var medias = [];
      if (Array.isArray(payload)) {
        for (var i = 0; i < payload.length; i++) {
          var it = payload[i];
          if (it && it.url) medias.push({ label: it.label || it.name || "Media", url: it.url, type: it.type || "" });
        }
      } else if (payload && typeof payload === "object") {
        medias = extractMediaList(payload);
      }

      var html = "";

      if (thumb || title) {
        html += '<div class="result__head">';
        if (thumb) {
          html += '<div class="result__thumb"><img src="' + escapeHtml(thumb) +
                  '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
                  'onerror="this.style.display=\'none\'"></div>';
        }
        html += '<div class="result__info">';
        if (title) html += '<div class="result__title">' + escapeHtml(title) + '</div>';
        html += '<div class="result__meta">' + medias.length + ' tautan siap</div>';
        html += '</div></div>';
      }

      if (medias.length > 0) {
        html += '<div class="result__list">';
        for (var k = 0; k < medias.length; k++) {
          html += '<a class="result__item" href="' + escapeHtml(medias[k].url) +
                  '" target="_blank" rel="noopener noreferrer">';
          html += '<span class="result__item-label">' + escapeHtml(medias[k].label) + '</span>';
          html += '<span class="result__item-icon">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg></span></a>';
        }
        html += '</div>';
      } else {
        html += '<div class="result__empty">Tidak ada tautan yang bisa ditampilkan otomatis. Lihat respons mentah di bawah.</div>';
      }

      var rawStr = JSON.stringify(raw, null, 2);
      if (rawStr.length > 50000) rawStr = rawStr.slice(0, 50000) + "\n\n... (dipotong)";

      html += '<details class="result__raw"><summary>Lihat respons mentah</summary><pre>' +
              escapeHtml(rawStr) + '</pre></details>';

      result.innerHTML = html;
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    var STATUS_ICONS = {
      loading: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>',
      error:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
      success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      info:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'
    };

    function showStatus(text, type) {
      var el = document.getElementById("dlStatus");
      if (!el) return;
      el.className = "dl__status is-" + (type || "info");
      el.innerHTML = (STATUS_ICONS[type] || STATUS_ICONS.info) + "<span>" + escapeHtml(text) + "</span>";
      el.hidden = false;
    }
    function hideStatus() {
      var el = document.getElementById("dlStatus");
      if (!el) return;
      el.hidden = true;
      el.innerHTML = "";
    }

    var input    = document.getElementById("dlUrl");
    var submit   = document.getElementById("dlSubmit");
    var spinner  = document.getElementById("dlSpinner");
    var label    = submit ? submit.querySelector(".dl__submit-label") : null;
    var resultEl = document.getElementById("dlResult");
    var pasteBtn = document.getElementById("dlPaste");
    var chips    = document.querySelectorAll("#dlPlatforms span");

    if (input && chips.length) {
      input.addEventListener("input", function () {
        var p = detectPlatform(input.value.trim());
        for (var i = 0; i < chips.length; i++) {
          chips[i].classList.toggle("is-detected", p && chips[i].textContent === p);
        }
      });
    }

    if (pasteBtn) {
      pasteBtn.addEventListener("click", async function () {
        try {
          var text = await navigator.clipboard.readText();
          if (text && input) {
            input.value = text.trim();
            input.dispatchEvent(new Event("input"));
            input.focus();
          }
        } catch (err) {
          showStatus("Izinkan akses clipboard, atau paste manual dengan Ctrl+V.", "info");
          if (input) input.focus();
        }
      });
    }

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var url = input ? input.value.trim() : "";

      if (!url) { showStatus("Masukkan link terlebih dahulu.", "error"); if (input) input.focus(); return; }
      if (!/^https?:\/\//i.test(url)) { showStatus("Link harus dimulai dengan http:// atau https://", "error"); if (input) input.focus(); return; }

      if (resultEl) { resultEl.hidden = true; resultEl.innerHTML = ""; }
      submit.disabled = true;
      if (input) input.disabled = true;
      if (spinner) spinner.hidden = false;
      if (label) label.textContent = "Memproses";

      showStatus("Memproses link, mohon tunggu…", "loading");

      var timers = [];
      var msgs = [
        [8000,  "Mengambil data dari server…"],
        [18000, "Menyelesaikan verifikasi keamanan…"],
        [35000, "Hampir selesai, mohon tunggu…"],
        [60000, "Server butuh waktu lebih lama, tetap menunggu…"]
      ];
      for (var i = 0; i < msgs.length; i++) {
        (function (delay, text) {
          timers.push(setTimeout(function () { showStatus(text, "loading"); }, delay));
        })(msgs[i][0], msgs[i][1]);
      }

      try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 120000);

        var res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        var json;
        try { json = await res.json(); }
        catch (e) { throw new Error("Server mengembalikan respons tidak valid."); }

        if (!json.ok) throw new Error(json.error || "Gagal memproses link.");

        hideStatus();
        renderResult(json.data);
      } catch (err) {
        if (err.name === "AbortError") {
          showStatus("Waktu habis. Server tidak merespons dalam 2 menit.", "error");
        } else {
          showStatus(err.message || "Terjadi kesalahan saat memproses link.", "error");
        }
      } finally {
        for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
        submit.disabled = false;
        if (input) input.disabled = false;
        if (spinner) spinner.hidden = true;
        if (label) label.textContent = "Unduh";
      }
    });
  })();

  /* =========================================================
     C. PAGE TRANSITION
     ========================================================= */
  (function initTransition() {
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var EXIT_MS = 620;

    function reveal() {
      document.body.classList.remove("is-loading");
      setTimeout(function () {
        document.body.classList.add("is-ready");
      }, 380);
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(reveal, 60);
    } else {
      document.addEventListener("DOMContentLoaded", function () { setTimeout(reveal, 60); });
    }
    setTimeout(reveal, 2500);

    function navigateTo(href) {
      if (reduceMotion) { window.location.href = href; return; }
      document.body.classList.add("is-leaving");
      setTimeout(function () { window.location.href = href; }, EXIT_MS);
    }

    var links = document.querySelectorAll("a[data-nav]");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (ev) {
        var href = this.getAttribute("href");
        if (!href) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.preventDefault();
        navigateTo(href);
      });
    }

    window.addEventListener("pageshow", function (ev) {
      if (ev.persisted) {
        document.body.classList.remove("is-leaving", "is-ready");
        document.body.classList.add("is-loading");
        setTimeout(function () {
          document.body.classList.remove("is-loading");
          setTimeout(function () {
            document.body.classList.add("is-ready");
          }, 380);
        }, 60);
      }
    });
  })();
})();
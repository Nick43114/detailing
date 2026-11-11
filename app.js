/* Застосунок студії. Дані — з studio-config.js (+ правки власника з бази). */
(function () {
  "use strict";

  const BASE = window.STUDIO_CONFIG, Core = window.Core, Api = window.Api;
  const view = document.getElementById("view");

  if (!BASE || !Core || !Api) {
    view.innerHTML = '<div class="card stub"><div class="big">⚠️</div><h2>Не вдалося запустити</h2><p>Перевірте файли studio-config.js, core.js і api.js.</p></div>';
    return;
  }

  // Поточна конфігурація = файл + правки власника (послуги, контакти, фото, закриті дні)
  let cfg = Core.mergeConfig(BASE, Api.cachedOverrides());

  // ── Допоміжні ─────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeUrl(u) { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; }
  function fmtDuration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + " год " + m + " хв";
    return h ? h + " год" : m + " хв";
  }
  function fmtNumber(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function fmtPrice(s) { return (s.priceFrom ? "від " : "") + fmtNumber(s.price) + " " + cfg.currency; }
  function todayISO() { return Core.zonedParts(Date.now(), cfg.timezone).iso; }
  function visible() { return Core.visibleServices(cfg); }
  function findService(id) { return (cfg.services || []).filter(function (s) { return s.id === id; })[0] || null; }
  function revealStep(id) {
    const el = document.getElementById(id);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
  }
  function stub(emoji, title, text) {
    return '<div class="card stub"><div class="big">' + emoji + "</div><h2>" + esc(title) + "</h2><p>" + esc(text) + "</p></div>";
  }

  function applyBranding() {
    document.getElementById("brand-logo").src = cfg.logo;
    document.getElementById("brand-name").textContent = cfg.name;
    document.getElementById("brand-tag").textContent = cfg.tagline;
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme && cfg.themeColor) theme.setAttribute("content", cfg.themeColor);
    const demoTag = document.getElementById("demo-tag");
    if (demoTag) demoTag.hidden = Api.mode !== "demo";
  }

  // ── Статус «зараз відчинено» (за часом студії) ────────────
  function workStatus() {
    const p = Core.zonedParts(Date.now(), cfg.timezone);
    const day = Core.daySchedule(cfg, p.iso);
    if (day) {
      if (p.minutes >= Core.toMin(day.open) && p.minutes < Core.toMin(day.close)) return { open: true, text: "Зараз відчинено · до " + day.close };
      if (p.minutes < Core.toMin(day.open)) return { open: false, text: "Зараз зачинено · відчинимось сьогодні о " + day.open };
    }
    for (let i = 1; i <= 7; i++) {
      const iso = Core.addDays(p.iso, i), d = Core.daySchedule(cfg, iso);
      if (d) return { open: false, text: "Зараз зачинено · " + (i === 1 ? "завтра" : "у " + Core.WEEKDAYS_ACC[Core.weekdayOf(iso)]) + " з " + d.open };
    }
    return { open: false, text: "Зараз зачинено" };
  }

  // ═══ ГОЛОВНА ═══════════════════════════════════════════════
  function serviceCard(s) {
    const includes = (s.includes || []).map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    return (
      '<article class="service">' +
        '<img class="service-img" src="' + esc(s.photo) + '" alt="' + esc(s.name) + '" loading="lazy">' +
        '<div class="service-body">' +
          "<h3>" + esc(s.name) + "</h3>" +
          '<p class="short">' + esc(s.short) + "</p>" +
          '<div class="meta"><span class="chip price">' + fmtPrice(s) + '</span><span class="chip">⏱ ' + fmtDuration(s.duration) + "</span></div>" +
          "<details><summary>Що входить</summary><p>" + esc(s.description) + "</p>" + (includes ? "<ul>" + includes + "</ul>" : "") + "</details>" +
          '<a class="btn block" href="#/booking?service=' + encodeURIComponent(s.id) + '">Записатися</a>' +
        "</div>" +
      "</article>"
    );
  }

  function miniService(s) {
    return (
      '<a class="mini" href="#/services"><img src="' + esc(s.photo) + '" alt="" loading="lazy">' +
      '<div class="t"><h3>' + esc(s.name) + '</h3><div class="s">⏱ ' + fmtDuration(s.duration) + "</div></div>" +
      '<div class="p">' + fmtPrice(s) + "</div></a>"
    );
  }

  function renderHome() {
    const st = workStatus(), hero = cfg.hero || {}, c = cfg.contacts || {};
    const featured = visible().slice(0, cfg.featuredServicesCount || 3);
    let html =
      '<section class="hero"><img class="hero-img" src="' + esc(hero.photo) + '" alt="">' +
        '<div class="hero-body"><h1>' + esc(hero.title) + "</h1><p>" + esc(hero.subtitle) + '</p><a class="btn" href="#/booking">' + esc(hero.cta || "Записатися") + "</a></div></section>" +
      '<div class="status"><span class="dot' + (st.open ? " on" : "") + '"></span><span>' + esc(st.text) + "</span></div>" +
      '<section><div class="row-head"><h2 class="section-title">Популярні послуги</h2><a class="link" href="#/services">Усі</a></div><div class="mini-list">' + featured.map(miniService).join("") + "</div></section>" +
      '<section><h2 class="section-title">Чому ми</h2><div class="cards">' +
        (cfg.highlights || []).map(function (h) {
          return '<div class="card highlight"><div class="ico">' + esc(h.icon) + "</div><div><h3>" + esc(h.title) + "</h3><p>" + esc(h.text) + "</p></div></div>";
        }).join("") + "</div></section>";

    if (cfg.gallery && cfg.gallery.length) {
      html += '<section><h2 class="section-title">Наші роботи</h2><div class="gallery">' +
        cfg.gallery.map(function (g) {
          return '<figure class="shot" style="margin:0"><img src="' + esc(g.photo) + '" alt="' + esc(g.caption) + '" loading="lazy"><span>' + esc(g.caption) + "</span></figure>";
        }).join("") + "</div></section>";
    }
    html += '<div class="btn-row"><a class="btn" href="#/booking">Записатися</a>' +
      (c.phone ? '<a class="btn secondary" href="tel:' + esc(c.phone) + '">Зателефонувати</a>' : "") + "</div>";
    return html;
  }

  // ═══ ПОСЛУГИ ═══════════════════════════════════════════════
  function renderServices() {
    return '<section><h1 class="page-title">Послуги</h1><p class="page-lead">Оберіть послугу — запишемо на зручний час.</p></section>' +
      '<div class="cards">' + visible().map(serviceCard).join("") + "</div>";
  }

  // ═══ ЗАПИС ═════════════════════════════════════════════════
  function freshBooking() {
    return { serviceId: null, date: null, slotEpoch: null, name: "", phone: "", hp: "", busy: null, loading: false, busyError: "", error: "", sending: false, done: null };
  }
  let bk = freshBooking();

  function renderBooking(params, entering) {
    if (entering && bk.done) bk = freshBooking();
    const sid = params.get("service");
    if (sid && findService(sid) && bk.serviceId !== sid) {
      bk.serviceId = sid; bk.slotEpoch = null; bk.error = "";
    }
    return '<section><h1 class="page-title">Запис</h1><p class="page-lead">Оберіть послугу, день і вільний час.</p></section><div id="book-root"></div>';
  }
  function mountBooking() {
    drawBooking();
    if (bk.date && bk.busy === null && !bk.loading && !bk.done) loadBusy();
  }

  function drawBooking() {
    const root = document.getElementById("book-root");
    if (!root) return;
    const y = window.scrollY;
    root.innerHTML = bookingHtml();
    window.scrollTo(0, y);
  }

  function currentSlots(svc) {
    if (!svc || !bk.date || !bk.busy) return [];
    return Core.computeSlots({ cfg: cfg, iso: bk.date, durationMin: svc.duration, busy: bk.busy, nowEpoch: Date.now() });
  }

  function bookingHtml() {
    if (bk.done) return confirmationHtml();
    const svc = findService(bk.serviceId);
    const tz = cfg.timezone;

    let h = '<section class="step" id="step-1"><h2 class="step-title"><span class="num">1</span>Послуга</h2><div class="choice-list">' +
      visible().map(function (s) {
        return '<button type="button" class="choice' + (bk.serviceId === s.id ? " selected" : "") + '" data-act="pick-service" data-id="' + esc(s.id) + '">' +
          '<span class="c-name">' + esc(s.name) + '</span><span class="c-meta">⏱ ' + fmtDuration(s.duration) + " · " + fmtPrice(s) + "</span></button>";
      }).join("") + "</div></section>";

    if (!svc) return h;

    const dates = Core.bookableDates(cfg, Date.now());
    h += '<section class="step" id="step-2"><h2 class="step-title"><span class="num">2</span>Дата</h2><div class="dates">' +
      dates.map(function (d) {
        return '<button type="button" class="date' + (bk.date === d.iso ? " selected" : "") + '" data-act="pick-date" data-iso="' + d.iso + '"' + (d.open ? "" : " disabled") + ">" +
          '<span class="dw">' + Core.WEEKDAYS_SHORT[d.weekday] + '</span><span class="dd">' + d.day + '</span><span class="dm">' + Core.MONTHS_SHORT[d.month - 1] + "</span></button>";
      }).join("") + "</div></section>";

    if (!bk.date) return h;

    h += '<section class="step" id="step-3"><h2 class="step-title"><span class="num">3</span>Час</h2><p class="muted step-sub">' + esc(Core.fmtDateLong(bk.date)) + "</p>";
    if (bk.loading) {
      h += '<p class="muted">Завантажуємо вільний час…</p>';
    } else if (bk.busy === null) {
      h += '<div class="alert err">' + esc(bk.busyError || "Не вдалося завантажити вільний час.") + '</div><button type="button" class="btn secondary" data-act="retry-busy">Спробувати ще раз</button>';
    } else {
      const slots = currentSlots(svc);
      if (bk.slotEpoch && !slots.some(function (s) { return s.epoch === bk.slotEpoch; })) bk.slotEpoch = null;
      if (!slots.length) {
        h += '<p class="muted">На цю дату вільного часу немає. Оберіть інший день.</p>';
      } else {
        h += '<div class="slots">' + slots.map(function (s) {
          return '<button type="button" class="slot' + (bk.slotEpoch === s.epoch ? " selected" : "") + '" data-act="pick-slot" data-epoch="' + s.epoch + '">' + s.time + "</button>";
        }).join("") + "</div>";
      }
    }
    if (!bk.slotEpoch && bk.error) h += '<div class="alert err" role="alert" style="margin-top:12px">' + esc(bk.error) + "</div>";
    h += "</section>";

    if (!bk.slotEpoch) return h;

    h += '<section class="step" id="step-4"><h2 class="step-title"><span class="num">4</span>Ваші дані</h2>' +
      '<form class="form" data-form="book" novalidate>' +
        '<label class="field"><span>Ім’я</span><input name="name" data-bind="bk-name" value="' + esc(bk.name) + '" autocomplete="name" maxlength="80" placeholder="Як до вас звертатися"></label>' +
        '<label class="field"><span>Телефон</span><input name="phone" type="tel" inputmode="tel" data-bind="bk-phone" value="' + esc(bk.phone) + '" autocomplete="tel" placeholder="+380 50 123 45 67"></label>' +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" data-bind="bk-hp">' +
        '<div class="summary"><strong>' + esc(svc.name) + "</strong><span>" + esc(Core.fmtDateTime(bk.slotEpoch, tz)) + "–" + esc(Core.fmtTime(bk.slotEpoch + svc.duration * 60000, tz)) + "</span><span>" + fmtPrice(svc) + "</span></div>" +
        (bk.error ? '<div class="alert err">' + esc(bk.error) + "</div>" : "") +
        '<button class="btn block" type="submit"' + (bk.sending ? " disabled" : "") + ">" + (bk.sending ? "Записуємо…" : "Записатися") + "</button>" +
      "</form></section>";
    return h;
  }

  function confirmationHtml() {
    const d = bk.done, s = d.service, c = cfg.contacts || {}, tz = cfg.timezone;
    const row = function (k, v) { return '<div class="kv"><span>' + k + "</span><strong>" + v + "</strong></div>"; };
    return (
      '<div class="card done"><div class="check">✓</div><h2 class="page-title">Запис створено</h2>' +
      '<p class="page-lead">Чекаємо на вас! Ми підтвердимо запис за потреби.</p>' +
      '<div class="kvs">' +
        row("Послуга", esc(s.name)) +
        row("Дата й час", esc(Core.fmtDateTime(d.epoch, tz)) + "–" + esc(Core.fmtTime(d.epoch + s.duration * 60000, tz))) +
        row("Тривалість", fmtDuration(s.duration)) +
        row("Вартість", fmtPrice(s)) +
        row("Ім’я", esc(d.name)) +
        row("Телефон", esc(Core.formatPhone(d.phone))) +
        (c.address ? row("Адреса", esc(c.address)) : "") +
      "</div>" +
      (Api.mode === "demo" ? '<div class="alert info">Демо-режим: запис збережено лише в цьому браузері.</div>' : "") +
      '<div class="btn-row">' +
        '<button type="button" class="btn secondary" data-act="ics">Додати в календар</button>' +
        (c.phone ? '<a class="btn secondary" href="tel:' + esc(c.phone) + '">Зателефонувати</a>' : "") +
      '</div><div class="btn-row"><a class="btn" href="#/home">На головну</a><button type="button" class="btn secondary" data-act="book-again">Новий запис</button></div></div>'
    );
  }

  async function loadBusy() {
    const iso = bk.date;
    bk.loading = true; bk.busy = null; bk.busyError = "";
    drawBooking();
    const r = Core.dayRangeEpoch(cfg, iso);
    try {
      const busy = await Api.getBusy(r.from, r.to);
      if (bk.date !== iso) return;
      bk.busy = busy;
    } catch (e) {
      if (bk.date !== iso) return;
      bk.busy = null;
      bk.busyError = (e && e.message) || "Не вдалося завантажити вільний час.";
    }
    bk.loading = false;
    drawBooking();
  }

  async function submitBooking() {
    if (bk.sending) return;
    const svc = findService(bk.serviceId);
    if (!svc || !bk.slotEpoch) return;
    const name = bk.name.trim(), phone = Core.normalizePhone(bk.phone);

    if (name.length < 2) { bk.error = "Вкажіть ім’я (від 2 символів)."; drawBooking(); return; }
    if (!phone) { bk.error = "Вкажіть номер у форматі +380 XX XXX XX XX."; drawBooking(); return; }
    if (bk.hp) { bk.done = { service: svc, epoch: bk.slotEpoch, name: name, phone: phone }; drawBooking(); return; } // бот

    if (!currentSlots(svc).some(function (s) { return s.epoch === bk.slotEpoch; })) {
      bk.error = "Цей час уже недоступний. Оберіть інший."; bk.slotEpoch = null; drawBooking(); return;
    }
    bk.sending = true; bk.error = ""; drawBooking();
    try {
      const res = await Api.createBooking({
        service: svc, startEpoch: bk.slotEpoch, name: name, phone: phone,
        buffer: cfg.schedule.bufferMinutes == null ? 15 : cfg.schedule.bufferMinutes, boxes: cfg.schedule.boxes || 1
      });
      bk.done = { service: svc, epoch: bk.slotEpoch, name: name, phone: phone, id: res.id };
      bk.sending = false; drawBooking(); window.scrollTo(0, 0);
    } catch (e) {
      bk.sending = false;
      if (e && e.code === "slot_taken") {
        bk.slotEpoch = null;
        await loadBusy();
        bk.error = "Цей час щойно зайняли. Оберіть, будь ласка, інший.";
        drawBooking();
        revealStep("step-3");
      } else {
        bk.error = (e && e.message) || "Не вдалося створити запис. Спробуйте ще раз.";
        drawBooking();
      }
    }
  }

  function downloadIcs() {
    const d = bk.done; if (!d) return;
    const c = cfg.contacts || {};
    const text = Core.buildIcs({
      uid: (d.id || String(d.epoch)) + "@detailing", title: d.service.name + " — " + cfg.name, startEpoch: d.epoch,
      durationMin: d.service.duration, location: c.address || "", description: "Запис у " + cfg.name + (c.phoneDisplay ? ". Телефон: " + c.phoneDisplay : "")
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    a.download = "zapys.ics";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ═══ ПИТАННЯ ═══════════════════════════════════════════════
  let faqSel = -1;
  function renderFaq() {
    return '<section><h1 class="page-title">Питання</h1><p class="page-lead">Оберіть питання — відповідь з’явиться одразу.</p></section><div id="faq-root"></div>';
  }
  function mountFaq() { drawFaq(); }
  function drawFaq() {
    const root = document.getElementById("faq-root");
    if (!root) return;
    const items = cfg.faq || [], c = cfg.contacts || {};
    let h = '<div class="faq-grid">' + items.map(function (f, i) {
      return '<button type="button" class="faq-btn' + (i === faqSel ? " on" : "") + '" data-act="faq" data-i="' + i + '" aria-pressed="' + (i === faqSel) + '">' + esc(f.q) + "</button>";
    }).join("") + "</div>";
    if (faqSel >= 0 && items[faqSel]) {
      h += '<div class="card faq-answer" id="faq-answer" aria-live="polite"><h3>' + esc(items[faqSel].q) + "</h3><p>" + esc(items[faqSel].a) + '</p><a class="btn" href="#/booking">Записатися</a></div>';
    } else {
      h += '<p class="muted faq-hint">Натисніть на кнопку з питанням.</p>';
    }
    h += '<div class="card"><h3 class="mini-title">Не знайшли відповідь?</h3><p class="muted">Зателефонуйте — підкажемо.</p>' +
      (c.phone ? '<a class="btn secondary block" href="tel:' + esc(c.phone) + '">' + esc(c.phoneDisplay || c.phone) + "</a>" : "") + "</div>";
    root.innerHTML = h;
  }

  // ═══ КОНТАКТИ ══════════════════════════════════════════════
  function renderContacts() {
    const c = cfg.contacts || {}, today = Core.zonedParts(Date.now(), cfg.timezone).weekday;
    const row = function (ico, label, inner) { return '<div class="info-row"><span class="ico">' + ico + '</span><div><div class="lbl">' + label + "</div>" + inner + "</div></div>"; };
    let rows = "";
    if (c.phone) rows += row("📞", "Телефон", '<a href="tel:' + esc(c.phone) + '">' + esc(c.phoneDisplay || c.phone) + "</a>");
    if (c.email) rows += row("✉️", "Пошта", '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>");
    if (c.address) rows += row("📍", "Адреса", "<span>" + esc(c.address) + "</span>" + (safeUrl(c.mapUrl) ? '<a class="link small" href="' + esc(safeUrl(c.mapUrl)) + '" target="_blank" rel="noopener">Прокласти маршрут</a>' : ""));

    const hours = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
      const d = (cfg.schedule.days || {})[wd];
      return '<div class="hours-row' + (wd === today ? " today" : "") + '"><span>' + Core.WEEKDAYS[wd].charAt(0).toUpperCase() + Core.WEEKDAYS[wd].slice(1) + "</span><span>" + (d ? d.open + "–" + d.close : "вихідний") + "</span></div>";
    }).join("");

    const socials = [];
    if (safeUrl(c.instagram)) socials.push('<a class="chip" href="' + esc(safeUrl(c.instagram)) + '" target="_blank" rel="noopener">Instagram</a>');
    if (safeUrl(c.telegram)) socials.push('<a class="chip" href="' + esc(safeUrl(c.telegram)) + '" target="_blank" rel="noopener">Telegram</a>');

    return (
      '<section><h1 class="page-title">Контакти</h1><p class="page-lead">Чекаємо на вас або відповімо за телефоном.</p></section>' +
      '<div class="card info">' + rows + "</div>" +
      (c.phone ? '<div class="btn-row"><a class="btn" href="tel:' + esc(c.phone) + '">Зателефонувати</a><a class="btn secondary" href="#/booking">Записатися</a></div>' : "") +
      '<section><h2 class="section-title">Графік роботи</h2><div class="card hours">' + hours + "</div></section>" +
      (socials.length ? '<section><h2 class="section-title">Ми в мережі</h2><div class="meta">' + socials.join("") + "</div></section>" : "") +
      '<p class="owner-link"><a href="#/owner">Вхід для власника</a></p>'
    );
  }

  // ═══ КАБІНЕТ ВЛАСНИКА ══════════════════════════════════════
  const ow = {
    tab: "bookings", filter: "new", bookings: null, loading: false, msg: "", msgKind: "ok",
    loginError: "", open: {}, svc: [], ct: {}, gal: [], heroPhoto: "", working: false
  };

  function initOwnerDrafts() {
    const c = cfg.contacts || {};
    ow.svc = JSON.parse(JSON.stringify(cfg.services || []));
    ow.gal = JSON.parse(JSON.stringify(cfg.gallery || []));
    ow.heroPhoto = (cfg.hero || {}).photo || "";
    ow.ct = { phone: c.phoneDisplay || c.phone || "", email: c.email || "", address: c.address || "", mapUrl: c.mapUrl || "", instagram: c.instagram || "", telegram: c.telegram || "" };
  }

  function renderOwner() { return '<div id="owner-root"></div>'; }
  function mountOwner() {
    if (Api.isLoggedIn()) {
      initOwnerDrafts();
      drawOwner();
      if (ow.bookings === null) loadOwnerBookings();
    } else {
      drawOwner();
    }
  }

  function drawOwner() {
    const root = document.getElementById("owner-root");
    if (!root) return;
    const y = window.scrollY;
    root.innerHTML = Api.isLoggedIn() ? ownerHtml() : loginHtml();
    window.scrollTo(0, y);
  }

  function loginHtml() {
    return (
      '<section><h1 class="page-title">Кабінет власника</h1><p class="page-lead">Введіть пароль, щоб побачити записи та змінити дані студії.</p></section>' +
      '<form class="form card" data-form="ow-login" novalidate>' +
        '<label class="field"><span>Пароль</span><input type="password" name="password" autocomplete="current-password" required></label>' +
        (ow.loginError ? '<div class="alert err">' + esc(ow.loginError) + "</div>" : "") +
        '<button class="btn block" type="submit"' + (ow.working ? " disabled" : "") + ">" + (ow.working ? "Входимо…" : "Увійти") + "</button>" +
        (Api.mode === "demo" ? '<p class="muted small">Демо-режим (база не підключена): пароль задано в studio-config.js → owner.demoPassword.</p>' : "") +
      "</form>"
    );
  }

  function ownerError(e) {
    if (e && e.code === "auth") {
      Api.logout(); ow.bookings = null; ow.loginError = "Сесія завершилась. Увійдіть знову.";
    } else {
      ow.msg = (e && e.message) || "Сталася помилка. Спробуйте ще раз."; ow.msgKind = "err";
    }
    ow.loading = false; ow.working = false;
    drawOwner();
  }
  function say(msg, kind) { ow.msg = msg; ow.msgKind = kind || "ok"; }

  function ownerHtml() {
    const tabs = [["bookings", "Записи"], ["services", "Послуги"], ["photos", "Фото"], ["contacts", "Контакти"], ["days", "Дні"]];
    const newCount = (ow.bookings || []).filter(function (b) { return b.status === "new"; }).length;
    let h = '<div class="row-head"><h1 class="page-title">Кабінет</h1><button type="button" class="link-btn" data-act="ow-logout">Вийти</button></div>';
    if (Api.mode === "demo") h += '<div class="alert info">Демо-режим: дані зберігаються лише в цьому браузері. Підключіть Supabase (див. README.md), щоб записи були спільними.</div>';
    h += '<div class="pills">' + tabs.map(function (t) {
      return '<button type="button" class="pill' + (ow.tab === t[0] ? " on" : "") + '" data-act="ow-tab" data-tab="' + t[0] + '">' + t[1] +
        (t[0] === "bookings" && newCount ? ' <span class="count">' + newCount + "</span>" : "") + "</button>";
    }).join("") + "</div>";
    if (ow.msg) h += '<div class="alert ' + ow.msgKind + '" role="status">' + esc(ow.msg) + "</div>";
    h += { bookings: ownerBookingsHtml, services: ownerServicesHtml, photos: ownerPhotosHtml, contacts: ownerContactsHtml, days: ownerDaysHtml }[ow.tab]();
    return h;
  }

  // — Записи —
  const STATUS = { "new": "Новий", confirmed: "Підтверджено", cancelled: "Скасовано" };

  function filteredBookings() {
    const now = Date.now();
    const list = (ow.bookings || []).filter(function (b) {
      if (ow.filter === "new") return b.status === "new";
      if (ow.filter === "upcoming") return b.status !== "cancelled" && b.end >= now;
      if (ow.filter === "cancelled") return b.status === "cancelled";
      return true;
    });
    const asc = ow.filter === "new" || ow.filter === "upcoming";
    return list.sort(function (a, b) { return asc ? a.start - b.start : b.start - a.start; });
  }

  function bookingCard(b) {
    const acts = [];
    if (b.status === "new") acts.push('<button type="button" class="btn small" data-act="ow-status" data-id="' + esc(b.id) + '" data-status="confirmed">Підтвердити</button>');
    if (b.status !== "cancelled") acts.push('<button type="button" class="btn small secondary" data-act="ow-status" data-id="' + esc(b.id) + '" data-status="cancelled">Скасувати</button>');
    else acts.push('<button type="button" class="btn small secondary" data-act="ow-status" data-id="' + esc(b.id) + '" data-status="new">Відновити</button>');
    return (
      '<article class="bk bk-' + esc(b.status) + '"><div class="bk-top"><div class="bk-when">' + esc(Core.fmtDateTime(b.start, cfg.timezone)) + "–" + esc(Core.fmtTime(b.start + b.durationMin * 60000, cfg.timezone)) +
      '</div><span class="badge ' + esc(b.status) + '">' + esc(STATUS[b.status] || b.status) + "</span></div>" +
      '<div class="bk-svc">' + esc(b.serviceName) + " · " + fmtDuration(b.durationMin) + " · бокс " + esc(b.box) + "</div>" +
      '<div class="bk-client">' + esc(b.name) + ' · <a href="tel:' + esc(b.phone) + '">' + esc(Core.formatPhone(b.phone)) + "</a></div>" +
      '<div class="bk-actions">' + acts.join("") + "</div></article>"
    );
  }

  function ownerBookingsHtml() {
    const filters = [["new", "Нові"], ["upcoming", "Майбутні"], ["all", "Усі"], ["cancelled", "Скасовані"]];
    let h = '<div class="subbar"><div class="pills small">' + filters.map(function (f) {
      return '<button type="button" class="pill' + (ow.filter === f[0] ? " on" : "") + '" data-act="ow-filter" data-filter="' + f[0] + '">' + f[1] + "</button>";
    }).join("") + '</div><button type="button" class="link-btn" data-act="ow-refresh">Оновити</button></div>';
    if (ow.loading && ow.bookings === null) return h + '<p class="muted">Завантажуємо записи…</p>';
    const list = filteredBookings();
    if (!list.length) return h + '<p class="muted empty">' + (ow.filter === "new" ? "Нових записів немає." : "Записів немає.") + "</p>";
    return h + '<div class="cards">' + list.map(bookingCard).join("") + "</div>";
  }

  async function loadOwnerBookings() {
    ow.loading = true; drawOwner();
    try {
      const since = Core.zonedToEpoch(todayISO(), 0, cfg.timezone) - 7 * 86400000;
      ow.bookings = await Api.listBookings(since);
      ow.loading = false; drawOwner();
    } catch (e) { ownerError(e); }
  }

  // — Послуги —
  function ownerServicesHtml() {
    let h = '<p class="muted">Змініть назви, ціни, тривалість і фото. Клієнти побачать зміни після збереження.</p>';
    h += ow.svc.map(function (s, i) {
      const num = function (v) { return typeof v === "number" && isFinite(v) ? v : ""; };
      return (
        '<details class="editor" data-id="' + esc(s.id) + '"' + (ow.open[s.id] ? " open" : "") + ">" +
          "<summary><span>" + esc(s.name || "Без назви") + "</span><small>" + (isFinite(s.price) ? fmtNumber(s.price) + " " + esc(cfg.currency) : "") + (s.hidden ? " · прихована" : "") + "</small></summary>" +
          '<div class="editor-body">' +
            '<img class="thumb" src="' + esc(s.photo) + '" alt="">' +
            '<label class="btn small secondary file">Змінити фото<input type="file" accept="image/*" hidden data-change="svc-photo" data-i="' + i + '"></label>' +
            '<label class="field"><span>Назва</span><input data-bind="svc" data-i="' + i + '" data-f="name" value="' + esc(s.name) + '" maxlength="80"></label>' +
            '<label class="field"><span>Коротко</span><input data-bind="svc" data-i="' + i + '" data-f="short" value="' + esc(s.short) + '" maxlength="160"></label>' +
            '<label class="field"><span>Опис</span><textarea rows="3" data-bind="svc" data-i="' + i + '" data-f="description">' + esc(s.description) + "</textarea></label>" +
            '<label class="field"><span>Що входить (кожен пункт з нового рядка)</span><textarea rows="4" data-bind="svc" data-i="' + i + '" data-f="includes">' + esc((s.includes || []).join("\n")) + "</textarea></label>" +
            '<div class="field-row">' +
              '<label class="field"><span>Ціна, ' + esc(cfg.currency) + '</span><input type="number" inputmode="numeric" min="0" step="1" data-bind="svc" data-i="' + i + '" data-f="price" value="' + num(s.price) + '"></label>' +
              '<label class="field"><span>Тривалість, хв</span><input type="number" inputmode="numeric" min="5" max="720" step="5" data-bind="svc" data-i="' + i + '" data-f="duration" value="' + num(s.duration) + '"></label>' +
            "</div>" +
            '<label class="check-row"><input type="checkbox" data-bind="svc" data-i="' + i + '" data-f="priceFrom"' + (s.priceFrom ? " checked" : "") + '> Ціна «від»</label>' +
            '<label class="check-row"><input type="checkbox" data-bind="svc" data-i="' + i + '" data-f="visible"' + (s.hidden ? "" : " checked") + '> Показувати клієнтам</label>' +
            '<button type="button" class="btn small secondary danger" data-act="ow-svc-del" data-i="' + i + '">Видалити послугу</button>' +
          "</div></details>"
      );
    }).join("");
    h += '<div class="btn-row"><button type="button" class="btn secondary" data-act="ow-svc-add">+ Додати послугу</button><button type="button" class="btn" data-act="ow-svc-save"' + (ow.working ? " disabled" : "") + ">Зберегти</button></div>" +
      '<button type="button" class="link-btn muted-link" data-act="ow-svc-reset">Скинути до значень із файлу конфігурації</button>';
    return h;
  }

  function cleanServices() {
    if (!ow.svc.length) throw new Error("Має лишитися хоча б одна послуга.");
    return ow.svc.map(function (s, i) {
      const label = "Послуга №" + (i + 1) + ": ";
      const name = String(s.name || "").trim();
      if (!name) throw new Error(label + "вкажіть назву.");
      const price = Number(s.price);
      if (!isFinite(price) || price < 0) throw new Error(label + "вкажіть ціну (число від 0).");
      const dur = Math.round(Number(s.duration));
      if (!isFinite(dur) || dur < 5 || dur > 720) throw new Error(label + "тривалість — від 5 до 720 хвилин.");
      const out = {
        id: s.id, name: name, short: String(s.short || "").trim(), description: String(s.description || "").trim(),
        includes: (s.includes || []).map(function (x) { return String(x).trim(); }).filter(Boolean),
        price: Math.round(price), priceFrom: !!s.priceFrom, duration: dur, photo: s.photo || BASE.hero.photo
      };
      if (s.hidden === true) out.hidden = true;
      return out;
    });
  }

  // — Фото —
  function ownerPhotosHtml() {
    let h = '<p class="muted">Фото на Головній. Нові фото стискаються автоматично.</p>' +
      '<div class="card"><h3 class="mini-title">Головне фото</h3><img class="thumb wide" src="' + esc(ow.heroPhoto) + '" alt="">' +
      '<label class="btn small secondary file">Змінити фото<input type="file" accept="image/*" hidden data-change="hero-photo"></label></div>' +
      '<h3 class="mini-title">Галерея «Наші роботи»</h3>';
    h += ow.gal.map(function (g, i) {
      return '<div class="card gal-item"><img class="thumb" src="' + esc(g.photo) + '" alt="">' +
        '<div class="gal-fields"><label class="field"><span>Підпис</span><input data-bind="gal" data-i="' + i + '" value="' + esc(g.caption) + '" maxlength="80"></label>' +
        '<div class="btn-row"><label class="btn small secondary file">Замінити<input type="file" accept="image/*" hidden data-change="gal-photo" data-i="' + i + '"></label>' +
        '<button type="button" class="btn small secondary danger" data-act="ow-gal-del" data-i="' + i + '">Видалити</button></div></div></div>';
    }).join("");
    if (ow.gal.length < 12) h += '<label class="btn secondary block file">+ Додати фото до галереї<input type="file" accept="image/*" hidden data-change="gal-new"></label>';
    h += '<button type="button" class="btn block" data-act="ow-photos-save"' + (ow.working ? " disabled" : "") + ">Зберегти</button>" +
      '<button type="button" class="link-btn muted-link" data-act="ow-photos-reset">Скинути до значень із файлу конфігурації</button>';
    return h;
  }

  // — Контакти —
  function ownerContactsHtml() {
    const f = function (key, label, type, ph) {
      return '<label class="field"><span>' + label + '</span><input type="' + type + '" data-bind="ct" data-f="' + key + '" value="' + esc(ow.ct[key]) + '"' + (ph ? ' placeholder="' + ph + '"' : "") + "></label>";
    };
    return '<div class="form card">' +
      f("phone", "Телефон", "tel", "+380 50 123 45 67") + f("email", "Пошта", "email") + f("address", "Адреса", "text") +
      f("mapUrl", "Посилання на мапу", "url", "https://maps.google.com/…") + f("instagram", "Instagram", "url", "https://instagram.com/…") + f("telegram", "Telegram", "url", "https://t.me/…") +
      '<button type="button" class="btn block" data-act="ow-contacts-save"' + (ow.working ? " disabled" : "") + ">Зберегти</button></div>" +
      '<button type="button" class="link-btn muted-link" data-act="ow-contacts-reset">Скинути до значень із файлу конфігурації</button>';
  }

  // — Дні —
  function ownerDaysHtml() {
    const today = todayISO();
    const closed = (cfg.schedule.closedDates || []).filter(function (d) { return d >= today; }).sort();
    let h = '<p class="muted">Закритий день зникає з вибору дат у записі. Існуючі записи на цей день не скасовуються автоматично.</p>' +
      '<form class="form card" data-form="ow-close"><label class="field"><span>Дата</span><input type="date" name="date" min="' + today + '" required></label>' +
      '<button class="btn block" type="submit"' + (ow.working ? " disabled" : "") + ">Закрити день</button></form>" +
      '<h3 class="mini-title">Закриті дні</h3>';
    if (!closed.length) return h + '<p class="muted empty">Немає закритих днів.</p>';
    return h + '<div class="cards">' + closed.map(function (iso) {
      return '<div class="card closed-day"><span>' + esc(Core.fmtDateLong(iso)) + '</span><button type="button" class="btn small secondary" data-act="ow-day-open" data-iso="' + iso + '">Відкрити</button></div>';
    }).join("") + "</div>";
  }

  async function reloadConfig() {
    const ov = await Api.getOverrides();
    cfg = Core.mergeConfig(BASE, ov);
    applyBranding();
  }

  async function saveOverrides(pairs, okMsg) {
    ow.working = true; say(""); drawOwner();
    try {
      for (let i = 0; i < pairs.length; i++) await Api.saveOverride(pairs[i][0], pairs[i][1]);
      await reloadConfig();
      initOwnerDrafts();
      ow.working = false; say(okMsg, "ok"); drawOwner();
    } catch (e) { ownerError(e); }
  }

  async function uploadFile(file) {
    say("Завантажуємо фото…", "info"); drawOwner();
    try {
      const blob = await Api.prepareImage(file);
      const url = await Api.uploadPhoto(blob);
      say("", "ok");
      return url;
    } catch (e) { ownerError(e); return null; }
  }

  // ═══ Події ═════════════════════════════════════════════════
  const actions = {
    "pick-service": function (el) { bk.serviceId = el.dataset.id; bk.slotEpoch = null; bk.error = ""; drawBooking(); revealStep("step-2"); },
    "pick-date": function (el) { bk.date = el.dataset.iso; bk.slotEpoch = null; bk.error = ""; loadBusy(); revealStep("step-3"); },
    "pick-slot": function (el) { bk.slotEpoch = Number(el.dataset.epoch); bk.error = ""; drawBooking(); revealStep("step-4"); },
    "retry-busy": function () { loadBusy(); },
    "book-again": function () { bk = freshBooking(); location.hash = "#/booking"; drawBooking(); window.scrollTo(0, 0); },
    "ics": downloadIcs,
    "faq": function (el) { const i = Number(el.dataset.i); faqSel = faqSel === i ? -1 : i; drawFaq(); if (faqSel >= 0) revealStep("faq-answer"); },

    "ow-logout": function () { Api.logout(); ow.bookings = null; ow.msg = ""; ow.loginError = ""; drawOwner(); },
    "ow-tab": function (el) { ow.tab = el.dataset.tab; ow.msg = ""; initOwnerDrafts(); drawOwner(); },
    "ow-filter": function (el) { ow.filter = el.dataset.filter; drawOwner(); },
    "ow-refresh": function () { ow.msg = ""; loadOwnerBookings(); },
    "ow-status": async function (el) {
      const status = el.dataset.status;
      if (status === "cancelled" && !window.confirm("Скасувати цей запис? Час звільниться для інших клієнтів.")) return;
      try {
        await Api.setBookingStatus(el.dataset.id, status);
        const b = (ow.bookings || []).filter(function (x) { return x.id === el.dataset.id; })[0];
        if (b) b.status = status;
        say(status === "confirmed" ? "Запис підтверджено." : status === "cancelled" ? "Запис скасовано." : "Запис відновлено.", "ok");
        drawOwner();
      } catch (e) { ownerError(e); }
    },

    "ow-svc-add": function () {
      const id = "svc-" + Date.now().toString(36);
      ow.svc.push({ id: id, name: "Нова послуга", short: "", description: "", includes: [], price: 0, priceFrom: false, duration: 60, photo: BASE.hero.photo });
      ow.open[id] = true; drawOwner();
    },
    "ow-svc-del": function (el) {
      const s = ow.svc[Number(el.dataset.i)];
      if (!s || !window.confirm("Видалити послугу «" + (s.name || "без назви") + "»? Вже створені записи збережуться.")) return;
      ow.svc.splice(Number(el.dataset.i), 1); drawOwner();
    },
    "ow-svc-save": function () {
      let list; try { list = cleanServices(); } catch (e) { say(e.message, "err"); drawOwner(); return; }
      saveOverrides([["services", list]], "Послуги збережено.");
    },
    "ow-svc-reset": function () { if (window.confirm("Повернути послуги з файлу studio-config.js? Ваші правки буде втрачено.")) saveOverrides([["services", null]], "Послуги скинуто до файлу конфігурації."); },

    "ow-gal-del": function (el) { ow.gal.splice(Number(el.dataset.i), 1); drawOwner(); },
    "ow-photos-save": function () {
      const gal = ow.gal.map(function (g) { return { photo: g.photo, caption: String(g.caption || "").trim() }; });
      saveOverrides([["hero", { photo: ow.heroPhoto }], ["gallery", gal]], "Фото збережено.");
    },
    "ow-photos-reset": function () { if (window.confirm("Повернути фото з файлу конфігурації?")) saveOverrides([["hero", null], ["gallery", null]], "Фото скинуто до файлу конфігурації."); },

    "ow-contacts-save": function () {
      const c = ow.ct, out = { email: c.email.trim(), address: c.address.trim() };
      const phone = c.phone.trim();
      if (phone) {
        const n = Core.normalizePhone(phone);
        if (!n) { say("Телефон: вкажіть номер у форматі +380 XX XXX XX XX.", "err"); drawOwner(); return; }
        out.phone = n; out.phoneDisplay = Core.formatPhone(n);
      } else { out.phone = ""; out.phoneDisplay = ""; }
      const urls = [["mapUrl", "мапу"], ["instagram", "Instagram"], ["telegram", "Telegram"]];
      for (let i = 0; i < urls.length; i++) {
        const v = c[urls[i][0]].trim();
        if (v && !safeUrl(v)) { say("Посилання на " + urls[i][1] + " має починатися з https://", "err"); drawOwner(); return; }
        out[urls[i][0]] = v;
      }
      saveOverrides([["contacts", out]], "Контакти збережено.");
    },
    "ow-contacts-reset": function () { if (window.confirm("Повернути контакти з файлу конфігурації?")) saveOverrides([["contacts", null]], "Контакти скинуто до файлу конфігурації."); },

    "ow-day-open": function (el) {
      const list = (cfg.schedule.closedDates || []).filter(function (d) { return d !== el.dataset.iso && d >= todayISO(); });
      saveOverrides([["closedDates", list]], "День знову відкрито.");
    }
  };

  const forms = {
    book: function () { submitBooking(); },
    "ow-login": async function (f) {
      if (ow.working) return;
      ow.working = true; ow.loginError = ""; drawOwner();
      try {
        await Api.login(f.elements.password.value);
        ow.working = false; ow.msg = ""; ow.bookings = null; ow.tab = "bookings";
        initOwnerDrafts(); drawOwner(); loadOwnerBookings();
      } catch (e) { ow.working = false; ow.loginError = (e && e.message) || "Не вдалося увійти."; drawOwner(); }
    },
    "ow-close": async function (f) {
      const iso = f.elements.date.value, today = todayISO();
      if (!iso) return;
      if (iso < today) { say("Оберіть сьогоднішню або майбутню дату.", "err"); drawOwner(); return; }
      const existing = (cfg.schedule.closedDates || []).filter(function (d) { return d >= today; });
      if (existing.indexOf(iso) !== -1) { say("Цей день уже закрито.", "err"); drawOwner(); return; }
      if (ow.bookings === null) { await loadOwnerBookings(); if (ow.bookings === null) return; }
      const n = ow.bookings.filter(function (b) { return b.status !== "cancelled" && Core.zonedParts(b.start, cfg.timezone).iso === iso; }).length;
      if (n && !window.confirm("На " + Core.fmtDateLong(iso) + " є активних записів: " + n + ". Закрити день? Записи не скасовуються автоматично — зв’яжіться з клієнтами.")) return;
      saveOverrides([["closedDates", existing.concat([iso]).sort()]], "День закрито: " + Core.fmtDateLong(iso) + ".");
    }
  };

  const binders = {
    "bk-name": function (t) { bk.name = t.value; },
    "bk-phone": function (t) { bk.phone = t.value; },
    "bk-hp": function (t) { bk.hp = t.value; },
    ct: function (t) { ow.ct[t.dataset.f] = t.value; },
    gal: function (t) { const g = ow.gal[Number(t.dataset.i)]; if (g) g.caption = t.value; },
    svc: function (t) {
      const s = ow.svc[Number(t.dataset.i)], f = t.dataset.f;
      if (!s) return;
      if (f === "priceFrom") s.priceFrom = t.checked;
      else if (f === "visible") s.hidden = !t.checked;
      else if (f === "price" || f === "duration") s[f] = t.value === "" ? NaN : Number(t.value);
      else if (f === "includes") s.includes = t.value.split("\n");
      else s[f] = t.value;
    }
  };

  const changers = {
    "svc-photo": async function (t, file) { const url = await uploadFile(file); if (url && ow.svc[Number(t.dataset.i)]) { ow.svc[Number(t.dataset.i)].photo = url; drawOwner(); } },
    "hero-photo": async function (t, file) { const url = await uploadFile(file); if (url) { ow.heroPhoto = url; drawOwner(); } },
    "gal-photo": async function (t, file) { const url = await uploadFile(file); if (url && ow.gal[Number(t.dataset.i)]) { ow.gal[Number(t.dataset.i)].photo = url; drawOwner(); } },
    "gal-new": async function (t, file) { const url = await uploadFile(file); if (url) { ow.gal.push({ photo: url, caption: "" }); drawOwner(); } }
  };

  view.addEventListener("click", function (e) {
    const el = e.target.closest("[data-act]");
    if (el && view.contains(el) && actions[el.getAttribute("data-act")]) actions[el.getAttribute("data-act")](el, e);
  });
  view.addEventListener("submit", function (e) {
    const name = e.target.getAttribute && e.target.getAttribute("data-form");
    if (name && forms[name]) { e.preventDefault(); forms[name](e.target); }
  });
  view.addEventListener("input", function (e) {
    const key = e.target.getAttribute && e.target.getAttribute("data-bind");
    if (key && binders[key]) binders[key](e.target);
  });
  view.addEventListener("change", function (e) {
    const t = e.target, key = t.getAttribute && t.getAttribute("data-change");
    if (key && changers[key]) {
      const file = t.files && t.files[0];
      t.value = "";
      if (file) changers[key](t, file);
    }
  });
  view.addEventListener("toggle", function (e) {
    const d = e.target;
    if (d.tagName === "DETAILS" && d.dataset.id) ow.open[d.dataset.id] = d.open;
  }, true);

  // ═══ Маршрутизація ═════════════════════════════════════════
  const routes = {
    home: { title: "Головна", render: renderHome },
    services: { title: "Послуги", render: renderServices },
    booking: { title: "Запис", render: renderBooking, mount: mountBooking },
    faq: { title: "Питання", render: renderFaq, mount: mountFaq },
    contacts: { title: "Контакти", render: renderContacts },
    owner: { title: "Кабінет власника", render: renderOwner, mount: mountOwner }
  };
  let currentRoute = null;

  function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "home").split("?");
    const name = routes[parts[0]] ? parts[0] : "home";
    const params = new URLSearchParams(parts[1] || "");
    const entering = name !== currentRoute;

    view.innerHTML = routes[name].render(params, entering);
    if (routes[name].mount) routes[name].mount(params, entering);
    currentRoute = name;
    document.title = routes[name].title + " — " + cfg.name;

    document.querySelectorAll(".tabbar a").forEach(function (a) {
      const on = a.getAttribute("data-route") === name;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (entering) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
  }

  window.addEventListener("hashchange", route);
  applyBranding();
  route();

  // Свіжі правки власника (послуги, контакти, закриті дні) з бази
  Api.getOverrides().then(function (ov) {
    cfg = Core.mergeConfig(BASE, ov);
    applyBranding();
    if (currentRoute !== "owner") route();
  });

  // ── PWA: service worker (працює на https або localhost) ────
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if ("serviceWorker" in navigator && secure) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* без офлайн-режиму */ });
    });
  }
})();

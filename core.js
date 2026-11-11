/*
 * core.js — чиста логіка без DOM і мережі: час студії, графік, вільні слоти,
 * форматування, телефони, об'єднання конфігурації з правками власника.
 * Працює і в браузері (window.Core), і в Node (для тестів).
 */
(function (root) {
  "use strict";

  var MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  var MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
  var WEEKDAYS = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п\u02BCятниця", "субота"];
  var WEEKDAYS_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
  var WEEKDAYS_ACC = ["неділю", "понеділок", "вівторок", "середу", "четвер", "п\u02BCятницю", "суботу"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toMin(hhmm) { var p = String(hhmm).split(":"); return Number(p[0]) * 60 + Number(p[1]); }
  function fmtMin(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
  function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  function parseISO(iso) { var p = String(iso).split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function weekdayOf(iso) { var o = parseISO(iso); return new Date(Date.UTC(o.y, o.m - 1, o.d)).getUTCDay(); }
  function addDays(iso, n) {
    var o = parseISO(iso);
    var t = new Date(Date.UTC(o.y, o.m - 1, o.d + n));
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  // ── Часовий пояс студії (без бібліотек) ───────────────────
  var dtfCache = {};
  function dtf(tz) {
    if (!dtfCache[tz]) {
      dtfCache[tz] = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    }
    return dtfCache[tz];
  }

  // Розкладає момент часу на дату/годину в поясі студії.
  function zonedParts(epoch, tz) {
    var o = {};
    dtf(tz).formatToParts(new Date(epoch)).forEach(function (p) { o[p.type] = p.value; });
    var h = +o.hour; if (h === 24) h = 0;
    var y = +o.year, m = +o.month, d = +o.day;
    var iso = isoOf(y, m, d);
    return {
      y: y, m: m, d: d, hour: h, minute: +o.minute, second: +o.second,
      iso: iso, minutes: h * 60 + (+o.minute), weekday: weekdayOf(iso)
    };
  }

  function offsetMs(epoch, tz) {
    var e = Math.floor(epoch / 1000) * 1000;
    var p = zonedParts(e, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second) - e;
  }

  // «Настінний» час студії (дата + хвилини від півночі) → момент часу (мс, UTC).
  function zonedToEpoch(iso, minutes, tz) {
    var o = parseISO(iso);
    var guess = Date.UTC(o.y, o.m - 1, o.d, 0, 0, 0) + minutes * 60000;
    var t = guess - offsetMs(guess, tz);
    return guess - offsetMs(t, tz);
  }

  // ── Графік ────────────────────────────────────────────────
  function daySchedule(cfg, iso) {
    var sch = cfg.schedule || {};
    if ((sch.closedDates || []).indexOf(iso) !== -1) return null;
    var d = (sch.days || {})[weekdayOf(iso)];
    return d || null;
  }

  function dayRangeEpoch(cfg, iso) {
    return { from: zonedToEpoch(iso, 0, cfg.timezone), to: zonedToEpoch(addDays(iso, 1), 0, cfg.timezone) };
  }

  function bookableDates(cfg, nowEpoch) {
    var sch = cfg.schedule || {};
    var horizon = sch.bookingHorizonDays || 30;
    var today = zonedParts(nowEpoch, cfg.timezone).iso;
    var out = [];
    for (var i = 0; i <= horizon; i++) {
      var iso = addDays(today, i), o = parseISO(iso);
      out.push({ iso: iso, y: o.y, month: o.m, day: o.d, weekday: weekdayOf(iso), open: !!daySchedule(cfg, iso) });
    }
    return out;
  }

  /*
   * Вільні слоти на день.
   * Запис займає бокс на [початок; початок + тривалість + запас).
   * Два записи в одному боксі не перетинаються, тож між клієнтами завжди є запас.
   * Останній клієнт має закінчити роботу до закриття (запас після нього не потрібен).
   * busy — зайняті інтервали [{box, start, end}] у мс; end вже містить запас.
   */
  function computeSlots(o) {
    var cfg = o.cfg, sch = cfg.schedule || {}, tz = cfg.timezone;
    var day = daySchedule(cfg, o.iso);
    if (!day) return [];
    var dur = o.durationMin;
    var buf = sch.bufferMinutes == null ? 15 : sch.bufferMinutes;
    var step = sch.slotStepMinutes || 30;
    var boxes = sch.boxes || 1;
    var open = toMin(day.open), close = toMin(day.close);
    var minStart = o.nowEpoch + (sch.minLeadMinutes || 0) * 60000;
    var busy = o.busy || [];
    var res = [];

    for (var m = open; m + dur <= close; m += step) {
      var start = zonedToEpoch(o.iso, m, tz);
      if (start < minStart) continue;
      var end = start + (dur + buf) * 60000;
      for (var b = 1; b <= boxes; b++) {
        var free = true;
        for (var i = 0; i < busy.length; i++) {
          var x = busy[i];
          if (x.box === b && x.start < end && start < x.end) { free = false; break; }
        }
        if (free) { res.push({ time: fmtMin(m), epoch: start, box: b }); break; }
      }
    }
    return res;
  }

  // ── Форматування ──────────────────────────────────────────
  function fmtDateLong(iso) {
    var o = parseISO(iso);
    return WEEKDAYS[weekdayOf(iso)] + ", " + o.d + " " + MONTHS_GEN[o.m - 1];
  }
  function fmtTime(epoch, tz) { var p = zonedParts(epoch, tz); return pad(p.hour) + ":" + pad(p.minute); }
  function fmtDateTime(epoch, tz) {
    var p = zonedParts(epoch, tz);
    return WEEKDAYS_SHORT[p.weekday] + ", " + p.d + " " + MONTHS_GEN[p.m - 1] + ", " + pad(p.hour) + ":" + pad(p.minute);
  }

  // ── Телефони (Україна) ────────────────────────────────────
  function normalizePhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.indexOf("380") === 0) return "+" + digits;
    if (digits.length === 11 && digits.indexOf("80") === 0) return "+3" + digits;
    if (digits.length === 10 && digits.charAt(0) === "0") return "+38" + digits;
    return null;
  }
  function formatPhone(p) {
    var m = /^\+38(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p || "");
    return m ? "+38 (" + m[1] + ") " + m[2] + "-" + m[3] + "-" + m[4] : (p || "");
  }

  // ── Конфігурація + правки власника ────────────────────────
  function mergeConfig(base, ov) {
    var cfg = JSON.parse(JSON.stringify(base));
    ov = ov || {};
    if (Array.isArray(ov.services)) cfg.services = ov.services;
    if (ov.contacts && typeof ov.contacts === "object") cfg.contacts = Object.assign({}, cfg.contacts, ov.contacts);
    if (Array.isArray(ov.closedDates)) { cfg.schedule = cfg.schedule || {}; cfg.schedule.closedDates = ov.closedDates; }
    if (ov.hero && typeof ov.hero === "object") cfg.hero = Object.assign({}, cfg.hero, ov.hero);
    if (Array.isArray(ov.gallery)) cfg.gallery = ov.gallery;
    return cfg;
  }

  function visibleServices(cfg) {
    return (cfg.services || []).filter(function (s) { return s.hidden !== true; });
  }

  // ── Календар (.ics) ───────────────────────────────────────
  function icsDate(epoch) {
    var d = new Date(epoch);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  function icsEscape(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  function buildIcs(o) {
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Detailing//UK", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + o.uid,
      "DTSTAMP:" + icsDate(Date.now()),
      "DTSTART:" + icsDate(o.startEpoch),
      "DTEND:" + icsDate(o.startEpoch + o.durationMin * 60000),
      "SUMMARY:" + icsEscape(o.title),
      "LOCATION:" + icsEscape(o.location),
      "DESCRIPTION:" + icsEscape(o.description),
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
  }

  var Core = {
    MONTHS_GEN: MONTHS_GEN, MONTHS_SHORT: MONTHS_SHORT,
    WEEKDAYS: WEEKDAYS, WEEKDAYS_SHORT: WEEKDAYS_SHORT, WEEKDAYS_ACC: WEEKDAYS_ACC,
    pad: pad, toMin: toMin, fmtMin: fmtMin, parseISO: parseISO, weekdayOf: weekdayOf, addDays: addDays,
    zonedParts: zonedParts, zonedToEpoch: zonedToEpoch,
    daySchedule: daySchedule, dayRangeEpoch: dayRangeEpoch, bookableDates: bookableDates, computeSlots: computeSlots,
    fmtDateLong: fmtDateLong, fmtTime: fmtTime, fmtDateTime: fmtDateTime,
    normalizePhone: normalizePhone, formatPhone: formatPhone,
    mergeConfig: mergeConfig, visibleServices: visibleServices,
    buildIcs: buildIcs
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  root.Core = Core;
})(typeof window !== "undefined" ? window : globalThis);

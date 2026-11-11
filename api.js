/*
 * api.js — шар даних. Два режими з однаковим інтерфейсом:
 *   • "supabase" — реальна база (REST API Supabase через fetch, без бібліотек);
 *   • "demo"     — localStorage браузера (коли supabase.url у конфігурації порожній).
 * Інтерфейс: getBusy, createBooking, getOverrides, login, logout, isLoggedIn,
 *            listBookings, setBookingStatus, saveOverride, uploadPhoto, prepareImage.
 */
(function (root) {
  "use strict";

  var BASE = root.STUDIO_CONFIG || {};
  var sb = BASE.supabase || {};
  var ownerCfg = BASE.owner || {};
  var configured = !!(sb.url && sb.anonKey);
  var mode = configured ? "supabase" : "demo";
  var ORIGIN = configured ? String(sb.url).replace(/\/+$/, "") : "";
  var isJwtKey = /^eyJ/.test(sb.anonKey || "");

  var MESSAGES = {
    slot_taken: "Цей час уже зайнято. Оберіть інший.",
    invalid_name: "Вкажіть ім’я (від 2 символів).",
    invalid_phone: "Вкажіть номер телефону у форматі +380 XX XXX XX XX.",
    in_past: "Цей час уже минув. Оберіть інший.",
    invalid: "Некоректні дані запису.",
    network: "Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.",
    auth: "Потрібен вхід.",
    bad_password: "Невірний пароль.",
    not_owner: "Цей обліковий запис не має доступу до кабінету."
  };

  function fail(code, message) {
    var e = new Error(message || MESSAGES[code] || "Помилка");
    e.code = code;
    return e;
  }

  var store = {
    get: function (k, def) {
      try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    },
    set: function (k, v) {
      try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { root.localStorage.removeItem(k); } catch (e) { /* ігноруємо */ } }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ═══ SUPABASE ══════════════════════════════════════════════
  var SESSION_KEY = "studio.owner.session";
  var session = configured ? store.get(SESSION_KEY, null) : null;
  var refreshing = null;

  function setSession(d) {
    session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000
    };
    store.set(SESSION_KEY, session);
  }
  function clearSession() { session = null; store.del(SESSION_KEY); }

  async function http(method, path, o) {
    o = o || {};
    var headers = { apikey: sb.anonKey };
    if (o.auth) {
      await ensureSession();
      if (!session) throw fail("auth");
      headers.Authorization = "Bearer " + session.access_token;
    } else if (isJwtKey) {
      headers.Authorization = "Bearer " + sb.anonKey;
    }
    var body;
    if (o.raw) {
      body = o.body;
    } else if (o.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(o.body);
    }
    if (o.headers) for (var k in o.headers) headers[k] = o.headers[k];

    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 15000) : null;
    var res;
    try {
      res = await fetch(ORIGIN + path, { method: method, headers: headers, body: body, signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw fail("network");
    } finally {
      if (timer) clearTimeout(timer);
    }
    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    if (!res.ok) {
      var msg = data && typeof data === "object" ? (data.message || data.error_description || data.msg || data.error) : null;
      var err = fail(res.status === 401 || res.status === 403 ? "auth" : "http", msg || ("Помилка сервера (" + res.status + ")"));
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  async function ensureSession() {
    if (!session) return;
    if (session.expires_at - 30000 > Date.now()) return;
    if (!session.refresh_token) { clearSession(); return; }
    if (!refreshing) {
      refreshing = (async function () {
        try {
          var d = await http("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } });
          setSession(d);
        } catch (e) {
          clearSession();
        } finally {
          refreshing = null;
        }
      })();
    }
    await refreshing;
  }

  function mapBooking(r) {
    return {
      id: r.id, serviceId: r.service_id, serviceName: r.service_name,
      start: Date.parse(r.starts_at), end: Date.parse(r.ends_at), durationMin: r.duration_min,
      box: r.box, name: r.customer_name, phone: r.phone, status: r.status, createdAt: Date.parse(r.created_at)
    };
  }

  var remote = {
    getBusy: async function (from, to) {
      var rows = await http("POST", "/rest/v1/rpc/get_busy", {
        body: { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() }
      });
      return (rows || []).map(function (r) { return { box: r.box, start: Date.parse(r.starts_at), end: Date.parse(r.ends_at) }; });
    },

    createBooking: async function (b) {
      var r = await http("POST", "/rest/v1/rpc/create_booking", {
        body: {
          p_service_id: b.service.id,
          p_service_name: b.service.name,
          p_starts_at: new Date(b.startEpoch).toISOString(),
          p_duration_min: b.service.duration,
          p_buffer_min: b.buffer,
          p_boxes: b.boxes,
          p_name: b.name,
          p_phone: b.phone
        }
      });
      if (!r || !r.ok) throw fail((r && r.error) || "invalid");
      return { id: r.id, box: r.box };
    },

    getOverrides: async function () {
      var rows = await http("GET", "/rest/v1/studio_settings?select=key,value", { timeout: 6000 });
      var out = {};
      (rows || []).forEach(function (r) { out[r.key] = r.value; });
      return out;
    },

    login: async function (password) {
      var d;
      try {
        d = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: ownerCfg.email, password: password } });
      } catch (e) {
        if (e.code === "network") throw e;
        throw fail("bad_password");
      }
      setSession(d);
      var ok = false;
      try { ok = (await http("POST", "/rest/v1/rpc/is_owner", { auth: true, body: {} })) === true; } catch (e) { ok = false; }
      if (!ok) { clearSession(); throw fail("not_owner"); }
    },
    logout: function () { clearSession(); },
    isLoggedIn: function () { return !!session; },

    listBookings: async function (sinceEpoch) {
      var rows = await http("GET",
        "/rest/v1/bookings?select=*&starts_at=gte." + encodeURIComponent(new Date(sinceEpoch).toISOString()) +
        "&order=starts_at.asc&limit=500", { auth: true });
      return (rows || []).map(mapBooking);
    },

    setBookingStatus: async function (id, status) {
      try {
        await http("PATCH", "/rest/v1/bookings?id=eq." + encodeURIComponent(id), {
          auth: true, body: { status: status }, headers: { Prefer: "return=minimal" }
        });
      } catch (e) {
        if (e.status === 409) throw fail("slot_taken", "Цей час уже зайнято іншим записом.");
        throw e;
      }
    },

    saveOverride: async function (key, value) {
      if (value === null) {
        await http("DELETE", "/rest/v1/studio_settings?key=eq." + encodeURIComponent(key), { auth: true, headers: { Prefer: "return=minimal" } });
        return;
      }
      await http("POST", "/rest/v1/studio_settings?on_conflict=key", {
        auth: true,
        body: { key: key, value: value, updated_at: new Date().toISOString() },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
      });
    },

    uploadPhoto: async function (blob) {
      var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      var path = uid() + "." + ext;
      await http("POST", "/storage/v1/object/photos/" + path, {
        auth: true, raw: true, body: blob,
        headers: { "Content-Type": blob.type || "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" },
        timeout: 60000
      });
      return ORIGIN + "/storage/v1/object/public/photos/" + path;
    }
  };

  // ═══ ДЕМО (localStorage) ═══════════════════════════════════
  var DEMO_BOOKINGS = "demo.bookings";
  var DEMO_SETTINGS = "demo.settings";
  var DEMO_SESSION = "demo.owner";

  function demoBookings() { return store.get(DEMO_BOOKINGS, []); }
  function demoSave(list) {
    if (!store.set(DEMO_BOOKINGS, list)) throw fail("storage", "Не вдалося зберегти дані в браузері (немає місця).");
  }
  function active(list) { return list.filter(function (b) { return b.status !== "cancelled"; }); }

  var demo = {
    getBusy: async function (from, to) {
      return active(demoBookings())
        .filter(function (b) { return b.start < to && b.end > from; })
        .map(function (b) { return { box: b.box, start: b.start, end: b.end }; });
    },

    createBooking: async function (b) {
      var list = demoBookings();
      var start = b.startEpoch, end = start + (b.service.duration + b.buffer) * 60000;
      if (start < Date.now()) throw fail("in_past");
      for (var box = 1; box <= b.boxes; box++) {
        var clash = active(list).some(function (x) { return x.box === box && x.start < end && start < x.end; });
        if (!clash) {
          var rec = {
            id: uid(), serviceId: b.service.id, serviceName: b.service.name,
            start: start, end: end, durationMin: b.service.duration,
            box: box, name: b.name, phone: b.phone, status: "new", createdAt: Date.now()
          };
          list.push(rec);
          demoSave(list);
          return { id: rec.id, box: box };
        }
      }
      throw fail("slot_taken");
    },

    getOverrides: async function () { return store.get(DEMO_SETTINGS, {}); },

    login: async function (password) {
      if (password !== (ownerCfg.demoPassword || "demo1234")) throw fail("bad_password");
      try { root.sessionStorage.setItem(DEMO_SESSION, "1"); } catch (e) { /* ігноруємо */ }
    },
    logout: function () { try { root.sessionStorage.removeItem(DEMO_SESSION); } catch (e) { /* ігноруємо */ } },
    isLoggedIn: function () { try { return root.sessionStorage.getItem(DEMO_SESSION) === "1"; } catch (e) { return false; } },

    listBookings: async function (sinceEpoch) {
      return demoBookings().filter(function (b) { return b.start >= sinceEpoch; })
        .sort(function (a, b) { return a.start - b.start; });
    },

    setBookingStatus: async function (id, status) {
      var list = demoBookings();
      var rec = list.filter(function (b) { return b.id === id; })[0];
      if (!rec) return;
      if (status !== "cancelled") {
        var clash = active(list).some(function (x) { return x.id !== id && x.box === rec.box && x.start < rec.end && rec.start < x.end; });
        if (clash) throw fail("slot_taken", "Цей час уже зайнято іншим записом.");
      }
      rec.status = status;
      demoSave(list);
    },

    saveOverride: async function (key, value) {
      var s = store.get(DEMO_SETTINGS, {});
      if (value === null) delete s[key]; else s[key] = value;
      if (!store.set(DEMO_SETTINGS, s)) throw fail("storage", "Не вдалося зберегти дані в браузері (немає місця).");
    },

    uploadPhoto: function (blob) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { reject(fail("image", "Не вдалося прочитати фото")); };
        fr.readAsDataURL(blob);
      });
    }
  };

  // ═══ Спільне ═══════════════════════════════════════════════
  var impl = configured ? remote : demo;
  var OV_CACHE = "studio.overrides.cache";

  function cachedOverrides() { return store.get(OV_CACHE, {}) || {}; }

  // Правки власника для всіх відвідувачів; без мережі — остання відома копія.
  async function getOverrides() {
    try {
      var ov = await impl.getOverrides();
      store.set(OV_CACHE, ov);
      return ov;
    } catch (e) {
      return cachedOverrides();
    }
  }

  // Стискає фото перед завантаженням (мобільні фото бувають по 5–10 МБ).
  function prepareImage(file) {
    var maxSide = configured ? 1600 : 900;
    var quality = configured ? 0.85 : 0.7;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(fail("image", "Не вдалося обробити фото")); }, "image/jpeg", quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(fail("image", "Це не схоже на зображення")); };
      img.src = url;
    });
  }

  var Api = {
    mode: mode,
    getBusy: impl.getBusy,
    createBooking: impl.createBooking,
    getOverrides: getOverrides,
    cachedOverrides: cachedOverrides,
    login: impl.login,
    logout: impl.logout,
    isLoggedIn: impl.isLoggedIn,
    listBookings: impl.listBookings,
    setBookingStatus: impl.setBookingStatus,
    saveOverride: impl.saveOverride,
    uploadPhoto: impl.uploadPhoto,
    prepareImage: prepareImage
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Api;
  root.Api = Api;
})(typeof window !== "undefined" ? window : globalThis);

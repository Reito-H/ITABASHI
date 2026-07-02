var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// .wrangler/tmp/bundle-RzJpx9/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
var init_strip_cf_connecting_ip_header = __esm({
  ".wrangler/tmp/bundle-RzJpx9/strip-cf-connecting-ip-header.js"() {
    "use strict";
    __name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
    globalThis.fetch = new Proxy(globalThis.fetch, {
      apply(target, thisArg, argArray) {
        return Reflect.apply(target, thisArg, [
          stripCfConnectingIPHeader.apply(null, argArray)
        ]);
      }
    });
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
  }
});

// node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// src/auth.ts
var auth_exports = {};
__export(auth_exports, {
  cleanExpiredSessions: () => cleanExpiredSessions,
  createSession: () => createSession,
  deleteSession: () => deleteSession,
  generateInviteCode: () => generateInviteCode,
  generateSessionId: () => generateSessionId,
  getPeriod: () => getPeriod,
  getPeriodRange: () => getPeriodRange,
  getPeriodSettings: () => getPeriodSettings,
  getSessionFromCookie: () => getSessionFromCookie,
  getShiftDisplayRange: () => getShiftDisplayRange,
  hashPassword: () => hashPassword,
  invalidatePeriodSettingsCache: () => invalidatePeriodSettingsCache,
  isLockedOut: () => isLockedOut,
  recordFailedLogin: () => recordFailedLogin,
  remainingAttempts: () => remainingAttempts,
  validateSession: () => validateSession,
  verifyPassword: () => verifyPassword
});
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hash = new Uint8Array(bits);
  const toHex = /* @__PURE__ */ __name((arr) => Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(""), "toHex");
  return `v2:${toHex(salt)}:${toHex(hash)}`;
}
async function verifyPassword(password, stored) {
  let iterations = 1e5;
  let saltHex, hashHex;
  if (stored.startsWith("v2:")) {
    iterations = PBKDF2_ITERATIONS;
    const parts = stored.slice(3).split(":");
    [saltHex, hashHex] = parts;
  } else {
    const parts = stored.split(":");
    [saltHex, hashHex] = parts;
  }
  if (!saltHex || !hashHex)
    return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const computed = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}
function generateSessionId() {
  return crypto.randomUUID();
}
async function createSession(db, adminId) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, admin_id, expires_at) VALUES (?, ?, ?)"
  ).bind(sessionId, adminId, expiresAt).run();
  return sessionId;
}
async function validateSession(db, sessionId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const row = await db.prepare(
    "SELECT admin_id FROM sessions WHERE id = ? AND expires_at > ?"
  ).bind(sessionId, now).first();
  return row?.admin_id ?? null;
}
async function deleteSession(db, sessionId) {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}
async function cleanExpiredSessions(db) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
}
async function isLockedOut(db, ip) {
  const since = new Date(Date.now() - 15 * 60 * 1e3).toISOString();
  const result = await db.prepare(
    "SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND failed_at > ?"
  ).bind(ip, since).first();
  return (result?.cnt ?? 0) >= 5;
}
async function remainingAttempts(db, ip) {
  const since = new Date(Date.now() - 15 * 60 * 1e3).toISOString();
  const result = await db.prepare(
    "SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND failed_at > ?"
  ).bind(ip, since).first();
  return Math.max(0, 5 - (result?.cnt ?? 0));
}
async function recordFailedLogin(db, ip) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
  await db.batch([
    db.prepare("DELETE FROM login_attempts WHERE failed_at < ?").bind(cutoff),
    db.prepare("INSERT INTO login_attempts (ip) VALUES (?)").bind(ip)
  ]);
}
function getSessionFromCookie(cookieHeader) {
  if (!cookieHeader)
    return null;
  const match2 = cookieHeader.match(/session=([^;]+)/);
  return match2?.[1] ?? null;
}
function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code;
}
async function getPeriodSettings(db) {
  if (_periodSettingsCache && Date.now() - _periodSettingsCachedAt < PERIOD_SETTINGS_TTL_MS) {
    return _periodSettingsCache;
  }
  const settings = {};
  for (let m = 1; m <= 12; m++)
    settings[m] = { close_day: 17, start_day: 18 };
  try {
    const rows = await db.prepare("SELECT month, close_day, start_day FROM period_settings").all();
    for (const r of rows.results ?? [])
      settings[r.month] = { close_day: r.close_day, start_day: r.start_day };
  } catch {
  }
  _periodSettingsCache = settings;
  _periodSettingsCachedAt = Date.now();
  return settings;
}
function invalidatePeriodSettingsCache() {
  _periodSettingsCache = null;
  _periodSettingsCachedAt = 0;
}
function getPeriod(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day >= 18) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month };
}
function getPeriodRange(year, month, settings) {
  const s = settings?.[month] ?? { close_day: 17, start_day: 18 };
  let startYear = year, startMonth = month - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  const start = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(s.start_day).padStart(2, "0")}`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(s.close_day).padStart(2, "0")}`;
  return { start, end };
}
function getShiftDisplayRange(year, month, settings) {
  const { start, end } = getPeriodRange(year, month, settings);
  const startDate = new Date(start);
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date(end);
  endDate.setDate(endDate.getDate() + 3);
  const dates = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return {
    start: startDate.toISOString().split("T")[0],
    end: endDate.toISOString().split("T")[0],
    dates
  };
}
var PBKDF2_ITERATIONS, _periodSettingsCache, _periodSettingsCachedAt, PERIOD_SETTINGS_TTL_MS;
var init_auth = __esm({
  "src/auth.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    PBKDF2_ITERATIONS = 6e5;
    __name(hashPassword, "hashPassword");
    __name(verifyPassword, "verifyPassword");
    __name(generateSessionId, "generateSessionId");
    __name(createSession, "createSession");
    __name(validateSession, "validateSession");
    __name(deleteSession, "deleteSession");
    __name(cleanExpiredSessions, "cleanExpiredSessions");
    __name(isLockedOut, "isLockedOut");
    __name(remainingAttempts, "remainingAttempts");
    __name(recordFailedLogin, "recordFailedLogin");
    __name(getSessionFromCookie, "getSessionFromCookie");
    __name(generateInviteCode, "generateInviteCode");
    _periodSettingsCache = null;
    _periodSettingsCachedAt = 0;
    PERIOD_SETTINGS_TTL_MS = 60 * 60 * 1e3;
    __name(getPeriodSettings, "getPeriodSettings");
    __name(invalidatePeriodSettingsCache, "invalidatePeriodSettingsCache");
    __name(getPeriod, "getPeriod");
    __name(getPeriodRange, "getPeriodRange");
    __name(getShiftDisplayRange, "getShiftDisplayRange");
  }
});

// src/cron.ts
var cron_exports = {};
__export(cron_exports, {
  handleCron: () => handleCron,
  runNotification: () => runNotification
});
async function pushToInstructors(env, messages) {
  const at = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!at)
    return;
  const rows = await env.DB.prepare(
    "SELECT line_uid FROM instructors WHERE line_uid IS NOT NULL AND is_active = 1"
  ).all();
  for (const row of rows.results ?? []) {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
      body: JSON.stringify({ to: row.line_uid, messages })
    });
  }
}
async function sendMorningReport(env, todayStr) {
  const schedules = await env.DB.prepare(`
    SELECT i.name, s.entry
    FROM instructor_schedules s
    JOIN instructors i ON s.instructor_id = i.id
    WHERE s.date = ? AND s.entry IN ('\u5F53\u76F4', '\u51FA\u52E4')
    ORDER BY i.sort_order, i.id
  `).bind(todayStr).all();
  const { year, month } = getPeriod(todayStr);
  const periodCfg = await getPeriodSettings(env.DB);
  const { start } = getPeriodRange(year, month, periodCfg);
  const salesAvg = await env.DB.prepare(`
    SELECT AVG(sr.amount) as avg_amount, COUNT(DISTINCT sr.emp_id) as emp_count
    FROM sales_records sr
    JOIN employees e ON sr.emp_id = e.id
    WHERE sr.date >= ? AND sr.date <= ? AND e.is_active = 1
  `).bind(start, todayStr).first();
  const badCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bad_events WHERE (admin_memo IS NULL OR admin_memo = '') AND DATE(created_at) = ?"
  ).bind(todayStr).first();
  const attendees = schedules.results ?? [];
  let msg = `\u3010\u672C\u65E5\u306E\u51FA\u52E4\u72B6\u6CC1 ${todayStr}\u3011

`;
  if (attendees.length > 0) {
    msg += "\u25A0 \u672C\u65E5\u306E\u62C5\u5F53\u8005\n";
    for (const a of attendees) {
      msg += `\u30FB${a.name}\uFF08${a.entry}\uFF09
`;
    }
  } else {
    msg += "\u25A0 \u672C\u65E5\u306E\u62C5\u5F53\u8005\n\u5F53\u76F4\u30FB\u51FA\u52E4\u306A\u3057\n";
  }
  msg += "\n";
  if (salesAvg?.avg_amount != null) {
    const avg = Math.round(salesAvg.avg_amount);
    msg += `\u25A0 \u4ECA\u6708\u5EA6\u306E\u5E73\u5747\u58F2\u4E0A
${avg.toLocaleString("ja-JP")}\u5186 / ${salesAvg.emp_count}\u540D

`;
  }
  if ((badCount?.cnt ?? 0) > 0) {
    msg += `\u25A0 \u5ACC\u306A\u3053\u3068\u5831\u544A\uFF08\u672A\u5BFE\u5FDC\uFF09
${badCount.cnt}\u4EF6 \u2192 \u7BA1\u7406\u753B\u9762\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044`;
  } else {
    msg += "\u25A0 \u5ACC\u306A\u3053\u3068\u5831\u544A\n\u672A\u5BFE\u5FDC\u306A\u3057";
  }
  await pushToInstructors(env, [{ type: "text", text: msg.trim() }]);
}
async function sendBadEventAlert(env, todayStr) {
  const badCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bad_events WHERE admin_memo IS NULL OR admin_memo = ''"
  ).first();
  if ((badCount?.cnt ?? 0) === 0)
    return;
  const msg = `\u3010\u5ACC\u306A\u3053\u3068\u5831\u544A \u30A2\u30E9\u30FC\u30C8\u3011

\u672A\u5BFE\u5FDC\u306E\u5831\u544A\u304C ${badCount.cnt}\u4EF6\u3042\u308A\u307E\u3059\u3002
\u7BA1\u7406\u753B\u9762\u3067\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002`;
  await pushToInstructors(env, [{ type: "text", text: msg }]);
}
async function runNotification(env, type) {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1e3);
  const todayStr = nowJST.toISOString().split("T")[0];
  if (type === "morning_report") {
    await sendMorningReport(env, todayStr);
  } else if (type === "bad_event_alert") {
    await sendBadEventAlert(env, todayStr);
  }
}
async function checkRetirements(env, todayStr) {
  await env.DB.prepare(`
    UPDATE employees
    SET is_active = 0, updated_at = datetime('now', 'localtime')
    WHERE is_active = 1
      AND retirement_date IS NOT NULL
      AND retirement_date != ''
      AND retirement_date <= ?
  `).bind(todayStr).run();
}
async function handleCron(env) {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1e3);
  const currentHour = nowJST.getUTCHours();
  const currentMinute = nowJST.getUTCMinutes();
  const todayStr = nowJST.toISOString().split("T")[0];
  await checkRetirements(env, todayStr);
  const settings = await env.DB.prepare(
    "SELECT type, send_hour, send_minute, last_sent_date FROM notification_settings WHERE is_enabled = 1"
  ).all();
  for (const s of settings.results ?? []) {
    if (s.send_hour !== currentHour || s.send_minute !== currentMinute)
      continue;
    if (s.last_sent_date === todayStr)
      continue;
    await runNotification(env, s.type);
    await env.DB.prepare(
      "UPDATE notification_settings SET last_sent_date = ?, updated_at = datetime('now','localtime') WHERE type = ?"
    ).bind(todayStr, s.type).run();
  }
}
var init_cron = __esm({
  "src/cron.ts"() {
    "use strict";
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    init_auth();
    __name(pushToInstructors, "pushToInstructors");
    __name(sendMorningReport, "sendMorningReport");
    __name(sendBadEventAlert, "sendBadEventAlert");
    __name(runNotification, "runNotification");
    __name(checkRetirements, "checkRetirements");
    __name(handleCron, "handleCron");
  }
});

// .wrangler/tmp/bundle-RzJpx9/middleware-loader.entry.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// .wrangler/tmp/bundle-RzJpx9/middleware-insertion-facade.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// src/index.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/index.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/hono.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/hono-base.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/compose.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/context.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/request.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/http-exception.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/request/constants.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = /* @__PURE__ */ __name(class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text2) => JSON.parse(text2));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
}, "HonoRequest");

// node_modules/hono/dist/utils/html.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = /* @__PURE__ */ __name(class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout2) => this.#layout = layout2;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text2, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text2) : this.#newResponse(
      text2,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
}, "Context");

// node_modules/hono/dist/router.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = /* @__PURE__ */ __name(class extends Error {
}, "UnsupportedPathError");

// node_modules/hono/dist/utils/constants.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = /* @__PURE__ */ __name(class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app19) {
    const subApp = this.basePath(path);
    app19.routes.map((r) => {
      let handler;
      if (app19.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app19.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
}, "_Hono");

// node_modules/hono/dist/router/reg-exp-router/index.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/reg-exp-router/router.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/reg-exp-router/matcher.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }, "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = /* @__PURE__ */ __name(class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
}, "_Node");

// node_modules/hono/dist/router/reg-exp-router/trie.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var Trie = /* @__PURE__ */ __name(class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
}, "Trie");

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = /* @__PURE__ */ __name(class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
}, "RegExpRouter");

// node_modules/hono/dist/router/reg-exp-router/prepared-router.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/smart-router/index.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/smart-router/router.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var SmartRouter = /* @__PURE__ */ __name(class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
}, "SmartRouter");

// node_modules/hono/dist/router/trie-router/index.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/trie-router/router.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// node_modules/hono/dist/router/trie-router/node.js
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = /* @__PURE__ */ __name(class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
}, "_Node");

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = /* @__PURE__ */ __name(class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
}, "TrieRouter");

// node_modules/hono/dist/hono.js
var Hono2 = /* @__PURE__ */ __name(class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
}, "Hono");

// src/middleware/auth.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();

// src/config.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var SECRET = "s7db8q6wys";
var ADMIN_PATH = `/${SECRET}/admin`;

// src/middleware/auth.ts
async function requireAuth(c, next) {
  const cookie = c.req.header("Cookie") ?? null;
  const sessionId = getSessionFromCookie(cookie);
  if (!sessionId) {
    return c.redirect(`${ADMIN_PATH}/login`);
  }
  const adminId = await validateSession(c.env.DB, sessionId);
  if (!adminId) {
    const res = c.redirect(`${ADMIN_PATH}/login`);
    res.headers.set("Set-Cookie", "session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
    return res;
  }
  c.set("adminId", adminId);
  return next();
}
__name(requireAuth, "requireAuth");
function requireJapan(c, next) {
  const country = c.req.header("CF-IPCountry");
  if (!country || country !== "JP") {
    return c.text("Access denied", 403);
  }
  return next();
}
__name(requireJapan, "requireJapan");

// src/routes/admin.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();

// src/html/layout.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/\//g, "\\u002F");
}
__name(safeJson, "safeJson");
function layout(title, content, activePage = "") {
  const navItems = [
    { href: `${ADMIN_PATH}`, label: "\u30DB\u30FC\u30E0", id: "home" },
    { href: `${ADMIN_PATH}/shift`, label: "\u65B0\u4EBA\u30B7\u30D5\u30C8\u7BA1\u7406", id: "shift" },
    { href: `${ADMIN_PATH}/newcomers`, label: "\u7DCF\u5408\u65B0\u4EBA\u7BA1\u7406", id: "newcomers" },
    { href: `${ADMIN_PATH}/staff`, label: "\u793E\u54E1\u7BA1\u7406", id: "staff" },
    { href: `${ADMIN_PATH}/events`, label: "\u5831\u544A\u4E00\u89A7", id: "events" },
    { href: `${ADMIN_PATH}/vehicles`, label: "\u8ECA\u4E21\u691C\u7D22", id: "vehicles" },
    { href: `${ADMIN_PATH}/settings`, label: "\u8A2D\u5B9A", id: "settings" }
  ];
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escHtml(title)} | Benten\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: #f5f5f5; margin: 0; }
    .sidebar {
      width: 200px; min-height: 100vh; background: #1a3a5c;
      position: fixed; top: 0; left: 0; z-index: 40;
      display: flex; flex-direction: column;
      transition: transform 0.25s ease;
    }
    .main-content { margin-left: 200px; min-height: 100vh; }
    .nav-item {
      display: flex; align-items: center;
      padding: 11px 18px; color: #cbd5e1;
      text-decoration: none; font-size: 13px; transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: rgba(255,255,255,0.08); color: white; }
    .nav-item.active { background: rgba(255,255,255,0.12); color: white; border-left-color: #60a5fa; }
    .mobile-header {
      display: none; background: #1a3a5c; color: white;
      padding: 12px 16px; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
    }
    .hamburger {
      background: none; border: none; cursor: pointer; padding: 4px;
      display: flex; flex-direction: column; gap: 5px; touch-action: manipulation;
    }
    .hamburger span { display: block; width: 22px; height: 2px; background: white; border-radius: 2px; }
    .sidebar-overlay {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 39;
    }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .sidebar-overlay.open { display: block; }
      .main-content { margin-left: 0; }
      .mobile-header { display: flex; }
      .desktop-header { display: none; }
    }
    @media (min-width: 769px) and (max-width: 1024px) {
      .sidebar { width: 180px; }
      .main-content { margin-left: 180px; }
    }
  </style>
</head>
<body>
  <!-- \u30E2\u30D0\u30A4\u30EB\u30D8\u30C3\u30C0\u30FC -->
  <div class="mobile-header">
    <button class="hamburger" onclick="toggleSidebar()" aria-label="\u30E1\u30CB\u30E5\u30FC">
      <span></span><span></span><span></span>
    </button>
    <span style="font-size:13px;font-weight:600;">${escHtml(title)}</span>
    <span style="font-size:12px;color:#93c5fd;" id="current-time-m"></span>
  </div>

  <!-- \u30B5\u30A4\u30C9\u30D0\u30FC\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4\uFF08\u30E2\u30D0\u30A4\u30EB\uFF09 -->
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>

  <!-- \u30B5\u30A4\u30C9\u30D0\u30FC -->
  <div class="sidebar" id="sidebar">
    <div style="padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,0.1);">
      <div style="color:white;font-weight:700;font-size:13px;letter-spacing:0.04em;">Benten\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0</div>
      <div style="color:#7cb3d8;font-size:10px;margin-top:3px;letter-spacing:0.06em;">CREW MANAGEMENT</div>
    </div>
    <nav style="flex:1;overflow-y:auto;padding:6px 0;">
      ${navItems.map((item) => `
        <a href="${item.href}" class="nav-item${activePage === item.id ? " active" : ""}" onclick="closeSidebar()">
          ${escHtml(item.label)}
        </a>
      `).join("")}
    </nav>
    <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.1);">
      <a href="${ADMIN_PATH}/logout" class="nav-item" style="color:#fca5a5;">\u30ED\u30B0\u30A2\u30A6\u30C8</a>
    </div>
  </div>

  <!-- \u30E1\u30A4\u30F3\u30B3\u30F3\u30C6\u30F3\u30C4 -->
  <div class="main-content">
    <div class="desktop-header bg-white shadow-sm px-5 py-3 flex items-center justify-between">
      <h1 style="font-size:16px;font-weight:600;color:#374151;">${escHtml(title)}</h1>
      <span style="font-size:12px;color:#9ca3af;" id="current-time"></span>
    </div>
    <div class="page-content" style="padding:16px;">
      ${content}
    </div>
  </div>

  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('open');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('open');
    }
    function updateTime() {
      const s = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const el  = document.getElementById('current-time');
      const elm = document.getElementById('current-time-m');
      if (el)  el.textContent  = s;
      if (elm) elm.textContent = s;
    }
    updateTime();
    setInterval(updateTime, 60000);
  <\/script>
</body>
</html>`;
}
__name(layout, "layout");
function loginPage(error = "", csrfToken = "") {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0 \u30ED\u30B0\u30A4\u30F3</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      background: #f0f2f5;
      min-height: 100vh;
      display: flex;
      align-items: stretch;
    }
    .left {
      width: 220px;
      flex-shrink: 0;
      background: #1a3a5c;
      display: flex;
      flex-direction: column;
      padding: 32px 0 24px;
    }
    .left-logo {
      padding: 0 20px 28px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .left-logo-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .left-logo-sub {
      font-size: 10px;
      color: #7cb3d8;
      margin-top: 3px;
      letter-spacing: 0.06em;
    }
    .left-nav {
      margin-top: 20px;
      flex: 1;
    }
    .left-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 20px;
      color: #7cb3d8;
      font-size: 13px;
      opacity: 0.5;
    }
    .left-nav-item.active {
      background: rgba(255,255,255,0.08);
      color: #ffffff;
      opacity: 1;
    }
    .left-footer {
      padding: 16px 20px 0;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .admin-badge {
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .admin-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 6px #4ade80;
      flex-shrink: 0;
    }
    .admin-texts { min-width: 0; }
    .admin-label {
      font-size: 9px;
      color: #7cb3d8;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .admin-name {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .right {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .card {
      width: 100%;
      max-width: 380px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(26,58,92,0.10), 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .card-header {
      background: #1a3a5c;
      padding: 22px 28px;
    }
    .card-header-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .card-header-sub {
      font-size: 11px;
      color: #7cb3d8;
      margin-top: 3px;
    }
    .card-body { padding: 28px 28px 24px; }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 14px;
      color: #1e293b;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
      background: #f8fafc;
    }
    .field input:focus {
      border-color: #2d6a9f;
      box-shadow: 0 0 0 3px rgba(45,106,159,0.12);
      background: #ffffff;
    }
    .btn {
      width: 100%;
      background: #1a3a5c;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.15s;
      font-family: inherit;
    }
    .btn:hover { background: #2d6a9f; }
    .btn:active { background: #153050; }
    .card-footer {
      border-top: 1px solid #f1f5f9;
      padding: 12px 28px;
      text-align: right;
      font-size: 11px;
      color: #94a3b8;
    }
    @media (max-width: 600px) {
      .left { display: none; }
    }
  </style>
</head>
<body>
  <div class="left">
    <div class="left-logo">
      <div class="left-logo-title">Benten\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0</div>
      <div class="left-logo-sub">CREW MANAGEMENT</div>
    </div>
    <nav class="left-nav">
      <div class="left-nav-item active">\u30ED\u30B0\u30A4\u30F3</div>
      <div class="left-nav-item">\u65B0\u4EBA\u30B7\u30D5\u30C8\u7BA1\u7406</div>
      <div class="left-nav-item">\u7DCF\u5408\u65B0\u4EBA\u7BA1\u7406</div>
      <div class="left-nav-item">\u793E\u54E1\u7BA1\u7406</div>
    </nav>
    <div class="left-footer">
      <div class="admin-badge">
        <div class="admin-dot"></div>
        <div class="admin-texts">
          <div class="admin-label">\u30B7\u30B9\u30C6\u30E0\u7BA1\u7406\u8005</div>
          <div class="admin-name">\u661F</div>
        </div>
      </div>
    </div>
  </div>
  <div class="right">
    <div class="card">
      <div class="card-header">
        <div class="card-header-title">\u7BA1\u7406\u8005\u30ED\u30B0\u30A4\u30F3</div>
        <div class="card-header-sub">\u8A8D\u8A3C\u60C5\u5831\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044</div>
      </div>
      <div class="card-body">
        ${error ? `<div class="error-box">${escHtml(error)}</div>` : ""}
        <form method="POST" action="${ADMIN_PATH}/login">
          ${csrfToken ? `<input type="hidden" name="csrf_token" value="${escHtml(csrfToken)}">` : ""}
          <div class="field">
            <label>\u30E6\u30FC\u30B6\u30FC\u540D</label>
            <input type="text" name="username" required autocomplete="username" placeholder="ID">
          </div>
          <div class="field">
            <label>\u30D1\u30B9\u30EF\u30FC\u30C9</label>
            <input type="password" name="password" required autocomplete="current-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
          </div>
          <button type="submit" class="btn">\u30ED\u30B0\u30A4\u30F3</button>
        </form>
      </div>
      <div class="card-footer">\u63D0\u4F9B\uFF1A\u30D9\u30F3\u30C6\u30F3\u30AF\u30E9\u30D6</div>
    </div>
  </div>
</body>
</html>`;
}
__name(loginPage, "loginPage");
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escHtml, "escHtml");

// src/html/shift.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var WEEKDAY_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
function shiftPage(employees, shiftMap, instructors, instructorScheduleMap, dates, year, month, periodStart, periodEnd, scheduleTypes = [], coaches = [], mode = "training") {
  const colorMap = {};
  for (const t of scheduleTypes)
    colorMap[t.code] = t.color;
  if (Object.keys(colorMap).length === 0) {
    Object.assign(colorMap, { "\u5B9F\u7814": "#dbeafe", "\u516C\u4F11": "#e5e7eb", "\u521D\u4E57\u52D9": "#fef08a", "\u6240\u9577": "#e9d5ff", "\u5EA7\u5B66": "#bbf7d0", "\u5B9F\u52D9": "#bfdbfe", "\u914D\u5C5E": "#fed7aa", "\u4F11": "#f3f4f6" });
  }
  const coachMap = {};
  for (const c of coaches)
    coachMap[c.id] = c.name;
  const periodLabel = `${year}\u5E74${month}\u6708\u5EA6\uFF08${periodStart}\u301C${periodEnd}\uFF09`;
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const newGrads = employees.filter((e) => e.entry_type === "\u65B0\u5352");
  const career = employees.filter((e) => e.entry_type !== "\u65B0\u5352");
  const STICKY = "position:sticky;z-index:2;";
  const HDR_BG = "background:#1e3a5f;color:white;";
  const FIX_BG = "background:#f8fafc;";
  function cell(am, row, empId, date, name, inPeriod) {
    const bg = row === "coach" ? "#fafafa" : colorMap[am] ?? (am ? "#fff7ed" : "#ffffff");
    const op = inPeriod ? "" : "opacity:0.45;";
    const fs = row === "coach" ? "font-size:8px;color:#6b7280;line-height:1;" : "font-size:11px;";
    const pd = row === "coach" ? "padding:2px 1px;" : "padding:5px 2px;";
    return `<td class="sc" data-emp="${empId}" data-date="${date}" data-row="${row}" data-name="${escHtml(name)}"
      style="background:${bg};min-width:44px;max-width:44px;width:44px;text-align:center;${fs}${pd}border:1px solid ${row === "coach" ? "#f0f0f0" : "#d1d5db"};cursor:pointer;overflow:hidden;white-space:nowrap;touch-action:manipulation;${op}"
      onclick="openEditor(this)">${escHtml(am)}</td>`;
  }
  __name(cell, "cell");
  function renderEmployeeRows(list) {
    return list.map((emp) => {
      const amCells = dates.map((d) => cell(shiftMap[`${emp.id}_${d}`]?.entry_am ?? "", "am", emp.id, d, emp.name, d >= periodStart && d <= periodEnd)).join("");
      const pmCells = dates.map((d) => cell(shiftMap[`${emp.id}_${d}`]?.entry_pm ?? "", "pm", emp.id, d, emp.name, d >= periodStart && d <= periodEnd)).join("");
      const coachCells = dates.map((d) => {
        const cid = shiftMap[`${emp.id}_${d}`]?.coach_id ?? null;
        return cell(cid ? coachMap[cid] ?? "" : "", "coach", emp.id, d, emp.name, d >= periodStart && d <= periodEnd);
      }).join("");
      const S0 = `min-width:32px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:0;${FIX_BG}`;
      const S1 = `min-width:28px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:32px;${FIX_BG}`;
      const S2 = `min-width:28px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:60px;${FIX_BG}`;
      const S3 = `min-width:80px;font-size:11px;border:1px solid #d1d5db;padding:2px 4px;${STICKY}left:88px;${FIX_BG}`;
      const S4 = `min-width:44px;font-size:10px;border:1px solid #d1d5db;padding:2px;${STICKY}left:168px;${FIX_BG}color:#6b7280;`;
      return `
        <tr data-emp="${emp.id}" style="border-top:2px solid #9ca3af;">
          <td rowspan="3" style="${S0}">${emp.seq_no ?? ""}</td>
          <td rowspan="3" style="${S1}">${emp.division ?? ""}</td>
          <td rowspan="3" style="${S2}">${emp.team ?? ""}</td>
          <td rowspan="3" style="${S3}">
            <a href="${ADMIN_PATH}/shift/print/${emp.id}?year=${year}&month=${month}" target="_blank"
               style="color:#2563eb;text-decoration:underline;">${escHtml(emp.name)}</a>
            ${emp.status === "unassigned" ? '<span style="font-size:9px;background:#f3f4f6;color:#6b7280;padding:1px 4px;border-radius:3px;margin-left:2px;">\u672A\u914D\u5C5E</span>' : ""}
            <button data-eid="${emp.id}" data-ename="${escHtml(emp.name)}" onclick="changeStatusBtn(this)"
              style="margin-top:2px;font-size:9px;padding:1px 5px;background:#bbf7d0;border:1px solid #86efac;border-radius:3px;cursor:pointer;color:#166534;touch-action:manipulation;">\u7814\u4FEE\u7D42\u4E86</button>
            <button data-eid="${emp.id}" data-ename="${escHtml(emp.name)}" onclick="openCountBtn(this)"
              style="margin-top:2px;font-size:9px;padding:1px 5px;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:3px;cursor:pointer;color:#0369a1;touch-action:manipulation;">\u96C6\u8A08</button>
          </td>
          <td rowspan="3" style="${S4}">${escHtml(emp.emp_no)}</td>
          ${amCells}
        </tr>
        <tr data-emp="${emp.id}">
          ${pmCells}
        </tr>
        <tr data-emp="${emp.id}" style="border-bottom:1px solid #d1d5db;height:18px;">
          ${coachCells}
        </tr>`;
    }).join("");
  }
  __name(renderEmployeeRows, "renderEmployeeRows");
  function renderGroupHeader(label, color) {
    return `<tr><td colspan="${5 + dates.length}" style="background:${color};font-size:12px;font-weight:bold;padding:4px 8px;border:1px solid #d1d5db;">${label}</td></tr>`;
  }
  __name(renderGroupHeader, "renderGroupHeader");
  function renderInstructorRows() {
    if (instructors.length === 0)
      return "";
    return instructors.map((inst) => {
      const mainCells = dates.map((d) => {
        const s = instructorScheduleMap[`${inst.id}_${d}`];
        const inPeriod = d >= periodStart && d <= periodEnd;
        const entry = s?.entry ?? "";
        const bg = entry ? colorMap[entry] ?? "#faf5ff" : "#faf5ff";
        const dispEntry = entry === "\u51FA\u52E4" ? "" : entry;
        return `<td data-inst="${inst.id}" data-inst-name="${escHtml(inst.name)}" data-date="${d}" data-row="1" data-value="${escHtml(entry)}"
          style="min-width:44px;max-width:44px;text-align:center;font-size:11px;padding:3px 2px;border:1px solid #d1d5db;cursor:pointer;background:${bg};${inPeriod ? "" : "opacity:0.5;"}touch-action:manipulation;"
          onclick="openInstEditor(this)">${escHtml(dispEntry)}</td>`;
      }).join("");
      const subCells = dates.map((d) => {
        const s = instructorScheduleMap[`${inst.id}_${d}`];
        return `<td data-inst="${inst.id}" data-date="${d}" data-row="2"
          style="min-width:44px;max-width:44px;text-align:center;font-size:10px;padding:2px;border:1px solid #e5e7eb;cursor:pointer;color:#6b7280;background:#fdf4ff;touch-action:manipulation;"
          onclick="openInstEditor(this)">${escHtml(s?.note ?? "")}</td>`;
      }).join("");
      const SI = `position:sticky;z-index:2;background:#faf5ff;border:1px solid #d1d5db;padding:2px;`;
      return `
        <tr style="border-top:2px solid #9ca3af;">
          <td colspan="3" style="${SI}left:0;min-width:88px;"></td>
          <td style="${SI}left:88px;min-width:80px;font-size:12px;font-weight:600;">${escHtml(inst.name)}<div style="font-size:10px;color:#6b7280;">${escHtml(inst.role ?? "")}</div></td>
          <td style="${SI}left:168px;min-width:44px;"></td>
          ${mainCells}
        </tr>
        <tr>
          <td colspan="5" style="position:sticky;left:0;z-index:2;background:#fdf4ff;border:1px solid #e5e7eb;"></td>
          ${subCells}
        </tr>`;
    }).join("");
  }
  __name(renderInstructorRows, "renderInstructorRows");
  const dateHeaders = dates.map((d) => {
    const dt = new Date(d);
    const day = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const inPeriod = d >= periodStart && d <= periodEnd;
    const bg = !inPeriod ? "#f3f4f6" : isWeekend ? "#fef2f2" : "#eff6ff";
    return `<th onclick="openDayList('${d}')" style="min-width:44px;max-width:44px;text-align:center;font-size:11px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};cursor:pointer;${!inPeriod ? "opacity:0.6;" : ""}touch-action:manipulation;"
      title="${d} \u306E\u51FA\u52E4\u8005\u4E00\u89A7">
      <div>${day}</div>
      <div style="color:${dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : "#374151"};">${WEEKDAY_JA[dow]}</div>
    </th>`;
  }).join("");
  const coachOptions = coaches.map(
    (c) => `<option value="${c.id}">${escHtml(c.name)}</option>`
  ).join("");
  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/shift?year=${prevYear}&month=${prevMonth}&mode=${mode}" class="btn-nav">\u25C0 \u524D\u6708\u5EA6</a>
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">${escHtml(periodLabel)}</h2>
    <a href="${ADMIN_PATH}/shift?year=${nextYear}&month=${nextMonth}&mode=${mode}" class="btn-nav">\u6B21\u6708\u5EA6 \u25B6</a>
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${mode === "completed" ? `<a href="${ADMIN_PATH}/shift?year=${year}&month=${month}&mode=training" style="padding:6px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;color:#166534;font-weight:600;text-decoration:none;">\u7814\u4FEE\u4E2D\u3092\u8868\u793A</a>` : `<a href="${ADMIN_PATH}/shift?year=${year}&month=${month}&mode=completed" style="padding:6px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:13px;color:#854d0e;font-weight:600;text-decoration:none;">\u7814\u4FEE\u7D42\u4E86\u8005\u3092\u8868\u793A</a>`}
      <a href="${ADMIN_PATH}/shift/export?year=${year}&month=${month}" class="btn-secondary">CSV\u51FA\u529B</a>
      <a href="${ADMIN_PATH}/employees/add" class="btn-primary">\uFF0B \u65B0\u4EBA\u767B\u9332</a>
    </div>
  </div>

  <!-- \u30ED\u30C3\u30AF\u72B6\u614B\u30D0\u30FC\uFF08\u4ED6\u30E6\u30FC\u30B6\u30FC\u304C\u7DE8\u96C6\u4E2D\u306E\u3068\u304D\uFF09 -->
  <div id="lock-status-bar" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:7px 12px;margin-bottom:8px;font-size:12px;color:#dc2626;font-weight:600;"></div>

  <!-- \u7DE8\u96C6\u30E2\u30FC\u30C9\u30D0\u30FC -->
  <div id="edit-mode-bar" style="display:none;background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#d97706;font-weight:700;font-size:13px;">\u7DE8\u96C6\u30E2\u30FC\u30C9\u4E2D</span>
    <span id="pending-count-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">\u5909\u66F4 0\u4EF6</span>
    <span id="edit-error" style="display:none;color:#dc2626;font-size:12px;"></span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="cancelEdit()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;touch-action:manipulation;">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
      <button onclick="batchSave()" id="batch-save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;opacity:0.5;">\u4E00\u62EC\u4FDD\u5B58</button>
    </div>
  </div>

  <!-- \u7DE8\u96C6\u30E2\u30FC\u30C9\u958B\u59CB\u30DC\u30BF\u30F3 -->
  <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <button onclick="startEdit()" id="edit-start-btn" style="padding:7px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;font-weight:600;color:#166534;cursor:pointer;touch-action:manipulation;">\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB</button>
    <span style="font-size:11px;color:#9ca3af;">\u30BB\u30EB\u3092\u7DE8\u96C6\u3059\u308B\u306B\u306F\u5148\u306B\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044</span>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;font-size:11px;align-items:center;">
    ${scheduleTypes.filter((t) => t.is_active).map(
    (t) => `<span style="background:${t.color};padding:2px 8px;border-radius:4px;border:1px solid #d1d5db;">${escHtml(t.code)}</span>`
  ).join("")}
    <a href="${ADMIN_PATH}/settings" style="margin-left:4px;font-size:11px;color:#2563eb;text-decoration:none;">\u533A\u5206\u3092\u7DE8\u96C6</a>
  </div>

  <div style="overflow-x:auto;overflow-y:auto;max-height:75vh;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead style="position:sticky;top:0;z-index:10;background:white;">
        <tr>
          <th style="min-width:32px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">NO</th>
          <th style="min-width:28px;${STICKY}left:32px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">\u8AB2</th>
          <th style="min-width:28px;${STICKY}left:60px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">\u73ED</th>
          <th style="min-width:80px;${STICKY}left:88px;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">\u6C0F\u540D</th>
          <th style="min-width:44px;${STICKY}left:168px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">\u793E\u54E1\u756A\u53F7</th>
          ${dateHeaders}
        </tr>
      </thead>
      <tbody>
        ${newGrads.length > 0 ? renderGroupHeader(`\u25CF \u65B0\u5352\uFF082026\u5E74\u5EA6\u5165\u793E\uFF09${mode === "completed" ? " \u2014 \u7814\u4FEE\u7D42\u4E86" : ""}`, "#dbeafe") + renderEmployeeRows(newGrads) : ""}
        ${career.length > 0 ? renderGroupHeader(`\u25CF \u4E00\u822C\u5165\u793E${mode === "completed" ? " \u2014 \u7814\u4FEE\u7D42\u4E86" : ""}`, "#dcfce7") + renderEmployeeRows(career) : ""}
        ${mode !== "completed" && instructors.length > 0 ? `<tr><td colspan="${5 + dates.length}" style="height:10px;background:#f3e8ff;border:none;border-top:3px solid #a855f7;"></td></tr>` + renderGroupHeader("\u25BC \u73ED\u9577\u30FB\u6307\u5C0E\u8005\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB", "#f3e8ff") + renderInstructorRows() : ""}
      </tbody>
    </table>
  </div>
</div>

<!-- \u30BB\u30EB\u7DE8\u96C6\u30E2\u30FC\u30C0\u30EB -->
<div id="cell-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <div id="modal-emp-name" style="font-size:15px;font-weight:700;color:#1e3a5f;"></div>
        <div id="modal-date-label" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
      </div>
      <button onclick="closeModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;padding:0 4px;line-height:1;">\u2715</button>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;" id="preset-buttons">
      ${scheduleTypes.filter((t) => t.is_active).map(
    (t) => `<button onclick="selectPreset('${escHtml(t.code)}')" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:${t.color};touch-action:manipulation;"
          onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${escHtml(t.code)}</button>`
  ).join("")}
    </div>

    <div style="margin-bottom:10px;">
      <label id="modal-am-label" style="font-size:11px;font-weight:600;color:#059669;display:block;margin-bottom:4px;">\u5348\u524D \u2014 \u7814\u4FEE\u5185\u5BB9</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <button id="seq-prev" onclick="seqNav(-1)"
          style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">\u25C0</button>
        <input id="modal-am" type="text" placeholder="\u533A\u5206\u3092\u9078\u629E\u307E\u305F\u306F\u81EA\u7531\u5165\u529B"
          style="flex:1;border:1px solid #6ee7b7;border-radius:6px;padding:10px;font-size:16px;font-family:inherit;outline:none;box-sizing:border-box;"
          onfocus="_currentFocus='am'">
        <button id="seq-next" onclick="seqNav(1)"
          style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">\u25B6</button>
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label id="modal-pm-label" style="font-size:11px;font-weight:600;color:#d97706;display:block;margin-bottom:4px;">\u5348\u5F8C \u2014 \u7814\u4FEE\u5185\u5BB9</label>
      <input id="modal-pm" type="text" placeholder="\u533A\u5206\u3092\u9078\u629E\u307E\u305F\u306F\u81EA\u7531\u5165\u529B"
        style="width:100%;border:1px solid #fcd34d;border-radius:6px;padding:10px;font-size:16px;font-family:inherit;outline:none;box-sizing:border-box;"
        onfocus="_currentFocus='pm'">
    </div>
    <div id="modal-coach-wrap" style="margin-bottom:16px;">
      <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u7814\u4FEE\u62C5\u5F53</label>
      <select id="modal-coach" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px;font-size:15px;font-family:inherit;background:white;outline:none;"
        onfocus="_currentFocus='coach'">
        <option value="">\u2014 \u306A\u3057 \u2014</option>
        ${coachOptions}
      </select>
    </div>

    <div id="modal-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;display:none;"></div>
    <div style="display:flex;gap:8px;">
      <button onclick="clearCell()" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;touch-action:manipulation;">\u30AF\u30EA\u30A2</button>
      <button onclick="applyCell()" id="save-cell-btn" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;">\u9069\u7528</button>
    </div>
  </div>
</div>

<!-- \u65E5\u5225\u51FA\u52E4\u8005\u30E2\u30FC\u30C0\u30EB -->
<div id="day-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 id="day-modal-title" style="font-size:15px;font-weight:700;color:#1e3a5f;"></h3>
      <button onclick="closeDayModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">\u2715</button>
    </div>
    <div id="day-modal-body"></div>
    <div style="margin-top:14px;text-align:right;">
      <button onclick="exportDayCsv()" style="padding:8px 18px;background:#6b7280;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">CSV\u51FA\u529B</button>
    </div>
  </div>
</div>

<!-- \u96C6\u8A08\u30E2\u30FC\u30C0\u30EB -->
<div id="count-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:24px;width:100%;max-width:360px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <h3 id="count-modal-name" style="font-size:16px;font-weight:bold;color:#1e3a5f;"></h3>
        <div style="font-size:11px;color:#6b7280;">\u6708\u5EA6\u5185\u306E\u533A\u5206\u96C6\u8A08</div>
      </div>
      <button onclick="closeCount()" style="color:#6b7280;font-size:22px;background:none;border:none;cursor:pointer;">\u2715</button>
    </div>
    <div id="count-modal-body"></div>
  </div>
</div>

<!-- \u4FDD\u5B58\u6210\u529F\u30C8\u30FC\u30B9\u30C8 -->
<div id="save-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#166534;color:white;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);"></div>

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-primary { padding:6px 14px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .sc:active { opacity:0.6; }
  /* \u672A\u4FDD\u5B58\u5909\u66F4\u30BB\u30EB\u306E\u30A4\u30F3\u30B8\u30B1\u30FC\u30BF\u30FC */
  .sc[data-pending="true"] { outline:2px dashed #f59e0b !important; position:relative; }
  /* \u73ED\u9577\u30BB\u30EB\u672A\u4FDD\u5B58\u30A4\u30F3\u30B8\u30B1\u30FC\u30BF\u30FC */
  td[data-inst][data-pending="true"] { outline:2px dashed #f59e0b !important; }
</style>

<script>
// ===== STATE =====
var _currentCell = null;
var _currentFocus = 'am'; // 'am' | 'pm' | 'coach'
var _isInstMode = false;  // \u73ED\u9577\u30E2\u30FC\u30C0\u30EB\u304C\u958B\u3044\u3066\u3044\u308B\u304B
var _dayListData = [];
var _isEditMode = false;
var _pendingChanges = {}; // key: "empId_date"
var _heartbeatTimer = null;
var _lockCheckTimer = null;
var _year = ${year};
var _month = ${month};

var _st = ${JSON.stringify(scheduleTypes.map((t) => ({ code: t.code, color: t.color, target: t.target ?? null }))).replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/\//g, "\\u002F")};
var colorMap = Object.fromEntries(_st.map(function(t) { return [t.code, t.color]; }));
var periodStart = '${periodStart}';
var periodEnd   = '${periodEnd}';

var _seqDates = ${JSON.stringify(dates).replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/\//g, "\\u002F")};
var _currentSeqDate = '';
var _instPendingChanges = {};

var _instPresets = [
  { code: '\u5F53\u76F4', color: '#c7d2fe' },
  { code: '\u660E\u3051', color: '#bfdbfe' },
  { code: '\u516C\u4F11', color: '#e5e7eb' },
  { code: '\u4F11',   color: '#f3f4f6' },
  { code: '\u5B9F\u7814', color: '#dbeafe' },
  { code: '\u5185\u52E4', color: '#e0e7ff' },
  { code: '\u51FA\u52E4', color: '#bbf7d0' },
];
var _origPresetHTML = null;

// ===== UTILS =====
function sel(selector) { return document.querySelector(selector); }
function escH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== \u7DE8\u96C6\u30E2\u30FC\u30C9 =====
async function startEdit() {
  var btn = sel('#edit-start-btn');
  btn.disabled = true;
  btn.textContent = '\u78BA\u8A8D\u4E2D...';
  try {
    // \u30ED\u30C3\u30AF\u78BA\u8A8D
    var r = await fetch('/api/shift/lock?year=' + _year + '&month=' + _month);
    var d = await r.json();
    if (d.locked) {
      showLockBar(escH(d.admin_name) + ' \u3055\u3093\u304C\u7DE8\u96C6\u4E2D\u306E\u305F\u3081\u3001\u7DE8\u96C6\u3067\u304D\u307E\u305B\u3093');
      return;
    }
    // \u30ED\u30C3\u30AF\u53D6\u5F97
    var r2 = await fetch('/api/shift/lock', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });
    var d2 = await r2.json();
    if (!d2.ok) {
      showLockBar(escH(d2.admin_name || '\u4ED6\u306E\u7BA1\u7406\u8005') + ' \u3055\u3093\u304C\u7DE8\u96C6\u4E2D\u306E\u305F\u3081\u3001\u7DE8\u96C6\u3067\u304D\u307E\u305B\u3093');
      return;
    }
    // \u7DE8\u96C6\u30E2\u30FC\u30C9\u958B\u59CB
    _isEditMode = true;
    sel('#edit-start-btn').style.display = 'none';
    sel('#edit-mode-bar').style.display = 'flex';
    sel('#lock-status-bar').style.display = 'none';
    clearInterval(_lockCheckTimer);
    // \u30CF\u30FC\u30C8\u30D3\u30FC\u30C8\uFF082\u5206\u3054\u3068\u306B\u30ED\u30C3\u30AF\u3092\u5EF6\u9577\uFF09
    _heartbeatTimer = setInterval(function() {
      fetch('/api/shift/lock', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ year: _year, month: _month })
      });
    }, 2 * 60 * 1000);
    window.addEventListener('beforeunload', _beforeUnload);
  } finally {
    if (_isEditMode) {
      btn.textContent = '\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB';
    } else {
      btn.disabled = false;
      btn.textContent = '\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB';
    }
  }
}

function _beforeUnload(e) {
  var hasChanges = Object.keys(_pendingChanges).length > 0;
  // \u30ED\u30C3\u30AF\u89E3\u653E\uFF08\u30D9\u30B9\u30C8\u30A8\u30D5\u30A9\u30FC\u30C8\uFF09
  navigator.sendBeacon('/api/shift/lock-release', JSON.stringify({ year: _year, month: _month }));
  if (hasChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
}

async function batchSave() {
  var count = Object.keys(_pendingChanges).length;
  if (count === 0) return;

  var btn = sel('#batch-save-btn');
  btn.disabled = true;
  btn.textContent = '\u4FDD\u5B58\u4E2D...';
  sel('#edit-error').style.display = 'none';

  try {
    var entries = Object.values(_pendingChanges);
    var res = await fetch('/api/shift/batch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ entries: entries })
    });
    if (!res.ok) throw new Error('server');

    // \u672A\u4FDD\u5B58\u30DE\u30FC\u30AF\u3092\u89E3\u9664
    Object.keys(_pendingChanges).forEach(function(key) {
      var idx = key.indexOf('_');
      var empId = key.substring(0, idx);
      var date  = key.substring(idx + 1);
      clearPendingMark(empId, date);
    });
    _pendingChanges = {};

    // \u30ED\u30C3\u30AF\u89E3\u653E
    await fetch('/api/shift/lock-release', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });

    _exitEditMode();
    showToast('\u4FDD\u5B58\u3057\u307E\u3057\u305F');
  } catch(e) {
    sel('#edit-error').textContent = '\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002';
    sel('#edit-error').style.display = 'block';
    btn.disabled = false;
    btn.textContent = '\u4E00\u62EC\u4FDD\u5B58';
    _updateBatchSaveBtn();
  }
}

async function cancelEdit() {
  var count = Object.keys(_pendingChanges).length;
  if (count > 0 && !confirm(count + '\u4EF6\u306E\u672A\u4FDD\u5B58\u5909\u66F4\u3092\u7834\u68C4\u3057\u307E\u3059\u304B\uFF1F')) return;

  // \u30ED\u30C3\u30AF\u89E3\u653E
  try {
    await fetch('/api/shift/lock-release', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });
  } catch(e) {}

  _exitEditMode();

  if (count > 0) {
    location.reload();
  }
}

function _exitEditMode() {
  _isEditMode = false;
  clearInterval(_heartbeatTimer);
  _heartbeatTimer = null;
  var btn = sel('#edit-start-btn');
  btn.style.display = '';
  btn.disabled = false;
  btn.textContent = '\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB';
  sel('#edit-mode-bar').style.display = 'none';
  sel('#edit-error').style.display = 'none';
  window.removeEventListener('beforeunload', _beforeUnload);
  // \u30ED\u30C3\u30AF\u78BA\u8A8D\u30DD\u30FC\u30EA\u30F3\u30B0\u518D\u958B
  _startLockCheckPolling();
}

function _updatePendingCount() {
  var count = Object.keys(_pendingChanges).length;
  sel('#pending-count-label').textContent = '\u5909\u66F4 ' + count + '\u4EF6';
  _updateBatchSaveBtn();
}

function _updateBatchSaveBtn() {
  var btn = sel('#batch-save-btn');
  var count = Object.keys(_pendingChanges).length;
  btn.disabled = count === 0;
  btn.style.opacity = count === 0 ? '0.5' : '1';
}

function setPendingMark(empId, date) {
  ['am', 'pm', 'coach'].forEach(function(row) {
    var td = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="' + row + '"]');
    if (td) td.dataset.pending = 'true';
  });
}

function clearPendingMark(empId, date) {
  ['am', 'pm', 'coach'].forEach(function(row) {
    var td = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="' + row + '"]');
    if (td) delete td.dataset.pending;
  });
}

function showLockBar(msg) {
  var el = sel('#lock-status-bar');
  el.textContent = msg;
  el.style.display = 'block';
}

function showToast(msg) {
  var el = sel('#save-toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 3000);
}

// \u30ED\u30C3\u30AF\u72B6\u614B\u306E\u30DD\u30FC\u30EA\u30F3\u30B0\uFF0830\u79D2\u3054\u3068\u3001\u7DE8\u96C6\u30E2\u30FC\u30C9\u5916\u306E\u307F\uFF09
function _startLockCheckPolling() {
  clearInterval(_lockCheckTimer);
  _lockCheckTimer = setInterval(function() {
    if (_isEditMode) return;
    fetch('/api/shift/lock?year=' + _year + '&month=' + _month)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var bar = sel('#lock-status-bar');
        var startBtn = sel('#edit-start-btn');
        if (d.locked) {
          bar.textContent = escH(d.admin_name) + ' \u3055\u3093\u304C\u7DE8\u96C6\u4E2D\u3067\u3059';
          bar.style.display = 'block';
          startBtn.disabled = true;
        } else {
          bar.style.display = 'none';
          startBtn.disabled = false;
        }
      }).catch(function() {});
  }, 30 * 1000);
}
_startLockCheckPolling();

// ===== \u30BB\u30EB\u7DE8\u96C6 =====
function openEditor(td) {
  if (!_isEditMode) {
    showToast('\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044');
    return;
  }
  _currentCell = td;
  _currentFocus = td.dataset.row; // 'am' | 'pm' | 'coach'
  var empId = td.dataset.emp, date = td.dataset.date, name = td.dataset.name;
  var amTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
  var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
  var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
  sel('#modal-emp-name').textContent = name;
  var dow = ['\u65E5','\u6708','\u706B','\u6C34','\u6728','\u91D1','\u571F'][new Date(date).getUTCDay()];
  sel('#modal-date-label').textContent = date + '\uFF08' + dow + '\uFF09';
  sel('#modal-am').value    = amTd ? amTd.textContent.trim() : '';
  sel('#modal-pm').value    = pmTd ? pmTd.textContent.trim() : '';
  sel('#modal-coach').value = coachTd && coachTd.dataset.coachId ? coachTd.dataset.coachId : '';
  sel('#modal-error').style.display = 'none';
  _currentSeqDate = date;
  _updateSeqNavBtns(date);
  sel('#cell-modal').style.display = 'flex';
  setTimeout(function() {
    if (_currentFocus === 'coach') sel('#modal-coach').focus();
    else if (_currentFocus === 'pm') sel('#modal-pm').focus();
    else sel('#modal-am').focus();
  }, 60);
  document.onkeydown = function(e) { if(e.key === 'Escape') closeModal(); };
}

function openInstEditor(td) {
  if (!_isEditMode) {
    showToast('\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044');
    return;
  }
  _currentCell = td;
  _currentFocus = 'inst';
  _isInstMode = true;
  var instId = td.dataset.inst, date = td.dataset.date;
  var mainTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="1"]');
  var noteTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="2"]');
  var instName = (mainTd && mainTd.dataset.instName) ? mainTd.dataset.instName : '\u73ED\u9577\u30FB\u6307\u5C0E\u8005';
  sel('#modal-emp-name').textContent = instName;
  var dow = ['\u65E5','\u6708','\u706B','\u6C34','\u6728','\u91D1','\u571F'][new Date(date).getUTCDay()];
  sel('#modal-date-label').textContent = date + '\uFF08' + dow + '\uFF09';
  sel('#modal-am').value    = mainTd ? (mainTd.dataset.value ?? mainTd.textContent.trim()) : '';
  sel('#modal-pm').value    = noteTd ? noteTd.textContent.trim() : '';
  sel('#modal-coach').value = '';
  // \u30D7\u30EA\u30BB\u30C3\u30C8\u3092\u73ED\u9577\u7528\u306B\u5207\u308A\u66FF\u3048
  if (!_origPresetHTML) _origPresetHTML = sel('#preset-buttons').innerHTML;
  sel('#preset-buttons').innerHTML = _instPresets.map(function(p) {
    return '<button data-code="' + escH(p.code) + '" onclick="selectPreset(this.dataset.code)" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:' + p.color + ';touch-action:manipulation;"'
      + ' onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">' + escH(p.code) + '</button>';
  }).join('');
  // \u7814\u4FEE\u62C5\u5F53\u6B04\u3092\u975E\u8868\u793A\u3001\u30E9\u30D9\u30EB\u3092\u73ED\u9577\u7528\u306B\u5909\u66F4
  sel('#modal-coach-wrap').style.display = 'none';
  sel('#modal-am-label').textContent = '\u30B7\u30D5\u30C8';
  sel('#modal-pm-label').textContent = '\u30E1\u30E2';
  sel('#modal-error').style.display = 'none';
  _currentSeqDate = date;
  _updateSeqNavBtns(date);
  sel('#cell-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key === 'Escape') closeModal(); };
}

// ===== \u9023\u7D9A\u5165\u529B\u30E2\u30FC\u30C9 =====
function _updateSeqNavBtns(date) {
  var idx = _seqDates.indexOf(date);
  var prev = sel('#seq-prev');
  var next = sel('#seq-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= _seqDates.length - 1;
}

function seqNav(dir) {
  var idx = _seqDates.indexOf(_currentSeqDate);
  if (idx < 0) return;
  var nextIdx = idx + dir;
  if (nextIdx < 0 || nextIdx >= _seqDates.length) return;

  var am = sel('#modal-am').value.trim();
  var pm = sel('#modal-pm').value.trim();
  var date = _currentSeqDate;
  var nextDate = _seqDates[nextIdx];

  if (_isInstMode) {
    // \u73ED\u9577\u30BB\u30EB: _instPendingChanges \u306B\u84C4\u7A4D
    var instId = _currentCell.dataset.inst;
    var key = instId + '_' + date;
    _instPendingChanges[key] = { instructor_id: parseInt(instId), date: date, entry: am || null, note: pm || null };
    var mTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="1"]');
    var nTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="2"]');
    if (mTd) { mTd.textContent = (am === '\u51FA\u52E4' ? '' : am); mTd.dataset.value = am; mTd.style.background = (colorMap[am] || (am ? '#fff7ed' : '#faf5ff')); mTd.dataset.pending = 'true'; }
    if (nTd) { nTd.textContent = pm; nTd.dataset.pending = 'true'; }
    // \u6B21\u306E\u73ED\u9577\u30BB\u30EB\u3078\uFF08openInstEditor \u3092\u547C\u3070\u305A\u306B\u30E2\u30FC\u30C0\u30EB\u5185\u5BB9\u3060\u3051\u66F4\u65B0\uFF09
    var nextTd = sel('td[data-inst="' + instId + '"][data-date="' + nextDate + '"][data-row="1"]');
    if (nextTd) {
      _currentCell = nextTd;
      var nextNoteTd = sel('td[data-inst="' + instId + '"][data-date="' + nextDate + '"][data-row="2"]');
      var dow = ['\u65E5','\u6708','\u706B','\u6C34','\u6728','\u91D1','\u571F'][new Date(nextDate).getUTCDay()];
      sel('#modal-date-label').textContent = nextDate + '\uFF08' + dow + '\uFF09';
      sel('#modal-am').value = nextTd.dataset.value ?? nextTd.textContent.trim();
      sel('#modal-pm').value = nextNoteTd ? nextNoteTd.textContent.trim() : '';
      sel('#modal-error').style.display = 'none';
      _currentSeqDate = nextDate;
      _updateSeqNavBtns(nextDate);
    }
  } else {
    // \u65B0\u4EBA\u30BB\u30EB: \u7DE8\u96C6\u30E2\u30FC\u30C9\u304C\u5FC5\u8981
    if (!_isEditMode) { showToast('\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
    var empId = _currentCell.dataset.emp;
    var coachId = sel('#modal-coach').value;
    var key = empId + '_' + date;
    _pendingChanges[key] = { emp_id: parseInt(empId), date: date, entry_am: am || null, entry_pm: pm || null, coach_id: coachId ? parseInt(coachId) : null };
    var amTd  = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
    var pmTd  = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var cTd   = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
    if (amTd)  { amTd.textContent  = am; amTd.style.background  = colorMap[am]  || (am  ? '#fff7ed' : '#ffffff'); amTd.dataset.pending  = 'true'; }
    if (pmTd)  { pmTd.textContent  = pm; pmTd.style.background  = colorMap[pm]  || (pm  ? '#fff7ed' : 'transparent'); pmTd.dataset.pending  = 'true'; }
    if (cTd) {
      var opt = sel('#modal-coach option[value="' + coachId + '"]');
      cTd.textContent = opt ? opt.textContent : '';
      cTd.dataset.coachId = coachId;
      cTd.dataset.pending = 'true';
    }
    _updatePendingCount();
    // \u6B21\u306E\u65B0\u4EBA\u30BB\u30EB\u3078
    var nextTd = sel('.sc[data-emp="' + empId + '"][data-date="' + nextDate + '"][data-row="am"]');
    if (nextTd) { _currentCell = nextTd; openEditor(nextTd); }
  }
}

async function _flushInstPending() {
  var keys = Object.keys(_instPendingChanges);
  if (keys.length === 0) return;
  var toSave = Object.values(_instPendingChanges);
  _instPendingChanges = {};
  for (var i = 0; i < toSave.length; i++) {
    var ch = toSave[i];
    try {
      await fetch('/api/instructor-schedule', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ instructor_id: ch.instructor_id, date: ch.date, entry: ch.entry, note: ch.note })
      });
      var mTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="1"]');
      var nTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="2"]');
      if (mTd) delete mTd.dataset.pending;
      if (nTd) delete nTd.dataset.pending;
    } catch(e) {}
  }
}

function selectPreset(value) {
  if (_currentFocus === 'pm') {
    sel('#modal-pm').value = value;
    sel('#modal-pm').focus();
  } else if (_currentFocus === 'coach') {
    // \u30B3\u30FC\u30C1\u6B04\u306B\u30D7\u30EA\u30BB\u30C3\u30C8\u306F\u9069\u7528\u3057\u306A\u3044\u3002\u5348\u524D\u306B\u5165\u308C\u308B
    sel('#modal-am').value = value;
    sel('#modal-am').focus();
    _currentFocus = 'am';
  } else {
    sel('#modal-am').value = value;
    sel('#modal-am').focus();
    _currentFocus = 'am';
  }
}

function closeModal() {
  sel('#cell-modal').style.display = 'none';
  _currentCell = null;
  document.onkeydown = null;
  // \u73ED\u9577\u30E2\u30FC\u30C0\u30EB\u3067\u5909\u3048\u305F\u8981\u7D20\u3092\u5143\u306B\u623B\u3059
  if (_origPresetHTML) {
    sel('#preset-buttons').innerHTML = _origPresetHTML;
    _origPresetHTML = null;
  }
  _isInstMode = false;
  sel('#modal-coach-wrap').style.display = '';
  sel('#modal-am-label').textContent = '\u5348\u524D \u2014 \u7814\u4FEE\u5185\u5BB9';
  sel('#modal-pm-label').textContent = '\u5348\u5F8C \u2014 \u7814\u4FEE\u5185\u5BB9';
  // \u73ED\u9577\u306E\u84C4\u7A4D\u5909\u66F4\u3092\u4E00\u62EC\u4FDD\u5B58\uFF08\u2715\u3067\u9589\u3058\u305F\u5834\u5408\uFF09
  _flushInstPending();
}

// \u73ED\u9577\u30BB\u30EB\u306E\u4FDD\u5B58\uFF08\u9023\u7D9A\u5165\u529B\u306E\u84C4\u7A4D\u5206\u3082\u542B\u3081\u3066\u4E00\u62EC\u4FDD\u5B58\uFF09
async function saveInstCell() {
  var btn = sel('#save-cell-btn');
  btn.disabled = true;
  btn.textContent = '\u4FDD\u5B58\u4E2D...';
  try {
    var am = sel('#modal-am').value.trim();
    var pm = sel('#modal-pm').value.trim();
    var instId   = _currentCell.dataset.inst;
    var instDate = _currentCell.dataset.date;

    // \u73FE\u5728\u306E\u30BB\u30EB\u3092\u84C4\u7A4D\u306B\u8FFD\u52A0\uFF08\u9023\u7D9A\u5165\u529B\u306E\u6700\u7D42\u30BB\u30EB\u542B\u3081\u4E00\u62EC\u4FDD\u5B58\uFF09
    var key = instId + '_' + instDate;
    _instPendingChanges[key] = { instructor_id: parseInt(instId), date: instDate, entry: am || null, note: pm || null };

    // \u84C4\u7A4D\u3092\u5168\u4EF6\u4FDD\u5B58
    var toSave = Object.values(_instPendingChanges);
    _instPendingChanges = {};
    var hasError = false;
    for (var i = 0; i < toSave.length; i++) {
      var ch = toSave[i];
      var res = await fetch('/api/instructor-schedule', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ instructor_id: ch.instructor_id, date: ch.date, entry: ch.entry, note: ch.note })
      });
      if (!res.ok) { hasError = true; continue; }
      var mTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="1"]');
      var nTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="2"]');
      if (mTd) { var ev = ch.entry ?? ''; mTd.textContent = (ev === '\u51FA\u52E4' ? '' : ev); mTd.dataset.value = ev; mTd.style.background = (colorMap[ev] || (ev ? '#fff7ed' : '#faf5ff')); delete mTd.dataset.pending; }
      if (nTd) { nTd.textContent = ch.note  ?? ''; delete nTd.dataset.pending; }
    }
    if (hasError) throw new Error();
    // \u30E2\u30FC\u30C0\u30EB\u3092\u9589\u3058\u308B\uFF08_flushInstPending \u306F\u7A7A\u306A\u306E\u3067\u30B9\u30AD\u30C3\u30D7\u3055\u308C\u308B\uFF09
    closeModal();
    showToast('\u4FDD\u5B58\u3057\u307E\u3057\u305F');
  } catch(e) {
    sel('#modal-error').textContent = '\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC\u3067\u3059\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002';
    sel('#modal-error').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '\u9069\u7528';
  }
}

// \u30BB\u30EB\u5909\u66F4\u3092\u30ED\u30FC\u30AB\u30EB\u306B\u84C4\u7A4D
function applyCell() {
  if (_isInstMode) {
    saveInstCell();
    return;
  }

  var am      = sel('#modal-am').value.trim();
  var pm      = sel('#modal-pm').value.trim();
  var coachId = sel('#modal-coach').value;
  var empId   = _currentCell.dataset.emp;
  var date    = _currentCell.dataset.date;

  var key = empId + '_' + date;
  _pendingChanges[key] = {
    emp_id:    parseInt(empId),
    date:      date,
    entry_am:  am || null,
    entry_pm:  pm || null,
    coach_id:  coachId ? parseInt(coachId) : null
  };

  // \u30BB\u30EB\u306EDOM\u66F4\u65B0
  var amTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
  var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
  var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
  if (amTd) { amTd.textContent = am; amTd.style.background = colorMap[am] || (am ? '#fff7ed' : '#ffffff'); }
  if (pmTd) { pmTd.textContent = pm; pmTd.style.background = colorMap[pm] || (pm ? '#fff7ed' : 'transparent'); }
  if (coachTd) {
    var opt = sel('#modal-coach option[value="' + coachId + '"]');
    coachTd.textContent = opt ? opt.textContent : '';
    coachTd.dataset.coachId = coachId;
  }

  // \u672A\u4FDD\u5B58\u30DE\u30FC\u30AF\u3092\u4ED8\u3051\u308B
  setPendingMark(empId, date);
  _updatePendingCount();
  closeModal();
}

function clearCell() {
  sel('#modal-am').value    = '';
  sel('#modal-pm').value    = '';
  sel('#modal-coach').value = '';
  applyCell();
}

// ===== \u65E5\u5225\u51FA\u52E4\u8005 =====
function openDayList(date) {
  var cells = document.querySelectorAll('.sc[data-date="' + date + '"][data-row="am"]');
  _dayListData = [];
  var dow = ['\u65E5','\u6708','\u706B','\u6C34','\u6728','\u91D1','\u571F'][new Date(date).getUTCDay()];
  sel('#day-modal-title').textContent = date + '\uFF08' + dow + '\uFF09\u51FA\u52E4\u8005\u4E00\u89A7';
  cells.forEach(function(td) {
    var empId = td.dataset.emp;
    var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
    var am = td.textContent.trim();
    var pm = pmTd ? pmTd.textContent.trim() : '';
    var coach = coachTd ? coachTd.textContent.trim() : '';
    if (am || pm || coach) _dayListData.push({ name: td.dataset.name, am: am, pm: pm, coach: coach });
  });
  if (_dayListData.length === 0) {
    sel('#day-modal-body').innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:20px;">\u3053\u306E\u65E5\u306E\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</div>';
  } else {
    var rows = _dayListData.map(function(r) {
      return '<tr>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">' + escH(r.name) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + escH(r.am) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + escH(r.pm) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">' + escH(r.coach) + '</td>'
        + '</tr>';
    }).join('');
    sel('#day-modal-body').innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + _dayListData.length + '\u540D</div>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr style="background:#f8fafc;">'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb;">\u6C0F\u540D</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#059669;border-bottom:2px solid #e5e7eb;">\u5348\u524D</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#d97706;border-bottom:2px solid #e5e7eb;">\u5348\u5F8C</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb;">\u7814\u4FEE\u62C5\u5F53</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody></table>';
  }
  sel('#day-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key==='Escape') closeDayModal(); };
}

function closeDayModal() {
  sel('#day-modal').style.display = 'none';
  document.onkeydown = null;
}

function exportDayCsv() {
  var title = sel('#day-modal-title').textContent;
  var parenIdx = title.indexOf('\uFF08');
  var date = parenIdx > 0 ? title.substring(0, parenIdx) : title;
  var NL  = String.fromCharCode(10);
  var BOM = String.fromCharCode(65279);
  var hdr = '\u6C0F\u540D,\u5348\u524D,\u5348\u5F8C,\u7814\u4FEE\u62C5\u5F53';
  var rows = _dayListData.map(function(r) {
    return [r.name, r.am, r.pm, r.coach].map(function(v) {
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(',');
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([BOM + hdr + NL + rows.join(NL)], { type: 'text/csv;charset=utf-8' }));
  a.download = 'attendance_' + date + '.csv';
  a.click();
}

// ===== \u96C6\u8A08 =====
var scheduleTargets = Object.fromEntries(_st.map(function(t) { return [t.code, t.target]; }));
function openCount(empId, name) {
  var cells = document.querySelectorAll('.sc[data-emp="' + empId + '"][data-row="am"]');
  var counts = {};
  cells.forEach(function(td) {
    var date = td.dataset.date;
    if (date < periodStart || date > periodEnd) return;
    var am = td.textContent.trim();
    if (am) counts[am] = (counts[am] || 0) + 1;
    var pmTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var pm = pmTd ? pmTd.textContent.trim() : '';
    if (pm) counts[pm] = (counts[pm] || 0) + 1;
  });
  var allKeys = Object.keys(scheduleTargets).concat(Object.keys(counts));
  var seen = {}, allCodes = [];
  allKeys.forEach(function(c) { if (!seen[c] && (counts[c] || scheduleTargets[c])) { seen[c]=1; allCodes.push(c); } });
  var rows = '', allMet = true;
  allCodes.forEach(function(code) {
    var cnt    = counts[code] || 0;
    var target = scheduleTargets[code];
    var color  = colorMap[code] || '#f3f4f6';
    var met    = target == null || cnt >= target;
    if (target != null && !met) allMet = false;
    var pct = target ? Math.min(100, Math.round(cnt / target * 100)) : 0;
    rows += '<div style="margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">'
      + '<span style="background:' + color + ';padding:2px 10px;border-radius:4px;font-size:13px;font-weight:600;">' + escH(code) + '</span>'
      + '<span style="font-size:13px;font-weight:700;color:' + (met ? '#166534' : '#c2410c') + ';">'
      + cnt + '\u56DE' + (target ? ' / ' + target + '\u56DE' : '') + '</span></div>'
      + (target ? '<div style="background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;">'
        + '<div style="background:' + (met ? '#22c55e' : '#f97316') + ';width:' + pct + '%;height:100%;border-radius:99px;"></div></div>'
        + '<div style="font-size:11px;color:' + (met ? '#166534' : '#c2410c') + ';text-align:right;margin-top:2px;">'
        + (met ? '\u9054\u6210' : '\u6B8B\u308A ' + (target - cnt) + '\u56DE') + '</div>' : '')
      + '</div>';
  });
  if (!rows) rows = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</div>';
  sel('#count-modal-name').textContent = name;
  sel('#count-modal-body').innerHTML =
    (allMet
      ? '<div style="background:#f0fdf4;color:#166534;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;">\u3059\u3079\u3066\u306E\u76EE\u6A19\u3092\u9054\u6210</div>'
      : '<div style="background:#fff7ed;color:#c2410c;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;">\u672A\u9054\u6210\u306E\u76EE\u6A19\u3042\u308A</div>'
    ) + rows;
  sel('#count-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key==='Escape') closeCount(); };
}
function closeCount() {
  sel('#count-modal').style.display = 'none';
  document.onkeydown = null;
}

function changeStatusBtn(btn) {
  var id   = parseInt(btn.dataset.eid);
  var name = btn.dataset.ename;
  changeStatus(id, name, 'completed');
}
function openCountBtn(btn) {
  var id   = parseInt(btn.dataset.eid);
  var name = btn.dataset.ename;
  openCount(id, name);
}
async function changeStatus(empId, name, status) {
  var msg = status === 'completed'
    ? name + ' \u3092\u300C\u7814\u4FEE\u7D42\u4E86\u300D\u306B\u3057\u307E\u3059\u304B\uFF1F\uFF08\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u304B\u3089\u975E\u8868\u793A\u306B\u306A\u308A\u307E\u3059\uFF09'
    : name + ' \u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u5909\u66F4\u3057\u307E\u3059\u304B\uFF1F';
  if (!confirm(msg)) return;
  var res = await fetch('/api/employees/' + empId, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ status: status })
  });
  if (res.ok) location.reload();
  else alert('\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
}
<\/script>`;
}
__name(shiftPage, "shiftPage");

// src/routes/admin.ts
var app = new Hono2();
app.get("/login", (c) => {
  const cookie = c.req.header("Cookie") ?? null;
  const sid = getSessionFromCookie(cookie);
  if (sid)
    return c.redirect(ADMIN_PATH);
  const csrfToken = crypto.randomUUID();
  const res = c.html(loginPage("", csrfToken));
  res.headers.append("Set-Cookie", `csrf_login=${csrfToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
  return res;
});
app.post("/login", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  if (await isLockedOut(c.env.DB, ip)) {
    return c.html(loginPage("\u3057\u3070\u3089\u304F\u6642\u9593\u3092\u304A\u3044\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002", ""));
  }
  let form;
  try {
    form = await c.req.formData();
  } catch {
    return c.html(loginPage("\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059\u3002", ""), 400);
  }
  const username = form.get("username")?.toString() ?? "";
  const password = form.get("password")?.toString() ?? "";
  const csrfForm = form.get("csrf_token")?.toString() ?? "";
  const cookies = c.req.header("Cookie") ?? "";
  const csrfCookie = cookies.match(/csrf_login=([a-f0-9-]+)/)?.[1] ?? "";
  if (!csrfForm || !csrfCookie || csrfForm !== csrfCookie) {
    const newToken = crypto.randomUUID();
    const res2 = c.html(loginPage("\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u7121\u52B9\u3067\u3059\u3002\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", newToken), 403);
    res2.headers.append("Set-Cookie", `csrf_login=${newToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
    return res2;
  }
  if (!username || !password) {
    return c.html(loginPage("\u30E6\u30FC\u30B6\u30FC\u540D\u3068\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", csrfForm), 400);
  }
  const admin = await c.env.DB.prepare(
    "SELECT id, password FROM admins WHERE username = ?"
  ).bind(username).first();
  if (!admin || !await verifyPassword(password, admin.password)) {
    await recordFailedLogin(c.env.DB, ip);
    return c.html(loginPage("\u30E6\u30FC\u30B6\u30FC\u540D\u307E\u305F\u306F\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002", ""));
  }
  const sessionId = await createSession(c.env.DB, admin.id);
  const cf = c.req.raw.cf ?? {};
  await c.env.DB.prepare(
    "INSERT INTO login_logs (ip, country, city, latitude, longitude, timezone, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    c.req.header("CF-Connecting-IP") ?? ip,
    cf.country ?? c.req.header("CF-IPCountry") ?? null,
    cf.city ?? null,
    cf.latitude ? String(cf.latitude) : null,
    cf.longitude ? String(cf.longitude) : null,
    cf.timezone ?? null,
    c.req.header("User-Agent") ?? null
  ).run();
  const res = c.redirect(ADMIN_PATH);
  res.headers.set(
    "Set-Cookie",
    `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
  );
  return res;
});
app.get("/logout", async (c) => {
  const cookie = c.req.header("Cookie") ?? null;
  const sid = getSessionFromCookie(cookie);
  if (sid)
    await deleteSession(c.env.DB, sid);
  const res = c.redirect(`${ADMIN_PATH}/login`);
  res.headers.set("Set-Cookie", "session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  return res;
});
app.get("/setup", async (c) => {
  const setupKey = c.env.SETUP_KEY;
  if (!setupKey)
    return c.text("SETUP_KEY \u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002wrangler.toml \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002", 403);
  const key = c.req.query("key");
  if (key !== setupKey)
    return c.text("Access denied", 403);
  const admin = await c.env.DB.prepare(
    "SELECT password FROM admins WHERE username = ?"
  ).bind("admin").first();
  if (admin && admin.password !== "CHANGE_ME_PLACEHOLDER") {
    return c.text("\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7\u306F\u65E2\u306B\u5B8C\u4E86\u3057\u3066\u3044\u307E\u3059\u3002\u30ED\u30B0\u30A4\u30F3\u753B\u9762\u304B\u3089\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002", 403);
  }
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>\u521D\u671F\u8A2D\u5B9A</title>
  <script src="https://cdn.tailwindcss.com"><\/script></head>
  <body class="flex items-center justify-center min-h-screen bg-gray-100">
  <div class="bg-white p-8 rounded-xl shadow w-80">
    <h1 class="text-lg font-bold mb-4">\u7BA1\u7406\u8005\u30D1\u30B9\u30EF\u30FC\u30C9\u8A2D\u5B9A</h1>
    <p class="text-sm text-gray-500 mb-4">8\u6587\u5B57\u4EE5\u4E0A\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
    <form method="POST" action="${ADMIN_PATH}/setup?key=${escHtml(setupKey)}">
      <input type="password" name="password" placeholder="\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\uFF088\u6587\u5B57\u4EE5\u4E0A\uFF09" required minlength="8"
        class="w-full border rounded px-3 py-2 mb-3 text-sm">
      <button type="submit" class="w-full bg-blue-600 text-white rounded py-2 text-sm">\u8A2D\u5B9A\u3059\u308B</button>
    </form>
  </div></body></html>`);
});
app.post("/setup", async (c) => {
  const setupKey = c.env.SETUP_KEY;
  if (!setupKey)
    return c.text("SETUP_KEY \u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", 403);
  const key = c.req.query("key");
  if (key !== setupKey)
    return c.text("Access denied", 403);
  const admin = await c.env.DB.prepare(
    "SELECT password FROM admins WHERE username = ?"
  ).bind("admin").first();
  if (admin && admin.password !== "CHANGE_ME_PLACEHOLDER") {
    return c.text("\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7\u306F\u65E2\u306B\u5B8C\u4E86\u3057\u3066\u3044\u307E\u3059\u3002", 403);
  }
  const form = await c.req.formData();
  const password = form.get("password")?.toString() ?? "";
  if (password.length < 8)
    return c.text("\u30D1\u30B9\u30EF\u30FC\u30C9\u306F8\u6587\u5B57\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044", 400);
  const hash = await hashPassword(password);
  await c.env.DB.prepare(
    "UPDATE admins SET password = ? WHERE username = ?"
  ).bind(hash, "admin").run();
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>\u8A2D\u5B9A\u5B8C\u4E86</title>
  <script src="https://cdn.tailwindcss.com"><\/script></head>
  <body class="flex items-center justify-center min-h-screen bg-gray-100">
  <div class="bg-white p-8 rounded-xl shadow w-80 text-center">
    <div class="text-4xl mb-4">\u2705</div>
    <h1 class="text-lg font-bold mb-2">\u30D1\u30B9\u30EF\u30FC\u30C9\u8A2D\u5B9A\u5B8C\u4E86</h1>
    <p class="text-sm text-gray-500 mb-4">\u30ED\u30B0\u30A4\u30F3\u753B\u9762\u304B\u3089\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
    <a href="${ADMIN_PATH}/login" class="inline-block w-full bg-blue-600 text-white rounded py-2 text-sm text-center">\u30ED\u30B0\u30A4\u30F3\u753B\u9762\u3078</a>
  </div></body></html>`);
});
app.get("/", async (c) => {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const [empStats, unrespondedEvents, overdueInterviews, lastLogin] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN entry_type = '\u65B0\u5352' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN entry_type != '\u65B0\u5352' THEN 1 ELSE 0 END) AS career_count
      FROM employees WHERE is_active = 1
    `).first(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM bad_events WHERE (admin_memo IS NULL OR admin_memo = '')").first(),
    c.env.DB.prepare(`
      SELECT COUNT(DISTINCT emp_id) as cnt FROM interview_records
      WHERE next_interview_date < ? AND next_interview_date != ''
        AND emp_id NOT IN (
          SELECT emp_id FROM interview_records WHERE interview_date >= ?
        )
    `).bind(today, today).first(),
    c.env.DB.prepare("SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 5").all()
  ]);
  const empCount = { cnt: empStats?.total ?? 0 };
  const newCount = { cnt: empStats?.new_count ?? 0 };
  const careerCount = { cnt: empStats?.career_count ?? 0 };
  const recentEvents = await c.env.DB.prepare(`
    SELECT b.id, b.category, b.content, b.admin_memo, b.created_at, e.name
    FROM bad_events b
    JOIN employees e ON b.emp_id = e.id
    ORDER BY b.created_at DESC LIMIT 8
  `).all();
  const overdueList = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.emp_no, e.division, e.team,
      ir.next_interview_date,
      MAX(ir.interview_date) as last_interview
    FROM interview_records ir
    JOIN employees e ON ir.emp_id = e.id
    WHERE ir.next_interview_date < ? AND ir.next_interview_date != ''
      AND ir.emp_id NOT IN (
        SELECT emp_id FROM interview_records WHERE interview_date >= ?
      )
    GROUP BY ir.emp_id
    ORDER BY ir.next_interview_date
    LIMIT 8
  `).bind(today, today).all();
  const CAT_COLOR = {
    "\u30AF\u30EC\u30FC\u30DE\u30FC": "#fecaca",
    "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB": "#fed7aa",
    "\u793E\u5185\u306E\u51FA\u6765\u4E8B": "#e9d5ff",
    "\u305D\u306E\u4ED6": "#e5e7eb"
  };
  const statCards = [
    { label: "\u5728\u7C4D\u65B0\u4EBA\u6570", value: empCount?.cnt ?? 0, sub: `\u65B0\u5352 ${newCount?.cnt ?? 0}\u540D / \u305D\u306E\u4ED6 ${careerCount?.cnt ?? 0}\u540D`, color: "#1a3a5c" },
    { label: "\u672A\u5BFE\u5FDC\u306E\u5831\u544A", value: unrespondedEvents?.cnt ?? 0, sub: "\u5ACC\u306A\u3053\u3068\u5831\u544A\uFF08\u7BA1\u7406\u8005\u30E1\u30E2\u306A\u3057\uFF09", color: (unrespondedEvents?.cnt ?? 0) > 0 ? "#b91c1c" : "#374151" },
    { label: "\u9762\u8AC7\u671F\u9650\u8D85\u904E", value: overdueInterviews?.cnt ?? 0, sub: "\u6B21\u56DE\u4E88\u5B9A\u65E5\u3092\u904E\u304E\u305F\u793E\u54E1", color: (overdueInterviews?.cnt ?? 0) > 0 ? "#b45309" : "#374151" }
  ].map((s) => `
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;display:flex;flex-direction:column;gap:6px;">
      <div style="font-size:12px;color:#6b7280;font-weight:500;letter-spacing:0.03em;">${escHtml(s.label)}</div>
      <div style="font-size:32px;font-weight:800;color:${s.color};line-height:1;">${s.value}</div>
      <div style="font-size:11px;color:#9ca3af;">${escHtml(s.sub)}</div>
    </div>`).join("");
  const eventRows = (recentEvents.results ?? []).length === 0 ? '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">\u5831\u544A\u306F\u3042\u308A\u307E\u305B\u3093</div>' : (recentEvents.results ?? []).map((e) => `
      <a href="${ADMIN_PATH}/events/${e.id}" style="display:block;padding:10px 16px;border-bottom:1px solid #f3f4f6;text-decoration:none;transition:background 0.1s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
          <span style="background:${CAT_COLOR[e.category] ?? "#e5e7eb"};padding:1px 7px;border-radius:3px;font-size:11px;color:#374151;white-space:nowrap;">${escHtml(e.category)}</span>
          <span style="font-size:13px;font-weight:600;color:#1e293b;">${escHtml(e.name)}</span>
          ${!e.admin_memo ? '<span style="margin-left:auto;font-size:10px;background:#fef2f2;color:#b91c1c;padding:1px 5px;border-radius:3px;white-space:nowrap;">\u672A\u5BFE\u5FDC</span>' : ""}
          <span style="font-size:11px;color:#9ca3af;${!e.admin_memo ? "" : "margin-left:auto;"}">${escHtml(e.created_at.slice(0, 10))}</span>
        </div>
        <div style="font-size:12px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(e.content)}</div>
      </a>`).join("");
  const overdueRows = (overdueList.results ?? []).length === 0 ? '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">\u671F\u9650\u8D85\u904E\u306A\u3057</div>' : (overdueList.results ?? []).map((e) => {
    const overDays = Math.floor((new Date(today).getTime() - new Date(e.next_interview_date).getTime()) / 864e5);
    return `
      <a href="${ADMIN_PATH}/interviews/${e.id}" style="display:block;padding:10px 16px;border-bottom:1px solid #f3f4f6;text-decoration:none;transition:background 0.1s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#1e293b;">${escHtml(e.name)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:1px;">${e.division ?? ""}\u8AB2 ${e.team ?? ""}\u73ED</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#b45309;">\u4E88\u5B9A: ${escHtml(e.next_interview_date)}</div>
            <div style="font-size:11px;font-weight:700;color:#b91c1c;">${overDays}\u65E5\u8D85\u904E</div>
          </div>
        </div>
      </a>`;
  }).join("");
  const loginRows = (lastLogin?.results ?? []).map((l) => {
    const loc = [l.city, l.country].filter(Boolean).join(" / ");
    const coords = l.latitude && l.longitude ? `<a href="https://www.google.com/maps?q=${l.latitude},${l.longitude}" target="_blank" style="color:#2563eb;font-size:10px;margin-left:4px;">\u5730\u56F3</a>` : "";
    return `
      <div style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <span style="font-weight:600;color:#374151;font-family:monospace;">${escHtml(l.ip ?? "\u4E0D\u660E")}</span>
          <span style="color:#9ca3af;margin-left:8px;">${escHtml(loc || "\u2014")}${coords}</span>
        </div>
        <span style="color:#9ca3af;white-space:nowrap;">${escHtml(l.logged_at?.slice(0, 16) ?? "")}</span>
      </div>`;
  }).join("") || '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">\u30ED\u30B0\u30A4\u30F3\u8A18\u9332\u306A\u3057</div>';
  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">

  <!-- \u30B5\u30DE\u30EA\u30FC\u30AB\u30FC\u30C9 -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px;">
    ${statCards}
  </div>

  <!-- \u30E1\u30A4\u30F3\u30B3\u30F3\u30C6\u30F3\u30C4\uFF082\u30AB\u30E9\u30E0\uFF09 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

    <!-- \u5ACC\u306A\u3053\u3068\u5831\u544A -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">\u5ACC\u306A\u3053\u3068\u5831\u544A\uFF08\u6700\u65B0\uFF09</span>
        <a href="${ADMIN_PATH}/events" style="font-size:12px;color:#2563eb;text-decoration:none;">\u3059\u3079\u3066\u898B\u308B</a>
      </div>
      ${eventRows}
    </div>

    <!-- \u9762\u8AC7\u671F\u9650\u8D85\u904E -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 16px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">\u9762\u8AC7\u671F\u9650\u8D85\u904E</span>
        <a href="${ADMIN_PATH}/interviews" style="font-size:12px;color:#2563eb;text-decoration:none;">\u9762\u8AC7\u4E00\u89A7\u3078</a>
      </div>
      ${overdueRows}
    </div>
  </div>

  <!-- \u30ED\u30B0\u30A4\u30F3\u5C65\u6B74 -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;font-weight:700;color:#1e293b;">\u6700\u8FD1\u306E\u30ED\u30B0\u30A4\u30F3</span>
      <a href="${ADMIN_PATH}/login-logs" style="font-size:12px;color:#2563eb;text-decoration:none;">\u3059\u3079\u3066\u898B\u308B</a>
    </div>
    ${loginRows}
  </div>

</div>`;
  return c.html(layout("\u30DB\u30FC\u30E0", content, "home"));
});
app.get("/login-logs", async (c) => {
  const logs = await c.env.DB.prepare(
    "SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 200"
  ).all();
  const rows = (logs.results ?? []).map((l) => {
    const loc = [l.city, l.country].filter(Boolean).join(" / ") || "\u4E0D\u660E";
    const coords = l.latitude && l.longitude ? `<a href="https://www.google.com/maps?q=${l.latitude},${l.longitude}" target="_blank" style="color:#2563eb;">\u{1F4CD}\u5730\u56F3</a>` : "\u2014";
    return `<tr class="hover:bg-gray-50">
      <td class="px-3 py-2 text-sm font-mono text-gray-700 border-b">${escHtml(l.ip ?? "\u2014")}</td>
      <td class="px-3 py-2 text-sm text-gray-600 border-b">${escHtml(loc)}</td>
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${escHtml(l.timezone ?? "\u2014")}</td>
      <td class="px-3 py-2 text-xs border-b">${coords}</td>
      <td class="px-3 py-2 text-xs text-gray-400 border-b" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.user_agent ?? "")}">${escHtml((l.user_agent ?? "").slice(0, 40))}</td>
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${escHtml(l.logged_at?.slice(0, 16) ?? "")}</td>
    </tr>`;
  }).join("");
  const content = `
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">IP\u30A2\u30C9\u30EC\u30B9</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u5834\u6240</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u30BF\u30A4\u30E0\u30BE\u30FC\u30F3</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u5EA7\u6A19</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u30D6\u30E9\u30A6\u30B6</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u65E5\u6642</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">\u8A18\u9332\u306A\u3057</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout("\u30ED\u30B0\u30A4\u30F3\u5C65\u6B74", content, "home"));
});
app.get("/shift", async (c) => {
  const now = /* @__PURE__ */ new Date();
  const year = parseInt(c.req.query("year") ?? String(now.getFullYear()));
  const month = parseInt(c.req.query("month") ?? String(now.getMonth() + 1));
  const mode = c.req.query("mode") ?? "training";
  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { dates } = getShiftDisplayRange(year, month, periodCfg);
  const empQuery = mode === "completed" ? "SELECT * FROM employees WHERE is_active = 1 AND status = 'completed' ORDER BY entry_type DESC, seq_no, id" : "SELECT * FROM employees WHERE is_active = 1 AND (status IS NULL OR status != 'completed') ORDER BY entry_type DESC, seq_no, id";
  const [employeesRes, shiftsRes, instructorsRes, instSchedulesRes, scheduleTypesRes, coachesRes] = await Promise.all([
    c.env.DB.prepare(empQuery).all(),
    c.env.DB.prepare(
      "SELECT emp_id, date, entry_am, entry_pm, coach_id FROM shift_entries WHERE date >= ? AND date <= ?"
    ).bind(dates[0], dates[dates.length - 1]).all(),
    c.env.DB.prepare(
      "SELECT * FROM instructors WHERE is_active = 1 ORDER BY sort_order"
    ).all(),
    c.env.DB.prepare(
      "SELECT * FROM instructor_schedules WHERE date >= ? AND date <= ?"
    ).bind(dates[0], dates[dates.length - 1]).all(),
    c.env.DB.prepare("SELECT * FROM schedule_types WHERE is_active = 1 ORDER BY sort_order").all(),
    c.env.DB.prepare("SELECT * FROM coaches WHERE is_active = 1 ORDER BY sort_order, id").all()
  ]);
  const shiftMap = {};
  for (const s of shiftsRes.results ?? []) {
    shiftMap[`${s.emp_id}_${s.date}`] = s;
  }
  const instSchedMap = {};
  for (const s of instSchedulesRes.results ?? []) {
    instSchedMap[`${s.instructor_id}_${s.date}`] = s;
  }
  const content = shiftPage(
    employeesRes.results ?? [],
    shiftMap,
    instructorsRes.results ?? [],
    instSchedMap,
    dates,
    year,
    month,
    periodStart,
    periodEnd,
    scheduleTypesRes?.results ?? [],
    coachesRes?.results ?? [],
    mode
  );
  return c.html(layout(`\u30B7\u30D5\u30C8\u7BA1\u7406 \u2014 ${year}\u5E74${month}\u6708\u5EA6`, content, "shift"));
});
app.get("/newcomers", (c) => {
  const ADMIN = ADMIN_PATH;
  const items = [
    { href: `${ADMIN}/employees`, title: "\u65B0\u4EBA\u30EA\u30B9\u30C8", desc: "\u5728\u7C4D\u65B0\u4EBA\u306E\u767B\u9332\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u9762\u8AC7\u30D5\u30E9\u30B0\u7BA1\u7406" },
    { href: `${ADMIN}/info`, title: "\u65B0\u5352Info", desc: "\u65B0\u5352\u793E\u54E1\u306E\u500B\u4EBA\u60C5\u5831\u30FB\u8DA3\u5473\u30FB\u30E1\u30F3\u30BF\u30EB\u72B6\u614B" },
    { href: `${ADMIN}/followup`, title: "\u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8", desc: "\u8981\u30D5\u30A9\u30ED\u30FC\u793E\u54E1\u306E\u4E00\u89A7\u78BA\u8A8D" },
    { href: `${ADMIN}/interviews`, title: "\u9762\u8AC7\u7BA1\u7406", desc: "\u9762\u8AC7\u8A18\u9332\u30FB\u6B21\u56DE\u9762\u8AC7\u4E88\u5B9A\u65E5\u306E\u7BA1\u7406" },
    { href: `${ADMIN}/sales`, title: "\u58F2\u4E0A\u7BA1\u7406", desc: "\u6708\u6B21\u55B6\u696D\u53CE\u5165\u30FB\u4E57\u8ECA\u56DE\u6570\u30FB\u8D70\u884C\u8DDD\u96E2\u306E\u96C6\u8A08" }
  ];
  const cards = items.map((item) => `
    <a href="${item.href}" style="display:flex;align-items:center;gap:16px;background:white;border-radius:12px;padding:20px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-decoration:none;color:inherit;border:1px solid #e5e7eb;transition:box-shadow 0.15s;"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:3px;">${item.title}</div>
        <div style="font-size:12px;color:#6b7280;">${item.desc}</div>
      </div>
      <div style="color:#9ca3af;font-size:20px;flex-shrink:0;">\u203A</div>
    </a>`).join("");
  const html = `
    <div style="max-width:560px;">
      <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">\u7DCF\u5408\u65B0\u4EBA\u7BA1\u7406</h2>
      <p style="font-size:13px;color:#6b7280;margin-bottom:20px;">\u65B0\u4EBA\u306B\u95A2\u3059\u308B\u5404\u6A5F\u80FD\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u306F\u3053\u3061\u3089\u304B\u3089\u3002</p>
      <div style="display:flex;flex-direction:column;gap:12px;">${cards}</div>
    </div>`;
  return c.html(layout("\u7DCF\u5408\u65B0\u4EBA\u7BA1\u7406", html, "newcomers"));
});
app.get("/shift/export", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.text("\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3", 400);
  const periodCfgExp = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfgExp);
  const { dates } = getShiftDisplayRange(year, month, periodCfgExp);
  const [employeesRes, shiftsRes, coachesRes2] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM employees WHERE is_active = 1 ORDER BY entry_type DESC, seq_no, id").all(),
    c.env.DB.prepare("SELECT emp_id, date, entry_am, entry_pm, coach_id FROM shift_entries WHERE date >= ? AND date <= ?").bind(dates[0], dates[dates.length - 1]).all(),
    c.env.DB.prepare("SELECT id, name FROM coaches WHERE is_active = 1").all()
  ]);
  const employees = employeesRes;
  const coachNameMap2 = {};
  for (const c2 of coachesRes2.results ?? [])
    coachNameMap2[c2.id] = c2.name;
  const shiftMap = {};
  for (const s of shiftsRes.results ?? []) {
    shiftMap[`${s.emp_id}_${s.date}`] = s;
  }
  const csvField = /* @__PURE__ */ __name((v) => '"' + (v ?? "").replace(/"/g, '""') + '"', "csvField");
  const WEEKDAY = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  const header = [
    "NO",
    "\u8AB2",
    "\u73ED",
    "\u793E\u54E1\u756A\u53F7",
    "\u6C0F\u540D",
    "\u533A\u5206",
    ...dates.flatMap((d) => {
      const dt = new Date(d);
      const dow = WEEKDAY[dt.getUTCDay()];
      return [`${d}(${dow})_\u5348\u524D`, `${d}(${dow})_\u5348\u5F8C`, `${d}(${dow})_\u7814\u4FEE\u62C5\u5F53`];
    })
  ].join(",");
  const body = (employees.results ?? []).map((e) => {
    const cells = dates.flatMap((d) => {
      const s = shiftMap[`${e.id}_${d}`];
      const coach = s?.coach_id ? coachNameMap2[s.coach_id] ?? "" : "";
      return [csvField(s?.entry_am), csvField(s?.entry_pm), csvField(coach)];
    });
    return [e.seq_no ?? "", e.division ?? "", e.team ?? "", csvField(e.emp_no), csvField(e.name), csvField(e.entry_type), ...cells].join(",");
  }).join("\n");
  const csv = `\uFEFF${header}
${body}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shift_${year}_${month}.csv"`
    }
  });
});
app.get("/shift/print/:empId", async (c) => {
  const empId = parseInt(c.req.param("empId"));
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(empId).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const periodCfgPrint = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfgPrint);
  const [shifts, sales, scheduleTypesRes] = await Promise.all([
    c.env.DB.prepare(
      "SELECT date, entry_am, entry_pm FROM shift_entries WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date"
    ).bind(empId, periodStart, periodEnd).all(),
    c.env.DB.prepare(
      "SELECT date, amount FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date"
    ).bind(empId, periodStart, periodEnd).all(),
    c.env.DB.prepare("SELECT code, color FROM schedule_types WHERE is_active = 1").all()
  ]);
  const shiftByDate = {};
  for (const s of shifts.results ?? [])
    shiftByDate[s.date] = { main: s.entry_am ?? "", sub: s.entry_pm ?? "" };
  const salesByDate = {};
  for (const s of sales.results ?? [])
    salesByDate[s.date] = s.amount;
  const colorMap = {};
  for (const t of scheduleTypesRes.results ?? [])
    colorMap[t.code] = t.color;
  const dates = [];
  const cur = new Date(periodStart);
  const endDate = new Date(periodEnd);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  const WEEKDAY = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  const half = Math.ceil(dates.length / 2);
  const leftDates = dates.slice(0, half);
  const rightDates = dates.slice(half);
  let workDays = 0;
  let cumulative = 0;
  function renderRow(d, showSales) {
    const dt = new Date(d);
    const day = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = false;
    const dayColor = dow === 0 ? "color:#dc2626;" : dow === 6 ? "color:#2563eb;" : "";
    const bgRow = isWeekend ? "background:#fafafa;" : "";
    const shift = shiftByDate[d] ?? { main: "", sub: "" };
    const entryAm = shift.main;
    const entryPm = shift.sub;
    const displayEntry = entryAm || entryPm ? `${entryAm ? `<span style="font-size:9px;color:#059669;font-weight:700;">\u5348\u524D</span>${escHtml(entryAm)}` : ""}${entryPm ? `${entryAm ? "<br>" : ""}<span style="font-size:9px;color:#d97706;font-weight:700;">\u5348\u5F8C</span>${escHtml(entryPm)}` : ""}` : "";
    const entryColor = colorMap[entryAm] ?? (entryAm ? "#fff7ed" : "#ffffff");
    const amount = salesByDate[d];
    if (entryAm && entryAm !== "\u516C\u4F11" && entryAm !== "\u4F11")
      workDays++;
    if (amount)
      cumulative += amount;
    const amountStr = amount ? amount.toLocaleString("ja-JP") : "";
    const cumulStr = amount ? cumulative.toLocaleString("ja-JP") : "";
    return `<tr style="${bgRow}">
      <td style="width:28px;text-align:center;padding:3px 4px;border:1px solid #9ca3af;font-size:12px;font-weight:600;${dayColor}">${String(day).padStart(2, "0")}</td>
      <td style="width:22px;text-align:center;padding:3px 2px;border:1px solid #9ca3af;font-size:12px;${dayColor}">${WEEKDAY[dow]}</td>
      <td style="width:60px;text-align:center;padding:3px 4px;border:1px solid #9ca3af;font-size:11px;background:${entryColor};">${displayEntry}</td>
      ${showSales ? `<td style="width:70px;text-align:right;padding:3px 6px;border:1px solid #9ca3af;font-size:11px;">${amountStr}</td>
      <td style="width:70px;text-align:right;padding:3px 6px;border:1px solid #9ca3af;font-size:11px;">${cumulStr}</td>` : ""}
    </tr>`;
  }
  __name(renderRow, "renderRow");
  const colHeader = /* @__PURE__ */ __name((showSales) => `<tr style="background:#1a3a5c;color:white;">
    <th style="padding:4px 2px;border:1px solid #9ca3af;font-size:11px;text-align:center;">\u65E5\u4ED8</th>
    <th style="padding:4px 2px;border:1px solid #9ca3af;font-size:11px;text-align:center;">\u66DC\u65E5</th>
    <th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">\u52E4\u52D9</th>
    ${showSales ? `<th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">\u55B6\u696D\u53CE\u5165</th>
    <th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">\u7D2F\u8A08</th>` : ""}
  </tr>`, "colHeader");
  const hasSales = Object.keys(salesByDate).length > 0;
  const leftRows = leftDates.map((d) => renderRow(d, hasSales)).join("");
  const rightRows = rightDates.map((d) => renderRow(d, hasSales)).join("");
  const maxRows = Math.max(leftDates.length, rightDates.length);
  const rightPadding = Array(maxRows - rightDates.length).fill(
    `<tr><td colspan="${hasSales ? 5 : 3}" style="border:1px solid #9ca3af;padding:5px;"></td></tr>`
  ).join("");
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex">
  <title>${escHtml(emp.name)} \u52E4\u52D9\u4E88\u5B9A\u8868</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'MS Gothic', 'Meiryo', sans-serif; background: white; padding: 16px; font-size: 12px; }
    .print-btn { margin-bottom: 12px; padding: 8px 20px; background: #1a3a5c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .sheet-title { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 0.3em; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 6px; }
    .sheet-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 12px; flex-wrap: wrap; gap: 4px; }
    .emp-info { font-size: 13px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 2px solid #374151; }
    .col { border-collapse: collapse; width: 100%; }
    .col td, .col th { border: 1px solid #9ca3af; }
    .col-divider { border-right: 2px solid #374151; }
    .footer { margin-top: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .work-count { font-size: 13px; font-weight: 600; border: 1px solid #9ca3af; padding: 6px 14px; }
    .notes-box { flex: 1; border: 1px solid #374151; padding: 8px 10px; min-height: 48px; font-size: 12px; }
    .notes-title { font-size: 11px; font-weight: 700; border-bottom: 1px solid #374151; margin-bottom: 4px; padding-bottom: 2px; }
    @media print {
      .print-btn { display: none; }
      body { padding: 8px; }
      @page { margin: 8mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">\u{1F5A8}\uFE0F \u5370\u5237 / PDF\u4FDD\u5B58</button>
  <div class="sheet">
    <div class="sheet-title">\u52E4 \u52D9 \u4E88 \u5B9A \u8868</div>
    <div class="sheet-header">
      <div>${year}\u5E74${month < 10 ? "0" : ""}${month}\u6708\u5EA6\uFF08${periodStart} \u301C ${periodEnd}\uFF09</div>
      <div class="emp-info">${emp.division ?? ""}\u8AB2 ${emp.team ?? ""}\u73ED &nbsp; ${escHtml(emp.emp_no)} &nbsp; ${escHtml(emp.name)} \u69D8</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;border:2px solid #374151;">
      <table style="border-collapse:collapse;width:100%;border-right:2px solid #374151;">
        <thead>${colHeader(hasSales)}</thead>
        <tbody>${leftRows}</tbody>
      </table>
      <table style="border-collapse:collapse;width:100%;">
        <thead>${colHeader(hasSales)}</thead>
        <tbody>${rightRows}${rightPadding}</tbody>
      </table>
    </div>
    <div class="footer">
      <div class="notes-box">
        <div class="notes-title">\u9023\u7D61\u4E8B\u9805</div>
      </div>
      <div class="work-count">\u52E4\u52D9\u6570\uFF1A${workDays} \u65E5</div>
    </div>
  </div>
</body>
</html>`;
  return c.html(html);
});
app.get("/settings", (c) => {
  const ADMIN = ADMIN_PATH;
  const adminLoginUrl = `https://bentenclub.com${ADMIN}/login`;
  const cards = [
    { href: `${ADMIN}/announcements`, title: "\u304A\u77E5\u3089\u305B\u914D\u4FE1", desc: "LINE\u3067\u4E00\u6589\u9001\u4FE1\u30FB\u914D\u4FE1\u5C65\u6B74\u306E\u78BA\u8A8D" },
    { href: `${ADMIN}/line`, title: "LINE\u7BA1\u7406", desc: "\u62DB\u5F85\u30B3\u30FC\u30C9\u767A\u884C\u30FB\u30E6\u30FC\u30B6\u30FC\u7D10\u4ED8\u3051\u72B6\u6CC1" },
    { href: `${ADMIN}/settings/schedule-types`, title: "\u30B7\u30D5\u30C8\u533A\u5206", desc: "\u30D7\u30EA\u30BB\u30C3\u30C8\u30DC\u30BF\u30F3\u306E\u533A\u5206\u540D\u30FB\u8272\u30FB\u76EE\u6A19\u56DE\u6570" },
    { href: `${ADMIN}/settings/coaches`, title: "\u7814\u4FEE\u62C5\u5F53", desc: "\u30B7\u30D5\u30C8\u8868\u306E\u7814\u4FEE\u62C5\u5F53\u8005\uFF08\u30B3\u30FC\u30C1\uFF09\u4E00\u89A7" },
    { href: `${ADMIN}/settings/instructors`, title: "\u73ED\u9577\u30FB\u6307\u5C0E\u8005", desc: "\u30B7\u30D5\u30C8\u8868\u4E0B\u90E8\u306E\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u4E00\u89A7\u3068LINE\u9023\u643A" },
    { href: `${ADMIN}/settings/periods`, title: "\u6708\u5EA6\u8A2D\u5B9A", desc: "\u5404\u6708\u5EA6\u306E\u958B\u59CB\u65E5\u30FB\u7DE0\u3081\u65E5\u306E\u8A2D\u5B9A" },
    { href: `${ADMIN}/settings/notifications`, title: "LINE\u901A\u77E5\u8A2D\u5B9A", desc: "\u73ED\u9577\u5411\u3051\u5B9A\u6642\u901A\u77E5\u306E\u9001\u4FE1\u6642\u523B\u30FB\u6709\u52B9/\u7121\u52B9\u8A2D\u5B9A" },
    { href: `${ADMIN}/settings/offices`, title: "\u55B6\u696D\u6240", desc: "\u5404\u55B6\u696D\u6240\u306E\u96FB\u8A71\u756A\u53F7\u30FB\u4F4F\u6240\u306E\u7BA1\u7406" },
    { href: `${ADMIN}/settings/vehicle-admins`, title: "\u8ECA\u756A\u691C\u7D22\u7BA1\u7406\u8005\u4E00\u89A7", desc: "LINE\u8ECA\u756A\u9023\u643A\u6E08\u307F\u30E6\u30FC\u30B6\u30FC\u306E\u78BA\u8A8D\u30FB\u5F37\u5236\u89E3\u9664" },
    { href: `${ADMIN}/settings/vehicle-search-guide`, title: "\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9", desc: "\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051LINE\u8ECA\u756A\u691C\u7D22\u306E\u4F7F\u3044\u65B9\u30DA\u30FC\u30B8\uFF08\u914D\u5E03\u7528\uFF09" },
    { href: `${ADMIN}/settings/tutorial`, title: "\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB", desc: "\u30B7\u30B9\u30C6\u30E0\u306E\u4F7F\u3044\u65B9\u30AC\u30A4\u30C9\uFF08\u5370\u5237\u30FBPDF\u51FA\u529B\u5BFE\u5FDC\uFF09" }
  ];
  const html = `
    <div style="max-width:560px;">
      <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:20px;">\u8A2D\u5B9A</h2>

      <!-- QR\u30B3\u30FC\u30C9 -->
      <div style="background:white;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">\u7BA1\u7406\u753B\u9762 \u30A2\u30AF\u30BB\u30B9QR\u30B3\u30FC\u30C9</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">\u3053\u306EQR\u30B3\u30FC\u30C9\u3092\u30B9\u30AD\u30E3\u30F3\u3059\u308B\u3068\u7BA1\u7406\u753B\u9762\u306E\u30ED\u30B0\u30A4\u30F3\u30DA\u30FC\u30B8\u304C\u958B\u304D\u307E\u3059</div>
        <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px;display:inline-block;line-height:0;">
            <div id="qr-container"></div>
          </div>
          <div style="flex:1;min-width:160px;">
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">\u30A2\u30AF\u30BB\u30B9\u5148URL</div>
            <div style="font-size:11px;color:#374151;word-break:break-all;background:#f3f4f6;padding:6px 8px;border-radius:4px;font-family:monospace;">${escHtml(adminLoginUrl)}</div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
              <button onclick="downloadQR()" style="padding:6px 14px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">\u4FDD\u5B58</button>
              <button onclick="copyUrl()" style="padding:6px 14px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;" id="copy-btn">URL\u30B3\u30D4\u30FC</button>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${cards.map((card) => `
          <a href="${card.href}" style="display:flex;align-items:center;gap:16px;background:white;border-radius:12px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-decoration:none;color:inherit;border:1px solid #e5e7eb;transition:box-shadow 0.15s;"
            onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">
            <div>
              <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:3px;">${card.title}</div>
              <div style="font-size:12px;color:#6b7280;">${card.desc}</div>
            </div>
            <div style="margin-left:auto;color:#9ca3af;font-size:18px;">\u203A</div>
          </a>`).join("")}
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
    <script>
      var QR_URL = ${JSON.stringify(adminLoginUrl)};
      var qrObj = new QRCode(document.getElementById('qr-container'), {
        text: QR_URL,
        width: 160,
        height: 160,
        colorDark: '#1e3a5f',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      function downloadQR() {
        var canvas = document.querySelector('#qr-container canvas');
        if (canvas) {
          var link = document.createElement('a');
          link.download = '\u7BA1\u7406\u753B\u9762QR\u30B3\u30FC\u30C9.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      }
      function copyUrl() {
        navigator.clipboard.writeText(QR_URL).then(function() {
          var btn = document.getElementById('copy-btn');
          btn.textContent = '\u30B3\u30D4\u30FC\u6E08';
          setTimeout(function() { btn.textContent = 'URL\u30B3\u30D4\u30FC'; }, 2000);
        });
      }
    <\/script>`;
  return c.html(layout("\u8A2D\u5B9A", html, "settings"));
});
function settingsSubHeader(title) {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">\u2190 \u8A2D\u5B9A\u306B\u623B\u308B</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}
__name(settingsSubHeader, "settingsSubHeader");
app.get("/settings/schedule-types", async (c) => {
  const typesRes = await c.env.DB.prepare("SELECT * FROM schedule_types ORDER BY sort_order, id").all();
  const rows = (typesRes.results ?? []).map((t) => `
    <tr id="row-${t.id}" data-changed="false" style="opacity:${t.is_active ? "1" : "0.45"};">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(t.code)}" id="code-${t.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:90px;" oninput="markChanged(${t.id})">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" value="${escHtml(t.color)}" id="color-${t.id}" style="width:36px;height:28px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;" oninput="markChanged(${t.id})">
          <span id="preview-${t.id}" style="background:${escHtml(t.color)};padding:2px 10px;border-radius:4px;border:1px solid #d1d5db;font-size:13px;">${escHtml(t.code)}</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${t.sort_order}" id="sort-${t.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;" oninput="markChanged(${t.id})">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" value="${t.target ?? ""}" id="target-${t.id}" min="1" max="999" placeholder="\u2014"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:58px;" oninput="markChanged(${t.id})">
          <span style="font-size:11px;color:#9ca3af;">\u56DE</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <span id="changed-${t.id}" style="display:none;font-size:11px;color:#d97706;font-weight:600;">\u672A\u4FDD\u5B58</span>
          <button onclick="toggleType(${t.id},${t.is_active})" style="padding:4px 8px;background:${t.is_active ? "#f3f4f6" : "#bbf7d0"};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${t.is_active ? "\u975E\u8868\u793A" : "\u8868\u793A"}
          </button>
          <button onclick="deleteType(${t.id},'${escHtml(t.code)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`).join("");
  const html = settingsSubHeader("\u30B7\u30D5\u30C8\u533A\u5206\u306E\u8A2D\u5B9A") + `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
      <p class="text-sm text-gray-500 mb-4">\u30D7\u30EA\u30BB\u30C3\u30C8\u30DC\u30BF\u30F3\u3068\u51E1\u4F8B\u306B\u4F7F\u308F\u308C\u307E\u3059\u3002<strong>\u76EE\u6A19\u56DE\u6570</strong>\u3092\u8A2D\u5B9A\u3059\u308B\u3068\u30B7\u30D5\u30C8\u8868\u306E\u96C6\u8A08\u3067\u9054\u6210\u72B6\u6CC1\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u533A\u5206\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u8272</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u76EE\u6A19\u56DE\u6570</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-bottom:16px;">
        <button onclick="saveAll()" id="save-all-btn" style="padding:9px 24px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">\u5909\u66F4\u3092\u4E00\u62EC\u4FDD\u5B58</button>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">\u65B0\u3057\u3044\u533A\u5206\u3092\u8FFD\u52A0</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-code" placeholder="\u533A\u5206\u540D\uFF08\u4F8B: \u5B9F\u5730\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:130px;">
          <input type="color" id="new-color" value="#e0f2fe"
            style="width:40px;height:34px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">
          <input type="number" id="new-sort" value="99" min="0" max="99"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;width:60px;">
          <button onclick="addType()" style="padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    var _changed = new Set();
    function markChanged(id) {
      _changed.add(id);
      var el = document.getElementById('changed-' + id);
      if (el) el.style.display = 'inline';
      // \u30AB\u30E9\u30FC\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u66F4\u65B0
      var colorEl = document.getElementById('color-' + id);
      var codeEl  = document.getElementById('code-' + id);
      var prev    = document.getElementById('preview-' + id);
      if (prev && colorEl && codeEl) { prev.style.background = colorEl.value; prev.textContent = codeEl.value; }
    }
    async function saveAll() {
      var btn = document.getElementById('save-all-btn');
      btn.disabled = true; btn.textContent = '\u4FDD\u5B58\u4E2D...';
      var ids = Array.from(document.querySelectorAll('tr[id^="row-"]')).map(function(r) { return parseInt(r.id.replace('row-','')); });
      var errors = [];
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var code = document.getElementById('code-' + id).value.trim();
        var color = document.getElementById('color-' + id).value;
        var sort_order = parseInt(document.getElementById('sort-' + id).value) || 0;
        var targetEl = document.getElementById('target-' + id); var target = targetEl.value ? parseInt(targetEl.value) : null;
        if (!code) { errors.push(id + '\u884C\u76EE: \u533A\u5206\u540D\u304C\u7A7A\u3067\u3059'); continue; }
        var res = await fetch('/api/schedule-types/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code,color,sort_order,target}) });
        if (!res.ok) errors.push(code + ' \u306E\u4FDD\u5B58\u306B\u5931\u6557');
        else { var el = document.getElementById('changed-' + id); if (el) el.style.display = 'none'; }
      }
      btn.disabled = false; btn.textContent = '\u5909\u66F4\u3092\u4E00\u62EC\u4FDD\u5B58';
      if (errors.length) alert('\u30A8\u30E9\u30FC:\\n' + errors.join('\\n'));
      else { btn.textContent = '\u2713 \u4FDD\u5B58\u5B8C\u4E86'; setTimeout(function(){ btn.textContent = '\u5909\u66F4\u3092\u4E00\u62EC\u4FDD\u5B58'; }, 2000); }
    }
    async function toggleType(id, current) {
      await fetch('/api/schedule-types/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active: current?0:1}) });
      location.reload();
    }
    async function deleteType(id, name) {
      if (!confirm('\u300C' + name + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/schedule-types/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addType() {
      var code = document.getElementById('new-code').value.trim();
      var color = document.getElementById('new-color').value;
      var sort_order = parseInt(document.getElementById('new-sort').value) || 99;
      if (!code) { alert('\u533A\u5206\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      var res = await fetch('/api/schedule-types', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code,color,sort_order}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>`;
  return c.html(layout("\u30B7\u30D5\u30C8\u533A\u5206\u8A2D\u5B9A", html, "settings"));
});
app.get("/settings/coaches", async (c) => {
  const coachesRes = await c.env.DB.prepare("SELECT * FROM coaches ORDER BY sort_order, id").all();
  const coachRows = (coachesRes.results ?? []).map((c2) => `
    <tr style="opacity:${c2.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(c2.name)}" id="cname-${c2.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:150px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${c2.sort_order}" id="csort-${c2.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveCoach(${c2.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
          <button onclick="deleteCoach(${c2.id},'${escHtml(c2.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`).join("");
  const html = settingsSubHeader("\u7814\u4FEE\u62C5\u5F53\uFF08\u30B3\u30FC\u30C1\uFF09\u306E\u767B\u9332") + `
    <div class="bg-white rounded-xl shadow p-6 max-w-xl">
      <p class="text-sm text-gray-500 mb-4">\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u306E\u5404\u30BB\u30EB3\u884C\u76EE\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
        </tr></thead>
        <tbody>${coachRows || '<tr><td colspan="3" class="px-3 py-4 text-center text-sm text-gray-400 border-b">\u672A\u767B\u9332</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="new-coach-name" placeholder="\u6C0F\u540D\uFF08\u4F8B: \u5C71\u7530 \u592A\u90CE\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;flex:1;">
          <button onclick="addCoach()" style="padding:8px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    async function saveCoach(id) {
      var name = document.getElementById('cname-' + id).value.trim();
      var sort_order = parseInt(document.getElementById('csort-' + id).value) || 0;
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      var res = await fetch('/api/coaches/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,sort_order}) });
      if (res.ok) location.reload(); else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function deleteCoach(id, name) {
      if (!confirm(name + ' \u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/coaches/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addCoach() {
      var name = document.getElementById('new-coach-name').value.trim();
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      var res = await fetch('/api/coaches', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>`;
  return c.html(layout("\u7814\u4FEE\u62C5\u5F53\u8A2D\u5B9A", html, "settings"));
});
app.get("/settings/instructors", async (c) => {
  const instRes = await c.env.DB.prepare("SELECT * FROM instructors ORDER BY sort_order, id").all();
  const instRows = (instRes.results ?? []).map((inst) => {
    const linked = !!inst.line_uid;
    const lineStatus = linked ? `<span style="color:#059669;font-size:11px;font-weight:600;">\u9023\u643A\u6E08</span>
         <button onclick="unlinkLine(${inst.id},'${escHtml(inst.name)}')" style="padding:2px 6px;background:#fee2e2;color:#991b1b;border:none;border-radius:3px;font-size:11px;cursor:pointer;">\u89E3\u9664</button>` : `<span style="color:#9ca3af;font-size:11px;">\u672A\u9023\u643A</span>
         <button onclick="genCode(${inst.id})" style="padding:2px 8px;background:#dbeafe;color:#1d4ed8;border:none;border-radius:3px;font-size:11px;cursor:pointer;white-space:nowrap;">\u62DB\u5F85\u30B3\u30FC\u30C9</button>`;
    return `
    <tr style="opacity:${inst.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.name)}" id="iname-${inst.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:130px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.role ?? "")}" id="irole-${inst.id}" placeholder="\u4F8B: 4\u8AB2 \u65B0\u4EBA\u6559\u80B2"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:160px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${inst.sort_order}" id="isort-${inst.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;align-items:center;">${lineStatus}</div>
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveInst(${inst.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
          <button onclick="toggleInst(${inst.id},${inst.is_active})" style="padding:4px 8px;background:${inst.is_active ? "#f3f4f6" : "#bbf7d0"};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${inst.is_active ? "\u975E\u8868\u793A" : "\u8868\u793A"}
          </button>
          <button onclick="deleteInst(${inst.id},'${escHtml(inst.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  const html = settingsSubHeader("\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306E\u767B\u9332") + `
    <div class="bg-white rounded-xl shadow p-6 max-w-3xl">
      <p class="text-sm text-gray-500 mb-4">\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u306E\u4E0B\u90E8\u300C\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u300D\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002LINE\u9023\u643A\u3067\u5B9A\u6642\u901A\u77E5\u3092\u53D7\u3051\u53D6\u308C\u307E\u3059\u3002</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u5F79\u8077\u30FB\u5099\u8003</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">LINE\u9023\u643A</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
        </tr></thead>
        <tbody>${instRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-sm text-gray-400 border-b">\u672A\u767B\u9332</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-inst-name" placeholder="\u6C0F\u540D\uFF08\u4F8B: \u677E\u672C\u73ED\u9577\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;width:140px;">
          <input type="text" id="new-inst-role" placeholder="\u5F79\u8077\uFF08\u4F8B: 4\u8AB2 \u65B0\u4EBA\u6559\u80B2\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;width:170px;">
          <button onclick="addInst()" style="padding:8px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    async function saveInst(id) {
      var name = document.getElementById('iname-' + id).value.trim();
      var role = document.getElementById('irole-' + id).value.trim();
      var sort_order = parseInt(document.getElementById('isort-' + id).value) || 0;
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      var res = await fetch('/api/instructors/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role:role||null,sort_order}) });
      if (res.ok) location.reload(); else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function toggleInst(id, current) {
      await fetch('/api/instructors/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active:current?0:1}) });
      location.reload();
    }
    async function deleteInst(id, name) {
      if (!confirm(name + ' \u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/instructors/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addInst() {
      var name = document.getElementById('new-inst-name').value.trim();
      var role = document.getElementById('new-inst-role').value.trim();
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      var res = await fetch('/api/instructors', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role:role||null}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    async function genCode(id) {
      var res = await fetch('/api/instructor-invite', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({instructor_id:id}) });
      if (!res.ok) { alert('\u62DB\u5F85\u30B3\u30FC\u30C9\u306E\u767A\u884C\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); return; }
      var j = await res.json();
      try { await navigator.clipboard.writeText(j.code); } catch(_) {}
      alert('\u62DB\u5F85\u30B3\u30FC\u30C9: ' + j.code + '\\n\uFF08\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF09\\n\\n\u6709\u52B9\u671F\u9650: 24\u6642\u9593\\nLINE\u3067\u3053\u306E\u30B3\u30FC\u30C9\u3092\u9001\u4FE1\u3057\u3066\u3082\u3089\u3063\u3066\u304F\u3060\u3055\u3044\u3002');
    }
    async function unlinkLine(id, name) {
      if (!confirm(name + ' \u306ELINE\u9023\u643A\u3092\u89E3\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/instructor-invite/' + id, { method:'DELETE' });
      location.reload();
    }
    <\/script>`;
  return c.html(layout("\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u8A2D\u5B9A", html, "settings"));
});
app.get("/settings/periods", async (c) => {
  const periodCfg = await getPeriodSettings(c.env.DB);
  const MONTH_NAMES = ["1\u6708\u5EA6", "2\u6708\u5EA6", "3\u6708\u5EA6", "4\u6708\u5EA6", "5\u6708\u5EA6", "6\u6708\u5EA6", "7\u6708\u5EA6", "8\u6708\u5EA6", "9\u6708\u5EA6", "10\u6708\u5EA6", "11\u6708\u5EA6", "12\u6708\u5EA6"];
  const periodRows = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const cfg = periodCfg[m] ?? { close_day: 17, start_day: 18 };
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#374151;">${MONTH_NAMES[i]}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        \u524D\u6708 <input type="number" id="ps_start_${m}" value="${cfg.start_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> \u65E5\u301C
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        \u5F53\u6708 <input type="number" id="ps_close_${m}" value="${cfg.close_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> \u65E5
      </td>
    </tr>`;
  }).join("");
  const html = settingsSubHeader("\u6708\u5EA6\u8A2D\u5B9A") + `
    <div class="bg-white rounded-xl shadow p-6 max-w-xl">
      <p class="text-sm text-gray-500 mb-4">\u5404\u6708\u5EA6\u306E\u958B\u59CB\u65E5\uFF08\u524D\u6708\uFF09\u3068\u7DE0\u3081\u65E5\uFF08\u5F53\u6708\uFF09\u3092\u8A2D\u5B9A\u3057\u307E\u3059\u3002<br>\u4F8B: 6\u6708\u5EA6 = \u524D\u670818\u65E5\u301C\u5F53\u670817\u65E5</p>
      <table class="w-full mb-5">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6708\u5EA6</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u958B\u59CB\uFF08\u524D\u6708\uFF09</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u7DE0\u3081\uFF08\u5F53\u6708\uFF09</th>
        </tr></thead>
        <tbody>${periodRows}</tbody>
      </table>
      <button onclick="saveAllPeriods()" id="save-period-btn" style="padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">\u5168\u6708\u5EA6\u3092\u4E00\u62EC\u4FDD\u5B58</button>
    </div>
    <script>
    async function saveAllPeriods() {
      var btn = document.getElementById('save-period-btn');
      btn.disabled = true; btn.textContent = '\u4FDD\u5B58\u4E2D...';
      var errors = [];
      for (var m = 1; m <= 12; m++) {
        var start = parseInt(document.getElementById('ps_start_' + m).value);
        var close = parseInt(document.getElementById('ps_close_' + m).value);
        if (!start||start<1||start>31||!close||close<1||close>31) { errors.push(m + '\u6708\u5EA6: \u65E5\u4ED8\u304C\u4E0D\u6B63\u3067\u3059'); continue; }
        var res = await fetch('/api/period-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({month:m,start_day:start,close_day:close}) });
        if (!res.ok) errors.push(m + '\u6708\u5EA6\u306E\u4FDD\u5B58\u306B\u5931\u6557');
      }
      btn.disabled = false;
      if (errors.length) { btn.textContent = '\u5168\u6708\u5EA6\u3092\u4E00\u62EC\u4FDD\u5B58'; alert('\u30A8\u30E9\u30FC:\\n' + errors.join('\\n')); }
      else { btn.textContent = '\u2713 \u4FDD\u5B58\u5B8C\u4E86'; setTimeout(function(){ btn.textContent = '\u5168\u6708\u5EA6\u3092\u4E00\u62EC\u4FDD\u5B58'; }, 2500); }
    }
    <\/script>`;
  return c.html(layout("\u6708\u5EA6\u8A2D\u5B9A", html, "settings"));
});
app.get("/settings/notifications", async (c) => {
  const settingsRes = await c.env.DB.prepare("SELECT * FROM notification_settings ORDER BY type").all();
  const TYPE_LABELS = {
    morning_report: { label: "\u671D\u306E\u51FA\u52E4\u30EC\u30DD\u30FC\u30C8", desc: "\u5F53\u76F4\u30FB\u51FA\u52E4\u62C5\u5F53\u8005\u4E00\u89A7 / \u4ECA\u6708\u5EA6\u5E73\u5747\u58F2\u4E0A / \u672A\u5BFE\u5FDC\u5831\u544A\u6570" },
    bad_event_alert: { label: "\u5ACC\u306A\u3053\u3068\u5831\u544A\u30A2\u30E9\u30FC\u30C8", desc: "\u672A\u5BFE\u5FDC\u306E\u5ACC\u306A\u3053\u3068\u5831\u544A\u304C\u3042\u308B\u5834\u5408\u306E\u307F\u9001\u4FE1" }
  };
  const rows = (settingsRes.results ?? []).map((s) => {
    const info = TYPE_LABELS[s.type] ?? { label: s.type, desc: "" };
    const hh = String(s.send_hour).padStart(2, "0");
    const mm = String(s.send_minute).padStart(2, "0");
    return `
    <div style="background:white;border-radius:10px;border:1px solid #e5e7eb;padding:18px 20px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#1e3a5f;">${escHtml(info.label)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px;">${escHtml(info.desc)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:4px;">\u6700\u7D42\u9001\u4FE1: ${escHtml(s.last_sent_date ?? "\u672A\u9001\u4FE1")}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-size:13px;color:#374151;">\u9001\u4FE1\u6642\u523B</label>
          <input type="number" id="hour-${escHtml(s.type)}" value="${s.send_hour}" min="0" max="23"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:56px;text-align:center;">
          <span style="font-size:13px;">\u6642</span>
          <input type="number" id="min-${escHtml(s.type)}" value="${s.send_minute}" min="0" max="59" step="5"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:56px;text-align:center;">
          <span style="font-size:13px;">\u5206</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="enabled-${escHtml(s.type)}" ${s.is_enabled ? "checked" : ""}
              style="width:15px;height:15px;cursor:pointer;">
            \u6709\u52B9
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button data-type="${escHtml(s.type)}" onclick="saveNotif(this.dataset.type)"
          style="padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">\u4FDD\u5B58</button>
        <button data-type="${escHtml(s.type)}" onclick="sendNow(this.dataset.type)"
          style="padding:6px 16px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\u4ECA\u3059\u3050\u9001\u4FE1</button>
        <button data-type="${escHtml(s.type)}" onclick="resetSent(this.dataset.type)"
          style="padding:6px 14px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">\u9001\u4FE1\u6E08\u307F\u30EA\u30BB\u30C3\u30C8</button>
      </div>
    </div>`;
  }).join("");
  const html = settingsSubHeader("LINE\u901A\u77E5\u8A2D\u5B9A") + `
    <div style="max-width:640px;">
      <p style="font-size:13px;color:#6b7280;margin-bottom:16px;">LINE\u9023\u643A\u6E08\u307F\u306E\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5168\u54E1\u306B\u9001\u4FE1\u3055\u308C\u307E\u3059\u3002\u9023\u643A\u8005\u304C\u3044\u306A\u3044\u5834\u5408\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002</p>
      ${rows || '<p style="color:#9ca3af;font-size:13px;">\u901A\u77E5\u8A2D\u5B9A\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002migration_008.sql \u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>'}
    </div>
    <script>
    async function saveNotif(type) {
      var hour = parseInt(document.getElementById('hour-' + type).value);
      var min  = parseInt(document.getElementById('min-' + type).value);
      var enabled = document.getElementById('enabled-' + type).checked ? 1 : 0;
      if (isNaN(hour)||hour<0||hour>23||isNaN(min)||min<0||min>59) { alert('\u6642\u523B\u304C\u4E0D\u6B63\u3067\u3059'); return; }
      var res = await fetch('/api/notifications/' + type, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({send_hour:hour,send_minute:min,is_enabled:enabled}) });
      if (res.ok) { alert('\u4FDD\u5B58\u3057\u307E\u3057\u305F'); location.reload(); } else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function sendNow(type) {
      if (!confirm('\u4ECA\u3059\u3050\u9001\u4FE1\u3057\u307E\u3059\u304B\uFF1F')) return;
      var res = await fetch('/api/notifications/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type}) });
      if (res.ok) alert('\u9001\u4FE1\u3057\u307E\u3057\u305F');
      else alert('\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function resetSent(type) {
      await fetch('/api/notifications/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type}) });
      alert('\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F'); location.reload();
    }
    <\/script>`;
  return c.html(layout("LINE\u901A\u77E5\u8A2D\u5B9A", html, "settings"));
});
app.get("/settings/vehicle-search-guide", (c) => {
  const html = settingsSubHeader("\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9 \u2014 \u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051") + `
<style>
  .vg-body { max-width:680px;font-family:'Hiragino Sans','Meiryo',sans-serif;color:#1f2937;line-height:1.7; }
  .vg-cover { text-align:center;padding:40px 0 32px;border-bottom:3px solid #1e3a5f;margin-bottom:32px; }
  .vg-cover-title { font-size:26px;font-weight:900;color:#1e3a5f;letter-spacing:0.06em;margin-bottom:8px; }
  .vg-cover-sub { font-size:13px;color:#6b7280; }
  .vg-section { margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6; }
  .vg-section h3 { font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
  .vg-section h3 .num { display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:#1e3a5f;color:white;border-radius:50%;font-size:12px;font-weight:700;flex-shrink:0; }
  .vg-steps { counter-reset:step;list-style:none;padding:0;margin:10px 0; }
  .vg-steps li { counter-increment:step;display:flex;gap:10px;margin-bottom:8px;font-size:13px; }
  .vg-steps li::before { content:counter(step);display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;background:#dbeafe;color:#1e3a5f;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px; }
  .vg-note { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;margin:8px 0; }
  .vg-tip  { background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:12px;color:#166534;margin:8px 0; }
  .vg-table { width:100%;border-collapse:collapse;font-size:12px;margin:10px 0; }
  .vg-table th { background:#1e3a5f;color:white;padding:7px 12px;text-align:left;font-weight:600; }
  .vg-table td { padding:7px 12px;border-bottom:1px solid #e5e7eb; }
  .vg-table tr:last-child td { border-bottom:none; }
  .vg-mock { background:#f1f5f9;border-radius:8px;padding:14px 18px;font-size:13px;font-family:monospace;line-height:2.2;margin:10px 0;border:1px solid #e2e8f0; }
  .vg-mock .you { color:#1e3a5f;font-weight:700; }
  .vg-mock .bot { color:#374151; }
  .vg-cmd { display:inline-block;background:#1e3a5f;color:white;border-radius:4px;padding:2px 10px;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:0.05em; }
  .print-btn { padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:24px; }
  @media print {
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .sidebar-overlay, .mobile-header, .desktop-header,
    .no-print, .print-btn { display: none !important; }
    .main-content { margin-left: 0 !important; }
    .page-content { padding: 0 !important; }
    body { background: white !important; }
    .vg-body { max-width: 100% !important; }
    .vg-cover { break-after: page; page-break-after: always; }
    .vg-section { break-inside: avoid; page-break-inside: avoid; }
    .vg-mock { break-inside: avoid; page-break-inside: avoid; }
    .vg-table { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
</style>

<div class="vg-body">
  <button class="print-btn" onclick="window.print()">\u5370\u5237 / PDF\u4FDD\u5B58</button>

  <div class="vg-cover">
    <div style="font-size:11px;color:#9ca3af;letter-spacing:0.15em;margin-bottom:16px;">LINE VEHICLE SEARCH GUIDE</div>
    <div class="vg-cover-title">LINE \u8ECA\u756A\u691C\u7D22<br>\u4F7F\u3044\u65B9\u30AC\u30A4\u30C9</div>
    <div style="margin:14px auto;width:40px;height:3px;background:#1e3a5f;border-radius:2px;"></div>
    <div class="vg-cover-sub">\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306E\u65B9\u3078\uFF08\u793E\u5185\u6A5F\u5BC6\uFF09</div>
  </div>


  <div style="text-align:center;padding:24px 0 20px;border-bottom:1px solid #f3f4f6;margin-bottom:8px;">
    <p style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">\u307E\u305A\u516C\u5F0FLINE\u3092\u53CB\u9054\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044</p>
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhwAAAIcCAYAAAC9/nd8AACAAElEQVR4XuydZ5wcxbnu76d7nLNx4DjH45x9nI9tcDzOJieRkyxAJJGFAAECBMhkk01G5ByNCNYmbZJWm1fSRq2kzatdaRX6ztPcoXve6q7u3qme7pl9/vo9HyRV6pqZrqerq976PxYhhBBCSMz8H/kPhBBCCCGmoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOwUreEY3DZuPTRQZp227g7rr82LrK/VzrU+U32M9Zayva3/u3wPKqNPZ/rjCzVzrD80XmiduPZW658bXrK6t26SXUkIIQVly44pa9nIKuvi7getA1qvsL5XP8++f7+34kDlPjZTtWvVYXaf/LzhbOvYjhusJb2PW/Wb18quLCqKynD0Tw3bnf6DlacpHw4VXjAhC7rus9on18suJoSQWJjMmIz7N/3b+mPTRdY7y/dT7ktUOH2o8hDrqPbrrJdHVssuTj1FYTgaJ7qtg1v/ztmLGPTbxvOL8ovrx7otG+wnJpgqPB146b9q/mbt07LYapnsldmNce36p21jLOt2C091V/c9ae3M/JGMbZ+0Z6W+Xvf6zJ2ffr36POuF4XqZ3RjPDtVav1q9QKnXrW/UnWidsvZ2a3zHFpm9pHh8sMravWG+cv1ufbPuJOuMdXfag6tkR+ZzvrTnYeu79aco+dz6yaozrVs3vCizFy0D28bsB5wPVh6s3H+o/PSl2uOs2zb8y5rauV12eypJteHAjAaMxpuW76l0NGVWv2g412rKGLtiBgP3V2tPUK7NT7i5Y2rXNHdufFmpSyevweXwtmuUdH56e/m+VmsM5glG/21l+yj1+emY9utlESVDzXiH9eayvZRr9hPMogSzszKdTjA4xQwGwUsyBouvSeLXZ6uPtR4brJQfQepIreG4qf95a5fKWUrHUvEJg8s5nfdY24rELUvwikheU5CqMwOJafZruVypR6c9my+VRVi7Vh2qpNMJMyqmiTpAfmzFEbKIkuGi7geV69UJM2ySX65eoKTTCe/ti5WKsVbrK7XHK9dExas/NV1krZ8akh9Hakid4RjdPmHt33KF0pFU4YQp3a4iXFyKBVXyWoL0yqj510n40ct6dPrfxgtkEda7yvdX0ul0Wc8jsoi8iTrIvr/iIFlEyXB2593K9erkZb5+tPJ0JZ1Os1qXyCKKgit6H7PeytffiekjVYdbL8b4mjUfUmU4ercO2u+sZQdShRdWSK8Yb5cfUaqh4TALDYcDDUcwmBnFK3B5HVThhdd/N6x/Vn5EiZMaw4F30NjGKTuOSk549/rSyCr5UaUWGg6z0HA40HDowSLZ3zcuVK6BSlYLu5fKjypRUmE4erYO0GykVO+pOMCqHGuTH1kqoeEwCw2HAw2HP9t37rD+0rRIaT+VDl3Z+7j8yBIjccOBNRt8jZJufbjykKKI2UHDYRYaDgcaDn+wO0m2nUqPsMvz3k2vyo8tERI3HFwgWhxC7IA4tpCahIbDLDQcDjQc3iAGhGw3lT69O3M/wTb3pEnUcGDrq+wYKr06fs3N8iNMFTQcZqHhcKDhUGme6LEHMtluKp1CgL6kHxoTMxwI6sU4G8UlTM2Vj7XIjzI19E0NKm0OUhzBzo5oDx+0C8LKfknUNU140jTNjREfCBDBtVT5e98TyvXq9K26k2QRkY3oSR7Bw9IEoq7KNlPp1gUJLyJNzHAc0naV0hlU+oVXKwjRnFb2aL5EabOfELLbK6x4vpRlTFnYOAQI1+81y4IZC5nWT59YcZR9mKFpNm4btT5adYRSn58QKKxUgZnFWiZ5zX76R/9zsgjrqaHq0NFKcdbIys3rZBGp4e6NryhtptIvfK/WbOmXH2fBSMRw4F0Sw5UXr5Zu+rf8SFMDYgHc3P+CHaXxsLarPXV0+3XWdeufiXV6EYPFmZ13KXW7dfq6O6w6zemPTwxWWSesuVnJ5xZCR2+YGpZZjYGohYt6HlLqdQttfDozmJY6OGn5wu4HlOt3CyHNdWfbYMfXqWtvV/K5hWi/eF2RVrAr5fM1s5X7AlUcwgxsUiRiOBgcprj17fqTY5kZIISkn7sinhVEpUs4wqJzy0b5sRaEghsOrN0oxKmvOIsCi2R2a5g/Y/Tf9adaH19xpNIXcWhZEQUEI4SY4/sr5yn3A9NC/B+sCZL3uFLWT1edZR8oWYjxEbOrSVBwwxH1QKgowmr/W/pfjHWKuRjA0eb3b/q3dWDrlaHXEkQVTjMlhMwssMha3gtM6Wu1c+1XVmnYvpkkeGW1bKTBOnntbZEPcQwrrPtKYi1ewQ1HHO4YznD5aLOsimRom+yz9mlZrPRZvnpfxYHW1p3bZHVGwGLFtVs2+CquetPIhqkR5frdwhHgQeAgPpkvqzCH9KG/ZT638HkVAjxIyLrdCnPKMaaSZb6sEPG4WMBMsWy/W3ENJlhfIu8F+eqTmcHv9g0vxdbmYmZk+4Td51jsKfstXyUxS11QwzGwbcz4YtGzOu/iFzUE2DaJd3ey//LRyyPq7op8wOppvBaS9UjhOpKaEiwULZO91jfrTlKuXert5fta53XdJ7PbPDpYEWpnBZ6inhxaIbPbIP4E6pB5pLCuB+Y2DhomOq0vhzjq/B2ZdmIRrRf3bXrN+kCIbfjYlfP8cJ3MnhpqxjvsVw2y3VKI43J135Mye978MGIskSD9ouFce1wgemrH11ifqj5a6b98hEXthaaghuOhgTLlovMRXp+Q8GD7pUmnvMBnoJsuUeMUPDtUK4soGXAjlterk9xai9dqOHxPpvMTgnZN7NiaU8a/RlYq6XT6beP5OflNESVg1n9kHmjkKcebto1G+t7DpIWZLUmCMCY0KzzcrZ7okkVMGzxtm1xfgFe+ae3nNIJZra/WnqD043SF31WhKajhwFOpvOjpKgl3Vgogpr7sy+nqd40LZfF58ZGqw5U6dML73lIFr6zk9eokD2iqGm9T0gRJbtG9tOdhJY1OH8oM1HEQdZCTx3LjfbhMEyScXp02sI0bhkq2Vac7Ni6TxUwbTMHL8qerH686I9Zt6aUKzrT6YOXBSn9OR5gpLrThK6jh+GuzmRMFsWaDr1Gmz+yOG5Q+nY6wF98kYab/3fJ7lVAK5BvaHMHHZJogyZmBtIQ2l/UE6dr1T+fkjzpTA6Vx4eLmHVuUdgbJZARaGDlZ/nSEHSi9Wwdl8SQkjwxUKH06XRXaWBfUcGAVsrzg6YgLRPMDU3P40ct+jSpETTS5gJOGw4GGw0HWEyQaDkcmDQd2TcjypyPTr2JnIj9bdbbSr9MRot8WkoIajqhT5l7yOuiKROc0Q6+3TG5BpuFwoOFwkPUEiYbDkUnDgSiosvyowroirC8i+TGd77SXTL5yC0NBDYeJkwURtprkD0Isy76djjq2rJdFTxsaDgcaDgdZT5BoOByZNBx7NV+qlB9VezdfJosl0wCxOkzE6JC/lbgpqOGIuuBJCvnxOoDkD0KTRzmYy08mD5ii4XCg4XCQ9QRJ3kRpOMyAReKy/Kgq9BN1KWNixmlx76Oy2FgpqOGQFxtVGJCIOaJuvfRSvebwsajQcDjQcDjIeoJEw+HIpOHA62xZflRh9xQxQ9RdZF6S9424KSrDgT3oxByzWpcofRxVJg1H1CnCUjYcUV8/yhtH+TQMR/V4R04ZUQ3HLpWzcvKbIurMqAnDgRDeaQNxUmQ7g5Q2w8HdKea408AhevK+ETdFZTh2b5gviyR5MHfNLUofR5VJw4G9+bJ8nXBqZanyrQgBnqCHB8pz8mMxb5SovthxNLhtPKcMnMcj0+n0vfp5OflN8YWaOUpdOj03nBsQbt2WDZFMC+ITYDYhjXxsRbTXoK+ONsoipo0Jw2FyV9tM5+mhaqV/o4qGQyO8AiDmOHHtrUofR5VJw4FQ6ZiWl3V4CeYzzDkixQoGzbBbl/FuHYvIJBd0Lw010CLNop6HZHY7KNCvV5+npPcSdh9gJiEOHh+sCv2KaY/mS+z1SRIECpRpvQTj9fe+J2T21LA0YwLDhJqHEMnTJCYMRyn/ZgvNM0M1Sv9GFQ2HRjQcZkmb4QAIQ40zQHCYk5/wumAmBH7DwW0I8iOv3y28E/caYLPgTBZEl5X5ssL/6c5AQdnY0STzuYXPK+4D3NZPDdmzOLJut+QrIQlek9yz0b8vMKNjctdVXOC1BI6JkO3PCgszcfaGaWg40gUNRwDyYqOKhsMsaTQchJB0QsORLmg4ApAXG1WFMByI7//icL1164YX7UWJhdY/+p+zHhustEa3T8imGYeGgxASlmIxHJjdwUwPXhPK+2vcwus4nEyMdUNxQ8MRgLzYqIrTcOBUxQNarwj93jxuYeEaTt/EgUlxQcNBCAlLmg0HFjyfse5O65MrjlLqTErfrj/ZfoCM64A0Go4A5MVGVRyGA6um53TcaC8Wk/WlRTi2PY535KVqOBomOu332PLdtlvyZNQ00rV1k72uQLbdrZcyhtRrwSgxDwbL54frlM/ArQcGllt9U/Fu/cQ6E91aFMjk7pQsaTUcmI3+QOUspa606Eu1x9nroExDwxGAvNioMm04MIj/z6ozlXrSqM9VzzYejKgUDcfC7qVKG/106trbZfbU8MRglfWOkLsRdmuYH9tTFHkdxMD4/sp5St97CbOkcc1Mwki/tWxvpU4v+e3YmS5pMxy4NhNb+wuhd5bvZy/QNgkNRwDyYqPKpOHAzEaxmI2sPlV9tNHQ7qVmOIa3b440U4XtoN1bN8liUsHX66KdrPzgQJksghgEZzjJPtcJ95Y4iHoA5rKRBlnEtEmb4Tin8x6l/DTrLRmjiBkyU9BwBCAvNqpMGg68RpHlF4N+3nC2saeWUjMcONdFti9IcUw9myDfSKPELGd33q30uU4fX3GkLCJvSiHSqCnDgdgsYWLMpE149dOzdUBezrSg4QhAXmxUmTIcWCAa5Uk4bULwHxOUmuFAW2T7gvTK6GpZTCoIG+gqq0LfOGYaUQ0HIoKaphTOUjFhOFBG1OizadKR7dfKS5oWNBwByIuNKlOGA7tRZNnFpK/VzpWXNC1oOGg4SDhoONJjOLAoVpZbTMLDroltszQcAciLjSoThgNxNhCGWZZdbDKxgJSGg4aDhIOGIz2GA7v2ZLnFpiW9j8vLigwNRwDyYqPKhOFAUC9ZbjHqSgNfWBoOGg4SDhqOdBgO7MbCjg9ZbrEJMZbyhYYjAHmxUWXCcERdbZ5WnbDmZnlpkaHhoOEg4aDhSIfhwK4yWWYx6os1c+SlRYaGIwB5sVFlwnDgBE1ZbjFqn5bF8tIiQ8NBw0HCQcORDsOBAFqyzGIUXuvnCw1HAPJio8qE4Yh640ir8B4zX0rNcGBdi2xfkMrGWmQxqeD9FQcpbdXJxCs24s+CrvuUPtfp09XHyCLyBrGDom4FvXPjy7KYaZMGw4EHBFlmMQrB2/KFhiMAebFRRcPhiIZDBTezD1ceorTRT3jKGCnAIXnT4Terz1faq9Py0WZZBDFI1Jv7vgZmIL34bv0pSl1+wm6I5okeWcS0oeEwJxqOAiAvNqpoOBzRcHiDs0U+W32s0k4pBGZ6cmiFzJ4acF7GT0JEwn1fxjQV+qYxU0FkyzCHO+7eMN/q3RrPeSqrNnda36o7SalT6oOVB1s39j8vs+cFDYc50XAUAHmxUUXD4YiGgxBSSGg4zImGowDIi40qGg5HNByEkEJCw2FONBwFQF5sVNFwOKLhIIQUEhoOc6LhKADyYqOKhsMRDQchpJDQcJgTDUcBkBcbVTQcjkrVcOCY9b91/MM6rO1qX53ZeZe11ucsAoSuv7rvSSWP1BW9j9lxDbzAgr/5nfcoedw6tuMG6+6Nr8isb1A+1mL3r8zn1tw1t6R+d0nnlo3WWZn+lm13a3amL0wdKOgHtnce0369Urdb53bda62fGpJZbca2T1qLex9V8rh1eNs11jV9T/kOiljIe/q6O5R8buG7+8hAhcz6BljUfPyam5V8bp289jarzud3tcPaacfWOLr9OiWfW+d13Wdt3DYqs+cFDYc50XAUAHmxUUXD4agUDcflmQFBlu8nrMLvm1J3Avy+caGS1k8/W3V25va9Myf/wLYxO2iTTOsnGBMJbophTyNGun+NrJRFpIL+qWFr16pDlTb7aVHPQ7III5yx7k6lLj99YsVR1vD2zTn5MUj/aOXpSlo//aVpUU5+gAiXu1TOUtL66aqM6ZU8OlgROo7G28r2sWrGO2QRdoRhmdZPn6+ZbY37mOrpQMNhTjQcBUBebFTRcDgqRcPx5drjlfJ1wtOoG8xMyDRBWj3RlVPGHRuXKWl0+miVGlEST5gynU4HtS6RRaSCG9Y/q7RVJwxwcRAltgp076ZXc/JjtkCmCdKGqZGcMhBYTabR6Rt1J+bkB39ovFBJpxNmwNzAOIXZluvW44NVOWXkAw2HOdFwFAB5sVFFw+GoFA1H1IEF08ZuTIQ2xymOMo1OXjeOqKdZ4kaeRi7qflBpq06IjhoHsp4gXbv+6Zz8mEGSaYIkT2OOet/wCm0eZZYFmiWMKEOb03C4oeEIQF5sVNFwOKLhoOGIGxoOh6j3DRoOb9FwvC6v+0ZUaDgCkBcbVTQcjmg4aDjihobDIep9g4bDWzQcr8vrvhEVGo4A5MVGFQ2HIxoOGo64oeFwiHrfoOHwFg3H6/K6b0SFhiMAebFRRcPhiIaDhiNuaDgcot43aDi8RcPxurzuG1Gh4QhAXmxU0XA4ouGg4YgbGg6HqPcNGg5v0XC8Lq/7RlRoOAKQFxtVNByOaDhoOOKGhsMh6n2DhsNbNByvy+u+ERUajgDkxUYVDYejUjQcn6k+RilfJwQKc4NIkDJNkGRwpZv6n1fS6PSBylk5+cEBrVco6XTau/kyWUQqQPAq2VadPr7iSFmEEaLGnrh9w0s5+SvGWpU0QerauimnDAQ1k2l0+mLNnJz84FerFyjpdEIEVzfbMoM1AoLJdDqZjABLw2FONBwFQF5sVNFwOCpFw3FShPbgxiufQhE19Ft1Jylp/fSFzKAgb4Drtmyw3l2+v5LWTwiHLbk/c5OX6XRC2O400jLZa72jfF+lvX6a03GjLMIIeNKXdfnpvRUH2lFB3SDc/Werj1XS+ul79fNy8oOVm9fZg4RM66fT1t0hi7BnXmQ6nZ4dqpVFWHs2X6qk8xPMsAxglg80HOZEw1EA5MVGFQ2Ho1I0HBgYzu+639qtYb5Wf2662DcceM/WAevI9muVPFKHtF3lex4Lzjf5a/MiJY8UzhjxCx19S/+L1m8bz1fyuIX/v7H/eZk1VSwbabD7W7ZdakHXfdZk5vOLA5yDgjNMZJ1SezRfYs9meIHZLxgXmUcKZ5R4hcwHzw/X2b87mcet3TNa2L3Uc2BFpFCc8/Pr1ecp+dz6XeNCJVpqlpHtE/ZZKzKPFGbN5OxdvtBwmBMNRwGQFxtVNByOStFwEELSCw2HOdFwFAB5sVFFw+GIhoMQUkhoOMyJhqMAyIuNKhoORzQchJBCQsNhTjQcBUBebFTRcDii4SCEFBIaDnOi4SgA8mKjiobDUSkaDiwO/FvHP6wv1R5nb5H10w9WnmY9OFAms6cG7Ja5pOdh65t1Jyltdwv/j1gXSJ9WHh2ssH648nSl7W7h8zq24wZ7QaMECyUv6F5qH9cu87mF3UWLxTZnk+CIeizSlfVKYeEpFph6gd1H3185T8nj1pdrj7eOW3OT52Li7Tt32Pefr9fNVfK59e36k61r+p6S2ROHhsOcaDgKgLzYqKLhcFSKhuOY9uuV8v305rK9jK/CN8WtG15U2qvTP/qfk0WkAmwFfUuEraBeW4SjbgWNY4swAmZ9tOoIpS4/fSVjGqQJrBxrs960fE8lrZ+8tgjj5i7T6fRQykw1DYc50XAUAHmxUUXD4agUDcenqo9Wytfp0p6HZRGpYN+WxUpbdcJTdRq5MmLUVQzqkj9GjLp6kIiuaQJsc5b1BAnxWNxc2P2Akkanz9fMzskPsGVWptMJW3TTBA2HOdFwFAB5sVFlwnAgXoAstxhlYpBKm+HIN7R5WmBoc4dfRoyuicBWpimV0OZJkwbDUTbWopRZjHpX+f7y0iJDwxGAvNioMmE4rl//rFJuMQprHfKFhiMeaDgcaDgcaDjyNxxrtvQrZRajPletzoBFhYYjAHmxUWXCcDwxWKWUW4zCYJAvNBzxQMPhQMPhQMORv+FANFus35LlFpt+3nC2vLTI0HAEIC82qkwYjuHtmyMfgJRGlY+1yEuLDA1HPNBwONBwONBw5G84wG4N5yjlFptwhEO+0HAEIC82qkwYDoDtcbLsYhJO5ZSr6KcDDUc80HA40HA40HCYMRxLIi5mTqNM3DdpOAKQFxtVpgzHspFVStnFJBwbbgIajnig4XCg4XCg4TBjOEa3T1i7Vh2qlF0s+n3jQnlJ04KGIwB5sVFlynCAqINCWoQj1bfu3CYvZ1rQcMRD1O8WDYcjGg5HNBz+RI3vkhZhOyzi25iAhiMAebFRZdJwbNo2aq8UlnWkWe+tONBatblTXsq0SZvhQARGWb5O2HGURo5qv05pq06HtF0li0gFN/e/oLRVpy9mzLDkgNYrlHQ6mdh9JWmY6FTq0ek/lu9pDWwbyykDx8rLdDp9p/6UnPzgL02LlHQ6nbL2dllEoqTJcOCV8n4tlyvlp103GLxn0XAEIC82qkwaDoCnmE+uOEqpJ42C2XhuuFZeQl6kzXBEGeCwjgWmMY2sGG+33lG+r9JmL709k87EAuA4GNo2HikYm5cBfG20KfQi7XeW72eHIDcNBqffrA6/butQDwO4YWo4dLRSGJbbN7wki7BeGK4PHbn1PRUHWM0TPbKIREmT4QATO7Zav159nlJHWnVu173yEvKChiMAebFRZdpwgP7MjQRblGRdaRJeo5ic2ciSNsMBEEkQK7jxusRPWDS2MaVmI0tTxswiEqpsu1s4b0VO3acNmLq/9z2htN0tfF7LRhpk1jfADMOinoeUfG6hr1ome2VWY2CgQ8h5Wa/UfZtes89/8QKmA9FXZR63cG4MTJYfMFQXdz+o5HMLg4DfeS5JkjbDAXA+De5jUcLOF1p4WLwrhpD9NBwByIuNqjgMRxYczPTV2hOUOpMU3gNjKtf0jzRLGg0HISSdpNFwZIGRw2LMNBmPd5fvb5+pA6MaBzQcAciLjao4DUcWTGNe3vuodfyam619WhZbuzXML5jwjhenbuJpECF844aGgxASljQbjiwbpkbsmazT1t1hr42S99g4hdd2h7Vdbb86QYBJBCmLExqOAOTFRlUhDMdMgoaDEBKWYjAcMwkajgDkxUYVDYdZaDjiBesf1m7Z4Ku0r0PJMrZ9Umm7Wz1bB2QWBVyrzOeW3BXiRffWTUo+t3AMvQ4MdjKPlN/6jSyIASHzuNU3NSizxELnlo1K3W5hQaVpaDjSBQ1HAPJio4qGwyw0HPGAATrsrgh8pzGIpZWTMt8R7LqQ7ZbCwmYslJXgKIGwoah/17jQ0zTUjHdYn64+RkkvhTM2/HYCYNcITuiUeaR2qZxlT4dLsNMFW3Zlei9hLVj7ZDyLPvGqFTu0ZJ1S2A2DV7MmoeFIFzQcAciLjSoaDrPQcMQDdm3IftLpnM57ZBGpANuwZVt1QpAvyenr7lDS6YQdHJLv1c9T0ukktxnjvT62H8t0fvpAxnTIgfGRgQolnU5/bro4J78poixsh1E0FWQK0HCkCxqOAOTFRtV3PYLpkOmDBU6yj6OKhkPlr83RAjz9ofFCWUQqwLZd2VadPlh5sCwi9ExPVlioLYl6OqiMB4ItuzJNkFrFFl3MnMg0OiG+j2m27JgKNdvk1j894oFMFxOGA+aPmAFbuGX/RhUNh0YIvEPMEXUw8BINhwpDmzuYCG0u0wQJYa/dpCW0eb7gdZOsJ0i3bfiXLGbamDAccQR2m6kgJozs36ii4dAIe6zT/L672Pivmr8pfRxVJqdsSwUaDgcaDnOUguF4aKBMFkumCWJ8yP6NqpI2HAhdLC84qpZu+rcslkwDxBuRfTsdyalnQsPhhobDHEkbjj2aL1HKj6oj26+VxZJp8tnqY5X+japr+p6SxcZKQQ3HrlWHKRccVTgMiuQPVrDLvp2O1k8NyaJnPDQcDjQc5kjacBzc+nel/KjCGLCNC0fzpnZ8jdK305HXmT9xUlDDgdMk5QVHFY73bZvsk0WTCIxnblxhD6LSCQvY4tjvX+zQcDjQcJgjacOB6Muy/OnI5ImpM5V9WxYr/TodPTpYIYuOlYIaDuyzlxc8HXmtZCfhWdi9VOnT6egTMazELwVoOBxoOMyRtOG4qu9JpfzpCA87eOgh06NirDXybiU/xXEoqI6CGg4TcR+yMvlDmkksH22OFJNAJ8ZF8QYxGGRf6QQjnkYQE0O2VScEzZL8KqLh2MvDcES9uUrD8dLIKiVNkGQQM8RKkWl0QnAu02A2UdYTJJNT5s8ORYvLotP+LVfYwdRINAa3jRt5UwBhu3nc571ICmo4sCdcXvR0hUETR5mT8CDk8X8aWEeT1Slrb5dVkAynZvpF9pVOc9fcIotIBQ8OlClt1emHK0+XRUReSX9W512yCOvLtccr6XR6cbg+Jz9Cokc5RfQdmXuLfFV4x8ZlSjqddm+Yn5PfFJ+qPlqpSyc8YJiif2o4svnTCQHySHi27txm/Xr1eUo/Tldfr5srq4idghoO/PDlRecj7Hq5Z+OrshriAW48Js0G9NRQtayGWIhsOWx9JeQg+aXa4wp2/kZUcK5I2NdDiM756mijLMI+ZyXs9mvcAL3Ol8GT9XsrDlTSe+mg1iUyu80F3UtDDZZYI+a1xgARMsPGrdm16lCrcqxNFmEEvHPHseeyTi8d1X6dzJ43X6udq9STj45bcxMXkYYA95SfrjpL6b98hDU5haaghgPgBisvPF/hSHd8IEQF70qxZsPUa5Ss3la2D2OiaEBUSAw6y0ZW+QrvYpEu7SC4m2y7W5hpHNF8FzBti2uV+dyqGm+zn+D8GNo2biFiqMzn1uqJLpktB8zwyTxSvVv9zR9eASBwlczjFkxX3L8LHHQn65WSr4RMcYKhhaNuYSCtHu+QVZH/z/2b/h15ZiuMHhuslFXFTsENR9QQwWH1nooDrNPW3WHf2IhltUz22ltfTexG8RL25BNCZhaYKZX3AhPC7BN2XmDWtNDrCtIIZvqwTvEHK09T+sqEMCOZxMNOwQ0HtrSGmdrMR1iwtVvDfOuQtqvsw6MWdN1X8sKitkMz14tFeqYWFen08EC5/GgJITMAnAws7wcmhVdGP1t1tm1AMKMi73WlqqPbr7NfYX5/5bzI5wdF1THt18uPtSAU3HCA3zaGexdKpVOY3uOpj4TMTEyc4UElJzzwI3BYEiRiOF4eWa10AlU8ktsOTbJmS79118aX7e18fsK7R937/nzBIjZM7cp63cKuhbjDurdPrrfrkXW79cRgVazmD2U/nqlD1uvWnZnPq2PLepnVKHhFiF1usm63ns58Ztt37pBZjYEpaHz3ZL1u4buLtSJxghghsl6p54Zr7UW/cYB1YVgYK+8LVHHoj00XyY+0YCRiOEDUgEBUOoTZjbjesT45tCL04tbv1J+ibF00AQbYsKvBsaMBR0THAbakonxZp5d+tPL0WAwYBtjv1c9T6vMSFhHHFbUQhuYtIfsCr1Lj2PWAQfabdScp9XkJ22qxsyYObux/PvR0OwLKxWU6Fvc+qtRHpV/YHo4F2kmRmOGAS8dNSnYIlW7FuXYj7OCWVRzB33B9sh6dsOUzDsJuq80KK9lNg6d1WY9OGJDj4NPVxyh16YRZH9P8o/85pR6dfrzqDFmEEaLOLCDKahzAmH+19gSlPirdwo7OJEnMcICo4YKpZIUFTXHy4cpDlDp1Oq/rPllE3iyJ+H4asxBx8K6QsRayiuOYaROhzU0g6wlSHK/8ot6rSjG0uQSvxqMEVKOS1UeqDre3VCdJooYDU58/WXWm0jFU+oRzU7yCMpmEhsOBhsNB1hMkGg5HcRoOMD9iyHcqGeE1XFyzXVFI1HCArq2bjBxbT8UnrKvwiiJpGhoOBxoOB1lPkGg4HMVtOLBIl+vx0i9E2k0DiRsOsGK8PXToYqqwwpRpHOsDvKDhcKDhcJD1BImGw1HchgMgyuy3609W6qbSoThC3E+XVBgOgBMdES1UdhaVnGA2sFiuUNBwONBwOMh6gkTD4agQhgPgYDcuIk2f9mu5PNat4lFJjeEACEsedRU2FY/wGqVQMxtZaDgcaDgcZD1BouFwVCjDAbAgEbtzZBuoZISTmuPaFj1dUmU4AIIdIcaC7DyqcMIC0UKs2ZDQcDjQcDjIeoJEw+GokIYDoI04YkG2gyqcEG7i6r4n5UeTClJnOAACDuHoXG65Kryw9TXu3Sh+4CYt26MTBkTTYLCS9eiEcx/iYJfKWUpdOsEomQYmRtajE2Yn4yBqvJ44XgPC3Mp6dELsENMguFvUeyJiqSQBop3CgMr2UPEK52glGdgriFQajizlYy3WdznbURAhgmicQb3CsE/LYqVdOuG4ctPUjHdEuqn/ZvX5sggj/KHxQqUuP+FshDhOSf73aJNSl05/bV4kizDC7g3zlbr8hM9u1eZOWUTevDBcr9Sl04GtV8oijPDDlacrdfkJ0VlxWGZSrJ8asg5qXaK0izKvd5bvZ+9EiSPisElSbTgA3kEt3fRv61shwwpT0QSjcU3fU7GFK48CblAYwINCen+o8hDr8t5HZXZjXL/+2cCt2tjXjjDa62I6NwPbxX/RcG5gSG/MKuDziwvMnAS96sLnhVOKe7cOyuxGwDktP284OzCkNwIb3dT/vMxujEU9D1kfrDxYqdctzMb8rnGhvYgyDponeuzYRUEnbmO2ECHh0wB2Ie7RfElgm6nowqvXk9beavVNxfPbM03qDYebZSOrrMPbruEW2jyFmyJuAJjRiPPgL0IIyYLDDs/pvCdyqHpKFWa68Pp3U0Kvv6dLURmOLJg2QljdBV332VPPOM9CfiCUIzzt4An01LW326egjm2flF1KCCEFA6+9sLBx7+bL7DN4cOCdvG9Rr+sDlbOsH6w8zTq6/Tr79OierQOyO4uGojQcfnRu2WgfDU05iuPkTEIIMc2GqRHl/jXTNbp9QnZTUVNShoMQQggh6YSGg6QKLHQ7ov0a67C2q3114tpbrZbJXpnVBnEAsLhP5pE6v+t+OyRzXGC90d86/qHU6xb+3+9ApZ2ZP4ihgDVLMp9bJ6+9zV5UmWaeH66zZnfcoLTdLQQpemV0tcxacuCVJo4Il9cv+6JsrEVmtcGMJRY1yzxSp6+7I7ZFvIRMFxoOkhqiBJp6X8WB9k4OSZSDpPBeNI5IfC8O14dekY90zw7VyiIiBZrCrp24dkXkyxODVUp7/YQtrVibVaogcq+8Zj9hR47XVmeYFZnWT9iBVmpT8qS4oeEgqQFBa+RNU6erRDS97owBkWmC1DBhPmbDIREjLR7QeoUswo72KtPpFOd20HzAokDZVp2ObL9WFlEy/L5xoXK9Op2w5uac/DgTI2oE2kcHK3LKICRJaDhIagiK9yAlQ5vXb16rpAlSHNP4iNYq69HpfxsvkEVEHljiCG1ugigzTtCezZfKIkqGH0UI2gXNal2Sk78YQpsTooOGg6QGGg4HGo7Sg4aDzHRoOEhqoOFwoOEoPWg4yEyHhoOkBhoOBxqO0oOGg8x0aDhIaqDhcKDhKD1oOMhMh4aDpAYaDgcajtKDhoPMdGg4SGqg4XCg4Sg9aDjITIeGg6SGz1XPVm6YOl3R+1hOfpw9INMEqS5jUkxzYOuVSj067dOyWBZhH7Uu0+mE6JNp5K/Ni5S26nRo21WyiJLhN6vPV65XJ0SidYM4HG+PeMjZgwNlOWUQkiQ0HCQ1nLbuDuWG6SecLonjriXfXzlPSeunr9QeH8vhdg8PlCt16YQIlJLj1tykpPPTeyoOsNZlzFYauWvjy0p7dUJk0lLlxv7nlev1EyLQeoW937/lCiWtnzBjWGzHl5PShoaDpAYM/pf0PGw/Ce7WMN9XiF65fLRZZrfBiZPHr7lZySOFsz3iPOb5no2vWn9uulip1y28esHZMV5s3bnNWti91Pr16vOUfG7t13K5VTXeJrOnits3vGT9MXOtsu1uoa+WehivUgOm4w+NFyrX79Zfmhb5Rggd37HFDnuPV1Uyn1t4HbN6oktmJyRRaDgIIYQQEjs0HIQQQgiJHRoOQgghhMQODQchhBBCYqdoDceaLf32QrTPVB+j1Y9XnWG9PGI+1kKWy3sftb5WO1ep160v1MyxTlp7q7Vlx5TMbo1tn7SO7bjB3hIq87n1jboTfY8gb5nstX7XuFDJI/U/q860ysZaZHabJ4dWWN+rn6fkkdq3ZbHVNzUosxthePtm64j2a6zPVh+r1OvWt+pO8l1siePmsdBS5pHareEca8V4u8xug10m36k/RckjdVDrEnuRalqpHV9j7d4wX2m3FBYgIoYJ0YOYFt/MfPdk/7mF3/FR7ddZI9snZHYjYKEzFk3LeqWwW+uZoRqZ3ea10SbrJ5l7gcwj9fvMPaV9cr3MboNt2LgnyTxufb5mtr21Fwtd4wA7s7DAVtYrhfgnL42sktlt8O/4f5lHCvXEtRMM/YN+Qn/Jet1Cf6d1+3tYitZw/Hf9qco2MD+9v+Iga2MM28MeGihT6tJJBqoCczpuVNL5CVvlvMwTtnfKtH76UOUhys0Q5i3K/v7fNp6fk98Uh7ddo9Tlpzdl+qJyLHd3xg5rp21WZFo/IdbFxI6tOWU0TXRbby3bW0nrpz2aL8nJnxawy+XjK45U2uunT1UfHcsW4VIBu6Lw+5P95qdj2q+XRRjhFw3nKnX56Z3l+1ldWzfl5B/aNm59oHKWktZPMFgSbNeV6XQ6MfOwFQdRAqm9t+JAq39qOCc//o5/l2n9hPriAP0j69LJa7t0sVCUhmMw86ORH0KQnh6qlsXkDVyprEcnzDBIvlR7nJJOp3O77s3JjycemSZIy0Yacsq4Y+MyJY1Obyvbxx7cTfPJFUcpdemELbRuMNMj0wRJmhY8Qcg0OuGGlUYwuyHbGiTMDhFvsEVZ9pdOmOkwzVTGEL4lghmG7t30ak4ZLwzXK2mCtEEM1Gd23qWk0enrdXNz8psAM8NRDCD02GBlThn4u0yjE+pDvaZB/8i6dEL/FytFaTh6tw4qH0KQME1umihP5BBmZSSfrj5GSacTgmO5aZvsU9IE6dmh2pwyogQkygo3P9OkIbT5kt7HlTQ6YTYkjeDVmWxrkPxeMRHLjn0h+0unj604QhaRNyZCmyOwmkwTJPkqAa+HZRqd/qvmbzn5TYAZa1lPkGSAPfxdpglSHDPl6B9Zj07o/2KFhiMPaDjMQsNhDhoOs9BwONBwmIWGI+XQcDjQcDjQcDjQcJiFhsOBhsMsNBwph4bDgYbDgYbDgYbDLDQcDjQcZqHhSDk0HA40HA40HA40HGah4XCg4TALDUfKoeFwoOFwoOFwoOEwCw2HAw2HWWg4Ug4NhwMNhwMNhwMNh1loOBxoOMxCw5FyENQIsSDkB6GT33Hm+XBWxP3oiIwqiRK8BroyMyC6Gd0+YQfBkul0klElH494E9q16tCc/KZAkCFZl07/6H8uJz+ifso0QYJhc3PfpteUNDohYFYawSAh2xokGHnizbXrn1b6Syevh4t82Zn5s0uEoF2QjDYKUynT6IS4HzI43qU9DyvpdPrZqrNz8psAQeoQ2EzWpZMMmoi/yzQ6ob44guOhf2RdOqH/i5WiNBzg9MyTvvwg/ITwznEEqlqbual/sPJgpT4vwSB5hdd9cKDMenPZXkp6L31ixVGeobSPX3OzktZPCFeMG5cbhFxHKG+Z1k+Lex/NyW8KhCsPa54QURRREyUIjS7T+mmv5ktldvsp8qu1Jyhp/YSBKK3s33KF0l4/Hdz6d5mduBjYNmabS9lvXsLvWQbcMsXF3Q8q9fkJ4c3lTCR++wj9L9P66eS1t+XkB4jQ+dGqI5S0XoJheXSwQhZhhHM671Hq8xMG9e07d+Tkx9+jDPaoLw7QP2EDuqHfZcTUYqJoDQfAq4ELupfaU+t+wiAmf3QmwbkiV/U9qdTrFs5b0UVxrB7vsF2rzOcWBjbc9PzAWSjnd92v5HMLN0E/h46nmFv6X1TyuHVR5ma3zMM0maRirNWOICrrdgvRQL3MRhZEEJR5pB4YWO5rQhFNEOfWyDxu4cb/6mijzJoqcH0Ivy/bLvXIQIViQokKIhxft/4Zpf/cwne3ajw3eq1p8OByYfcDSt1u4VXKpMfZTQD3gLs3vqLkcQv3El10ZrxauKbvKSWfW5f1PGJHvI2T54fr7Ciwsm63/rnhJXtW3Av8O/5f5nEL5aOeOEE/ob9k3W6hv+N4pVNIitpwEEIIIaQ4oOEghBBCSOzQcBBCCCEkdhI1HJ1bNtoLL/3ktUDSDd6/yTxS2MWhA0e1yzxSQWtAsIhH5nGrWxwR7QV2Fch8bgW9u8PCT5lHKo6TDiXrp4aUet3C6bZxg/Uosl6p8R1bZDbjYH2PrNetoF0hWIMh80jp1vUALIKVeaTkLgQJ6pB5pOJeA4IFfrJOKd26HoDPXOaR8lv3kCawBkO2W2p4+2aZzTi4P8t63cL9PW5wb5b1SuEer8PEGIATdWUet7pCjAH5jofFQCKGA50XdifAHs2XeC50xHavMFvEsPrXb1cFFpyG2SGC+BBeO0wwyGPXh0zvpW/VneQ5wLRO9lpfqJmjpPfSAa1XeC50xKK/91UcqKSXwk6ZuHZVYGD75eoFSp1e+l79vNh+PNjW+u7y/ZU6pd5Rvq91c/8LMrsRcAMLu/r9J6vO9Bwoa8Y7rE+uOEpJ76U5HTfK7Da3b3gp1NbBd2X6666NL8vsNsd23KCk9xLiycjt1qYoH2sJtSsCx4fPW/dPmd3mhvXPhtpK/97M7wg7x9IKtnJiW7pstxR2e53bda/MbgSYv31aFit1eunLtcdbHVvWyyKM8MJwfahdghgDsMjbC/x7mB0iqAf1SfDQ++emi5X0XvpG3YmexgP9g36S6b2Efpe7bYqJRAwHBk7ZkTphx4AbPE19pOpwJZ2f8ONrn8z90q/a3GnfoGRaP2EbpgS7U2Q6nY5sv1YWYf2laZGSTqd7NuZut4MZ+0AI45UVflxxzDIs6nlIqUunE9bcLIvIGzyphzEbWWEA2hQwczQd5kfYrgedse5OWYT1PxkjItPpJFfR4wkXpkqm8xOMiZwBe2qoWkmn024N83Pym+Lb9Scrden02mhTTn7MQCJAm0znJ5h3v10NSfPFkA8nWcWxSwS7OmQ9Ou3dfJkswggIEyDr8hPu9U0T3Tn58fcoYwDqk2DXkkyn0yFtV8ki7P6R6XTCg0Sxkojh+FrtXKUTdZKDE24gMk2Q5F5wDNwyTZDkDRkGQqbRCfviJTAyMp1OcnBas6VfSRMkOTiZIKqJ3K3hHFlE3mDrsawnSP8Wg5MJoppIzJJJ8KQt0+mErdduKsfalDRBkoNTVBOJp8A4CBubJSsMAm6wlVumCVLLZG9OGWkAr3tkO4MEc2CaU9bertSjE0ySabBFWdYTJGyFd4O/yzRBQr1uZoecAcwK5lkS1USi/4uVRAzHV0JOH2V13JqbcvKbCG2OKWSZJkjyvWiphDY3wX4tlyv16BRH9EEToc1N8Kemi5R6dPrfxgtkEfZrDplOJ+zhd2MitDnirsg0Or2/4qCc/KaQ9QRJvjb818hKJU2QGsXTcBowEdrcBAxt7nBM+/VKGp0QTVnC0OYxQ8PhQMNhDhoOBxoOBxoOs9BwONBwRIOGI4JoOPyh4XCg4TCLrCdINByOaDgc0XAkDw1HBNFw+EPD4UDDYRZZT5BoOBzRcDii4UgeGo4IouHwh4bDgYbDLLKeINFwOKLhcETDkTw0HBFEw+EPDYcDDYdZZD1BouFwRMPhiIYjeRIxHFG3xeL4dTeIZinTBAnBsdzgtESZJkgyammUo9AhE9tiTxeGA0FjZJogPTds3nBEOQodimNbLGKryHqCJGM2mCBsIKCsfuexLfY9FQco6XSSwe1w6q5MEyQEG3MT5Sh0CPFg4iDqtlhpOBC0T6YJUvNET04ZaWA622LjiNmAI+tlPTrFsS0W0W9lPUFaKgwH/i7TBElG9g0bGC8rE9ti0f/FSiKGI2qgE7mvHoG/PlR5iJLOTwjuIm8guLnKdDp5BX1B7AOZTievoC9hI5VmJW8gCLkbJWYDbt5xhBxG1FZZl07Yv24aPAFGCXaFIGgISWwaxEqRdenkta8e5lSm0wlButzgxhgl2BWCoMkQ0IhdI9PphGBlcRD1AQVxN9xgRjRMROGsMLuEKMJpJOoDCoynaRCIUdajE+LSxMF/Vh2m1KUTHkjcRH1AQX2SqMEfEa9IEjVujwyEWUwkYjgQVOczIV8lIFy2148f4YfDRJWE2UDkRy9ODRnABgP6k0MrZHZ7gAsbwhrTZgjpLsGXPmzEvD80XugZ5h2vh8IMtLjp+oX4zRcMVj9YeZpSp5fwSs0rzLsJbul/MVQIa5iNJb2Py+xGQPTS79SfotTpJUyxeoV5Xz7aHCqENTSrdYnnWSZ40g9jOpAGob8lKDPsqzLcjOMY3AAMRNhouke3Xyez22AGKIzpeHvmdxRHsCxT4HUoXl3Jdntp7ppbZHYjIArrbxvPV+rz0qeqj47t9RQMcZiZQIwBZ3beJbPb4N/DRBtFPTJ4JMCsEyLsyvRe+lz1bCXiNUD/oJ9kei+h39MaBTcMiRgOABOBd8a4mfhp9USXzJYDzqB4dbRRyedW0MCGg9VkHrcQiVI++UlgGmQ+t6rHO7RfEnxpERlS5nNLhuWVIAIe1iPIfG4hQmucYIDCOgpZr1uYWQo6CClf8HSPMydk3W55DfImwXkHdQF9gf/XnYuAw8ZwjojM51bQORUwP8tGGpR8jhoCw7tjnZCazxGMBsx3nCDKL9alyLrd8jL0bjCbJfO4he+MjCSZRnA/wn1Jtt8trzM7TIOBUtbrVtV4W+yH4WFdHV6LyrrdCjrKAf8v87iF8uX6PQmiHMt8bmGs83pwzoJ+Qn/JfG7FZdwKSWKGgxBCCCEzBxoOQgghhMQODQchhBBCYicxw4H3rVjUdl7Xfb7C1lXduzO808VOEZkvK8QRwGLPHR4L6gDenz8+WGUt7F6q5M3qit7H7HdrcYKFRNf0PaXU7da9m15VtuWaBOsqsHUYu01k3Vld2fu4cqJoGsH7zkt7HlbanxVOQY3jxFw3WC+DBayybrdu7n/B3uIdJy8M11uXaPoC/4c4FWkH612wyFe2P6vzu+63Y+3EvT6oFMBaK+xqwv1R9mNWWGSrO0kZ60hw4rbM5xbuaTjNOs1gDHgiMwZc2P2A0v6sMMboFkRjLSEW7st8bmGnZRy7A4uNRAwH9sWH2VUBITCW1wI/fEFkWj8hEJNcxQ8T8qvVC5S0fsJgGwfPDNWE2lUBYacLvtymwc6Xn646S6nPS9hWe73Hjoa0cGKEoESHtV0tsxsBu7BwVLusz0u7VM4KXBw9XbBjQ9bnpzkdN8rsqQHGLGwsjh+tPJ2mI4A9mi9R+s1PCzKDpQSLssNuz8Wun7jN/XTBmIAYOLLNfsJDjAQPFmF3GWK7dRyBBouJRAzHr1efp3wYOuGJ1A1uKGENS1bYBeIGq/NlGp2wFU2aFhMgdoGsS6er+56UReQNnnZkPTp57UdPA7gRhtni5lYcT2B/6/iHUo9OR/ls5cwH7L6S9QQp7l1M0yXsDT0rr+2L5HUwQyn7Syc8DMndFZj1lel0wrbRNIIZHNlWnRCGQe4qixp/CHGXZjKJGI5SCW1ugnxDm5vgxoiBfKA0PkWWUmjzfDER2jwtyHYGSUYaJQ54fSD7K0jrxHbjNIQ2N0FaQpvPJGg4IoiGwxENhz80HGaR7QwSDYc/NBwONByFh4Yjgmg4HNFw+EPDYRbZziDRcPhDw+FAw1F4aDgiiIbDEQ2HPzQcZpHtDBINhz80HA40HIWHhiOCaDgc0XD4Q8NhFtnOINFw+EPD4UDDUXhoOCKIhsMRDYc/NBxmke0MEg2HPzQcDjQchYeGI4JoOBzRcPhDw2EW2c4g0XD4Q8PhQMNReBIxHN+uP1n5IHQ6ee1tOflxuqVMEyR5vPzSiF82xHeY2LE1pwwTfLFmjlKXTud03iOLyJvbN7yk1KMTjnb3i96aJM0TPUpbg6SLIDhd9mq+VKlHpz83XSyLyBucyivrCRJOPU4jCB4l26oTDDTx5rnhWqW/giSj4Z6eeeiRaXT6Wu3cnPxpAZGVZVuDJE8OP37NzUoanb6/cl5O/plGIobjhIgfklcgn6/XzVXS+QkBW2RQI4SZjXIj+8HK03LymwJBn2RdOsURta91std6a8ZEyLr8lNZAPoiY+vEVRyrt9dOHKg+xj4A3DYKzybp0QiAl0+C4612rDlPq8tNHqg63tu7cJotJBVECBcIMl8Ix3nGBJ/T3Vhyo9JufvlR7nCwicqBABMJLI5gpf2f5fkp7/fSd+lNkEdYDA8uVdDqdsvZ2WcSMIhHDgTNBDmpdYr0v4Iv/0aojrIu7H5TZbXBT+dmqswPDgsNdP535gXgBh4sflMzjFkzJ7pkBtm2yT2Y3wuC2cWvflsWBNwEMpHEMTFnu2/SaPfUp63UL0V1x85dTrGkCrwVgDt9ctpfS/qwwW/XdzM0jjtcpANEIMe0MQyPrdgvhz2G+43o9tXy02frv+lO1YcHRT9+rnxfLTI8purZusn7beH7g4PD5mtn2q1KiB7Mc36g7Uek/t/AAgijIfrNeCPP9sRVHKPncwj3tgNYrYnkVbQqcpRX0ih9jzG4N59hHFniBaKOIvizzuYVI1Ye0XRXLA04xkYjhIIQQQsjMgoaDEEIIIbFDw0EIIYSQ2KHhIIQQQkjsJGY47t74ir19EDse/HRE+zV2PAEvsEX1ou4H7eN+Zb6sfrl6gb2lFquRSfz8a2SldXDr35XPwa39Wi733HVUajw7VGsd2Hqlcv1uYUEdVvwTPdh99Pe+J+z4JrIP3UK8Hr/F3didgRg2WPQs82WFeCgLuu6zF7V7gaPdEXdB5nNrj+ZLrJv7X7B2pnDbeKmBnVjYVPCHxguVzyErjAFYwN29dZPMboN/x/8jncybFcpHPagvrWzescVa2L1UOx7+KnONp669XdnmXEgSMRzX9D2lrOL1E1ZL121eK4uwf9gyrZ+weh0fCImPZSMN2t0QUtgVU6o8M1SjXK9OWClP/JnTcaPSZ376cOUh1oapkZz82AUUtCvDrV80nJuTH8DIvKt8fyWtny7sfkAWQQyD3X2y3/2EAItyhwj+HiXwIupLK3+MEGwQsZ+SMk+JGI4frzpD6QSdzu68Oyf/2PbJSIMbhKdvEh/Hdtyg9LlOeFotVTDLI69Xp/1brpBFEBe7VM5S+kwnuTW2ehpB0PqmcmdFL+t5REmj01drT8jJT8yCARMxV2S/64RZRzf4u0yjE+pLaqDWgW3H2Oov26tTXCEBgkjEcATte5aKI7Q5MQtelcg+1wkxVEqVNIQ2LyVkfwVJhjbHw4ZMEyQZPAwPPTKNTohRQeIDr8hknwcJoczdmAhtngYQF0m2M0gIcZ8ENBzECDQcDjQcZpH9FSQajtKHhsOBhiMAGo7Sg4bDgYbDLLK/gkTDUfrQcDjQcARAw1F60HA40HCYRfZXkGg4Sh8aDgcajgBoOEoPGg4HGg6zyP4KEg1H6UPD4UDDEQANR+lBw+FAw2EW2V9BouEofWg4HGg4AqDhKD1oOBxoOMwi+ytINBylDw2HAw1HAD9aebrSATqd1XlXTn7G4UgfiMAo+1wnBKopVWa1LlGuVyeYNeIPjvaWfabTnSIOx4rxdiVNkGR04qhxOPBQReIDkaaTiMOBetPG0LZxxuHQgTDFsgP8hEijNeMdsgjrz00XK2n99JnqYxhpNGZg6KJ86RHavlR5cmiFcr06PTJQ+qHe8yFKULkP2ZFGh3PyI9IoAnHJtH7areGcnPygdbLXekf5vkpaP53fdb8sghgGR2PIfvfTJ1ccZT+ousHf8e8yrZ9QX1r5XeNCpb1++q+avyUWwCwRwwFu3fCi9ZemRUq8d7fwpPjqaKPMaoOwtOd13Wf9tvF8JZ9bJ6y52eryiaNPzPLccK39tC4/A7f2zPxoHxhYLrOWHDAdezdfply/W7iBPTZYKbMSAQwDZhh050RAmGVrnuiR2W36MyYE5yohbLnMlxXOWcFsKiI3elE13mYd1na1ks8tvE67bv0z1g6epRI7eIiEscMrSfk5uIVX8njt4AX+Hf8v87iF8lFPmh9aYZ7O7brX+s1q//Fw94zmrrnF6tk6ILMXjMQMByGEEEJmDjQchBBCCIkdGg5CCCGExA4NByGEEEJiJxHDgQUuR7RfY30g4NjpT1cfYy8WiwvsRf5m3Una3RXvKt/fXoizZku/zG6zsHtp4EpnrJyf3XFDKrdUZXlooMz6Wu1cpe1uvTvTF1i4F9ci3E3bRu1Fp0HbILHK+sb+52V2QkoeLHLEIkb8FuXvwq1v1J1oPTrovfsJO8q+W3+K9eayvZR8WWFHDhYayngkWa7sfdze/SfzuYX7+6FtV1mj2ydk9tTw9FC19a0QY8CvVi+w2ib7ZHabi7sftD5VfbSSz60PVh5sHd1+nefCU/QP+iloPER/o9+LmUQMx4lrb1U6U6c4gpR0ZwbNKNvcEDtEct+m15R0OiF4UBrBD+ltZfso7fUTVvrHQZT4FbhBLB9tlkUQUtIgYJ78Lfjp7Zn721qxOwOm/n0VBypp/eQVTyRq/Io5HTfKIlJB39SgbSZke/303/WnyiLsgJIynU7z1v1TFmH3j0ynk4wnUkwkYji+XX+y0ok6nbL2dllE3mBrpqxHJwxwcoYCsxYynU4/WXVmTv60cPuGl5S26oTYKHFs+/v4iiOVunRa1POQLIKQkgXbg3WzEl66Z+OrOWU8P1ynpAkSthS7OWPdnUoanTBzmkYwAyTbqhPGADlbc/yam5V0On1/5byc/CBoZlkK/V+sJGI48g1tboK7Nr6s1BMkuT//8LZrlDQ6eTnkNIDXE7KtQcLNzzQfrjxEqUcnxGEhZKaA6Xj5GwjSbRv+lVMGZotlmiDJGBYnRZyhxivQNGIitHnUCMt4hS9B/8h0OqH/ixUajgii4XBEw0FIYaHhMAsNR+Gh4YggGg5HNByEFBYaDrPQcBQeGo4IouFwRMNBSGGh4TALDUfhoeGIIBoORzQchBQWGg6z0HAUHhqOCKLhcETDQUhhoeEwCw1H4aHhiCAaDkc0HIQUFhoOs9BwFJ5EDAeitslO1AmR3EyzbGSVUo9OCJYjY0+c03mPkk6nPzddnJM/LeAoddlWnXatOkwWYYSo8VluYrRRMsNAxEr5O9DpueHcIFE14x1KGp0Qc2dyx1ROGYt7H1XS6bRbwzk5+dPCq6ONSlt1QpCw7Tt35JSBY+tlOp1+17gwJz9A/8h0OqH/i5VEDMeLw/V2FDzZkV76xIqjrA0i8IwJYB4QulfW5yevEOuIVvqfmcFXpvXSO8v3s7/gaQSzFYikKtvsJQS/uXb907IIIyzNPHG8JXODk3V66Uu1xylBeAgpdZb0Pq78Fvz001VnWds8ZiL/1HSRktZPXtGR8ZSPYydkWi8hgvEzQzWyiFSAMSDKw+9FHg++iFb60aojlLReQmRrPOhK0D9hIz2j3+UsSzGRiOEACKd9Vd+T9rS4nzAdOLhtXGY1Bn6MCE0r63ULRkMXQhsf/s39Lyj53Lo6c50yxHDa2Lpzmz3gy7a7BWddMdYqsxpl1eZO+7wAWbdbeB2G83gImYmUj7XY9yX5u3DrwYEy39eeGGgfG6y0LuhequTL6pKehzODY4PM+gZDmfsyIhTLfG79ve8Jq2WyV2ZNFRgDHhmosGcqZPuzujTTF6+NNsmsbzCwbcy6pf9FJZ9bGOs6tqyXWd8A/YT+kvncQn+j34uZxAwHIWliftc91hdq5mj19boTrTs2LpNZC8oLw/XWD1aerrRNCgdS4ZWTnAL2Ak/NMr/Ul2uPt+7dlBsm2yQ7M39wU5b1eulnDWdbKzevk0UolI22WD/NpJX5CynMxJ2+7g7ZNEJmJDQcZMZzy4YXlKlLP+Ek2x07zZ8jEwYs3oty4CAUNJ39UsS1TCvG22URRnh5dLVSl04wQNstfzM1tH088PTNQmqxxytZQmYaNBxkxvPeCKdnQnjtkwSLe6It1oOOaLtGFpPDmevuUvLo9Inqo2J5nXVu171KXUHqmPSfosY0uUyfpN5dfoBsIiEzjhlvOLAgFQt5/IT3peM7tshsRsG7Vqwel3W7tWZLv8xGDCEHhyDhO5EEC7uWKm0J0oGtV8picsBJzDJPkI5o15uY6YDXDrKeIDVP9Mhi3mA6Wx7jVqnRnjF88j7lFu5pfutITAHzW5b5Pcq63dowNSKzGad1slep1626zWu1rzfDjAHobx1YRI/1hjKfowZrU8ILTme04Tiz8y5714W8MUhhGj1oanq6rJ7oCr3i+6/NizxXnZP8kP0cpJluOPCb+Uf/c7KovKDhKB4wOP4x5E6Xz1YfG9vCUWznR7gCWafUmzLfV8ygxcGWHVOhd7pgTY/X5gH0D/pJpvcS+t3LxGGR8LvL91fSS725bK9YwkyEZcYaDjhO+WHo9Knqo2URRvhD44VKXTolvWixFJF9HKSZbjigXSpnWS2aAT8qNBzFA3ZkyGvTaY/mS2QRRgi7HRWCScbDnWmu6XtKqUung1qXyCLs/pHpdEL/u8GuoyjrlWDAkpoxn7GG4+6NrygfRJDiiPsQ1tlmdca6O2URJE9kHweJhuN1faPuRHt3iQloOIqHqN+ZL2ae7E2DraiyniBh279pZnfcoNSjE4IbStA/Mp1O6H83XVs3KWmChNmhJJixhsNEaHMThH2dktVp3GJnHNnHQaLhcHRY69XWTgO7dmg4ioc0hDZH/CNZT5DwnTBNGkKbY/eaTBMkhLhPAhqOCKLhKE1kHweJhsMRpmexIC1faDiKBxoOBxqOaNBwRBANR2ki+zhINByqercOyqIjQcNRPNBwONBwRIOGI4JoOEoT2cdBouFQ9bma2Z6r58NS6oYDh66VCjQcDjQc0aDhiCAajtJE9nGQaDi8hSBi06XUDUcp7S6j4XCg4YgGDUcE0XCUJrKPg0TD4a03le1lPT7NG1kpG469mi+VzStqaDgcaDiiMWMNxz0bX1U+hCBxW2xpIvs4SDQc/vroiiOszi0bZTWBpMFw/HPjSx7RGfMTokeWGlG/M2nZFvvAwHJZTN4U67bYp4aqc8ooFDPWcOC0Sfkh6ISZiDj4U8iIfVlhZoaYRfZxkGg49Nq9Yb4djCgKaTAcTRPdshjiwW0b/qX0nU57xjTD87EV0QJ/Ncbw+V67/mmlLp1meQT+Qv/IdDqh/93gt4Y1QjKdn7CzzCviaSGYsYYDzO+8x+58+YFIIYobjgWPA9w0P1c9W6nTS3s3X6aNx0+mh+znINFwBCvqkew0HMUDjlcIGx0TrwvaJvtkEUbAcROIeCvrlEI47wu6l8rsRkBo8981LlTq9NJXao+3X39I0D9hX6ug372Ot3h0sCLUIZRvKdvbWtz7qMxeMGa04QCYmnt5ZLUyFZpV1XibNZn5UsUJHGr95rVK3W71bB2Q2Ygh5I8ySDQcwXrz8r2s5kl/QyCh4Sg+urduUu5TbuGeFnWmKyoTO7ZalWNtSt1ZvTK62hrcNi6zGQdGQtbtVtAJ02HGAPS3js07tlgVY61KvqxeHW20hgrQFzpmvOEgRA48QaLhCKddKmZZW3Zuk1V6QsNBSOlDw0FmPHLgCRINR3j9cOVpnlPAEhoOQkofGg4y45EDT5BoOKLp731PyGoVaDgIKX0SMxxYMXxl7+PWeV33+eqG9c9am7aNyqxv8K+RldZF3Q8q+dzCVii/JyxERrx306tKHrcW9Txkr/FIO88N11oXdj+gtN+thwfKfRedYvETdsDIPG5d0vOw9dpok8z6BuunhuzjmmU+tzD4dGxZL7Mmihx4gkTDEU3YIVAW0Gc0HDMPfH5BY8D1mTEAMTfiAmPAfZteU+p16+LMGIM1EHHSMNFpXdH7mFK3Wzf2P2+vOfQDGxuCxsMHB8p8x4BCkIjheHao1npr2d7KD95LH606wh7IJGd33q2k9dOvV5+nLF5Cp/901VlKWj/hg0wrUQLx/LnpYpnd2rpzm/X9lfOUtH7yemLFSmvs5pFpvfSu8v0TG7S9kO0LUlJtL1bDAX2m+hjtw0MaDMeJa2+xFnYvNapLMg8sTw/V+D70zFTwsPi2sn2Uz8BL/1l1WCyL5jEm7NYwX6nPTxiw4wBHxYcdDz+x4ihrw9SwLMIOCCnT+gm7anbGvJjXj0QMxy9XL1A6QSc52GOAfHv5vko6neQg8VLGsco0OmHLkTQtaWBs+6S97Uu2VyfEIHGDqHMyjU67Vh2akx9EMT3Qfi2XyyISQ7YtSPK7VCjSYDjeVBa8jdxP+Mx3+BxlnwbDEadKLdpovvxv4wVKH+kUx2CPHSyyHp3woBSHcfx5w9lKXTpd1vNITn7s1MF2V5lOp+qEAtIlYjiwH1l2gE7HrbkpJz9OppRpgoTXCW7SEto8XzCzINsZJMwwucFUnUwTJHlQFwYTmUann606Oyd/ksi2BWkmGw6clxLV4LqFaWMvSt1wQMQBIb5l/+iEEOKmmc53JI7XO2FjcGTF0OYRoeEwBw1H/si2BWkmGw4cQnZpz8PKv4fVO8v3s9ZuVYMf0XDMLGg4HGg4YoaGwxw0HPkj2xakmW44MK28Z1O4SJNe8jrMi4ZjZkHD4UDDETM0HOag4cgf2bYgzXTDAfoyv8GPVYU/y0IKYfrda6JoOGYWNBwONBwxQ8NhDhqO/JFtCxINx+ssH2tS/j+s/iMjbNHLQsMxs6DhcKDhiBkaDnPQcOSPbFuQaDgcLup5UEkTRa3//2AvGo6ZBQ2HAw1HzNBwmIOGI39k24JEw+GA9RxfiHjDdAs3W2zro+GYWdBwONBwxMx36k9ROkAn3BTdINqaTBOkp4aqc8pABFKZRiccY48bY9rACYKyrUGSUfP+ueElJY1OCFIjY5Ic2naVkk4nBGNLC7JtQaLhyAWxNcIGffPSyZkbKA3HzOIHK09T+kenE9bcLIvIGxzpLuvRCRFzR7dPyGLy5ut1c5W6dDpj3Z05+funhpU0QXp+uC6njEKRiOGIepOTZgF8u/5kJZ2fELRrw9RITn5ErkMgF5nWT/+z6syc/GniS7XHKe310wcrD1ZmahBqPEogNS+zENW0IGR8WpBtCxINhwpC3k83PgfM/OdrZiv/HqRiMhy7ZAwZccCgKftIJ5gD0yCC9XsqDlDq8hNMUhzATMm6dPIyC1+rDW9a3l9xkDZEepwkYjjGd2yxZnfcYEeslJ3h1hdq5lhLeh+X2W3wKuG3jedrvzB4EkfIboTR9eKZoRrru/WnaKO0waz8ofFCe9oqreBcGkRvfbfGQCGM8A9Xnm69Otoos9vgBw0Th5u/zJsVvqh/bV7kGWYYoXLP77rfDmEt87n1sRVHZJ5ob7OjxaYF2cYg0XB4g9DgMn2cKhbD8eHMfa5yrE02cUaD2eI5HTdmxoDDlP5yC68bFvc+KrMbA4P3f9efGjgGIBz4mi39MrsREC366PbrrA9XHqLU7RYeLHFWlRctk732g2DQGADTtGykQWYvGIkYDkLShPxhBomGwxus5/hZxDDN+ci04bh74yv2TI1J4dC60R3mp+EJKUZoOMiMRw48QaLh8Aczjx8KeFIzJdOGg6fFEhIvNBxkxiMHniDRcOh5ZLDCXmAn85oWDQchxQUNB5nxyIEnSDQcwcxdE/96DhoOQoqLRAwHFhjesP5Z649NF1m7Ncz31T4ti5UtnFmwPenszrutX61eoORz69iOG6y1MS74xKIjHD0t63Xrz00XW7f0vyiz2mB7KRYCYWGqzOfW/i1X2O+E08yTQyusPQP64i9Ni+wYKGlCDjxBouEIZnLHlL1YUuY3KRqOmQ0WW57TeY+9WFLeZ9zCgky/BZ/4d/y/zOMWykc9qM8LbEpAqH6Zz60/Zca6m/qfl1ltMAZct/6ZwPEQsY5eGV0ts9uMZMbDMzvvsjcPyHxu/a3jH1bnlo0ye8FIxHDgiGr5Y/cTVg+vGG+XRdgDtEzrp09VH23vjDENDIBuV4cUTJZkYXf4QQSrjBsmOmURqeCF4fpI0+hhB65CINsWJBqOcGA309vK91HKMCUajpkNdszJz9BPH19xpBJDA3/Hv8u0fkJ9EtwLomwH99plckmE05ex87Ju81pZhPWb1ecraf302epjE4splYjhwPZM2Qk6nZVxbm7wRYky0EMvZgZE00SdNt494zAl36g7UUmn04XdD8giUgGeEmRbdYKbTwuybUGi4QgPzkuJ+lsNKxqOmQsGzCgDPYQwCG7wd5lGJ9QnB+pTI/5+frrqrJz8AKEZZDqdFnTdl5N/cNt4pIc96OUR75mSuEnEcKQhtLkJDm+7RqlHJ+z3lnw6IG6F1Gnr7pBFpAKGNo+fYjQcAK8DZTkmRMMxc0GIcfn5BQnfCTfT+Y7I0OYIuS7T6ISQ7hKGNo8ZGg4HGo7kkW0LEj53vNM1LcSBkE9QborVcGy3dlhfrT1BKStfmTYcCEYoP5N8haBVZaPJGNRShobDgYYjABoOBxqO5JFtS1LndN4tm/cGxWo4QP342khHCYSRacMRlzAVjzVOxBw0HA40HAHQcDjQcCSPbFuS+lzNbNm8NyhmwwGuXf+0Ul4+KhbDAX2o8mDZRJIHNBwONBwB0HA40HAkj2xbkvpI1eGyeW9Q7IYD2/8Oal2ilDldFZPhgIg5aDgcaDgCoOFwoOFIHtm2JFXKhgPglEpT8TloOGYuNBwONBwB0HA40HAkj2xbkip1wwGqx9uVcqcjGo6ZCw2HAw1HAD9ZdabSATphtbcbBPGKugf7JZ+IpfmAY9ZlPTohKqoER8LLdDpd3P2gLCIVIKKrbKtOiL6aFmTbktRMMBzgyr7HI8cOkKLhmLkgkq3uSHkvPTdcm1MG/i7T6IT6UK+b0zMPgDKdTrs1nJOTH3x/5TwlnU7nd92fk394++bIv6VXRxtzyigUiRgOhHGVHeAnRNdcuXmdLMIOJSvT+ukLNXO02w2nS9V4W6Qv/e0bXpJFWJf3Pqqk89M7y/ezWid7ZRGpACF3owR4emBguSwiMWTbktRMMRxYz/HThrOU8qOIhmNmc0Br+PguiK65WUSbxt/x7zKtn1CfpHZ8jR39U6b1k1d486v6nlTS+ekd5ftajR7xYnBkhEzrpy/XHm9tEcapUCRiOMDSzA3hiPZrrMParvbVnI4b7UHdC3TYZT2PKHmk8Aqif2pYZjfG8tFmOz69rNetI9uvtR4ZqJBZ3wDxF/B6RuZzC33hFdI2TSB6HWIZyLa7dVT7dfaZK2lC/iCT1EwxHACm42MrjlDqCCsajpnN1p3b7Dgn8h4jNW/dP62+qUGZ3Qb/jv+XeaRQD+rzAoEAg8YAjHWIuuvHvZteDTUGVI93yKw2mHlBiHSZR+qMdXdaG6ZGZPaCkZjhICQtyIEhSc0kwwHwQPGmsvAzY27RcBBSXNBwkBlPlCnRuIXDpPzA+h2ZPkhBhgNPdzKPTqYNB8BZSbKeMGrRvF58YNNyJX2SekvZXrKJhMw4aDjIjGd2e7QFr3Hqr03qiZRZlo81KemDdEF37gIzyW0b/qXk0elpcQCWCaZ2bo902iWE9UI4ktsPnIsi8ySpWa1LZBMJmXHQcJAZz7bMgId3sF+smWP9V/XfEtPuq8+12ib7ZPNyuKbvaWuXilnKgOal79SfYvX6vLvOgoVzWDkv83oJ2/cGt4/LIozQuWVjpJOTl/Q9LotQuGPDMrsPZD8XUl+qOc46bs2Nvu//CZlJJGI4sI1nn5bF1rsDzlb4UOUh1nniKN40sTPzB4twPlh5sNJ2t95TcYA9tY3tvGnlzo0vW5+qPlppu1t49bBbw3yrY8t6mZ0QUgBgSH/ecHbg7jjE98FCxLi4qPtB68OZ+7Os1y2cnbNX86X28emS0e0T9inCuDfKfG5hDJBhEbJgtwZCLASFSPhc9WzfRfv4d/y/zOMWykc9XrtDTID+QT8FnTWE/ka/e1G/ea31g5WnBe4UxEPVU0PVMnvBSMRwIJCX7Aid4gjaZYK7MoO0bKtOaQ3ahcV3QTcwt3DDI4QUnh+vOkP5PfoJDwjtk+YfDhA0StalE2L0SBC8SqbTSQbtAt+qO0lJ5ydsJ+3ZOpCTH3/Hv8u0fkJ9cRA1hpFX0C6EfpDp/IQH/aR2qiRiOKJ8USAE2EojUb8ouFmkkajv8WFOtu/cIYshhMQIXssEPcFKYcu9aaIGu/pq7QmyCOt79dGCXclo01i/I9MESc5y4O8yTZB064amC/pH1qMT+t/N+qkhJU2QZBC0QpGI4cg3tHlaMBHaPA3c2P+80tYgYaEfIaRwYL2N/B0GCQ8Tpok6O4G1PxKE+JbpdEIIcTdpCW1uAoY2jxkajnRBw0FI+qHhcKDhcKDhCICGI13QcBCSfmg4HGg4HGg4AqDhSBc0HISkHxoOBxoOBxqOAGg40gUNByHph4bDgYbDgYYjABqOdEHDQUj6oeFwoOFwoOEIgIYjXdBwEJJ+aDgcaDgcaDgCiHpuwqU9D8siUsGCrvuUtuq0R/MlsohU8MxQjdJWnT5adYQsghBSAIKie0q9OFwvi8ibK3sfV+rRafeG+bII649NFynpdLqw+4Gc/DusnYFRSqWWjzbnlIG/yzQ6oT7Uaxr0j6xLJ/S/my07pqy3le2jpNOpbvPanDIKRSKG4+WR1YFhXLP6bPWx1qYYXKUJEHDlEyuOUtrspfdWHGiVj7XIIlIBgnghZLlss5cQeOim/udlEYSQAnDd+mdCB//61eoFsQyQQ9vGQz+Vv7N8P+tfIytlEda/R5tCGwaEad8wNSyLsK7ofcz6j5B98aeMwcFRFG7wd/y7TOsl1IP64gD9g36SdXoJ/Y7+l8CQybR+2rdlscxeMBIxHACHNeH8jts3vOSrBwaW2zH30ww+/KWb/q203S2EQJdhddMGDjDDNJtsu1TDRKfMSggpICs3r1N+l1JPDq2INRrw2PZJ68GBMqVet+7YuMye7veja+sm+94o87mFMUAX3bNmvEPJI4UZXD/jhX/H/8s8UqgnTtBP6C9Zr1vob/S7H5VjbUoeqeeH62S2gpKY4SCEEELIzIGGgxBCCCGxQ8NBCCGEkNhJzHBgi1fFWKu1bGSVr+o3r/V992aKji3rlXrdemV0tTXosUgnC96TYsWvzOcW3q1N7NgqsxoF27VkvVJ4Z5p2sGYHq8dl290KWkfSPzWs5JEKWlPTPNGj5HHrtdEma3j7ZpntDXCyZ/V4h5LPrRXj7Xa6tLN6oktpu1tYABj3Wiv09aujjUrdbrVM9spsOXRnvv8yj1TQsd2rNncqedwqG2vRvmc3Ae5HuC/Jut2K41h6N1hwibUksl63sEh+PHOfj5OBbWP2JgRZt1trtvTLbCQhEjEcTRPd1idD7u7YreEca3LHlCzCCHPX3KLU56V3l+9vPTqYe7QxwI3lRytPV9J7CbttYG7i4J8bXgq1LQqr2y/oXiqzpwYYs12rDlPa7aU/N13suSjuhvXPWm8t21tJL/Xmsr2sxb2Pyuz2jfSg1iVKei99oHKWfUOTwPx9o+5EJb2XcDQ1DFIagdnfs/lSpc1ewnZNue3QFNja+f6Kg5Q6vXRY29Uyu83F3Q+G2t2B39Et/S/K7Pai6t83LlTSe+kjVYfbZjMOsBgUO95knV6a03GjzG4EbMP85eoFSn1e+viKI22TFgdYRBl2t+Opa2+X2UkCJGI4wt7Esrp2/dOyiLzBDUHWo9PHVqixJy7reURJp9OszEBmGgTggiGSdfkJN13dyvEk+XnD2Up7dZKBfPA09fbyfZV0foLpkIP9s0O1SjqdvlV3Uk5+cNq6O5R0OslAPmnh4YFypa06/XjVGbIII8CUybp0ktswMZsVxmxkhS2K8iEHuylkOp0wIMcBtojKunSKYyt+1ECB2HoaB2EfTrLCjAxJlkQMR9QbyPFrbpZF5M3dG19R6gmSnDY+oj1apNHv1c/LyW8CzJrIeoL03HCtLCYVRL2BnN91f05+PEnJNEHCqxE3f+97QkmjE56IJZh9kel0+l3myTmNYFZAtlUnzPjEQdhYC1nJB5SXRlYpaYKEV2puzum8R0mjE57sTQMTJOsJErZCmubktbcp9ej0hZo5soi8QWwmWU+QEL6AJEsihiMNoc2jPrFA8p19GkKbt032KfUECU/xaSRqFMXzuu7LyY81PzJNkPAu3M2SiFEU8fpGEjaYUFb/23iBLCIVXBTRcOC1RxzIeoIkDQdmPGSaIDVOdOeUcXbn3UoanbxmRPOllEKb54uJ0Oak8NBwRBANR7zQcKQLGg4HGg4HGg4yXWg4IoiGI15oONIFDYcDDYcDDQeZLjQcEUTDES80HOmChsOBhsOBhoNMFxqOCKLhiBcajnRBw+FAw+FAw0GmCw1HBNFwxAsNR7qg4XCg4XCg4SDTJRHD8fW6ucqXQacTYtgWe8/GV5V6giQjCB7Vfp2SRqcfrDwtJ78JEEVP1hOkpE8M9OM/I26LlUHMEIFUpgkSomS6uarvSSWNTu8o3zcnP/hL0yIlnU4IKJVGFvU8pLRVpw9WHiyLMALipci6dLp+/bM5+RGcTaYJkoxaOj/itlgENjQNtsVG3SKMoICmOWXt7Uo9On2p9jhZRN4g2qqsJ0g4eZYkSyKGI2wkx6y8Iv/lC8I1R/nxfr5mtizCuqbvKSWdTkdnDIppEG0TN3pZl5/wRN67dVAWkwp+23i+0l6dHh+sysmPG3LYKIwQgoQhNLIbhEmW6XT64crTc/KDBV33Kel0OqvzLllEKsCx3bKtOv2i4VxZhBG+W3+KUpdOMuLphqnhUJF4s8JMDQLquXlooExJp9MfYwp29eUIs8O4v+HYBdPgGHVZl077tiyWRRjhU9VHK3X5CYHfpIkkhScRw9G5ZaP1zbqTlC+Fl/BlRVjhOMAT3FtChMFGQCoMRBKcgxE2yBNep/RNxTPQP5EZeHepnKXUKYUBFqG/0wpC3mP6VbbbS7M7bpDZbfAUE8Z0IJqkX1Ckeev+GcqM4oZX4xHCGgHidm+Yr6T3EqKryld1aQKvM2WbvfS56tmBZ9xMF4S8/0SIoxAwqJzpY95u7n/Bno2SeaRgNh4ZUI8xQMj7I9uvVdJ76Ys1c6zWmAY3BKpD6HRZpxRmheQMoCkQ8v7A1iuVOr30tdq51tqYIhsjoNuuVYcqdUrhIcvrGANSeBIxHFkQchhfRj/Jp884QDhsWa9U0AFyiHon87gVl9FwA1Mm65WK+wA5U+CQOdl2t4Y0h+kBPJ3KPFI4D0LHSMY0yDxuhQkPjydrmc8tGVY9rcAQyba7hQeIQiDrlZKRgCWYAZN5pOTMhgTfPZnHLRwQFzcwP7JeKfn6Nw5wf5b1uhV0QKIJcG+W9UrFfYAcCU+ihoMQQgghMwMaDkIIIYTEDg0HIYQQQmInMcOB4+GxaBOxFPyEkzt16x+wWFLmkbp1w4v24s64wHqDK3sfV+p169Keh+0YEX5UjLXaJ3PKfG5hu+aGqRGZ9Q1wlLjMI4Utcn7vqPGeEwtKZR63cDrri8P1MiuJCSxUXti9VPkc3ELMiTgXnWLNAnZjyXrdurD7AevV0UaZ9Q0Q0+KynkeUfG5d3vuo1T65XmY1BtY43bnxZaVeKexGwRqJNINt7fgtyra7hSPkEbcjzdSOr7EuydwbZdvdQlycQqwFyQe0D+2UbXcL14nrjZPHBiuVeqUQl8VvDCgEiRgOdEzYvfUIBuW1ECvKEck/W3V24MLP6YCj4cPsDoGwUtor/sV9m16zV9fL9F76aNUR9kJECXZsyLR++s3q85UbKhbThd01BMEokni5bv0zSr/7CTt7ghZMTgcYmc9WH6vU56ebMoOcpGysxd4dJdN66d3l+1srN6+TRRgBsU5kfX7CbpS0gp0nsr1++k79KbE+bOXD00PVoXYIQtj2H2aRdhKgXWHDEuB6cd1xcPyam5X6/IQddHGMh2FIxHCE3TKYFZ7y3GCHQZR99ZAM8GQCbMGT9ej0h8YLZRF2HAeZTqcreh/LyY+BJqxhyUruzYcBlGl0ggkk8YJtprLfdUJsBNMg/o2sRyevAE9ht09mNafjRllE3iDmjqxHJ2yJRmCptIEHBWzble3VKa4BLl/w4CPbqtO5XffKIlIB2iXbqhOu2zSYyQpr3rKqGm+TxRSERAxHvqHNEbhKpgkSXjmYxkRo809XH6Ok0+m0dXfk5DcR2hzTrzJNkJKclpsJvCvztC/7XCe8sjCNidDmv1y9QEmn057Nl8oi8sZEaPM0kJbQ5iaIMqMKHdN+vSwiFaBdsq064bpNg1kWWU+QsBwhCWg48oCGg8QFDYc5aDjSBw2HOWg4AqDhcKDhIF7QcJiDhiN90HCYg4YjABoOBxoO4gUNhzloONIHDYc5aDgCoOFwoOEgXtBwmIOGI33QcJiDhiMAGg4HGg7iBQ2HOWg40gcNhzloOAKg4XCg4SBe0HCYg4YjfdBwmIOGI4Dv1p+idIBOp669PSc/9sjLNEGKYz86YgbIenT66aqzZBHWlyOaL7kfHVHuZJogLRtpyCkDMRxkGp0QAyWpwDEzhQ9VHqL0u06IBmoaRNCV9eiEY9Mlf2y6SEmn00GtS2QReYMYPLKeIOGU0bQBkx813sK9m16VxaSCqPGH5q65RRaRCtAu2VadcN2mQTBIWU+QXkgoYnQihuOMdXcqHaCTV4TOH6w8TUnnJ0QDxRHypnl0sEKpSydECZScECFCHAISeYWQ/nrdXCWtn3atOlSJSgmH/I6Q0SAhRG0k8XJA6xVKv/sJgxCCW5kG4fjDRgSGDmm7ShZhh+SX6XS6fcNLsoi8Qdh+mCFZl58QwExG400Lv159ntJeP2GWzCtKcxqY33mP0l6dnorhgdEEaJdsq0647jj4dv3JSl1+QmRUHFmQBIkYjokdW60T195q/7A/U32Mr75Vd5J9vocXnVs22tOvMo8UwprHEWU0C26omCaT9bqFWYx56/7pGWYYN0PMlHyxZo6Szy18ofxuxjiD4s9NFyt5pHZrmG9VjnlHmMNrlh9l3LfM4xbCXOMJtN8jvDoxC2bx8Mru8zWzlc/Bre/Vz7MeGaiQ2Y3xwMBy+1WgrNcthFZHOHCvM10wE4ab7FdrT1DyuQXTjPOE4hrocXbTLxrOVeqVwoxM62SvzJ4acLYUorfKdkv9eNUZiT3FhgHRonE8RdAYgHsrzgtKM2hf0BiA68T14rrjADNyf21epNQr9fOGs63ysRaZvWAkYjgIIYQQMrOg4SCEEEJI7NBwEEIIISR2aDgIIYQQEjuJGI7tO3fYW+5wVC8WMvoJCyH9VidjUR0Wnso8UrNal1gtPovAGiY67d0AMo8UYl+MiJ0dWRDf409NFyl53Ppt4/n2wiKvraTbdm63Lu152F59LvO59ZemRb6LwDZuG7Vjlcg8Uoe2XWWt+X/tnXmcHVWB7/99b0bHUWdGHUbcl+cyo350Rp1xGYeZ0Tduo6OyyCJLCBIRgywCAsomIKBsIiAIsstOgGERCItk6XQ6nU46ayfpdHfWTtJJpzvpJNS7v5p3qbq/U3WqTt9Tfeve/n35/P5ocpa6t7qrfnXqnN/ZtYGriwLAUmOs5uFzEBf+vcicBKxQOG7ltUa/LGQJINsmCUy4xuRsrhMXsjawAitpUrQoH5hk/p3lVxrnkYUVdIN7dnD1EEwyxzWJ68SFa9rlAw+F13sG10JMuMe1kevFhXvAjJTMCExSPmX1LUYdFia6F5mrguPDcXK/ceFz4vMm3QN8gPOE88X9snDecf4bRUMMxyWVGywv1UnT/3rpm4mzal2Wh71l3hRjKShOEJaIctk0YQYwM3OoK1yqymXTdHXlF45BrgaXS9OfzjowWLBzNTcRfLbrTKNsmjBTGauERHFgZQd/7zbducl/VgIu8lgZwn2lCbPs+WKIUDmX5dK44Ilyg/Cwt8+bapy7NOEmxcwbXum0XPqChDiAXww8bJRLE+4BSXEAX+m+0CibJiyLTlpFVS84Lhwf95cmfO4iwHnivtKE84/fg0bQEMPhkqEBIbcjDkYbXG70EGd5uGZoIOuAlzS5ZGhASX+8LhkaEGd5YIkql8nSiwUuExZBuGyRv3ObDlx6KTdRNxi9436yxCOBrhkab6tcyES5wUMSn7cs8SiHa4bG33eeUlMfuDwkQRjJiIMbpovpgdJGy+sBx8X92ITP7RucH+4nS/g9aAQNMRxliDa/fdNzRpkssUNulWhz4Re8YuPv3KYvdp/PTdTNrB3LjH6yhCfXOD6izUW5QKQ1n7csIRgwzg9X/9YoYxNyWph6o83xGpnLZOn3m/9Y04YPFG3uhgyHg2Q4RB5kOERZkeHwiwyHGzIcDpLhEHmQ4RBlRYbDLzIcbshwOEiGQ+RBhkOUFRkOv8hwuCHD4SAZDpEHGQ5RVmQ4/CLD4YYMh4NkOEQeZDhEWZHh8IsMhxsyHA6S4RB5kOEQZUWGwy8yHG40xHC4rsFGOFac8azBnjm0qKaN/97abpSxCQFISAWN47oGG8mqDNaoczmbEJoWB2uwXTNJ0raoF35Aoit/5zYht8M32GKd+8kStriO8+v1TxhlbHpP+7Sa+qJ8IDmWz5tNCLXilGUEeXE5m5C7xLgEVUGcxYRMJAQhcjmb0pKa6wHHxf3YlJTFVC84Py7hYxB+DxpBQwzHTRueNr6ANL1m9iHBkoRYWsTVctk0IXGRQ7tgWt47f5pRNk2IiGY6hlcFr5p1kFE2TXdtNhMlr1n3mFEuTa+bc2hiNPk3ll5ilE0TDA4bJ+EXhOrkvQCgXBEXwpcr//3LorOM/tL0b4t+wk0E68e2Bm+ae6RRNk0X9t3LTYiSMVb523cZXTh42WXcRGhm/3z2t42yabquYlwZRP9zuTS9uvKw17Wzl5sIjl5xtVE2Te+ff0IwSvcAH+C4cHzcX5rwuYsA54n7ShPOP34PGkFDDAd4eMvcYFrPdeEvTZqwV8rCnWu4aghumtifhOuwfrr27nDflSQ2jg0FZ/feadSJC69Nrt/wZOJ+AKB9uCeYvuomo15c3+u5PhxRSeO+wVnB8Rnfxcmrb040XgB7WFy57hGjDgsppfxaSBQDIo9PXHWjcQ7iwqtCHnnzyXDFVGNEjPtlXdr/YGrUMQzuaWt+Z9SJC2b8jk3Pc1VRUrZWrofnrf29cR5Z2Ioh7ca0eGRt+GqF68SFa9qDg3O46is8unVeeG3kenHhHpC0nQPAPQCjcFyHhRHyzXu2c3Vv4PhwnNxvXPic+LxFgfOE88X9snDecf4bRcMMhxBCCCEmDzIcQgghhCgcGQ4hhBBCFI4MhxBCCCEKpyGGAxN4kFWQtazp9XMOCyesJTF/uCfXbOu3zJuSuv4aM4b/pu1oow4L+RlJs6TLAjIXsBKHj5v19nlTw8m6Sdyw4algv7ajjDqsTy08PVg60s/Vw0m1WJOeNXsdM7oPWXZ5OKGxCJ4bWhzOSOd+We9q/27w+Nb5XN0LmMSLCVpYYcX9xoWl1kcsv8JYQeWLp7YtCJeqcr8s5CQ8W9B21SP7dofLfvFZud+48Htz7MpfpU5SrBdM2MuTefPBjhODFxu0ZDAPmKz5yYWnGcfN2q9yXfvtxqe5esj9g7OCt8471qjD+vCC6alL6M/svT34i8r1mevE9SeV6/uXuy8IMzMYTOT/+pKLM+8BWJmHyalYdcVgsubHOk826rD2b5sS3LnJXCHYSuA84XzxZ2fhvOP8N4qGGA7MXuYvwqZ7EgzD+3LcVKrCTQ5hYXF6dq3P/GWP66MFBLb4AH+IMBJ8vGl6beXCzhcAXMRcck0+3XVGTX2AFUNcziasDvINbla40HJfaUJQ1XbKGPDBZQMPGX3ZdFHffdxE3WDVyRvmHmH0lSYsfy3C+GBWPPdlE1Zb+Qaz8vHwwn2lCTeotFVpjeYTndlmoyrc8JeNDtTU3zC2LdMIxwVjzmDlCZezacrKa7iJcIUWl7MJQY1MnoesqhBf0LtrEzfRMuA88WdOE84/fg8aQUMMR56RibjgcOOMJ2WOk9Uw6sFlbEK4VtrSwUYynpS5Z4YW1rSBJyEuYxPMCV+Q8aTO5WxKyn2ol+6RPqOfLGF0yDffXPpzox+bMNrnG6SGcj9Z6kxZflgPSFHlfmzC6Jdvnt++2OgnS0jwLRsYOcub71LVbXSjRsowl8nSurHahzWkHXMZm5AszWDUmMvZdELPDTX1sbyfy2SJ06ZbBZwf/qxZalTadEMMR6tEm5cBH9HmeJ3CZbLEQ9+4UXAZmz7XdVZNfR/ghsn9ZAk3I9+0SrS5D/598U+NfmyCWfMNDDb3kyWY17KBBx4+zizdvPGZmjYUbd56jOehkx/AJwoZDgfJcESS4UhHhiNChsMfMhwRMhwRMhwZyHD4Q4YjQoYjQoYjQoYjQoaj9ZDhyECGwx8yHBEyHBEyHBEyHBEyHK2HDEcGMhz+kOGIkOGIkOGIkOGIkOFoPWQ4MpDh8IcMR4QMR4QMR4QMR4QMR+shw5FBvYZjPMuAfBiOoQIyG+pl5eh64ziz5MNw8Bb3ZTAc2FmY+8kSdnX1TRkMx+xxGA7sfOybZjUcaTszNxKEqPFxZsmH4eD8ijIYDoRHcpkstarhwPnhz5qlSWU4vtR9gfEF2HT5wEM19XGzQ4AVl7MJyaRxkCbIZWx649zvJKbdNRpchBBqw8drEyeFIpGSy9iEtDrmdMe1+UeuuIqbqBsEPLnmFKzdvZmbqRtsS8/92DSt5zpuom7Wj20Ns2O4rzThe+NAOB8gPZT7sunk1TdzE3WDkD/uxyYEZu3YO8rNlII8ychxzaQEWSQmcxmbkBCL/I84V6171Chn0+crppP52pKLjHI2cTjevsq1OCvplDVnx/KaNloFnJ+sJF9Wo5KzG2I4MNyb95cFUcO4kTD4pc97czl8+RVcPTQP31h6iVE2SQi6wihAWbmk/4HcN5epK6/l6uEfb96AJlyMOUwI4DXXO9qPM8on6a/nHlnYkPVP1t5l9Jem6atu4upeWL1rYxipz/0l6c1tx4SjVEVw6upbjP7ShKjqIkDSZd70VxjZIgwgQHAU95emC/ru4eqlASF9+BvkY04SRtqSHpIQu89lk4RrCj/sAYz0fqgjO0YbQsJr0ihi2/CKMOmXyycJqdKDe3ZwE2G6cd57wMHLLuPqLQXOU957AM5/o2iI4QC4QWGI65aNz6Zqxpa28Ak+DURy/y6hXlzYW8MG9pDgOnFhv5UyDq8yeJ3Ax876o2WPCJiOp7d1GnXiwmuo5RSVHAcXIsQec7247hucFWwcG+KqXukYXmX0yyr6aQd7ReA1HvcbF/Y0SLqQ+gQXdu6XVcSrlDgY/sZn5X7jwu9N0XOk8KDD/bKKSFv1DUwcTD8fe1x4jZRkNqrABHCduHBdtT0Fj+4bC6/PXC8uXN/7dw9y1VfAKBy2reB6cWHvJ1vCMx5ccI3menHxKE+rgvOVdT9MMn8TScMMhxBCCCEmDzIcQgghhCgcGQ4hhBBCFI4MhygVeI8/c2hR+N41TZhzYHs/jXXpXIdV1ETNKnjHjTkD3G9cL21fGpZLA/NAuA6LV1+VEczDwvwhPva48F3tsnwXWEHDdVhFz7/APCdklXC/tVpU+PL5jWPbEvqtlW3+RSuBiAT+7KysCer4d67D4h1z42DV5NwdK4w6cWHuxLBlLspkQYZDlAYsVX7D3COMWdVJ+sLic40sEHDFwIxwVRGXZ2FG9/kFrUbAZLj3zz/B6DNJ750/LXFiHSbw5l3JhdUIuBmWEWQEvLv9eOOYk4QVaUkTih/b2p57GTxWI9jM6HjB0sN/XXSO0V+SsIQeOShFgMm3r5l9iNFnko4qYOl5mbhj0/O5IwG+13M9Vw/B/+eySUI/6I/B8umPd55qlE/S/m1TwoUOkxkZDlEaPtt1pvFHatOdm16oqY8//j/NuWQQwpI625PLeDnFYTkq9INVN3ITwcc6TzbK2fTQljncRCnIe0Gv6ow1t3ETuc1bVciV8Q1m/3M/Nh1QMSdF8LZ5U42+bIKJb0VgKt8090jj89qE1Wtx8DOXsQn9sZnFclQuZ9OBSy+tqT/ZkOEQpWG/tqOMP1Cbzl17d039siSNuoYaIQiPyftEX9VlCXkJZQChT3ysNn0rIWk0b75AVchn8M3ZvXca/diUFI5XLz6SRlsFH0mj+JnLZAn9xjm+5zqjjE0fXfDDmvqTDRkOURoQCMZ/oDax4WilvVT+3NFwXNr/IDdRCnxEm3OZLBVhOM7qvcPoxyYEv/nGx14qrYKPvVTGYzg4jReR61zGJkS6T2ZkOERpkOGIkOGI4DJZkuGIJMMRSYaj8chwiNIgwxEhwxHBZbIkwxFJhiOSDEfjkeEQpUGGI0KGI4LLZEmGI5IMRyQZjsYjwyFKgwxHhAxHBJfJkgxHJBmOSDIcjUeGQ5QGGY4IGY4ILpMlGY5IMhyRZDgajwyHKA3Yqp3/QG3ibcQRqsNlsoS0T9/819KLjX5s+kr3hdxE7tCvqn4x8DA3UQr+7+LzjGO16aCEbcTzbsde1a/XP8FN1M1P1t5l9GPT2+dN5SbqBkmsrkuEsZNqK7J1z7DxWbOEnarj4GcukyX0G8c1Z+YfOk+pqT/ZkOEQpQE3Xv4Dtem/t7bX1McF+S/nHG6USxMSG/kC4gMYIe7LJtzMGARHcTmbEKldRs7svd04Vpsu6X+Amwj+ceGPjHI2IWbaN9gmnfuxCaazCD68YLrRV5pgTlo54vw97dOMz5wmpA/zdgb4OU8qcVXoj7lxwx+McjZNXXktNzGpkOEQpQEXgI8sOMn4I2XhInHy6pu5esijW+eF0dJchwVjcvfmF7m6FzD0/dWcr1XwOgUJqcySkb4w6pvLs/D0j+H+soJ9RRBDz8edpK8vuThxbxm8KkMEPJdnIWWWR718gkRYpNNyvyyEO63atYGrewFm6p3t3zX6ZL169sFhCmYrgxTVPMmrf1b5LtJes+H/49+5Dgv9JKW27n15X3DkiquM8kn6TNeZwYaxbdzEpEKGQ5QO/FGu3rUxVUhczAIbuHG9uDiiuAgwesL9xpVndAX7snC9uJJu0GUEG9HxsceFTfuyQAw914vLtvmbL2Amud+4sLHaRID9d7jvuMYS9hlqVfp2bzY+f1xJey7Fwb9znbjQfhbbK8aa68XFcz8mKzIcQgghhCicpjYccJXPDnUF165/PPjh6t8GR6+4Ojhk2eXh++/Jrm8svST8Pk7ouSG4at2j4XyHiXr6EkIIIZimMxx4t42NlP5p4elOE36k/9GHOqYH01fdVMjqDCGEECKNpjAcmJhz+6bngk8uPM24gUrj1/+Z/73glwMzwvfSrQJ+V7CVODI6bPrNhqdS33MP7tkRfi9ch/X41vlc1StPbusw+mRhOSzvYFkFn++mDU8bdVjIakh7z71xbCicfMh1WE9v6+Sqr4BJnxf23WvUieuivvvCh4k0MBmY67CuqJyztHkxu1/eE1y/4UmjDuu2ynUGv0NJYA4JduXlOqznhtKzXdqHe8KJrVwnrov77w+Wjw5w1Vd4cHCOUYeFUU1M2C2Ktbs3h9kv3C/rjwkTLX1yz+Y/Gn2yMDF0uMBrHCYI/7z/AaPfuM6vnPM5O5Zz1UlH6Q0HjEaeGerS+IVt4XEhTbsBNxPIceDPl6b/6D7PmDyKi/S72483yqYpaRmnD2AkuK80vaP9uMQbbd6VMlDSMk4YL2yzzmXTdM26x7iJ8OaL1SNcNklYLYAbMuOyzBgmmlf94By7BJAdvvyKmvoAE5n3azvaKJsmGD3mia0duUdlEfyGXBnGZZkxRjOLmFQMs5FnJRiEpbl3bnqBm/ACRmq5vzQh/6KI6xtW1uXNzMEKJ5jFyUxpDcfSkf5wLgKfNKk4/W3Hidans7KDFR38mbKE37M4d2x63ihjE27IRfCuHEsf47pl47M19Xt2rTfKZAk3kjgYBeIyNr1v/gk19cGhy39hlLNpWs913ITTjR7CU28cZFFwGZtwk+RRI4wYcDmbPtZ5ck198LUlFxnlbOKl3zBOeW9uVWFkyDcYjeJ+bMJyUN/APGDpL/dl08yhLm6mbvB6n/ux6fMV4zuZKaXhwBDvax2jnSU/ggs/p/JHlDasXGZ8RJtjWJ7L2ISn9yKoN9p81o5lRpkszRteWdPGzxxvLMg2YVxGFqAios2fGVpolMlSN73e8RFt/qmFpxvlbDqCRlrKEm2OCfrcj00YdfKNj2hzHyja3I1SGQ7c5FxPoFSMcKMo8h1wEchwRMhwRMhw+EWGI8L1fiXDURIQ5oSkQT5BUuOEYWG8pmgWZDgiZDgiZDj8IsMRIcPhRikMB2bIf7n7AuPkSI3X33X8IJw82AzIcETIcETIcPhFhiNChsONhhsOTITKm0UvNUaf7jqjKZbOynBEyHBEyHD4RYYjQobDjYYbDpflf1LjdFTFFJYdGY4IGY4IGQ6/yHBEyHC40VDDMbtyUXzVrIOMkyKVU7z0smzIcETIcETIcPhFhiNChsONhhkOrKPG/AA+IVJ5hRtKmSeRrhhdZxxzlvgmizRKLmNT0k3WB38990ijL5v4Jjse88U3WVfztX+beZP9T4fwMYhvssDVfP12Y23o1njMF3YbjuNqvpJusv+26CdGOZtwM4uDuW55Q9SqunvzizVt+MDVfBVxk0VyKJbwc182PbKljZupm5MczRdM52SmYYYDCY18MqTy67Dlv+RTWRr2BS8HH+w40TjmNCGhk7c0R3KgS6AQgq2KwGVeE0YJOcAMht4lMRU3SM5eWTTS63SDO3blr2rqA2ysyOVsSkqlPHDppUa5NL1m9iHhduBxsALOJTH1wwum19QHMKZ5U0KhH6y6kZsII+K5nE0PbTFTKV0m179+zmFhHLtvXtjeHYajcX9pOmPNbdyEF1yCId8w9wgjzM0HT21bYPRlEyLOJzMNMRxY9YA/Bj4ZUvmFCw2PCpQJ7GuAG9R72qeFaZ1pQpQ3P9FXwUUEFzOuExdSWZGKuW3vTq7uBWSgYKdf9MN9x3XAorNT93RZNjoQvqKA8eB6VeF7+lalDEaHkkBS5ee6zjLqxYWRyhMrN1iOFAcwgdhnAkusuV5ciJ6+et2jXD0Ese3Hrbw2NJNcL65/rZwzvD5JAuYJy+65TlzYQuHgZZcZhqXK/YOzgs92nWnUiwtx4n1655wAACKlSURBVEgITZpkDUOHG85HK0/8XC+uT3SeFtyw4SmuHoJXCVNWXhN8oOP7Rr24kGj5YoH7mNy1+YXwaZ37jQvG7fQ1txqm3hcYbYUxR8It9x0XtjAoch8T7N30jwt/ZPQbF0Z5kEpaRLx6M9EQw/HTtXcbNzKpefSNpZfwKRVCCCGsTLjhwGZCeTf+kcopvDvF07MQQgiRlwk3HJgpzDcwX3rdnEPD3UKxxXTb8IqgjzajanU2jm0LFuxcHTwwODscdnXd9MpFGB4UQggh8jLhhsNly+y8gtHAa5qkd8iTGcxqx6qLN7cdY3xn9QrvJXlrdyGEECKNCTUcmDyEWeR886pHSMEc2O1/JnYrgSVk317mtk14HmHbb5/gdRuW3P195ynGpKu4vtR9QfDktg6uHoIt1jGRzDbZEhPusLoEW7gngWwOGGOuFxcm/p26+pZUkwuj989dPzbqxYUJiFjFURSYQHv48iusEwwxEfM7y680loH6AqYUS3bxd8p9x4WJqTdu+ANX98by0YHgkGWXB++3TDDE78zRK64O+ncPcnUvYAItlhr/U8ZkS0xYxihtEphA+/1Vvwk+suAko15VmAiMSdEY5W1lsOoEE7cxOZW/g6owERgTpzHymwT+P/4d5bhuVWgf/RSxygVgIukFffcEH+881eg7ri8sPjd4cNBcudRMTKjhmDnUZdy06hGWaBY1A7oVOW/t743vsB5dlbKqYLxgKSH3kSYs18TKgzi4ueFCzGXThAvz7pf31LSBFQouuQ8wNwyWdnI5mzDL3TcY3cLNlftKE262uCH6BiaC+7Lp3sGXuIm6gZF9Z+WCzX2lCYa3CPD3wn3Z9NjWdm7CaYNLZMRsGNvGTbQMuAHzZ04Tcm22VMxaHPzskneD/orgnN47jb7ShPlzyJVpVibUcFzYd6/xBY5XCNHBRVW4gacj/i7HKywh9AlcPPdh02UDD9XUx4gFl8nS/OGemjawHJHL2IT1/YzraBKWpfoGo0/cT5Y4y8MHX1tykdGPTRht8Q0SjbmfLGGkzDeuqavHV56q4+B655rMfE8B6ZplAMuOXYO/sMQ7Dn7mMjahv6TlzvWC0VLuy6Zmnj83oYYDw7v85Y1Hb583tWl2MC0buGhhqJ+/0/HId4Kgy9MGdO7au2vqjydds4hoc9d0zS92n89N1M140jWLyFdxvckmRZvXi49ocx+0SrR5GfARbT6eBQzo1zcI3eN+bEK0fLMyoYbjkwtPM7688ajse3qUHdxYXJIC04T5OD6H4WU4/CHDESHD0XrIcDQnE2o43jZvqvHluQpJfj5vcpMVTKDj73Y88jnSJMPhDxmOCBmO1kOGozmZUMOBSUz85bnqor77uFkxDlzfX6bJ5+oGGQ5/yHBEyHC0HjIczcmEGg6XzY/StHhkLTcrxgFm7iO/hL9fV/FKkXqQ4fCHDEeEDEfrIcPRnEyo4eAvzlXY8E34AzkQ/B27Cjd5X8hw+EOGI0KGo/WQ4WhOmspwIFdA+MNl2+80yXDIcNiQ4YiQ4fCHDEdz0lSG418WncVNijrwkcnh03AgfIrbtwkJlnGQOMtlssQ3FiQ8chmb3jJvSk19cMyKa4xyNvGNxQfYbp77yZLP+ThVXCcnf3flr7mJuhmPEd04NsTN1I3rtg4n0Y0Fk+VdX4PO2NJW00argMA+10wSGM84rkYU/XFQoA9cjejPmngeY1MZDoR9CX/ggsbfsat8Go4r1z1itJ8mjIasH9vKTTgFTSFCmveDQXS0y2oqpLcyL25fEvzJrAONsklCuZlDi7iJusHnckliRFx8EfxhW2fuuVsYLZqzYzk3UTe4UbtkzxQRxAZw888bVvVnsw9OjOM+efXNRtk0vW/+CYUEVZUFBKPxZ04T4sk5lRo/4/9z2TRxEJsvEPPAfaXpL+YcFm5Z0KzIcExiymY4AC7KGHnBnhZpwkZ9aUmQ2Jfg1+ufCKauvNaoVxV20r163aPByL7dXD0EcdDY24DrxXVCzw3WGG4kmJ6y+hajXly4eRTxGqMKLqgYBcLn5b6rOnblr8IyRTy5VYGJwGflvuPCvjS+f5fi4MaLaHGMPnHfVeF35rrK7w5+h4oCZhR/d9x3XD9ac2vq5HgYyds3PRfu7cH14rq4/34jyrvVgJHEzRpGgD9/XJf2Pxhs27uTq4fg/+PfuU5caB/9FBnH8NS2BeHWDtx3XNhnauVo8v5PzYIMxySmjIZDCCFEayLDkQLeZ2MPBmw4N1HCBEZsHlbkE1YcGQ4hhBAThQzH/wc3eezaiYldiOzmvidSeOd9wKKzwxUTQ3tH+FC9IcMhhBBiopDhqPDwlrnhBCvurwzar+0oYzWGL8pqODBxEyM9adr78j6u0rIgOp4/f1x53itj9Q7Xq2rd2BYuXlo279luHH9ceejfPWjUqyppEjKDzQ+5Xlz43c1ix95Ro15cPLkxCSzP5HpV5V1thHlQXLeqPNva4yGN68WV52Fpe6UM14srz9yijZVj5XpV9e7axMVbGpw3/g6qSpv3NpFMasOBCVjY6tfHRmZFC8sLfc84L5vhwIXy011nGH2wMALVzFs05wHLWj/Rmb3Z4Z/P/nbqMjnE17+57RijDgtLex/fOp+rlwYsXcbOxHzcLCwZ/eXADK4ecv/grIp5P9qow3pH+3HBs0NdXD3k9DW3hqtHuA4LgXp9CRd3TFDMk9GC1TqY3Apzw+DvLc/ycaxmuHb941w95I5NzwdvypF58572aeEkVwbXzemrbgpeneO7wEqwJPMC8/gf3ecZ5VlYiooJsknGeu6OFWE2E9dh/dXcI4KbNjzN1VsKnCecL/7sLJx3nP9GMakNB/5ouI8yC8scfT7dl81wfH3JxUb7NmFmd6vyecfALL4x4CkaNx0ulyZclNNW7TSazzgk4uLhoX24p6Y+RolgzLhsmjCqyDd7172HEKrHuCxphZIMw8c6TzbKpQlLcDlnBiNaeYxCVVgizkvH73EMzDpyxVU19QFMBJezKWmH8DxmoyosP2/m5aQ2cH5clvLj/DdqZHPSGo7fbnzaaL8ZxGFA9VA2w7F/2xSjfZsu7LuXm2gZXMwCxE/2bcMrjDJZ8nkufZI306QqLG2N89zQYqNMljDCFAdLsbmMTRgpYVyyQCAshYyDVy2uo7EIsouDkSwukyW8kotz2prfGWVs+mDHiTX1wT90nmKUswnL0OPg1RWXyRJGuVqR8QQeNmpEc1IaDqxPf0PliY7bbwbhqaVjeBV/pHFRNsNRb7R5K+HyRA4hSyBOWaLNfcDHmSWe8+SaKAnxyAAyELiMTUkJtK6JkpxA6yPa/JEtbUaZLPGcEERrcxmbEN3N5HlFFhcn0PqINm8VcH74s2YJvweNYFIajjPW3Ga03Uz6sqdUSBmO8iLDEcHHmSUZjkgyHJFkOCLJcOSQD8OB911vd3jfVUZh2ayPvR5kOMqLDEcEH2eWZDgiyXBEkuGIJMORQz4MByaUcbvNKL6QjAcZjvIiwxHBx5klGY5IfJ2Q4Wg9ZDhS4A/tKh+Gw3U30LIKE7fqRYajvMhwRPBxZkmGI5IMRyQZjkgyHDnkw3D8vP8Bo91m1OEetjSX4SgvMhwRfJxZkuGIJMMRSYYjkgxHDvkwHK4XjrIKAUL1UjbDgfwDbt+mVjYcr63TcGAfIC6TJc6vKAuuS0F9GI4ldRqOt847tqY+yBNqFxcbDuSkcJks+TAcnNbpajiQ4sx8tE7DgeAwLpOlVjUcOD/8WbMkw5FDMhyRWtFwuD4BcsZAK/GRBScZn9cmzhhAuiOWUHO5NGEiMgKyysh752cnKMbFGQOIdXYxLUj65FRf19yez3WdVVMfYFSSy9mE7A/GNasGGSRxMHLDZWzCSBtvJnnNuseMcjYhUZT5xtJLjHI2YWQ6Dib/I6yOy9mEbJpWBOfHdUSUR/AmChmOJlUrGg5ESr8+Z+AVLuh59lloVv57a3vuiwhSSTkZE/xk7V1G2TRd0HcPVy8NDwzOzhUpDuHvIikG+9TVtxhlkwSTdvnAQ1w9DN3KO0KB0Da+0QOMmuSJmoc+0PH98LUBc+emF8K4by6fpIOXXcbVQ77Xc71RNkkwoTxaBIYrZixvcBfyjubsWM5NBAsq1428r1A/vGB6GAvPIK48byjcUQlpp60EzhPOF3/uJOH8NwoZjiZVKxoOgCdzPK0jyjhNz29f7DXivawgfvi+jO8CkeZJN9gqi0fWBrdves6oVxX+jV8flBHsTXLv4EvG8ceFeSs2unb2BrdummnUqwo382WjA1ztFWDqYCS4XlwwR7Yl69jQbMaWNqNeXE9u6whGLRu4YQgdrwe4XlzYZ8QGbvjYHZvrVXXX5heClaPrudor4KkaDwhcL64HB+eErz7SQFroQ1vmGPXienpbp/XBAnHld29+0agX1/ySvir0Dc4Xzht//qpwvnHeG4kMR5OqVQ2HEEKI1kSGo0klwyGEEKKZkOFoUslwCCGEaCZkOJpUrWo4fMzhWDrSH9yx6XmjXlVY3bJopJereQVLGB/b2m70HRe2POfVEHE0hyPCxxwOUS58zOHwAeZ4cL9xYY5I0VvbY64L5rxw33FhzgyvGGo2ZDiaVK1oOHysUrm4//7cSyDP7L2dq3sBN8d3tn/X6C9J2NeHg5WAVqlE+FilIsqFj1UqPsDqFe4vSVgNg1UxRYBVPHl3L8fqIKwSalZkOJpUrWg46s3hwAqAvMvkIBiT/t2DNW34wPV7PaHnBm5CORwx6s3hEOWj3hwOHyCXg/uxCbkfyP/wDXJKuC+bkIPSrMhwNKla0XDUmzS6cOcao0yWXtjeXdOGD3BuuB+bvth9PjehpNEYeUesqkrKjhDlot6kUR9gaTH3kyXbMt/xgiRW7scmJL02KzIcTapWNBx5h1irYsOBY+EyWcJ8EN/4MBx5X6dUxYZDe6mIMlPvXio+GI/hSApjqxfsNcP92CTDkRP+4lwlwxFJhkOGIy4ZjkgyHOVHhiNChqMg+ItzlQxHJBkOGY64ZDgiyXCUHxmOCBmOguAvzlUyHJFkOGQ44pLhiCTDUX5kOCJkOAqCvzhXyXBEkuGQ4YhLhiOSDEf5keGIkOEoCP7iXCXDEUmGQ4YjLhmOSDIc5UeGI0KGoyD4i3OVDEekVjQc+7dNMdq36cK+e2vqd4/0GWWy9NL2pTVt+MA1Y+CrCecSW5xzOZt+OTCjpr5rxgDk81z6xCVbBbpu/RPchCgZebe3ryopq6ZekF3D/WQJ6ai++WDHiUY/Np225nfcRNMgw9GkakXD8fUlFxvt2/TUtgU19ZE8+sa53zHKpel1cw4tJMHwor77jL5sOm/t77mJMD2Uy9mEiPM4O/aOOpkWhBohjr2MfKbrTON404TMjrLmiYiIaT3XGefOJkR7+wZx5S5m9v3zT+AmvHBkzrTTqu7Z/EduommQ4WhStaLhQMT3p7vOMPpgvWb2IcHZvXdy9RCYkLfNm2rUYf1N29HhPg5FMLpvLDhk2eVheif3GxeSQA9adlnifiorRtcFn+g8zajDwquXn1UMThLYq+XNbccYdVhvmTel1OmcGLnKMwQPA8kjPaKcIEArT8Lmq2YdFJqTouLqEVcOs839smA25u5YwdW9gFTgAxadY/TJevXsg4Ppq24qJO10opDhaFK1ouGogmHL1RXzkSbbxm1VsPEZ16uqiDjzJDBiwH3HlWQ0GMSNc7248lyIB3anfxf4npoF3KT4+OMSzcf2vSPGeYwrab+kIujdtcnou6qNFUMwEWBrBu47rmbfuA3IcDSpWtlwCCGEaD1kOJpUMhxCCCGaCRmOJpUMhxBCiGZChqNJJcNRHJjEdUHfPcHRK65OFZbp3Tv4ElctFbv2jYWZFFNWXmMcf1XHrvxVWGai3pWPl7s3vxh8r+d64/jjwjLpjWNDXLWlwITB2zc9F06k5M8f18X99wdbUpZwYgUTJtdynbiQe3Hjhj/kmi81XmYOdYWTILnvuM7svT1YNjrAVUMwfwmrV47P+C6QUZO2Gg3/H//OdeJC++gnz3yp8YLJ7j9YdaPRd1y4d60cXc9VQ3CecL5w3rheXDjvOP+NQoajSSXDUQyYsJpnlUtVSUtaywBuTF9YfK5xvGn6UvcF3ERpwIokPt40vbP9u+Hku1bl5NU3G585Tdj2nCcm73l5b67VT1V9Z/mVNfV94RK6hZVYS0f6uYnQCHDZNH14wfTQgMfBz/j/XDZN6K8IYGa4rzRhqTuW8zI4T1w2TTj/+D1oBDIcTSoZjmK4rfL0yJ/RJiwpLSNYVsvHmiUsSy4jrgm0GA1pRfCEjaW//HltmrGlraYN1wRaLN0u4okY13Luy6Yf995eUx8jclgyy+VsemZoYU0b+JnL2IT+ihgJ/NTC042+bOJl8Dg/OE9czib8HjSCSWc4XJ6WyqyvLbmIP5ozMhwmVwzMMD6jTX8660BuohS43lggRZuXG4xW8GfN0s0bn6lp45GKAeEyWSrCiObJVYmLo80RMc5lsoRRlTguoyxVlTHaHOeHy2QJvweNYNIZjivXPWK024zCe/l6keEwkeEoH3ycWZLhiCTDEUmGI5IMRw75MBzj+SUro9KSNl2Q4TCR4SgffJxZkuGIJMMRSYYjkgxHDvkwHDg52G+B22428bvZ8SDDYSLDUT74OLMkwxFJhiOSDEckGY4c8mE4wMc6Tzbabia9dva3vWy0JcNhIsNRPvg4syTDEUmGI5IMRyQZjhzyZTiu3/Ck0XYzyddWzTIcJjIc5YOPM0syHJFkOCLJcESS4cghX4YDa5A/2HGi0X4z6PVzDvO2mZAMh4kMR/ng48ySDEckGY5IMhyRZDhyyJfhANhqGNuccx9lF1IGfSHDYXLDhqeMz2jTG+YewU2Ugq6dvcaxZikpXKkMuGZP8E22VcCDkmv2xD10k312qMsokyXs0uubT3edYfRjE99kYb5csyce3Tqvpg38zGVsQn8cpOaDjzqaL14wgPPDZbKE34NGMGkNB7hr8wvBn1SeULmfsuocDytT4shwmGAbaCQb8udM05ErruImSgFuTu+ff4JxvGn6244TC41urodDl//CON40wZys3b2Zm2gZvr7kYuMzp+kv5xwexvTHQUjU/m1TjLJp+mzXmTX1fYHode4rTZjkjxh0xiVJF+FxHPWOn11C5dBfEeC6zn2lCaYnKbQL54nLpgnnv4gwtzxMasMBkGGPp1Tuq0zCsP1165/gQ68bGY5knt++OPjqkp8F72r/bqrwVHLq6lsa9oebB0QgH778iuADHd83jr8qvFpELHIRw+a+2L53JHzCxTA8H39V724/PkzffWn7Uq7eUiB6//urfhN8ZMFJxndQ1XvapwX/tfTioG14BVcPWTyyNjho2WVh9DnXrepDHdODqSuvNQyLL7D3x8/7HwhjtrnvuHDN51chVfBkjz1lEE/O9ap67/xpwTeX/jxYkHKdwv/Hv6Mc160K7aOfIkZ6wFjl4QB7N32881Sj77hgeB4cnMPVQ3CecL5w3rheVTjfOO84/41i0hsO0L97MNzE6n/P+pbRZ6OFPS4wPF4EMhxCCCEmChmOGHjKw6TBL1du8pjI4/ruuF7h/SycKD4nNgVbuHMNH6JXZDiEEEJMFDIckxgZDiGEEBOFDMckRoZDCCHERCHDMYkpm+EY3rcrPCbbxCfon7t+HDy8ZS5XD8FEyQOXXhpOnON6cWFSXfdIH1cvDUN7R8KAN6we4WOP64BFZwePb53P1UOWjQ6EE+IwoZLrVYXv6VuVMtjOPgksHfxc11lGvbj+ruMHwYmrbkycQIuVL5gciHRfrhfXP3SeEly97lGu3lJgouT5ffeEE47588eFiZRYnp0EciCwcaNtIjD0+cU/DV7cvoSrewMr/LCtOvcbFya2nr7m1mDXvjGu7oX1Y1vDVWK2ya/Qf3SfF8zZsZyre+N3G58N/nHhj4x+48KEZyxnxQTRIujbvTk4bPkvw6kA3HdcX+m+MJg/3MPVJwwZjklM2QwHZoJz+2nCcmaeeY6bm0ug2zvajyvsYlgvuJDy8aYJc384QwMXNhgNLpsmXKhwQ4yzaKQ3XCHFZdOEidfMtesfN8rZdOemF7iJluHygYeMz2vTQ1vMFQmYX8bl0oSQwHVjW7iJunlhe7fTflRnrLmNm/DCAYvOMfpKE1YiFrHKBKscuS+bYDiLAIaH+0rTfm1Hhw80jaCpDAfCYoQ/jne4wafJp+F4Z8WBc/s2Xdr/YE19PKVzmSyVNV3TJR8A4nRNnBcukyUe8XFNXcX6fgZLVbmcTUcsv4KbaBnwwMSf1yZO10S2iosBhO7e/GJNGz44q/cOox+b8HTvG4yGugZ/FZGu6frQhlEh32wcGzL6ydIzQwu5mQmhqQwHhoSEP7625CLjO3aVT8PhepM9d+3dNfXHc5NF5kYZcQkfg9h8+Yg2/1nffUYZmxA0xfz74p8a5WzCK6BWBTcb/rw2sfnyEW3uA2SicD82YfTMNz6izX0AU8j92FSE+VK0eQr8oV316tkHG8O+YvzgvTl/x66S4SgGGY7WQ4bDHzIcETIcKbgOByZp5tAiblaMA/zB+gg6W+Jx4qUMR4QMR+shw+EPGY4IGY4U3jj3O8YHdxVv4iPGBy5E/N2OR5gd7QsZjggZjtZDhsMfMhwRMhwpYA4Gf3BX7dd2VMNm2LYKL1f+c5nVbJPPcyHDESHD0XrIcPhDhiNChiMFZAbwBx+PeHte4Qa2rObvdDzyvTW7DEeEDEfrIcPhDxmOCBmOFI5bea3xwccjXIw7hldx8yIHG8e2hfkT/J2OR76XeMlwRMhwtB4yHP6Q4YiQ4UjhqnWPGh98vMJNs6itk1sVhFwhpZO/y/EqKeipHpAwyn3YhFCpOEge5DJZ4sCssuD6+vGWjc/W1O/Ztd4ok6W1NB/nNxueMsrYhMRH5tDlvzDK2YTwt1bFdRn6yatvrqmPV6F/Mecwo5xNSIr1zUWORvQzXWdyE3WDYDusWuS+bJo51MXN1A1G27kfm5AA6xtkkrguACgyedXGhBoOJEPyB69HiFReObqeuxEJbNkzHHxh8bnGd1iPbt00k7upi+vWP2H0kSaETCHwhjlo2WVG2TQh8hgX8TLyi4GHjeNNE8z31sr5Zb7qELqFqHdmcM+O4K3zjjXKpumadY9xE8FzQ4tzr077s8oNpL2BsctF88TWjtw3BoxwLR5Zy00EZ/bebpRNEwz8aAFJujCmeRcAIJG0qPTY6atuMvpLEyIAiogVx/0nrwlEUNmDg2Z6rA9c3h7AADYqXmJCDQcu7q7D5lnCL35RJ7FVgJt9f+Xpk7+7etW/e5C7qptnK08heFViEyKi00a38IeEp32uw8LTexEXIJ88ua3DOG4WjElaZDM+300bnjbqsDDsjhTLJGDq8H1zHdbT2zq56ivgVdeFffcadeLCU7PPJdZlBYbqgr57jM8f18X99wfLRwe46ivgesd1WBhN9jmhm4HpwGs87pf1xwL3cwGYj8Z9spDCi1GAosD+TdgviPuNC5HmRY4q4N4KY8f9sn5deagb2bebq08YE2o4wFQHJ+YibDCFix720xD/AzbpOWTZ5cZ35UNY5SKEEELkZcINBybp8c3Lp7Bs9pgV1wSXVBwnnnTx3m6yCA73lwMzgu+v+o3zHABX8d4dQgghhI0JNxwY+sHWynwDk5pHr5397dRhfCGEECKJCTccwFfKpdQYNUPaK5aKrbYoa7IoVvRwnbjybPuNiZxcL66kiZ5lBO98+djjSptP04pgaSp//riw7HwiwPwp7juuss9PqoLlrXzscW3PMQ8FacdcL660+UlV8O9cJy6facqTnYYYDvwxvKd9mnEjk8qv18w+JBjYnX2zbRRYBphnBj0yI9K27v7p2rtzrazAMtBFI71cPbwp5V0h8qXuC4Ide0e5idLwozW35lpZgRVjyywTHVuBH6y6MdeW6B9d8MNwImERzN2xInhnjtelWDKKyb5lBSYVqyX4uJN05IqrEldVvLh9SfC2eVON8iysfkp7BYz/j3/nOiz0g/5EfTTEcICHt8w1TqpUfmGGfVnBqMRfzT3COOY0wTzxKANm1XM5mz6bkDGA74jL2fSTtXdxE6XgD9s6jWO1CcuuWxXX61XSMmMffHhB/qwaLEnt2mka4jLgunjgxg1/4CacHlphmjlCAT/nMdNVoT9RHw0zHOA/cz4FSuUQltbipl5WkFvAx5yll7YvrWnjasdwOpgWBjcbLmfTV7ov5CZKASZe87Ha9Ka5R3ITLQNMIX9em95eeSL2Df72YCK4L5t8Z+X4ArkYfKw2fa/n+pr6eFDgMlm6b3BWTRv4mctkiR9QhBsNNRxIhnxz2zHGSZXKJwzRtg2v4FNYKnxEm18xMMMoYxNevTCuRvqL3edzE6XAR7R5q3BW7x3G57XpLfOmcBN1U5Zocx8g4puP1SZEiMfxEW2On7lMltCvGD8NNRwA2Rkuw1pSY4QgobIjw+EXGY4IGQ6/yHBMThpuOMD1G540TqxUHp3QcwOfslIiw+EXGY4IGQ6/yHBMTkphOIDrRDtpYoSk0mZJb5Xh8IsMR4QMh19kOCYnpTEcACmZeZadSRMjbAiUtBytrMhw+EWGI0KGwy8yHJOTUhkOcNfmF4LXzTnUONHSxAlzarDZULMhw+EXGY4IGQ6/yHBMTkpnOED3SJ/TenPJn7Bq6JmhhXxKmoKFO9cYnydLL2zvrmnjynWPGGVsetWsg2rqg68tucgoZxPCv8qIq+FABkqrcnbvncbntemt847lJuoGia/cT5bKajgQjsbHatPxPdfV1MfWClwmSz4Mh7Z0qI9SGg6w++U94VM2cg74pEv+hVdZeIoY3LODT0XTgMTOPAmh8c/MEeWPbW03ytn0oY7pNfXBKatvMcrZhATLMnLv4EvGsdr0yYWncRMtw+82Pmt8XpsOWHQON+GFPMmacZU1HfPApZcax2oTp6ZiawLkvnA5mzqGV9W0gZ+5jE3oL2tLBGGntIajCiKCp6y8JnyS5F8AyY/wCqDsGRt5wSuRPMusEaCU9NoIF5RvLL3EKJ+k1885LHhiawc3EebLICSNyyfpvfOnhftilBHM38HoCx9zkvA6ZebQIm6iZcAD0L9WTAR/7iQhWn/2jmXchBfuH5yV+yHsqBVXcfXSgJC+/dumGMecpI93npoY/3/Hpudz3xc4OKwK/j+XTRL6QX+iPkpvOKr07toUnL7mVmeHLyULw98Y0ViwczV/1U0PNm6bOdRlFcccM/heuA7LNho0um8smFW56XCduJByinJlBgZs/nCPceysyZDAiNVa84ZXGp+9VouCoRwbjtUDNogz+61VWSPN4wzv2xW+0uRjjwt7x9g2X8MIJddh4RW9Dfw712HxSKgYH01jOKrgAvhs5Rfgx723B59aeLrTEPpk10cWnBScuOrGYMaWtlJHlAshhGg9ms5wMDAgS0f6g0cqN9FbNj4b3LTh6eDctXdPev16/RPh94EhWDztyGAIIYRoJE1vOIQQQghRfmQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKJz/B1MOE5St+9SJAAAAAElFTkSuQmCC" alt="\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE QR\u30B3\u30FC\u30C9" style="width:160px;height:160px;display:block;margin:0 auto;border-radius:8px;">
    <p style="font-size:12px;color:#6b7280;margin-top:10px;">\u30AB\u30E1\u30E9\u30A2\u30D7\u30EA\u307E\u305F\u306FLINE\u306EQR\u30B3\u30FC\u30C9\u30EA\u30FC\u30C0\u30FC\u3067\u8AAD\u307F\u53D6\u308A</p>
  </div>

  <div class="vg-section">
    <h3><span class="num">1</span>\u8ECA\u756A\u691C\u7D22\u3067\u3067\u304D\u308B\u3053\u3068</h3>
    <p style="font-size:13px;">\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE\u306B<strong>\u6570\u5B57</strong>\u3092\u9001\u308B\u3060\u3051\u3067\u3001\u8ECA\u4E21\u60C5\u5831\u3092\u3059\u3050\u306B\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
    <table class="vg-table">
      <tr><th>\u9001\u4FE1\u3059\u308B\u5185\u5BB9</th><th>\u691C\u7D22\u3055\u308C\u308B\u60C5\u5831</th></tr>
      <tr><td>\u7121\u7DDA\u756A\u53F7\uFF08\u4F8B: <span class="vg-cmd">1988</span>\uFF09</td><td>\u7121\u7DDA\u756A\u53F7\u304C\u4E00\u81F4\u3059\u308B\u8ECA\u4E21</td></tr>
      <tr><td>\u30CA\u30F3\u30D0\u30FC\u672B\u5C3E\uFF08\u4F8B: <span class="vg-cmd">1988</span>\uFF09</td><td>\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u672B\u5C3E\u304C\u4E00\u81F4\u3059\u308B\u8ECA\u4E21</td></tr>
    </table>
    <div class="vg-tip">LINE\u9023\u643A\u3092\u5B8C\u4E86\u3057\u305F\u65B9\u3067\u3042\u308C\u3070\u5229\u7528\u3067\u304D\u307E\u3059\u3002</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">2</span>\u521D\u56DE\u8A2D\u5B9A\uFF08LINE\u9023\u643A\uFF09</h3>
    <p style="font-size:13px;">\u521D\u56DE\u306E\u307F1\u56DE\u3060\u3051\u8A2D\u5B9A\u304C\u5FC5\u8981\u3067\u3059\u3002\u4EE5\u4E0B\u306E\u624B\u9806\u3067\u81EA\u5DF1\u7533\u8ACB\u3067\u304D\u307E\u3059\u3002</p>
    <ol class="vg-steps">
      <li>\u30B9\u30DE\u30FC\u30C8\u30D5\u30A9\u30F3\u3067\u300CITABASHI\u516C\u5F0FLINE\u300D\u3092\u53CB\u9054\u8FFD\u52A0\u3059\u308B\uFF08\u4E0A\u306EQR\u30B3\u30FC\u30C9\u304B\u3089\uFF09</li>
      <li>\u30C8\u30FC\u30AF\u753B\u9762\u306B <span class="vg-cmd">\u8ECA\u756A\u9023\u643A</span> \u3068\u5165\u529B\u3057\u3066\u9001\u4FE1\u3059\u308B</li>
      <li>\u540D\u524D\u306E\u5165\u529B\u3092\u6C42\u3081\u3089\u308C\u308B\u306E\u3067\u3001<strong>\u6F22\u5B57\u30D5\u30EB\u30CD\u30FC\u30E0</strong>\u3092\u9001\u4FE1\u3059\u308B\uFF08\u4F8B: \u677F\u6A4B\u592A\u90CE\uFF09</li>
      <li>\u30D1\u30B9\u30EF\u30FC\u30C9\u306E\u5165\u529B\u3092\u6C42\u3081\u3089\u308C\u308B\u306E\u3067\u3001\u4E8B\u52D9\u6240\u304B\u3089\u5171\u6709\u3055\u308C\u305F\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u9001\u4FE1\u3059\u308B</li>
      <li>\u300C\u767B\u9332\u3055\u308C\u307E\u3057\u305F\u300D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u5C4A\u3044\u305F\u3089\u9023\u643A\u5B8C\u4E86</li>
    </ol>
    <div class="vg-mock">
      <span class="you">\u3042\u306A\u305F \u25B6</span> <span class="bot">\u8ECA\u756A\u9023\u643A</span><br>
      <span class="you">\u30DC\u30C3\u30C8 \u25B6</span> <span class="bot">\u3042\u306A\u305F\u306E\u540D\u524D\u3092\u6F22\u5B57\u30D5\u30EB\u30CD\u30FC\u30E0\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span><br>
      <span class="you">\u3042\u306A\u305F \u25B6</span> <span class="bot">\u677F\u6A4B\u592A\u90CE</span><br>
      <span class="you">\u30DC\u30C3\u30C8 \u25B6</span> <span class="bot">\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span><br>
      <span class="you">\u3042\u306A\u305F \u25B6</span> <span class="bot">\uFF08\u30D1\u30B9\u30EF\u30FC\u30C9\uFF09</span><br>
      <span class="you">\u30DC\u30C3\u30C8 \u25B6</span> <span class="bot">\u677F\u6A4B\u592A\u90CE\u3055\u3093\u306E\u8ECA\u756A\u691C\u7D22\u6A29\u9650\u304C\u767B\u9332\u3055\u308C\u307E\u3057\u305F\u3002</span>
    </div>
    <div class="vg-note">\u9023\u643A\u306F1\u56DE\u3060\u3051\u3067OK\u3067\u3059\u3002\u3053\u306E\u30DA\u30FC\u30B8\u306E\u5185\u5BB9\u306F\u793E\u5916\u306B\u6F0F\u3089\u3055\u306A\u3044\u3088\u3046\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">3</span>\u691C\u7D22\u306E\u65B9\u6CD5</h3>
    <ol class="vg-steps">
      <li>\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE\u306E\u30C8\u30FC\u30AF\u753B\u9762\u3092\u958B\u304F</li>
      <li>\u8ABF\u3079\u305F\u3044<strong>\u6570\u5B57</strong>\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1</li>
      <li>\u6570\u79D2\u3067\u691C\u7D22\u7D50\u679C\u304CLINE\u306B\u8FD4\u3063\u3066\u304D\u307E\u3059</li>
    </ol>
    <div class="vg-mock">
      <span class="you">\u3042\u306A\u305F \u25B6</span> <span class="bot">1988</span><br>
      <span class="you">\u30DC\u30C3\u30C8 \u25B6</span> <span class="bot">\u300C1988\u300D\u306E\u691C\u7D22\u7D50\u679C\uFF081\u4EF6\uFF09</span><br>
      <br>
      <span class="bot">&nbsp;&nbsp;\u2501\u2501 \u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011 \u2501\u2501</span><br>
      <span class="bot">&nbsp;&nbsp;\u7121\u7DDA\u756A\u53F7: 1988</span><br>
      <span class="bot">&nbsp;&nbsp;\u8ECA\u4E21\u756A\u53F7: \u54C1\u5DDD502\u30421988</span><br>
      <span class="bot">&nbsp;&nbsp;\u8ECA\u7A2E: JPN TAXI</span><br>
      <span class="bot">&nbsp;&nbsp;\u55B6\u696D\u6240: \u677F\u6A4B\u55B6\u696D\u6240</span><br>
      <span class="bot">&nbsp;&nbsp;\u8AB2: \u677F\u6A4B2\u8AB2</span>
    </div>
  </div>

  <div class="vg-section">
    <h3><span class="num">4</span>\u691C\u7D22\u7D50\u679C\u306E\u898B\u65B9</h3>
    <table class="vg-table">
      <tr><th>\u9805\u76EE</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u7121\u7DDA\u756A\u53F7</td><td>\u8ECA\u4E21\u306B\u5272\u308A\u5F53\u3066\u3089\u308C\u305F\u7121\u7DDA\u756A\u53F7</td></tr>
      <tr><td>\u8ECA\u4E21\u756A\u53F7</td><td>\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u306E\u5168\u6587\u5B57\u5217</td></tr>
      <tr><td>\u8ECA\u7A2E</td><td>\u8ECA\u4E21\u306E\u7A2E\u985E\uFF08\u4F8B: JPN TAXI\u3001\u30AF\u30E9\u30A6\u30F3\uFF09</td></tr>
      <tr><td>\u55B6\u696D\u6240</td><td>\u6240\u5C5E\u3059\u308B\u55B6\u696D\u6240\u540D</td></tr>
      <tr><td>\u8AB2</td><td>\u6240\u5C5E\u8AB2</td></tr>
    </table>
    <table class="vg-table" style="margin-top:8px;">
      <tr><th>\u8868\u793A\u30E9\u30D9\u30EB</th><th>\u610F\u5473</th></tr>
      <tr><td>\u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011</td><td>\u5165\u529B\u3057\u305F\u6570\u5B57\u304C\u7121\u7DDA\u756A\u53F7\u3068\u5B8C\u5168\u4E00\u81F4\u3057\u305F\u8ECA\u4E21</td></tr>
      <tr><td>\u3010\u30CA\u30F3\u30D0\u30FC\u4E00\u81F4\u3011</td><td>\u5165\u529B\u3057\u305F\u6570\u5B57\u304C\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u672B\u5C3E\u3068\u4E00\u81F4\u3057\u305F\u8ECA\u4E21</td></tr>
    </table>
    <div class="vg-note">\u540C\u3058\u6570\u5B57\u3067\u7121\u7DDA\u756A\u53F7\u30FB\u30CA\u30F3\u30D0\u30FC\u306E\u4E21\u65B9\u306B\u8A72\u5F53\u3059\u308B\u5834\u5408\u3001\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u304C\u5148\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">5</span>\u305D\u306E\u4ED6\u306E\u30B3\u30DE\u30F3\u30C9</h3>
    <table class="vg-table">
      <tr><th>\u9001\u4FE1\u3059\u308B\u30C6\u30AD\u30B9\u30C8</th><th>\u52D5\u4F5C</th></tr>
      <tr><td><span class="vg-cmd">\u308C\u3093\u3051\u3044\u304B\u3044\u3058\u3087</span></td><td>LINE\u9023\u643A\u3092\u81EA\u5206\u3067\u89E3\u9664\u3059\u308B\uFF08\u518D\u5EA6\u4F7F\u3046\u5834\u5408\u306F\u518D\u9023\u643A\u304C\u5FC5\u8981\uFF09</td></tr>
    </table>
  </div>

  <div style="margin-top:36px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
    \u5F01\u5929\u30AF\u30E9\u30D6 \u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9 &nbsp;|&nbsp; \u3054\u4E0D\u660E\u306A\u70B9\u306F\u4E8B\u52D9\u6240\u30B9\u30BF\u30C3\u30D5\u307E\u3067
  </div>
</div>`;
  return c.html(layout("\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9", html, "settings"));
});
app.get("/settings/tutorial", (c) => {
  const html = settingsSubHeader("\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB \u2014 \u4F7F\u3044\u65B9\u30AC\u30A4\u30C9") + `
<style>
  .tut-body { max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;color:#1f2937;line-height:1.7; }
  .tut-cover { text-align:center;padding:48px 0 40px;border-bottom:3px solid #1e3a5f;margin-bottom:36px; }
  .tut-cover-title { font-size:28px;font-weight:900;color:#1e3a5f;letter-spacing:0.08em;margin-bottom:8px; }
  .tut-cover-sub { font-size:14px;color:#6b7280;margin-bottom:4px; }
  .tut-toc { background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:36px; }
  .tut-toc h3 { font-size:13px;font-weight:700;color:#6b7280;letter-spacing:0.1em;margin-bottom:10px;text-transform:uppercase; }
  .tut-toc a { display:block;font-size:13px;color:#1e3a5f;text-decoration:none;padding:3px 0; }
  .tut-toc a:hover { text-decoration:underline; }
  .tut-toc-section { font-size:12px;font-weight:700;color:#9ca3af;margin-top:8px;margin-bottom:2px; }
  .tut-chapter { border-left:4px solid #1e3a5f;padding-left:16px;margin-bottom:8px;margin-top:40px; }
  .tut-chapter h2 { font-size:20px;font-weight:800;color:#1e3a5f;margin:0; }
  .tut-chapter-label { font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px; }
  .tut-section { margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6; }
  .tut-section h3 { font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
  .tut-section h3 .num { display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#1e3a5f;color:white;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0; }
  .tut-steps { counter-reset:step;list-style:none;padding:0;margin:10px 0; }
  .tut-steps li { counter-increment:step;display:flex;gap:10px;margin-bottom:8px;font-size:13px; }
  .tut-steps li::before { content:counter(step);display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;background:#dbeafe;color:#1e3a5f;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px; }
  .tut-note { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;margin:8px 0; }
  .tut-tip  { background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:12px;color:#166534;margin:8px 0; }
  .tut-warn { background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b;margin:8px 0; }
  .tut-badge { display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600; }
  .tut-table { width:100%;border-collapse:collapse;font-size:12px;margin:10px 0; }
  .tut-table th { background:#1e3a5f;color:white;padding:6px 10px;text-align:left;font-weight:600; }
  .tut-table td { padding:6px 10px;border-bottom:1px solid #e5e7eb; }
  .tut-table tr:last-child td { border-bottom:none; }
  .tut-divider { border:none;border-top:2px dashed #e5e7eb;margin:36px 0; }
  .print-btn { padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:24px; }
  @media print {
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .sidebar-overlay, .mobile-header, .desktop-header,
    .no-print, .print-btn { display: none !important; }
    .main-content { margin-left: 0 !important; }
    .page-content { padding: 0 !important; }
    body { background: white !important; }
    .tut-body { max-width: 100% !important; }
    .tut-cover { break-after: page; page-break-after: always; }
    .tut-toc  { break-after: page; page-break-after: always; }
    .tut-chapter { break-before: page; page-break-before: always; }
    .tut-chapter:first-of-type { break-before: auto; page-break-before: auto; }
    .tut-section { break-inside: avoid; page-break-inside: avoid; }
    .tut-table  { break-inside: avoid; page-break-inside: avoid; }
    .tut-steps  { break-inside: avoid; page-break-inside: avoid; }
    .tut-note, .tut-tip, .tut-warn { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
</style>

<div class="tut-body">
  <button class="print-btn" onclick="window.print()">\u5370\u5237 / PDF\u4FDD\u5B58</button>

  <!-- \u8868\u7D19 -->
  <div class="tut-cover">
    <div style="font-size:11px;color:#9ca3af;letter-spacing:0.15em;margin-bottom:16px;">STAFF MANAGEMENT SYSTEM</div>
    <div class="tut-cover-title">\u65B0\u4EBA\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0<br>\u4F7F\u3044\u65B9\u30AC\u30A4\u30C9</div>
    <div style="margin:16px auto;width:48px;height:3px;background:#1e3a5f;border-radius:2px;"></div>
    <div class="tut-cover-sub">\u7BA1\u7406\u8005\u30FB\u73FE\u5834\u30B9\u30BF\u30C3\u30D5 \u5171\u901A\u30DE\u30CB\u30E5\u30A2\u30EB</div>
    <div class="tut-cover-sub" style="margin-top:6px;font-size:12px;">\u6700\u7D42\u66F4\u65B0: 2026\u5E746\u6708</div>
  </div>

  <!-- \u76EE\u6B21 -->
  <div class="tut-toc">
    <h3>\u76EE\u6B21</h3>
    <div class="tut-toc-section">\u7B2C1\u7AE0 \u2014 \u7BA1\u7406\u8005\u5411\u3051\u6A5F\u80FD</div>
    <a href="#dash">1-1. \u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9 \u2014 \u5168\u4F53\u72B6\u6CC1\u306E\u78BA\u8A8D</a>
    <a href="#emp">1-2. \u793E\u54E1\u7BA1\u7406 \u2014 \u767B\u9332\u30FB\u7DE8\u96C6\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u7BA1\u7406</a>
    <a href="#shift">1-3. \u30B7\u30D5\u30C8\u7BA1\u7406 \u2014 \u7814\u4FEE\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u5165\u529B</a>
    <a href="#info">1-4. \u65B0\u5352Info \u2014 \u65B0\u5352\u793E\u54E1\u306E\u500B\u4EBA\u60C5\u5831\u7BA1\u7406</a>
    <a href="#follow">1-5. \u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8 \u2014 \u8981\u30D5\u30A9\u30ED\u30FC\u793E\u54E1\u306E\u78BA\u8A8D</a>
    <a href="#interview">1-6. \u9762\u8AC7\u7BA1\u7406 \u2014 \u9762\u8AC7\u8A18\u9332\u30FB\u6B21\u56DE\u4E88\u5B9A</a>
    <a href="#sales">1-7. \u58F2\u4E0A\u7BA1\u7406 \u2014 \u6708\u6B21\u58F2\u4E0A\u306E\u8A18\u9332\u3068\u78BA\u8A8D</a>
    <a href="#events">1-8. \u5831\u544A\u4E00\u89A7 \u2014 \u5ACC\u306A\u3053\u3068\u5831\u544A\u306E\u78BA\u8A8D\u30FB\u5BFE\u5FDC</a>
    <a href="#announce">1-9. \u304A\u77E5\u3089\u305B\u914D\u4FE1 \u2014 LINE\u3067\u4E00\u6589\u9001\u4FE1</a>
    <a href="#vehicle">1-10. \u8ECA\u4E21\u691C\u7D22 \u2014 \u7121\u7DDA\u756A\u53F7\u30FB\u30CA\u30F3\u30D0\u30FC\u3067\u8ECA\u4E21\u7167\u4F1A</a>
    <a href="#line">1-11. LINE\u7BA1\u7406 \u2014 \u30E6\u30FC\u30B6\u30FC\u9023\u643A\u72B6\u6CC1</a>
    <a href="#settings">1-12. \u8A2D\u5B9A \u2014 \u5404\u7A2E\u30DE\u30B9\u30BF\u7BA1\u7406</a>
    <div class="tut-toc-section" style="margin-top:12px;">\u7B2C2\u7AE0 \u2014 \u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051\uFF08LINE\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9\uFF09</div>
    <a href="#veh-what">2-1. \u8ECA\u756A\u691C\u7D22\u3067\u3067\u304D\u308B\u3053\u3068</a>
    <a href="#veh-how">2-2. \u691C\u7D22\u306E\u65B9\u6CD5</a>
    <a href="#veh-result">2-3. \u691C\u7D22\u7D50\u679C\u306E\u898B\u65B9</a>
    <div class="tut-toc-section" style="margin-top:12px;">\u7B2C3\u7AE0 \u2014 \u73FE\u5834\u30B9\u30BF\u30C3\u30D5\u5411\u3051\uFF08LINE\u5229\u7528\u30AC\u30A4\u30C9\uFF09</div>
    <a href="#line-what">3-1. LINE\u3067\u3067\u304D\u308B\u3053\u3068</a>
    <a href="#line-link">3-2. \u521D\u56DE\u9023\u643A\u306E\u65B9\u6CD5</a>
    <a href="#line-report">3-3. \u5ACC\u306A\u3053\u3068\u30FB\u56F0\u3063\u305F\u3053\u3068\u306E\u5831\u544A\u65B9\u6CD5</a>
    <a href="#line-recv">3-4. \u304A\u77E5\u3089\u305B\u30FB\u30A2\u30F3\u30B1\u30FC\u30C8\u306E\u53D7\u3051\u53D6\u308A\u65B9</a>
  </div>

  <!-- \u7B2C1\u7AE0 -->
  <div class="tut-chapter" id="chap1">
    <div class="tut-chapter-label">Chapter 1</div>
    <h2>\u7BA1\u7406\u8005\u5411\u3051\u6A5F\u80FD</h2>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:8px;">\u3053\u306E\u30B7\u30B9\u30C6\u30E0\u3078\u306F\u7BA1\u7406\u8005\u5C02\u7528URL\u304B\u3089\u30A2\u30AF\u30BB\u30B9\u3057\u307E\u3059\u3002\u30ED\u30B0\u30A4\u30F3\u5F8C\u3001\u5DE6\u306E\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3\u304B\u3089\u5404\u6A5F\u80FD\u306B\u79FB\u52D5\u3067\u304D\u307E\u3059\u3002</p>

  <!-- 1-1 \u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9 -->
  <div class="tut-section" id="dash">
    <h3><span class="num">1</span>\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9 \u2014 \u5168\u4F53\u72B6\u6CC1\u306E\u78BA\u8A8D</h3>
    <p style="font-size:13px;">\u30ED\u30B0\u30A4\u30F3\u76F4\u5F8C\u306B\u8868\u793A\u3055\u308C\u308B\u30C8\u30C3\u30D7\u30DA\u30FC\u30B8\u3067\u3059\u3002\u73FE\u5728\u306E\u65B0\u4EBA\u72B6\u6CC1\u304C\u4E00\u76EE\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
    <table class="tut-table">
      <tr><th>\u8868\u793A\u9805\u76EE</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u5728\u7C4D\u65B0\u4EBA\u6570</td><td>\u73FE\u5728\u7814\u4FEE\u4E2D\u30FB\u914D\u5C5E\u6E08\u307F\u306E\u793E\u54E1\u7DCF\u6570\uFF08\u65B0\u5352 / \u305D\u306E\u4ED6\u306E\u5185\u8A33\u4ED8\u304D\uFF09</td></tr>
      <tr><td>\u672A\u5BFE\u5FDC\u306E\u5831\u544A</td><td>LINE\u3067\u5C4A\u3044\u305F\u300C\u5ACC\u306A\u3053\u3068\u5831\u544A\u300D\u306E\u3046\u3061\u7BA1\u7406\u8005\u30E1\u30E2\u672A\u8A18\u5165\u306E\u4EF6\u6570</td></tr>
      <tr><td>\u9762\u8AC7\u671F\u9650\u8D85\u904E</td><td>\u6B21\u56DE\u9762\u8AC7\u4E88\u5B9A\u65E5\u3092\u904E\u304E\u3066\u3044\u308B\u306E\u306B\u9762\u8AC7\u304C\u5B9F\u65BD\u3055\u308C\u3066\u3044\u306A\u3044\u793E\u54E1\u6570</td></tr>
      <tr><td>\u6700\u8FD1\u306E\u5831\u544A</td><td>\u76F4\u8FD1\u306E\u5ACC\u306A\u3053\u3068\u5831\u544A\u4E00\u89A7\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3078\uFF09</td></tr>
      <tr><td>\u9762\u8AC7\u671F\u9650\u8D85\u904E\u30EA\u30B9\u30C8</td><td>\u8D85\u904E\u65E5\u6570\u4ED8\u304D\u306E\u793E\u54E1\u4E00\u89A7\uFF08\u30AF\u30EA\u30C3\u30AF\u3067\u9762\u8AC7\u8A18\u9332\u3078\uFF09</td></tr>
      <tr><td>\u6700\u7D42\u30ED\u30B0\u30A4\u30F3\u5C65\u6B74</td><td>\u76F4\u8FD1\u306E\u30ED\u30B0\u30A4\u30F3\u8A18\u9332\uFF08\u4E0D\u6B63\u30A2\u30AF\u30BB\u30B9\u78BA\u8A8D\u7528\uFF09</td></tr>
    </table>
    <div class="tut-tip">\u672A\u5BFE\u5FDC\u30FB\u8D85\u904E\u4EF6\u6570\u304C\u8D64\u3084\u30AA\u30EC\u30F3\u30B8\u3067\u8868\u793A\u3055\u308C\u3066\u3044\u308B\u3068\u304D\u306F\u512A\u5148\u5BFE\u5FDC\u304C\u5FC5\u8981\u306A\u30B5\u30A4\u30F3\u3067\u3059\u3002</div>
  </div>

  <!-- 1-2 \u793E\u54E1\u7BA1\u7406 -->
  <div class="tut-section" id="emp">
    <h3><span class="num">2</span>\u793E\u54E1\u7BA1\u7406 \u2014 \u767B\u9332\u30FB\u7DE8\u96C6\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u7BA1\u7406</h3>
    <p style="font-size:13px;">\u65B0\u4EBA\u793E\u54E1\u306E\u767B\u9332\u30FB\u60C5\u5831\u66F4\u65B0\u30FB\u9000\u8077\u51E6\u7406\u3092\u884C\u3044\u307E\u3059\u3002</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u65B0\u4EBA\u3092\u767B\u9332\u3059\u308B</p>
    <ol class="tut-steps">
      <li>\u753B\u9762\u53F3\u4E0A\u306E\u300C\uFF0B \u65B0\u898F\u767B\u9332\u300D\u3092\u30AF\u30EA\u30C3\u30AF</li>
      <li>\u793E\u54E1\u756A\u53F7\u30FB\u6C0F\u540D\uFF08\u5FC5\u9808\uFF09\u3068\u8AB2\u30FB\u73ED\u30FB\u5165\u793E\u533A\u5206\u306A\u3069\u3092\u5165\u529B</li>
      <li>\u300C\u767B\u9332\u3059\u308B\u300D\u3092\u30AF\u30EA\u30C3\u30AF \u2014 \u30B7\u30D5\u30C8\u7BA1\u7406\u306B\u81EA\u52D5\u3067\u8FFD\u52A0\u3055\u308C\u307E\u3059</li>
    </ol>
    <div class="tut-note">\u8AB2\u30FB\u73ED\u3092\u9078\u3070\u306A\u3044\u5834\u5408\u306F\u7A7A\u6B04\u306E\u307E\u307E\u767B\u9332\u3067\u304D\u307E\u3059\u3002\u5F8C\u304B\u3089\u7DE8\u96C6\u30DA\u30FC\u30B8\u3067\u5909\u66F4\u53EF\u80FD\u3067\u3059\u3002</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u5207\u308A\u66FF\u3048\u308B</p>
    <p style="font-size:13px;">\u4E00\u89A7\u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u30DC\u30BF\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u305F\u3073\u306B\u72B6\u614B\u304C\u9806\u756A\u306B\u5909\u308F\u308A\u307E\u3059\u3002</p>
    <table class="tut-table">
      <tr><th>\u30B9\u30C6\u30FC\u30BF\u30B9</th><th>\u610F\u5473</th><th>\u6B21\u3078</th></tr>
      <tr><td><span class="tut-badge" style="background:#dbeafe;color:#1e40af;">\u7814\u4FEE\u4E2D</span></td><td>\u7814\u4FEE\u671F\u9593\u4E2D\u3002\u30B7\u30D5\u30C8\u7BA1\u7406\u306B\u8868\u793A\u3055\u308C\u308B</td><td>\u2192 \u7814\u4FEE\u7D42\u4E86</td></tr>
      <tr><td><span class="tut-badge" style="background:#bbf7d0;color:#166534;">\u7814\u4FEE\u7D42\u4E86</span></td><td>\u7814\u4FEE\u5B8C\u4E86\u3002\u901A\u5E38\u30B7\u30D5\u30C8\u304B\u3089\u975E\u8868\u793A</td><td>\u2192 \u672A\u914D\u5C5E</td></tr>
      <tr><td><span class="tut-badge" style="background:#f3f4f6;color:#6b7280;">\u672A\u914D\u5C5E</span></td><td>\u914D\u5C5E\u5F85\u3061\u72B6\u614B</td><td>\u2192 \u7814\u4FEE\u4E2D</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u9762\u8AC7\u5BFE\u8C61\u30D5\u30E9\u30B0\u3092\u8A2D\u5B9A\u3059\u308B</p>
    <p style="font-size:13px;">\u4E00\u89A7\u306E\u300C\u9762\u8AC7\u300D\u5217\u306E\u30DC\u30BF\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u30AA\u30F3/\u30AA\u30D5\u304C\u5207\u308A\u66FF\u308F\u308A\u307E\u3059\u3002<span class="tut-badge" style="background:#1a3a5c;color:white;">\u5BFE\u8C61</span> \u306B\u306A\u308B\u3068\u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8\u30FB\u9762\u8AC7\u7BA1\u7406\u3067\u512A\u5148\u8868\u793A\u3055\u308C\u307E\u3059\u3002</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u7D5E\u308A\u8FBC\u307F\u30FB\u4E26\u3073\u66FF\u3048</p>
    <p style="font-size:13px;">\u30DA\u30FC\u30B8\u4E0A\u90E8\u306E\u30DC\u30BF\u30F3\u3067\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u8AB2\u30FB\u5165\u793E\u5E74\u5EA6\u3067\u7D5E\u308A\u8FBC\u307F\u3001\u5217\u30D8\u30C3\u30C0\u30FC\u306E\u30EA\u30F3\u30AF\u3067\u4E26\u3073\u66FF\u3048\u304C\u3067\u304D\u307E\u3059\u3002</p>
  </div>

  <!-- 1-3 \u30B7\u30D5\u30C8\u7BA1\u7406 -->
  <div class="tut-section" id="shift">
    <h3><span class="num">3</span>\u30B7\u30D5\u30C8\u7BA1\u7406 \u2014 \u7814\u4FEE\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u5165\u529B</h3>
    <p style="font-size:13px;">\u793E\u54E1\u3054\u3068\u306E\u65E5\u5225\u7814\u4FEE\u5185\u5BB9\uFF08\u5348\u524D\u30FB\u5348\u5F8C\u30FB\u7814\u4FEE\u62C5\u5F53\uFF09\u3092\u5165\u529B\u3059\u308B\u6708\u5225\u30B7\u30D5\u30C8\u8868\u3067\u3059\u3002</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u30B7\u30D5\u30C8\u3092\u7DE8\u96C6\u3059\u308B</p>
    <ol class="tut-steps">
      <li>\u300C\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u958B\u59CB\u300D\u30DC\u30BF\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\uFF08\u4ED6\u306E\u7BA1\u7406\u8005\u304C\u7DE8\u96C6\u4E2D\u306E\u5834\u5408\u306F\u30ED\u30C3\u30AF\u3055\u308C\u307E\u3059\uFF09</li>
      <li>\u7DE8\u96C6\u3057\u305F\u3044\u30BB\u30EB\u3092\u30BF\u30C3\u30D7 \u2014 \u5165\u529B\u30E2\u30FC\u30C0\u30EB\u304C\u958B\u304D\u307E\u3059</li>
      <li>\u30D7\u30EA\u30BB\u30C3\u30C8\u30DC\u30BF\u30F3\uFF08\u5B9F\u7814\u30FB\u516C\u4F11\u30FB\u5EA7\u5B66 \u306A\u3069\uFF09\u3092\u30BF\u30C3\u30D7\u3001\u307E\u305F\u306F\u81EA\u7531\u5165\u529B</li>
      <li>\u5348\u524D\u30FB\u5348\u5F8C\u30FB\u7814\u4FEE\u62C5\u5F53\u3092\u8A2D\u5B9A\u3057\u3066\u300C\u9069\u7528\u300D</li>
      <li>\u5FC5\u8981\u306A\u3060\u3051\u30BB\u30EB\u3092\u7DE8\u96C6\u3057\u305F\u3089\u300C\u4E00\u62EC\u4FDD\u5B58\u300D\u3067\u78BA\u5B9A</li>
    </ol>
    <div class="tut-tip">\u25C0 \u25B6 \u30DC\u30BF\u30F3\u3067\u540C\u3058\u793E\u54E1\u306E\u524D\u5F8C\u306E\u65E5\u4ED8\u306B\u9023\u7D9A\u5165\u529B\u3067\u304D\u307E\u3059\u3002\u4E00\u62EC\u4FDD\u5B58\u524D\u306F\u30BB\u30EB\u306B\u9EC4\u8272\u306E\u70B9\u7DDA\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002</div>
    <div class="tut-note">\u30AD\u30E3\u30F3\u30BB\u30EB\u3059\u308B\u3068\u672A\u4FDD\u5B58\u306E\u5909\u66F4\u306F\u3059\u3079\u3066\u7834\u68C4\u3055\u308C\u307E\u3059\u3002</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u500B\u4EBA\u306E\u52E4\u52D9\u4E88\u5B9A\u8868\u3092\u5370\u5237\u3059\u308B</p>
    <ol class="tut-steps">
      <li>\u30B7\u30D5\u30C8\u8868\u306E\u6C0F\u540D\u30EA\u30F3\u30AF\u3092\u30AF\u30EA\u30C3\u30AF\uFF08\u65B0\u3057\u3044\u30BF\u30D6\u3067\u958B\u304D\u307E\u3059\uFF09</li>
      <li>A4\u7E26\u306E2\u5217\u30EC\u30A4\u30A2\u30A6\u30C8\u3067\u52E4\u52D9\u4E88\u5B9A\u8868\u304C\u8868\u793A\u3055\u308C\u308B</li>
      <li>\u300C\u5370\u5237 / PDF\u4FDD\u5B58\u300D\u30DC\u30BF\u30F3\u3067\u51FA\u529B</li>
    </ol>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u533A\u5206\u306E\u8272\u3068\u610F\u5473</p>
    <p style="font-size:13px;">\u30B7\u30D5\u30C8\u533A\u5206\u306E\u8272\u30FB\u76EE\u6A19\u56DE\u6570\u306F\u300C\u8A2D\u5B9A \u2192 \u30B7\u30D5\u30C8\u533A\u5206\u300D\u3067\u30AB\u30B9\u30BF\u30DE\u30A4\u30BA\u3067\u304D\u307E\u3059\u3002\u300C\u96C6\u8A08\u300D\u30DC\u30BF\u30F3\u3067\u793E\u54E1\u3054\u3068\u306E\u533A\u5206\u9054\u6210\u72B6\u6CC1\u3082\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
  </div>

  <!-- 1-4 \u65B0\u5352Info -->
  <div class="tut-section" id="info">
    <h3><span class="num">4</span>\u65B0\u5352Info \u2014 \u65B0\u5352\u793E\u54E1\u306E\u500B\u4EBA\u60C5\u5831\u7BA1\u7406</h3>
    <p style="font-size:13px;">\u65B0\u5352\u793E\u54E1\u306E\u8DA3\u5473\u30FB\u98DF\u306E\u597D\u307F\u30FB\u98F2\u9152\u72B6\u6CC1\u30FB\u904B\u8EE2\u6280\u80FD\u30FB\u30E1\u30F3\u30BF\u30EB\u72B6\u614B\u306A\u3069\u3092\u8A18\u9332\u3057\u307E\u3059\u3002\u9762\u8AC7\u3084\u65E5\u5E38\u30B1\u30A2\u306E\u53C2\u8003\u3068\u3057\u3066\u6D3B\u7528\u3067\u304D\u307E\u3059\u3002</p>
    <table class="tut-table">
      <tr><th>\u9805\u76EE</th><th>\u6D3B\u7528\u5834\u9762</th></tr>
      <tr><td>\u904B\u8EE2\u6280\u80FD\uFF08A\u301CE\uFF09</td><td>\u7814\u4FEE\u30AB\u30EA\u30AD\u30E5\u30E9\u30E0\u306E\u96E3\u6613\u5EA6\u8ABF\u6574</td></tr>
      <tr><td>\u30E1\u30F3\u30BF\u30EB\u72B6\u614B</td><td>\u5B89\u5B9A / \u6CE8\u610F / \u8981\u30D5\u30A9\u30ED\u30FC / \u5371\u967A \u306E4\u6BB5\u968E\u3002\u8981\u30D5\u30A9\u30ED\u30FC\u306F\u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8\u306B\u53CD\u6620</td></tr>
      <tr><td>\u305D\u306E\u4ED6\u30E1\u30E2</td><td>\u500B\u4EBA\u7684\u306A\u4E8B\u60C5\u30FB\u914D\u616E\u4E8B\u9805\u306A\u3069\u306E\u81EA\u7531\u8A18\u8FF0</td></tr>
    </table>
    <div class="tut-note">\u65B0\u5352Info \u306F\u65B0\u5352\u533A\u5206\u306E\u793E\u54E1\u306E\u307F\u5BFE\u8C61\u3067\u3059\u3002\u30AD\u30E3\u30EA\u30A2\u5165\u793E\u306B\u306F\u8868\u793A\u3055\u308C\u307E\u305B\u3093\u3002</div>
  </div>

  <!-- 1-5 \u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8 -->
  <div class="tut-section" id="follow">
    <h3><span class="num">5</span>\u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8 \u2014 \u8981\u30D5\u30A9\u30ED\u30FC\u793E\u54E1\u306E\u78BA\u8A8D</h3>
    <p style="font-size:13px;">\u4EE5\u4E0B\u306E\u6761\u4EF6\u306B\u8A72\u5F53\u3059\u308B\u793E\u54E1\u304C\u81EA\u52D5\u3067\u30EA\u30B9\u30C8\u30A2\u30C3\u30D7\u3055\u308C\u307E\u3059\u3002\u5B9A\u671F\u7684\u306B\u78BA\u8A8D\u3057\u3066\u58F0\u304B\u3051\u3084\u9762\u8AC7\u3092\u884C\u3044\u307E\u3057\u3087\u3046\u3002</p>
    <table class="tut-table">
      <tr><th>\u8868\u793A\u6761\u4EF6</th></tr>
      <tr><td>\u9762\u8AC7\u5BFE\u8C61\u30D5\u30E9\u30B0\u304C\u30AA\u30F3\u306E\u793E\u54E1</td></tr>
      <tr><td>\u65B0\u5352Info\u306E\u30E1\u30F3\u30BF\u30EB\u72B6\u614B\u304C\u300C\u8981\u30D5\u30A9\u30ED\u30FC\u300D\u307E\u305F\u306F\u300C\u5371\u967A\u300D\u306E\u793E\u54E1</td></tr>
      <tr><td>\u5ACC\u306A\u3053\u3068\u5831\u544A\u304C\u4E00\u5B9A\u671F\u9593\u5185\u306B\u3042\u308B\u793E\u54E1</td></tr>
    </table>
  </div>

  <!-- 1-6 \u9762\u8AC7\u7BA1\u7406 -->
  <div class="tut-section" id="interview">
    <h3><span class="num">6</span>\u9762\u8AC7\u7BA1\u7406 \u2014 \u9762\u8AC7\u8A18\u9332\u30FB\u6B21\u56DE\u4E88\u5B9A</h3>
    <p style="font-size:13px;">\u793E\u54E1\u3068\u306E\u9762\u8AC7\u5185\u5BB9\u30FB\u5B9F\u65BD\u65E5\u30FB\u6B21\u56DE\u4E88\u5B9A\u65E5\u3092\u8A18\u9332\u3057\u307E\u3059\u3002</p>
    <ol class="tut-steps">
      <li>\u300C\uFF0B \u9762\u8AC7\u3092\u8A18\u9332\u300D\u304B\u3089\u5BFE\u8C61\u793E\u54E1\u3092\u9078\u629E</li>
      <li>\u9762\u8AC7\u65E5\u30FB\u5185\u5BB9\u30FB\u6B21\u56DE\u9762\u8AC7\u4E88\u5B9A\u65E5\u3092\u5165\u529B\u3057\u3066\u4FDD\u5B58</li>
      <li>\u6B21\u56DE\u4E88\u5B9A\u65E5\u3092\u904E\u304E\u3066\u3082\u9762\u8AC7\u304C\u8A18\u9332\u3055\u308C\u3066\u3044\u306A\u3044\u5834\u5408\u3001\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u306B\u300C\u9762\u8AC7\u671F\u9650\u8D85\u904E\u300D\u3068\u3057\u3066\u8868\u793A\u3055\u308C\u308B</li>
    </ol>
    <div class="tut-tip">\u6B21\u56DE\u9762\u8AC7\u4E88\u5B9A\u65E5\u3092\u5165\u529B\u3057\u3066\u304A\u304F\u3053\u3068\u3067\u3001\u898B\u843D\u3068\u3057\u9632\u6B62\u306B\u306A\u308A\u307E\u3059\u3002</div>
  </div>

  <!-- 1-7 \u58F2\u4E0A\u7BA1\u7406 -->
  <div class="tut-section" id="sales">
    <h3><span class="num">7</span>\u58F2\u4E0A\u7BA1\u7406 \u2014 \u6708\u6B21\u58F2\u4E0A\u306E\u8A18\u9332\u3068\u78BA\u8A8D</h3>
    <p style="font-size:13px;">\u793E\u54E1\u3054\u3068\u306E\u65E5\u5225\u55B6\u696D\u53CE\u5165\u30FB\u4E57\u8ECA\u56DE\u6570\u30FB\u8D70\u884C\u8DDD\u96E2\u3092\u8A18\u9332\u30FB\u96C6\u8A08\u3057\u307E\u3059\u3002</p>
    <ol class="tut-steps">
      <li>\u6708\u5EA6\u3092\u9078\u629E\u3057\u3066\u5BFE\u8C61\u6708\u3092\u8868\u793A</li>
      <li>\u793E\u54E1\u540D\u306E\u30EA\u30F3\u30AF\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u65E5\u5225\u5165\u529B\u753B\u9762\u3078</li>
      <li>\u5404\u65E5\u306E\u58F2\u4E0A\u91D1\u984D\u30FB\u4E57\u8ECA\u56DE\u6570\u30FB\u8D70\u884C\u8DDD\u96E2\u3092\u5165\u529B\u3057\u3066\u4FDD\u5B58</li>
    </ol>
    <p style="font-size:13px;margin-top:10px;">\u6708\u5EA6\u96C6\u8A08\u30DA\u30FC\u30B8\u3067\u306F\u793E\u54E1\u3054\u3068\u306E\u6708\u9593\u5408\u8A08\u3068\u68D2\u30B0\u30E9\u30D5\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002CSV\u51FA\u529B\u3082\u53EF\u80FD\u3067\u3059\u3002</p>
  </div>

  <!-- 1-8 \u5831\u544A\u4E00\u89A7 -->
  <div class="tut-section" id="events">
    <h3><span class="num">8</span>\u5831\u544A\u4E00\u89A7 \u2014 \u5ACC\u306A\u3053\u3068\u5831\u544A\u306E\u78BA\u8A8D\u30FB\u5BFE\u5FDC</h3>
    <p style="font-size:13px;">\u793E\u54E1\u304CLINE\u304B\u3089\u9001\u4FE1\u3057\u305F\u300C\u5ACC\u306A\u3053\u3068\u30FB\u56F0\u3063\u305F\u3053\u3068\u300D\u306E\u5831\u544A\u304C\u4E00\u89A7\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
    <table class="tut-table">
      <tr><th>\u30AB\u30C6\u30B4\u30EA</th><th>\u5185\u5BB9</th></tr>
      <tr><td style="white-space:nowrap;"><span class="tut-badge" style="background:#fecaca;">\u30AF\u30EC\u30FC\u30DE\u30FC</span></td><td>\u4E57\u5BA2\u304B\u3089\u306E\u30AF\u30EC\u30FC\u30E0\u30FB\u66B4\u8A00\u306A\u3069</td></tr>
      <tr><td style="white-space:nowrap;"><span class="tut-badge" style="background:#fed7aa;">\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB</span></td><td>\u4E8B\u6545\u30FB\u30D2\u30E4\u30EA\u30CF\u30C3\u30C8\u30FB\u9053\u306B\u8FF7\u3063\u305F\u306A\u3069</td></tr>
      <tr><td style="white-space:nowrap;"><span class="tut-badge" style="background:#e9d5ff;">\u793E\u5185\u306E\u51FA\u6765\u4E8B</span></td><td>\u8077\u5834\u306E\u4EBA\u9593\u95A2\u4FC2\u30FB\u8A2D\u5099\u306E\u554F\u984C\u306A\u3069</td></tr>
      <tr><td style="white-space:nowrap;"><span class="tut-badge" style="background:#e5e7eb;">\u305D\u306E\u4ED6</span></td><td>\u4E0A\u8A18\u306B\u5F53\u3066\u306F\u307E\u3089\u306A\u3044\u3053\u3068</td></tr>
    </table>
    <ol class="tut-steps">
      <li>\u4E00\u89A7\u306E\u5831\u544A\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u8A73\u7D30\u3092\u958B\u304F</li>
      <li>\u300C\u7BA1\u7406\u8005\u30E1\u30E2\u300D\u6B04\u306B\u5BFE\u5FDC\u5185\u5BB9\u30FB\u6240\u611F\u3092\u8A18\u5165\u3057\u3066\u4FDD\u5B58</li>
      <li>\u30E1\u30E2\u3092\u5165\u529B\u3059\u308B\u3068\u300C\u672A\u5BFE\u5FDC\u300D\u30D0\u30C3\u30B8\u304C\u6D88\u3048\u3001\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u306E\u4EF6\u6570\u3082\u6E1B\u308A\u307E\u3059</li>
    </ol>
    <div class="tut-warn">\u30E1\u30E2\u672A\u8A18\u5165\u306E\u5831\u544A\u306F\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u8D64\u304F\u30AB\u30A6\u30F3\u30C8\u3055\u308C\u307E\u3059\u3002\u65E9\u3081\u306E\u78BA\u8A8D\u30FB\u5BFE\u5FDC\u3092\u5FC3\u304C\u3051\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <!-- 1-9 \u304A\u77E5\u3089\u305B\u914D\u4FE1 -->
  <div class="tut-section" id="announce">
    <h3><span class="num">9</span>\u304A\u77E5\u3089\u305B\u914D\u4FE1 \u2014 LINE\u3067\u4E00\u6589\u9001\u4FE1</h3>
    <p style="font-size:13px;">\u793E\u54E1\u306ELINE\u30A2\u30AB\u30A6\u30F3\u30C8\u306B\u304A\u77E5\u3089\u305B\u3084\u30A2\u30F3\u30B1\u30FC\u30C8\u3092\u4E00\u6589\u9001\u4FE1\u3067\u304D\u307E\u3059\u3002</p>
    <ol class="tut-steps">
      <li>\u300C\uFF0B \u65B0\u898F\u914D\u4FE1\u300D\u3092\u30AF\u30EA\u30C3\u30AF</li>
      <li>\u30BF\u30A4\u30C8\u30EB\u30FB\u672C\u6587\u3092\u5165\u529B\u3057\u3001\u9001\u4FE1\u5BFE\u8C61\uFF08\u5168\u54E1 / \u8AB2\u6307\u5B9A / \u5165\u793E\u6708\u6307\u5B9A\uFF09\u3092\u9078\u629E</li>
      <li>\u300C\u9001\u4FE1\u300D\u3092\u30AF\u30EA\u30C3\u30AF \u2014 \u5BFE\u8C61\u8005\u306ELINE\u306B\u5373\u6642\u914D\u4FE1\u3055\u308C\u307E\u3059</li>
    </ol>
    <table class="tut-table">
      <tr><th>\u9001\u4FE1\u5BFE\u8C61</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u5168\u54E1</td><td>LINE\u3092\u9023\u643A\u6E08\u307F\u306E\u5168\u793E\u54E1</td></tr>
      <tr><td>\u8AB2\u6307\u5B9A</td><td>\u9078\u629E\u3057\u305F\u8AB2\uFF081\u301C4\u8AB2\uFF09\u306E\u793E\u54E1</td></tr>
      <tr><td>\u5165\u793E\u6708\u6307\u5B9A</td><td>\u7279\u5B9A\u306E\u6708\u306B\u5165\u793E\u3057\u305F\u793E\u54E1\u306E\u307F</td></tr>
    </table>
    <div class="tut-note">LINE\u3092\u672A\u9023\u643A\u306E\u793E\u54E1\u306B\u306F\u5C4A\u304D\u307E\u305B\u3093\u3002LINE\u7BA1\u7406\u30DA\u30FC\u30B8\u3067\u9023\u643A\u72B6\u6CC1\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</div>
  </div>

  <!-- 1-10 \u8ECA\u4E21\u691C\u7D22 -->
  <div class="tut-section" id="vehicle">
    <h3><span class="num">10</span>\u8ECA\u4E21\u691C\u7D22 \u2014 \u7121\u7DDA\u756A\u53F7\u30FB\u30CA\u30F3\u30D0\u30FC\u3067\u8ECA\u4E21\u7167\u4F1A</h3>
    <p style="font-size:13px;">4\u6841\u306E\u7121\u7DDA\u756A\u53F7\u307E\u305F\u306F\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u672B\u5C3E4\u6841\u3092\u5165\u529B\u3057\u3066\u3001\u8ECA\u4E21\u60C5\u5831\u3092\u691C\u7D22\u3067\u304D\u307E\u3059\u3002</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258DWeb\u7BA1\u7406\u753B\u9762\u3067\u691C\u7D22\u3059\u308B</p>
    <ol class="tut-steps">
      <li>\u5DE6\u30E1\u30CB\u30E5\u30FC\u300C\u8ECA\u4E21\u691C\u7D22\u300D\u3092\u30AF\u30EA\u30C3\u30AF</li>
      <li>\u691C\u7D22\u30DC\u30C3\u30AF\u30B9\u306B4\u6841\u306E\u6570\u5B57\u3092\u5165\u529B\u3057\u3066\u300C\u691C\u7D22\u300D\u30DC\u30BF\u30F3\u3092\u30AF\u30EA\u30C3\u30AF</li>
      <li>\u691C\u7D22\u7D50\u679C\u306B\u7121\u7DDA\u756A\u53F7\u30FB\u8ECA\u4E21\u756A\u53F7\u30FB\u8ECA\u7A2E\u30FB\u55B6\u696D\u6240\u30FB\u8AB2\u30FB\u96FB\u8A71\u756A\u53F7\u304C\u8868\u793A\u3055\u308C\u308B</li>
    </ol>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258DLINE\u3067\u691C\u7D22\u3059\u308B\uFF08\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051\uFF09</p>
    <p style="font-size:13px;">\u8ECA\u756A\u691C\u7D22\u306E\u6A29\u9650\u304C\u4ED8\u4E0E\u3055\u308C\u305F\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306F\u3001\u516C\u5F0FLINE\u30A2\u30AB\u30A6\u30F3\u30C8\u306B4\u6841\u306E\u6570\u5B57\u3092\u9001\u4FE1\u3059\u308B\u3060\u3051\u3067\u691C\u7D22\u3067\u304D\u307E\u3059\u3002</p>
    <div class="tut-tip">\u7121\u7DDA\u756A\u53F7\u3068\u4E00\u81F4\u3059\u308B\u8ECA\u4E21\u306F\u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011\u3001\u30CA\u30F3\u30D0\u30FC\u672B\u5C3E\u3068\u4E00\u81F4\u3059\u308B\u8ECA\u4E21\u306F\u3010\u30CA\u30F3\u30D0\u30FC\u4E00\u81F4\u3011\u3068\u3057\u3066\u533A\u5225\u3057\u3066\u8868\u793A\u3055\u308C\u307E\u3059\u3002</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u691C\u7D22\u7D50\u679C\u306E\u8868\u793A\u5185\u5BB9</p>
    <table class="tut-table">
      <tr><th>\u9805\u76EE</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u7121\u7DDA\u756A\u53F7</td><td>\u8ECA\u4E21\u306B\u5272\u308A\u5F53\u3066\u3089\u308C\u305F\u7121\u7DDA\u756A\u53F7</td></tr>
      <tr><td>\u8ECA\u4E21\u756A\u53F7</td><td>\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u306E\u5168\u6587\u5B57\u5217\uFF08\u4F8B: \u54C1\u5DDD502\u30421988\uFF09</td></tr>
      <tr><td>\u8ECA\u7A2E</td><td>\u8ECA\u4E21\u306E\u7A2E\u985E\uFF08\u4F8B: JPN TAXI\uFF09</td></tr>
      <tr><td>\u55B6\u696D\u6240</td><td>\u6240\u5C5E\u3059\u308B\u55B6\u696D\u6240\u540D</td></tr>
      <tr><td>\u8AB2</td><td>\u6240\u5C5E\u8AB2\uFF08\u4F8B: \u677F\u6A4B2\u8AB2\uFF09</td></tr>
      <tr><td>\u96FB\u8A71\u756A\u53F7</td><td>\u55B6\u696D\u6240\u306E\u96FB\u8A71\u756A\u53F7\uFF08\u8A2D\u5B9A \u2192 \u55B6\u696D\u6240\u3067\u7BA1\u7406\uFF09</td></tr>
    </table>

    <div class="tut-tip">\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306FLINE\u9023\u643A\u5F8C\u3059\u3050\u306B\u8ECA\u756A\u691C\u7D22\u304C\u5229\u7528\u3067\u304D\u307E\u3059\u3002\u8FFD\u52A0\u8A2D\u5B9A\u306F\u4E0D\u8981\u3067\u3059\u3002</div>
    <div class="tut-note">\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u4EE5\u5916\u306B\u691C\u7D22\u6A29\u9650\u3092\u4E0E\u3048\u305F\u3044\u5834\u5408\u306F\u3001LINE\u3067\u300C\u8ECA\u756A\u9023\u643A\u300D\u3068\u9001\u4FE1\u3057\u3066\u81EA\u5DF1\u7533\u8ACB\u3067\u304D\u307E\u3059\u3002</div>
  </div>

  <!-- 1-11 LINE\u7BA1\u7406 -->
  <div class="tut-section" id="line">
    <h3><span class="num">11</span>LINE\u7BA1\u7406 \u2014 \u30E6\u30FC\u30B6\u30FC\u9023\u643A\u72B6\u6CC1</h3>
    <p style="font-size:13px;">\u793E\u54E1\u306ELINE\u30A2\u30AB\u30A6\u30F3\u30C8\u3068\u672C\u30B7\u30B9\u30C6\u30E0\u306E\u7D10\u4ED8\u3051\u72B6\u6CC1\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002</p>
    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">\u258D\u62DB\u5F85\u30B3\u30FC\u30C9\u306E\u767A\u884C\u3068\u9023\u643A\u624B\u9806</p>
    <ol class="tut-steps">
      <li>\u793E\u54E1\u306E\u884C\u306B\u3042\u308B\u300C\u62DB\u5F85\u30B3\u30FC\u30C9\u767A\u884C\u300D\u3092\u30AF\u30EA\u30C3\u30AF</li>
      <li>\u767A\u884C\u3055\u308C\u305F6\u6841\u306E\u30B3\u30FC\u30C9\u3092\u793E\u54E1\u306B\u53E3\u982D\u307E\u305F\u306F\u7D19\u3067\u6E21\u3059</li>
      <li>\u793E\u54E1\u304C\u516C\u5F0FLINE\u30A2\u30AB\u30A6\u30F3\u30C8\u306B\u300C\u30B3\u30FC\u30C9: XXXXXX\u300D\u3068\u9001\u4FE1</li>
      <li>\u9023\u643A\u5B8C\u4E86 \u2014 \u4EE5\u964D\u3001LINE\u304B\u3089\u5831\u544A\u3084\u78BA\u8A8D\u304C\u5229\u7528\u53EF\u80FD\u306B\u306A\u308A\u307E\u3059</li>
    </ol>
    <div class="tut-note">\u62DB\u5F85\u30B3\u30FC\u30C9\u306E\u6709\u52B9\u671F\u9650\u306F\u767A\u884C\u304B\u30897\u65E5\u9593\u3067\u3059\u3002\u671F\u9650\u5207\u308C\u306E\u5834\u5408\u306F\u518D\u767A\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <!-- 1-12 \u8A2D\u5B9A -->
  <div class="tut-section" id="settings">
    <h3><span class="num">12</span>\u8A2D\u5B9A \u2014 \u5404\u7A2E\u30DE\u30B9\u30BF\u7BA1\u7406</h3>
    <table class="tut-table">
      <tr><th>\u8A2D\u5B9A\u9805\u76EE</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u30B7\u30D5\u30C8\u533A\u5206</td><td>\u5B9F\u7814\u30FB\u516C\u4F11\u30FB\u5EA7\u5B66\u306A\u3069\u306E\u533A\u5206\u540D\u30FB\u80CC\u666F\u8272\u30FB\u6708\u9593\u76EE\u6A19\u56DE\u6570\u3092\u8FFD\u52A0\u30FB\u7DE8\u96C6</td></tr>
      <tr><td>\u7814\u4FEE\u62C5\u5F53</td><td>\u30B7\u30D5\u30C8\u5165\u529B\u6642\u306B\u9078\u629E\u3067\u304D\u308B\u30B3\u30FC\u30C1\uFF08\u7814\u4FEE\u62C5\u5F53\u8005\uFF09\u306E\u540D\u524D\u3092\u767B\u9332</td></tr>
      <tr><td>\u73ED\u9577\u30FB\u6307\u5C0E\u8005</td><td>\u30B7\u30D5\u30C8\u8868\u4E0B\u90E8\u306E\u6307\u5C0E\u8005\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u6B04\u3092\u7BA1\u7406\u3002LINE\u9023\u643A\u306E\u62DB\u5F85\u30B3\u30FC\u30C9\u767A\u884C\u3082\u53EF\u80FD</td></tr>
      <tr><td>\u6708\u5EA6\u8A2D\u5B9A</td><td>\u5404\u6708\u306E\u7DE0\u3081\u65E5\u30FB\u958B\u59CB\u65E5\u3092\u8A2D\u5B9A\uFF08\u4F8B\uFF1A17\u65E5\u7DE0\u3081 18\u65E5\u958B\u59CB\uFF09</td></tr>
      <tr><td>LINE\u901A\u77E5\u8A2D\u5B9A</td><td>\u73ED\u9577\u3078\u306E\u30B7\u30D5\u30C8\u30EA\u30DE\u30A4\u30F3\u30C0\u30FC\u306A\u3069\u5B9A\u6642\u901A\u77E5\u306E\u6709\u52B9/\u7121\u52B9\u30FB\u9001\u4FE1\u6642\u523B\u3092\u8A2D\u5B9A</td></tr>
      <tr><td>\u8ECA\u4E21\u691C\u7D22\u7BA1\u7406\u8005</td><td>LINE\u3067\u300C\u8ECA\u756A\u9023\u643A\u300D\u3068\u9001\u4FE1\u3057\u3001\u81EA\u5DF1\u7533\u8ACB\u3067\u6A29\u9650\u3092\u53D6\u5F97\uFF08\u7BA1\u7406\u753B\u9762\u304B\u3089\u306E\u624B\u52D5\u767B\u9332\u306F\u5EC3\u6B62\uFF09</td></tr>
      <tr><td>\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9</td><td>\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051LINE\u8ECA\u756A\u691C\u7D22\u306E\u4F7F\u3044\u65B9\u30DA\u30FC\u30B8\uFF08\u5370\u5237\u30FB\u914D\u5E03\u7528\uFF09</td></tr>
      <tr><td>\u30A2\u30AF\u30BB\u30B9QR\u30B3\u30FC\u30C9</td><td>\u7BA1\u7406\u753B\u9762\u30ED\u30B0\u30A4\u30F3\u30DA\u30FC\u30B8\u306EQR\u30B3\u30FC\u30C9\u3092\u8868\u793A\u30FB\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9</td></tr>
      <tr><td>\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB</td><td>\u3053\u306E\u30DE\u30CB\u30E5\u30A2\u30EB\uFF08\u5370\u5237\u30FBPDF\u51FA\u529B\u5BFE\u5FDC\uFF09</td></tr>
    </table>
  </div>

  <hr class="tut-divider">

  <!-- \u7B2C2\u7AE0 -->
  <div class="tut-chapter" id="chap2">
    <div class="tut-chapter-label">Chapter 2</div>
    <h2>\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u5411\u3051\uFF08LINE\u8ECA\u756A\u691C\u7D22\u30AC\u30A4\u30C9\uFF09</h2>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:8px;">\u7BA1\u7406\u8005\u304B\u3089\u8ECA\u756A\u691C\u7D22\u306E\u6A29\u9650\u3092\u4ED8\u4E0E\u3055\u308C\u305F\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306F\u3001<strong>LINE</strong> \u304B\u3089\u8ECA\u4E21\u60C5\u5831\u3092\u691C\u7D22\u3067\u304D\u307E\u3059\u3002</p>

  <!-- 2-1 \u8ECA\u756A\u691C\u7D22\u3067\u3067\u304D\u308B\u3053\u3068 -->
  <div class="tut-section" id="veh-what">
    <h3><span class="num">1</span>\u8ECA\u756A\u691C\u7D22\u3067\u3067\u304D\u308B\u3053\u3068</h3>
    <table class="tut-table">
      <tr><th>\u691C\u7D22\u30AD\u30FC</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u7121\u7DDA\u756A\u53F7\uFF084\u6841\uFF09</td><td>\u7121\u7DDA\u756A\u53F7\u304C\u5B8C\u5168\u4E00\u81F4\u3059\u308B\u8ECA\u4E21\u3092\u8868\u793A</td></tr>
      <tr><td>\u30CA\u30F3\u30D0\u30FC\u672B\u5C3E\uFF084\u6841\uFF09</td><td>\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u672B\u5C3E\u306E\u6570\u5B57\u304C\u4E00\u81F4\u3059\u308B\u8ECA\u4E21\u3092\u8868\u793A</td></tr>
    </table>
    <div class="tut-note">\u3053\u306E\u6A5F\u80FD\u306F\u7BA1\u7406\u8005\u304B\u3089\u6A29\u9650\u3092\u4ED8\u4E0E\u3055\u308C\u305FLINE\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u307F\u5229\u7528\u3067\u304D\u307E\u3059\u3002\u6A29\u9650\u304C\u306A\u3044\u5834\u5408\u306F\u901A\u5E38\u306E\u793E\u54E1\u5411\u3051\u30E1\u30CB\u30E5\u30FC\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002</div>
  </div>

  <!-- 2-2 \u691C\u7D22\u306E\u65B9\u6CD5 -->
  <div class="tut-section" id="veh-how">
    <h3><span class="num">2</span>\u691C\u7D22\u306E\u65B9\u6CD5</h3>
    <ol class="tut-steps">
      <li>\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE\u306E\u30C8\u30FC\u30AF\u753B\u9762\u3092\u958B\u304F</li>
      <li>\u8ABF\u3079\u305F\u3044<strong>4\u6841\u306E\u6570\u5B57</strong>\u3092\u5165\u529B\u3057\u3066\u9001\u4FE1\uFF08\u4F8B\uFF1A\u300C1988\u300D\uFF09</li>
      <li>\u6570\u79D2\u3067\u691C\u7D22\u7D50\u679C\u304CLINE\u306B\u8FD4\u3063\u3066\u304D\u307E\u3059</li>
    </ol>
    <div class="tut-tip">\u81EA\u5206\u306ELINE UID\u3092\u78BA\u8A8D\u3057\u305F\u3044\u5834\u5408\u306F\u300Cuid\u300D\u3068\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <!-- 2-3 \u691C\u7D22\u7D50\u679C\u306E\u898B\u65B9 -->
  <div class="tut-section" id="veh-result">
    <h3><span class="num">3</span>\u691C\u7D22\u7D50\u679C\u306E\u898B\u65B9</h3>
    <p style="font-size:13px;">\u691C\u7D22\u7D50\u679C\u306F\u4EE5\u4E0B\u306E\u5F62\u5F0F\u3067\u8FD4\u3063\u3066\u304D\u307E\u3059\u3002</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;font-size:12px;font-family:monospace;line-height:1.8;margin:10px 0;">
      \u{1F50D} \u300C1988\u300D\u306E\u691C\u7D22\u7D50\u679C\uFF081\u4EF6\uFF09<br><br>
      \u2501\u2501 \u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011 \u2501\u2501<br>
      \u7121\u7DDA\u756A\u53F7: 1988<br>
      \u8ECA\u4E21\u756A\u53F7: \u54C1\u5DDD502\u30421988<br>
      \u8ECA\u7A2E: JPN TAXI<br>
      \u55B6\u696D\u6240: \u677F\u6A4B\u55B6\u696D\u6240<br>
      \u8AB2: \u677F\u6A4B2\u8AB2
    </div>
    <table class="tut-table">
      <tr><th>\u8868\u793A</th><th>\u610F\u5473</th></tr>
      <tr><td>\u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011</td><td>\u5165\u529B\u3057\u305F\u6570\u5B57\u304C\u7121\u7DDA\u756A\u53F7\u3068\u4E00\u81F4\u3057\u305F\u8ECA\u4E21</td></tr>
      <tr><td>\u3010\u30CA\u30F3\u30D0\u30FC\u4E00\u81F4\u3011</td><td>\u5165\u529B\u3057\u305F\u6570\u5B57\u304C\u30CA\u30F3\u30D0\u30FC\u30D7\u30EC\u30FC\u30C8\u672B\u5C3E\u3068\u4E00\u81F4\u3057\u305F\u8ECA\u4E21</td></tr>
    </table>
    <div class="tut-note">\u540C\u3058\u6570\u5B57\u3067\u7121\u7DDA\u756A\u53F7\u3068\u30CA\u30F3\u30D0\u30FC\u306E\u4E21\u65B9\u306B\u8A72\u5F53\u3059\u308B\u5834\u5408\u3001\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u304C\u5148\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002</div>
  </div>

  <hr class="tut-divider">

  <!-- \u7B2C3\u7AE0 -->
  <div class="tut-chapter" id="chap3">
    <div class="tut-chapter-label">Chapter 3</div>
    <h2>\u73FE\u5834\u30B9\u30BF\u30C3\u30D5\u5411\u3051\uFF08LINE\u5229\u7528\u30AC\u30A4\u30C9\uFF09</h2>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:8px;">\u3053\u306E\u30B7\u30B9\u30C6\u30E0\u3067\u306F\u3001\u30B9\u30BF\u30C3\u30D5\u306E\u7686\u3055\u3093\u306F\u30B9\u30DE\u30FC\u30C8\u30D5\u30A9\u30F3\u306E <strong>LINE</strong> \u3092\u4F7F\u3063\u3066\u5831\u544A\u30FB\u9023\u7D61\u304C\u3067\u304D\u307E\u3059\u3002\u5C02\u7528\u30A2\u30D7\u30EA\u306E\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u306F\u4E0D\u8981\u3067\u3059\u3002</p>

  <!-- 3-1 LINE\u3067\u3067\u304D\u308B\u3053\u3068 -->
  <div class="tut-section" id="line-what">
    <h3><span class="num">1</span>LINE\u3067\u3067\u304D\u308B\u3053\u3068</h3>
    <table class="tut-table">
      <tr><th>\u6A5F\u80FD</th><th>\u5185\u5BB9</th></tr>
      <tr><td>\u5ACC\u306A\u3053\u3068\u30FB\u56F0\u3063\u305F\u3053\u3068\u306E\u5831\u544A</td><td>\u4ED5\u4E8B\u4E2D\u306B\u56F0\u3063\u305F\u3053\u3068\u3084\u5ACC\u306A\u51FA\u6765\u4E8B\u3092LINE\u304B\u3089\u7C21\u5358\u306B\u5831\u544A\u3067\u304D\u307E\u3059</td></tr>
      <tr><td>\u304A\u77E5\u3089\u305B\u306E\u53D7\u3051\u53D6\u308A</td><td>\u4E8B\u52D9\u6240\u304B\u3089\u306E\u304A\u77E5\u3089\u305B\u30FB\u9023\u7D61\u4E8B\u9805\u304CLINE\u306B\u5C4A\u304D\u307E\u3059</td></tr>
      <tr><td>\u30A2\u30F3\u30B1\u30FC\u30C8\u3078\u306E\u56DE\u7B54</td><td>URL\u30EA\u30F3\u30AF\u4ED8\u304D\u306E\u30A2\u30F3\u30B1\u30FC\u30C8\u304CLINE\u3067\u9001\u3089\u308C\u3066\u304F\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059</td></tr>
    </table>
  </div>

  <!-- 3-2 \u521D\u56DE\u9023\u643A -->
  <div class="tut-section" id="line-link">
    <h3><span class="num">2</span>\u521D\u56DE\u9023\u643A\u306E\u65B9\u6CD5</h3>
    <p style="font-size:13px;">\u6700\u521D\u306B1\u56DE\u3060\u3051\u8A2D\u5B9A\u304C\u5FC5\u8981\u3067\u3059\u3002</p>
    <ol class="tut-steps">
      <li>\u4E8B\u52D9\u6240\u30B9\u30BF\u30C3\u30D5\u304B\u3089\u300C\u62DB\u5F85\u30B3\u30FC\u30C9\u300D\uFF08\u4F8B\uFF1A<strong>AB1234</strong>\uFF09\u3092\u53D7\u3051\u53D6\u308B</li>
      <li>\u30B9\u30DE\u30FC\u30C8\u30D5\u30A9\u30F3\u3067\u300C<strong>\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE</strong>\u300D\u3092\u53CB\u9054\u8FFD\u52A0\u3059\u308B\uFF08QR\u30B3\u30FC\u30C9\u307E\u305F\u306FID\u691C\u7D22\uFF09</li>
      <li>\u30C8\u30FC\u30AF\u753B\u9762\u306B\u300C<strong>\u30B3\u30FC\u30C9: AB1234</strong>\u300D\u3068\u5165\u529B\u3057\u3066\u9001\u4FE1</li>
      <li>\u300C\u9023\u643A\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u300D\u3068\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u5C4A\u3044\u305F\u3089\u8A2D\u5B9A\u5B8C\u4E86\u3067\u3059</li>
    </ol>
    <div class="tut-note">\u9023\u643A\u306F1\u56DE\u3060\u3051\u3067OK\u3067\u3059\u3002\u6A5F\u7A2E\u5909\u66F4\u3057\u305F\u5834\u5408\u306F\u4E8B\u52D9\u6240\u30B9\u30BF\u30C3\u30D5\u306B\u518D\u9023\u643A\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <!-- 3-3 \u5ACC\u306A\u3053\u3068\u5831\u544A -->
  <div class="tut-section" id="line-report">
    <h3><span class="num">3</span>\u5ACC\u306A\u3053\u3068\u30FB\u56F0\u3063\u305F\u3053\u3068\u306E\u5831\u544A\u65B9\u6CD5</h3>
    <p style="font-size:13px;">\u4ED5\u4E8B\u4E2D\u306B\u5ACC\u306A\u3053\u3068\u3084\u56F0\u3063\u305F\u3053\u3068\u304C\u3042\u3063\u305F\u3089\u3001\u6C17\u8EFD\u306BLINE\u304B\u3089\u5831\u544A\u3067\u304D\u307E\u3059\u3002\u5831\u544A\u306F\u3059\u3050\u306B\u4E8B\u52D9\u6240\u306B\u5C4A\u304D\u3001\u5BFE\u5FDC\u3057\u307E\u3059\u3002</p>
    <ol class="tut-steps">
      <li>LINE\u306E\u30C8\u30FC\u30AF\u753B\u9762\u3067\u300C<strong>\u5831\u544A</strong>\u300D\u307E\u305F\u306F\u300C<strong>\u307B\u3046\u3053\u304F</strong>\u300D\u3068\u9001\u4FE1</li>
      <li>\u30AB\u30C6\u30B4\u30EA\u3092\u9078\u3076\u30E1\u30CB\u30E5\u30FC\u304C\u8868\u793A\u3055\u308C\u308B\uFF08\u30AF\u30EC\u30FC\u30DE\u30FC\u30FB\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB\u30FB\u793E\u5185\u306E\u51FA\u6765\u4E8B\u30FB\u305D\u306E\u4ED6\uFF09</li>
      <li>\u8A72\u5F53\u3059\u308B\u30AB\u30C6\u30B4\u30EA\u3092\u9078\u629E</li>
      <li>\u4F55\u304C\u3042\u3063\u305F\u304B\u3092\u81EA\u7531\u306B\u6587\u7AE0\u3067\u5165\u529B\u3057\u3066\u9001\u4FE1</li>
      <li>\u300C\u5831\u544A\u3092\u53D7\u3051\u4ED8\u3051\u307E\u3057\u305F\u300D\u3068\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u5C4A\u3044\u305F\u3089\u5B8C\u4E86\u3067\u3059</li>
    </ol>
    <div class="tut-tip">\u3069\u3093\u306A\u5C0F\u3055\u306A\u3053\u3068\u3067\u3082\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u4E00\u4EBA\u3067\u62B1\u3048\u8FBC\u307E\u306A\u3044\u3053\u3068\u304C\u5927\u5207\u3067\u3059\u3002</div>
    <div class="tut-note">\u5831\u544A\u3057\u305F\u5185\u5BB9\u306F\u4E8B\u52D9\u6240\u306E\u62C5\u5F53\u8005\u306E\u307F\u304C\u78BA\u8A8D\u3057\u307E\u3059\u3002\u4ED6\u306E\u30B9\u30BF\u30C3\u30D5\u306B\u306F\u5171\u6709\u3055\u308C\u307E\u305B\u3093\u3002</div>
  </div>

  <!-- 3-4 \u304A\u77E5\u3089\u305B\u53D7\u3051\u53D6\u308A -->
  <div class="tut-section" id="line-recv">
    <h3><span class="num">4</span>\u304A\u77E5\u3089\u305B\u30FB\u30A2\u30F3\u30B1\u30FC\u30C8\u306E\u53D7\u3051\u53D6\u308A\u65B9</h3>
    <p style="font-size:13px;">\u4E8B\u52D9\u6240\u304B\u3089\u306E\u304A\u77E5\u3089\u305B\u306F\u5F01\u5929\u30AF\u30E9\u30D6\u516C\u5F0FLINE\u304B\u3089\u81EA\u52D5\u3067\u5C4A\u304D\u307E\u3059\u3002</p>
    <ol class="tut-steps">
      <li>LINE\u306B\u901A\u77E5\u304C\u5C4A\u3044\u305F\u3089\u30C8\u30FC\u30AF\u753B\u9762\u3092\u958B\u304F</li>
      <li>\u304A\u77E5\u3089\u305B\u5185\u5BB9\u3092\u78BA\u8A8D\u3059\u308B</li>
      <li>URL\u30EA\u30F3\u30AF\u304C\u542B\u307E\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u30BF\u30C3\u30D7\u3057\u3066\u30A2\u30F3\u30B1\u30FC\u30C8\u306B\u56DE\u7B54\u3059\u308B</li>
    </ol>
    <div class="tut-note">LINE\u306E\u901A\u77E5\u8A2D\u5B9A\u304C\u30AA\u30D5\u306B\u306A\u3063\u3066\u3044\u308B\u3068\u53D7\u3051\u53D6\u308C\u307E\u305B\u3093\u3002\u901A\u77E5\u304C\u30AA\u30F3\u306B\u306A\u3063\u3066\u3044\u308B\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002</div>
  </div>

  <div style="margin-top:40px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
    \u65B0\u4EBA\u7BA1\u7406\u30B7\u30B9\u30C6\u30E0 \u4F7F\u3044\u65B9\u30AC\u30A4\u30C9 &nbsp;|&nbsp; 2026\u5E746\u6708\u7248 &nbsp;|&nbsp; \u3054\u4E0D\u660E\u306A\u70B9\u306F\u4E8B\u52D9\u6240\u30B9\u30BF\u30C3\u30D5\u307E\u3067\u304A\u554F\u3044\u5408\u308F\u305B\u304F\u3060\u3055\u3044
  </div>
</div>`;
  return c.html(layout("\u30C1\u30E5\u30FC\u30C8\u30EA\u30A2\u30EB", html, "settings"));
});
app.get("/settings/legacy", async (c) => {
  const [typesRes, coachesRes, instructorsRes, periodCfg] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM schedule_types ORDER BY sort_order, id").all(),
    c.env.DB.prepare("SELECT * FROM coaches ORDER BY sort_order, id").all(),
    c.env.DB.prepare("SELECT * FROM instructors ORDER BY sort_order, id").all(),
    getPeriodSettings(c.env.DB)
  ]);
  const types = typesRes;
  const rows = (types.results ?? []).map((t) => `
    <tr id="row-${t.id}" style="opacity:${t.is_active ? "1" : "0.45"};">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(t.code)}" id="code-${t.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:90px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" value="${escHtml(t.color)}" id="color-${t.id}" style="width:36px;height:28px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">
          <span style="background:${escHtml(t.color)};padding:2px 10px;border-radius:4px;border:1px solid #d1d5db;font-size:13px;">${escHtml(t.code)}</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${t.sort_order}" id="sort-${t.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" value="${t.target ?? ""}" id="target-${t.id}" min="1" max="999" placeholder="\u2014"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:58px;">
          <span style="font-size:11px;color:#9ca3af;">\u56DE</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveType(${t.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
          <button onclick="toggleType(${t.id},${t.is_active})" style="padding:4px 8px;background:${t.is_active ? "#f3f4f6" : "#bbf7d0"};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${t.is_active ? "\u975E\u8868\u793A" : "\u8868\u793A"}
          </button>
          <button onclick="deleteType(${t.id},'${escHtml(t.code)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`).join("");
  const content = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
      <h3 class="font-semibold text-gray-700 mb-4">\u30B7\u30D5\u30C8\u533A\u5206\u306E\u8A2D\u5B9A</h3>
      <p class="text-sm text-gray-500 mb-4">\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u306E\u30D7\u30EA\u30BB\u30C3\u30C8\u30DC\u30BF\u30F3\u3068\u51E1\u4F8B\u306B\u4F7F\u308F\u308C\u307E\u3059\u3002<strong>\u76EE\u6A19\u56DE\u6570</strong>\u3092\u8A2D\u5B9A\u3059\u308B\u3068\u30B7\u30D5\u30C8\u8868\u306E\u96C6\u8A08\u30DC\u30BF\u30F3\u3067\u9054\u6210\u72B6\u6CC1\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002</p>
      <table class="w-full mb-6">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u533A\u5206\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u8272</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u76EE\u6A19\u56DE\u6570</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">\u65B0\u3057\u3044\u533A\u5206\u3092\u8FFD\u52A0</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-code" placeholder="\u533A\u5206\u540D\uFF08\u4F8B: \u5B9F\u5730\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:130px;">
          <input type="color" id="new-color" value="#e0f2fe"
            style="width:40px;height:34px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">
          <input type="number" id="new-sort" value="99" min="0" max="99"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;width:60px;">
          <button onclick="addType()" style="padding:7px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    async function saveType(id) {
      const code = document.getElementById('code-' + id).value.trim();
      const color = document.getElementById('color-' + id).value;
      const sort_order = parseInt(document.getElementById('sort-' + id).value) || 0;
      const targetVal = document.getElementById('target-' + id).value;
      const target = targetVal ? parseInt(targetVal) : null;
      if (!code) { alert('\u533A\u5206\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/schedule-types/' + id, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ code, color, sort_order, target })
      });
      if (res.ok) { location.reload(); } else { alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    async function toggleType(id, current) {
      await fetch('/api/schedule-types/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ is_active: current ? 0 : 1 })
      });
      location.reload();
    }
    async function deleteType(id, name) {
      if (!confirm('\u300C' + name + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/schedule-types/' + id, { method: 'DELETE' });
      location.reload();
    }
    async function addType() {
      const code = document.getElementById('new-code').value.trim();
      const color = document.getElementById('new-color').value;
      const sort_order = parseInt(document.getElementById('new-sort').value) || 99;
      if (!code) { alert('\u533A\u5206\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/schedule-types', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ code, color, sort_order })
      });
      if (res.ok) { location.reload(); }
      else { const j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>
  `;
  const coachRows = (coachesRes.results ?? []).map((c2) => `
    <tr style="opacity:${c2.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(c2.name)}" id="cname-${c2.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:120px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${c2.sort_order}" id="csort-${c2.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveCoach(${c2.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
          <button onclick="deleteCoach(${c2.id},'${escHtml(c2.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`).join("");
  const coachSection = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl mt-6">
      <h3 class="font-semibold text-gray-700 mb-1">\u7814\u4FEE\u62C5\u5F53\uFF08\u30B3\u30FC\u30C1\uFF09\u306E\u767B\u9332</h3>
      <p class="text-sm text-gray-500 mb-4">\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u306E\u5404\u30BB\u30EB3\u884C\u76EE\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody id="coach-list">${coachRows || '<tr><td colspan="3" class="px-3 py-4 text-center text-sm text-gray-400 border-b">\u672A\u767B\u9332</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <h4 class="text-sm font-semibold text-gray-700 mb-2">\u65B0\u898F\u8FFD\u52A0</h4>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="new-coach-name" placeholder="\u6C0F\u540D\uFF08\u4F8B: \u5C71\u7530 \u592A\u90CE\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;flex:1;">
          <button onclick="addCoach()" style="padding:7px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    async function saveCoach(id) {
      const name = document.getElementById('cname-' + id).value.trim();
      const sort_order = parseInt(document.getElementById('csort-' + id).value) || 0;
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/coaches/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, sort_order })
      });
      if (res.ok) location.reload(); else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function deleteCoach(id, name) {
      if (!confirm(name + ' \u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/coaches/' + id, { method: 'DELETE' });
      location.reload();
    }
    async function addCoach() {
      const name = document.getElementById('new-coach-name').value.trim();
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/coaches', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
      if (res.ok) location.reload();
      else { const j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>`;
  const MONTH_NAMES = ["1\u6708\u5EA6", "2\u6708\u5EA6", "3\u6708\u5EA6", "4\u6708\u5EA6", "5\u6708\u5EA6", "6\u6708\u5EA6", "7\u6708\u5EA6", "8\u6708\u5EA6", "9\u6708\u5EA6", "10\u6708\u5EA6", "11\u6708\u5EA6", "12\u6708\u5EA6"];
  const periodRows = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const cfg = periodCfg[m] ?? { close_day: 17, start_day: 18 };
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${MONTH_NAMES[i]}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">
        \u524D\u6708 <input type="number" id="ps_start_${m}" value="${cfg.start_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> \u65E5\u301C
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">
        \u5F53\u6708 <input type="number" id="ps_close_${m}" value="${cfg.close_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> \u65E5
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">
        <button onclick="savePeriod(${m})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
      </td>
    </tr>`;
  }).join("");
  const periodSection = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl mt-6">
      <h3 class="font-semibold text-gray-700 mb-1">\u6708\u5EA6\u8A2D\u5B9A</h3>
      <p class="text-sm text-gray-500 mb-4">\u6708\u5EA6\u3054\u3068\u306E\u958B\u59CB\u65E5\uFF08\u524D\u6708\uFF09\u3068\u7DE0\u3081\u65E5\uFF08\u5F53\u6708\uFF09\u3092\u8A2D\u5B9A\u3057\u307E\u3059\u3002<br>\u4F8B: 6\u6708\u5EA6 = \u524D\u670818\u65E5\u301C\u5F53\u670817\u65E5</p>
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6708\u5EA6</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u958B\u59CB\uFF08\u524D\u6708\uFF09</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u7DE0\u3081\uFF08\u5F53\u6708\uFF09</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody>${periodRows}</tbody>
      </table>
    </div>
    <script>
    async function savePeriod(month) {
      var start = parseInt(document.getElementById('ps_start_' + month).value);
      var close = parseInt(document.getElementById('ps_close_' + month).value);
      if (!start || start < 1 || start > 31 || !close || close < 1 || close > 31) {
        alert('\u65E5\u4ED8\u306F1\u301C31\u306E\u7BC4\u56F2\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044');
        return;
      }
      var res = await fetch('/api/period-settings', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ month: month, start_day: start, close_day: close })
      });
      if (res.ok) { alert(month + '\u6708\u5EA6\u306E\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F'); }
      else { alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>`;
  const instructorRows2 = (instructorsRes.results ?? []).map((inst) => `
    <tr style="opacity:${inst.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.name)}" id="iname-${inst.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:120px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.role ?? "")}" id="irole-${inst.id}" placeholder="\u4F8B: 4\u8AB2 \u65B0\u4EBA\u6559\u80B2"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:150px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${inst.sort_order}" id="isort-${inst.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveInstructor(${inst.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u4FDD\u5B58</button>
          <button onclick="toggleInstructor(${inst.id},${inst.is_active})" style="padding:4px 8px;background:${inst.is_active ? "#f3f4f6" : "#bbf7d0"};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${inst.is_active ? "\u975E\u8868\u793A" : "\u8868\u793A"}
          </button>
          <button onclick="deleteInstructor(${inst.id},'${escHtml(inst.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`).join("");
  const instructorSection = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl mt-6">
      <h3 class="font-semibold text-gray-700 mb-1">\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u306E\u767B\u9332</h3>
      <p class="text-sm text-gray-500 mb-4">\u30B7\u30D5\u30C8\u7BA1\u7406\u753B\u9762\u306E\u4E0B\u90E8\u300C\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u300D\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u5F79\u8077\u30FB\u5099\u8003</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9806\u756A</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody>${instructorRows2 || '<tr><td colspan="4" class="px-3 py-4 text-center text-sm text-gray-400 border-b">\u672A\u767B\u9332</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <h4 class="text-sm font-semibold text-gray-700 mb-2">\u65B0\u898F\u8FFD\u52A0</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-inst-name" placeholder="\u6C0F\u540D\uFF08\u4F8B: \u677E\u672C\u73ED\u9577\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:140px;">
          <input type="text" id="new-inst-role" placeholder="\u5F79\u8077\uFF08\u4F8B: 4\u8AB2 \u65B0\u4EBA\u6559\u80B2\uFF09"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:160px;">
          <button onclick="addInstructor()" style="padding:7px 18px;background:#7c3aed;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">\u8FFD\u52A0</button>
        </div>
      </div>
    </div>
    <script>
    async function saveInstructor(id) {
      const name = document.getElementById('iname-' + id).value.trim();
      const role = document.getElementById('irole-' + id).value.trim();
      const sort_order = parseInt(document.getElementById('isort-' + id).value) || 0;
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/instructors/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, role: role || null, sort_order })
      });
      if (res.ok) location.reload(); else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function toggleInstructor(id, current) {
      await fetch('/api/instructors/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ is_active: current ? 0 : 1 })
      });
      location.reload();
    }
    async function deleteInstructor(id, name) {
      if (!confirm(name + ' \u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      await fetch('/api/instructors/' + id, { method: 'DELETE' });
      location.reload();
    }
    async function addInstructor() {
      const name = document.getElementById('new-inst-name').value.trim();
      const role = document.getElementById('new-inst-role').value.trim();
      if (!name) { alert('\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/instructors', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, role: role || null })
      });
      if (res.ok) location.reload();
      else { const j = await res.json(); alert(j.error ?? '\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
    }
    <\/script>`;
  return c.html(layout("\u8A2D\u5B9A\uFF08\u65E7\uFF09", content + coachSection + instructorSection + periodSection, "settings"));
});
app.get("/employees", async (c) => {
  const filterStatus = c.req.query("status") ?? "all";
  const filterDiv = c.req.query("div") ?? "all";
  const filterYear = c.req.query("year") ?? "all";
  const sortKey = c.req.query("sort") ?? "hire_date";
  const conditions = ["is_active = 1"];
  if (filterStatus === "training")
    conditions.push("(status IS NULL OR status = 'training')");
  else if (filterStatus === "completed")
    conditions.push("status = 'completed'");
  else if (filterStatus === "unassigned")
    conditions.push("status = 'unassigned'");
  if (filterDiv !== "all")
    conditions.push(`division = ${parseInt(filterDiv)}`);
  if (filterYear !== "all")
    conditions.push(`strftime('%Y', hire_date) = '${filterYear.replace(/[^0-9]/g, "")}'`);
  const ORDER = {
    hire_date: "CASE WHEN hire_date IS NULL THEN 1 ELSE 0 END, hire_date ASC, seq_no, id",
    hire_date_desc: "CASE WHEN hire_date IS NULL THEN 1 ELSE 0 END, hire_date DESC, seq_no, id",
    seq_no: "seq_no ASC, id",
    division: "division ASC, team ASC, seq_no, id",
    name: "name ASC"
  };
  const orderBy = ORDER[sortKey] ?? ORDER.hire_date;
  const employees = await c.env.DB.prepare(
    `SELECT * FROM employees WHERE ${conditions.join(" AND ")} ORDER BY ${orderBy}`
  ).all();
  const years = await c.env.DB.prepare(
    "SELECT DISTINCT strftime('%Y', hire_date) as y FROM employees WHERE is_active = 1 AND hire_date IS NOT NULL ORDER BY y DESC"
  ).all();
  const STATUS_STYLE = {
    training: { bg: "#dbeafe", color: "#1e40af", label: "\u7814\u4FEE\u4E2D" },
    completed: { bg: "#bbf7d0", color: "#166534", label: "\u7814\u4FEE\u7D42\u4E86" },
    unassigned: { bg: "#f3f4f6", color: "#6b7280", label: "\u672A\u914D\u5C5E" }
  };
  const ENTRY_COLORS = {
    "\u65B0\u5352": "#dbeafe",
    "\u30AD\u30E3\u30EA\u30A2": "#bbf7d0"
  };
  const rows = (employees.results ?? []).map((e) => {
    const st = e.status ?? "training";
    const ss = STATUS_STYLE[st] ?? STATUS_STYLE.training;
    const itTarget = !!e.interview_target;
    const cycleMap = { training: "completed", completed: "unassigned", unassigned: "training" };
    const nextStatus = cycleMap[st] ?? "completed";
    const nextLabels = { training: "\u2192\u7814\u4FEE\u7D42\u4E86", completed: "\u2192\u672A\u914D\u5C5E", unassigned: "\u2192\u7814\u4FEE\u4E2D" };
    const nextLabel = nextLabels[st] ?? "\u2192\u7814\u4FEE\u7D42\u4E86";
    const C = "padding:7px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle;overflow:hidden;";
    return `
    <tr style="background:white;cursor:pointer;"
      onmouseover="this.style.background='#f8fafc'"
      onmouseout="this.style.background='white'"
      onclick="if(!event.target.closest('button'))location.href='${ADMIN_PATH}/employees/${e.id}/edit'">
      <td style="${C}font-size:12px;color:#9ca3af;text-align:center;white-space:nowrap;">
        ${e.seq_no ?? ""}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">
        ${e.division ?? ""}\u8AB2${e.team ? " " + e.team + "\u73ED" : ""}
      </td>
      <td style="${C}">
        <div style="display:flex;align-items:baseline;gap:5px;min-width:0;">
          <span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(e.name)}</span>
          <span style="font-size:11px;color:#9ca3af;white-space:nowrap;flex-shrink:0;">${escHtml(e.emp_no)}</span>
        </div>
      </td>
      <td style="${C}white-space:nowrap;">
        <span style="background:${ENTRY_COLORS[e.entry_type] ?? "#f3f4f6"};padding:2px 6px;border-radius:4px;font-size:11px;">${escHtml(e.entry_type)}</span>
      </td>
      <td style="${C}white-space:nowrap;">
        <button onclick="event.stopPropagation();cycleStatus(${e.id},'${st}')" title="${nextLabel}"
          style="background:${ss.bg};color:${ss.color};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;border:none;cursor:pointer;"
          onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          ${ss.label}
        </button>
      </td>
      <td style="${C}text-align:center;white-space:nowrap;">
        <button onclick="event.stopPropagation();toggleInterview(${e.id},${itTarget ? 1 : 0})"
          style="padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:none;white-space:nowrap;background:${itTarget ? "#1a3a5c" : "#f3f4f6"};color:${itTarget ? "white" : "#9ca3af"};">
          ${itTarget ? "\u5BFE\u8C61" : "\u2014"}
        </button>
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;text-align:center;">
        ${e.hire_date ? e.hire_date.slice(5).replace("-", "/") : "\u2014"}
      </td>
      <td style="${C}white-space:nowrap;">
        <div style="display:flex;gap:4px;">
          <button onclick="event.stopPropagation();retire(${e.id},'${escHtml(e.name)}')" style="font-size:11px;padding:4px 8px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;cursor:pointer;white-space:nowrap;">\u9000\u8077</button>
          <button onclick="event.stopPropagation();purge(${e.id},'${escHtml(e.name)}')" style="font-size:11px;padding:4px 8px;background:#1f2937;color:white;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">\u524A\u9664</button>
        </div>
      </td>
    </tr>`;
  }).join("");
  const q = /* @__PURE__ */ __name((params) => {
    const base = { status: filterStatus, div: filterDiv, year: filterYear, sort: sortKey };
    return Object.entries({ ...base, ...params }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  }, "q");
  const statusBtns = [
    ["all", "\u5168\u54E1"],
    ["training", "\u7814\u4FEE\u4E2D"],
    ["completed", "\u7814\u4FEE\u7D42\u4E86"],
    ["unassigned", "\u672A\u914D\u5C5E"]
  ].map(
    ([val, label]) => `<a href="${ADMIN_PATH}/employees?${q({ status: val })}" class="text-xs px-3 py-1 rounded ${filterStatus === val ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}">${label}</a>`
  ).join("");
  const divBtns = [
    ["all", "\u5168\u8AB2"],
    ["1", "1\u8AB2"],
    ["2", "2\u8AB2"],
    ["3", "3\u8AB2"],
    ["4", "4\u8AB2"]
  ].map(
    ([val, label]) => `<a href="${ADMIN_PATH}/employees?${q({ div: val })}" class="text-xs px-3 py-1 rounded ${filterDiv === val ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}">${label}</a>`
  ).join("");
  const yearBtns = [
    ["all", "\u5168\u5E74"],
    ...(years.results ?? []).map((r) => [r.y, `${r.y}\u5E74`])
  ].map(
    ([val, label]) => `<a href="${ADMIN_PATH}/employees?${q({ year: val })}" class="text-xs px-3 py-1 rounded ${filterYear === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}">${label}</a>`
  ).join("");
  function sortLink(key, keyDesc, label) {
    const isAsc = sortKey === key;
    const isDesc = sortKey === keyDesc;
    const nextSort = isAsc ? keyDesc : key;
    const indicator = isAsc ? " \u25B2" : isDesc ? " \u25BC" : "";
    const active = isAsc || isDesc;
    return `<a href="${ADMIN_PATH}/employees?${q({ sort: nextSort })}"
      style="text-decoration:none;color:${active ? "#1d4ed8" : "#6b7280"};font-weight:${active ? "700" : "500"};">
      ${label}${indicator}
    </a>`;
  }
  __name(sortLink, "sortLink");
  const content = `
    <div class="flex justify-between items-center mb-3">
      <div class="space-y-2">
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">\u30B9\u30C6\u30FC\u30BF\u30B9</span>
          <div class="flex gap-1">${statusBtns}</div>
        </div>
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">\u8AB2</span>
          <div class="flex gap-1">${divBtns}</div>
        </div>
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">\u5E74</span>
          <div class="flex gap-1">${yearBtns}</div>
        </div>
      </div>
      <div class="flex gap-2 items-center">
        <span class="text-sm text-gray-500">${(employees.results ?? []).length}\u540D</span>
        <a href="${ADMIN_PATH}/employees/add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">\uFF0B \u65B0\u898F\u767B\u9332</a>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table style="width:100%;table-layout:fixed;border-collapse:collapse;">
        <colgroup>
          <col style="width:40px">   <!-- NO -->
          <col style="width:74px">   <!-- \u8AB2\u30FB\u73ED -->
          <col style="width:160px">  <!-- \u6C0F\u540D+\u793E\u54E1\u756A\u53F7 -->
          <col style="width:60px">   <!-- \u533A\u5206 -->
          <col style="width:86px">   <!-- \u30B9\u30C6\u30FC\u30BF\u30B9 -->
          <col style="width:58px">   <!-- \u9762\u8AC7 -->
          <col style="width:52px">   <!-- \u914D\u5C5E\u65E5 -->
          <col style="width:108px">  <!-- \u64CD\u4F5C -->
        </colgroup>
        <thead class="bg-gray-50">
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink("seq_no", "seq_no", "NO")}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink("division", "division", "\u8AB2\u30FB\u73ED")}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink("name", "name", "\u6C0F\u540D")}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">\u533A\u5206</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">\u30B9\u30C6\u30FC\u30BF\u30B9</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">\u9762\u8AC7</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink("hire_date", "hire_date_desc", "\u914D\u5C5E\u65E5")}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">\u64CD\u4F5C</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">\u8A72\u5F53\u3059\u308B\u793E\u54E1\u304C\u3044\u307E\u305B\u3093</td></tr>'}</tbody>
      </table>
    </div>
    <script>
    async function toggleInterview(id, current) {
      const res = await fetch('/api/employees/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_target: current ? 0 : 1 })
      });
      if (res.ok) { location.reload(); }
      else { alert('\u5909\u66F4\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    async function cycleStatus(id, current) {
      const map = { training:'completed', completed:'unassigned', unassigned:'training' };
      const next = map[current] ?? 'completed';
      const res = await fetch('/api/employees/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      if (res.ok) { location.reload(); }
      else { alert('\u5909\u66F4\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    async function purge(id, name) {
      if (!confirm('\u3010\u5B8C\u5168\u524A\u9664\u3011' + name + ' \u3092\u5B8C\u5168\u306B\u524A\u9664\u3057\u307E\u3059\u3002\\n\u30B7\u30D5\u30C8\u30FB\u58F2\u4E0A\u30FB\u9762\u8AC7\u8A18\u9332\u306A\u3069\u5168\u30C7\u30FC\u30BF\u304C\u524A\u9664\u3055\u308C\u307E\u3059\u3002\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002\\n\\n\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      if (!confirm('\u6700\u7D42\u78BA\u8A8D\uFF1A' + name + ' \u306E\u3059\u3079\u3066\u306E\u30C7\u30FC\u30BF\u3092\u524A\u9664\u3057\u307E\u3059\u3002')) return;
      const res = await fetch('/api/employees/' + id + '/purge', { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    async function retire(id, name) {
      if (!confirm(name + ' \u3055\u3093\u3092\u9000\u8077\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F\\n\u30B7\u30D5\u30C8\u30FB\u58F2\u4E0A\u30C7\u30FC\u30BF\u306F\u4FDD\u6301\u3055\u308C\u307E\u3059\u3002')) return;
      const res = await fetch('/api/employees/' + id, { method: 'DELETE' });
      if (res.ok) {
        alert(name + ' \u3055\u3093\u3092\u9000\u8077\u51E6\u7406\u3057\u307E\u3057\u305F\u3002');
        location.reload();
      } else {
        alert('\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002');
      }
    }
    <\/script>
  `;
  return c.html(layout("\u793E\u54E1\u7BA1\u7406", content, "employees"));
});
app.get("/followup", async (c) => {
  const filterDiv = c.req.query("div") ?? "all";
  const divCond = filterDiv !== "all" ? ` AND e.division = ${parseInt(filterDiv)}` : "";
  const rows = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team, e.phone,
      e.status, e.hire_date,
      i.mental_status, i.mental_note, i.driving_skill, i.other_notes,
      (SELECT COUNT(*) FROM bad_events b WHERE b.emp_id = e.id) as event_count,
      (SELECT b2.category FROM bad_events b2 WHERE b2.emp_id = e.id ORDER BY b2.created_at DESC LIMIT 1) as last_event_cat,
      (SELECT b3.created_at FROM bad_events b3 WHERE b3.emp_id = e.id ORDER BY b3.created_at DESC LIMIT 1) as last_event_at
    FROM employees e
    LEFT JOIN new_employee_info i ON e.id = i.emp_id
    WHERE e.is_active = 1${divCond}
    ORDER BY
      CASE i.mental_status WHEN '\u5371\u967A' THEN 1 WHEN '\u8981\u30D5\u30A9\u30ED\u30FC' THEN 2 WHEN '\u6CE8\u610F' THEN 3 ELSE 4 END,
      e.division, e.seq_no
  `).all();
  const MENTAL_STYLE = {
    "\u5371\u967A": { bg: "#fecaca", color: "#991b1b" },
    "\u8981\u30D5\u30A9\u30ED\u30FC": { bg: "#fed7aa", color: "#9a3412" },
    "\u6CE8\u610F": { bg: "#fef08a", color: "#854d0e" },
    "\u5B89\u5B9A": { bg: "#bbf7d0", color: "#166534" }
  };
  const STATUS_STYLE = {
    training: { bg: "#dbeafe", color: "#1e40af", label: "\u7814\u4FEE\u4E2D" },
    completed: { bg: "#bbf7d0", color: "#166534", label: "\u7814\u4FEE\u7D42\u4E86" },
    unassigned: { bg: "#f3f4f6", color: "#6b7280", label: "\u672A\u914D\u5C5E" }
  };
  const cards = (rows.results ?? []).map((e) => {
    const ms = MENTAL_STYLE[e.mental_status] ?? { bg: "#f3f4f6", color: "#6b7280" };
    const ss = STATUS_STYLE[e.status ?? "training"] ?? STATUS_STYLE.training;
    const mentalBadge = e.mental_status ? `<span style="background:${ms.bg};color:${ms.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(e.mental_status)}</span>` : '<span style="color:#9ca3af;font-size:11px;">\u672A\u5165\u529B</span>';
    const statusBadge = `<span style="background:${ss.bg};color:${ss.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${ss.label}</span>`;
    const lastEvent = e.last_event_cat ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;">${escHtml(e.last_event_cat)}</span> <span style="font-size:11px;color:#9ca3af;">${escHtml((e.last_event_at ?? "").slice(0, 10))}</span>` : '<span style="font-size:11px;color:#9ca3af;">\u5831\u544A\u306A\u3057</span>';
    return `
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;border-left:4px solid ${ms.bg === "#fecaca" ? "#ef4444" : ms.bg === "#fed7aa" ? "#f97316" : ms.bg === "#fef08a" ? "#eab308" : "#22c55e"};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:bold;color:#1f2937;">${escHtml(e.name)}</div>
          <div style="font-size:12px;color:#6b7280;">${e.division ?? ""}\u8AB2 ${e.team ?? ""}\u73ED \uFF0F ${escHtml(e.emp_no)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">${statusBadge}${mentalBadge}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">
        <div><span style="color:#9ca3af;">\u{1F4DE} </span><a href="tel:${escHtml(e.phone ?? "")}" style="color:#2563eb;">${escHtml(e.phone ?? "\u2014")}</a></div>
        <div><span style="color:#9ca3af;">\u{1F4C5} \u914D\u5C5E </span>${escHtml(e.hire_date ?? "\u2014")}</div>
        <div><span style="color:#9ca3af;">\u{1F697} \u904B\u8EE2 </span>${escHtml(e.driving_skill ?? "\u2014")}</div>
        <div><span style="color:#9ca3af;">\u{1F4CB} \u5831\u544A </span>${e.event_count}\u4EF6 ${lastEvent}</div>
      </div>
      ${e.mental_note ? `<div style="background:#f9fafb;border-radius:6px;padding:8px;font-size:12px;color:#374151;margin-bottom:8px;"><span style="color:#9ca3af;">\u30E1\u30F3\u30BF\u30EB\u30E1\u30E2: </span>${escHtml(e.mental_note)}</div>` : ""}
      ${e.other_notes ? `<div style="background:#f9fafb;border-radius:6px;padding:8px;font-size:12px;color:#374151;margin-bottom:8px;"><span style="color:#9ca3af;">\u305D\u306E\u4ED6: </span>${escHtml(e.other_notes)}</div>` : ""}
      <div style="display:flex;gap:6px;">
        <a href="${ADMIN_PATH}/info/${e.id}" style="font-size:12px;padding:4px 10px;background:#f3f4f6;border-radius:6px;color:#374151;text-decoration:none;">Info\u7DE8\u96C6</a>
        <a href="${ADMIN_PATH}/events" style="font-size:12px;padding:4px 10px;background:#fee2e2;border-radius:6px;color:#991b1b;text-decoration:none;">\u5831\u544A\u5C65\u6B74(${e.event_count})</a>
      </div>
    </div>`;
  }).join("");
  const divBtns = [
    ["all", "\u5168\u8AB2"],
    ["1", "1\u8AB2"],
    ["2", "2\u8AB2"],
    ["3", "3\u8AB2"],
    ["4", "4\u8AB2"]
  ].map(
    ([val, label]) => `<a href="${ADMIN_PATH}/followup?div=${val}" class="text-xs px-3 py-1 rounded ${filterDiv === val ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}">${label}</a>`
  ).join("");
  const dangerCount = (rows.results ?? []).filter((e) => e.mental_status === "\u5371\u967A" || e.mental_status === "\u8981\u30D5\u30A9\u30ED\u30FC").length;
  const content = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-2 items-center">
        <div class="flex gap-1">${divBtns}</div>
        ${dangerCount > 0 ? `<span style="background:#fecaca;color:#991b1b;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">\u26A0\uFE0F \u8981\u6CE8\u610F ${dangerCount}\u540D</span>` : ""}
      </div>
      <span class="text-sm text-gray-500">${(rows.results ?? []).length}\u540D</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
      ${cards || '<div style="color:#9ca3af;padding:24px;">\u8A72\u5F53\u3059\u308B\u793E\u54E1\u304C\u3044\u307E\u305B\u3093</div>'}
    </div>
  `;
  return c.html(layout("\u30D5\u30A9\u30ED\u30FC\u30EA\u30B9\u30C8", content, "followup"));
});
app.get("/employees/:id/edit", async (c) => {
  const id = parseInt(c.req.param("id"));
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const S = "border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;width:100%;outline:none;background:white;";
  const DS = "border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;";
  const inp = /* @__PURE__ */ __name((name, val, type = "text", placeholder = "") => `<input type="${type}" name="${name}" value="${escHtml(String(val ?? ""))}" placeholder="${escHtml(placeholder)}" style="${S}" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">`, "inp");
  const sel = /* @__PURE__ */ __name((name, opts, val) => `<select name="${name}" style="${S}" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
      ${opts.map(([v, l]) => `<option value="${v}"${String(val) === v ? " selected" : ""}>${escHtml(l)}</option>`).join("")}
    </select>`, "sel");
  const dateRow = /* @__PURE__ */ __name((name, val) => `<div style="display:flex;gap:6px;align-items:center;">
      <input type="date" name="${name}" value="${escHtml(val ?? "")}" style="${DS}flex:1;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
      <button type="button" onclick="clearField('${name}')" style="padding:10px 10px;background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:pointer;flex-shrink:0;">\u2715</button>
    </div>`, "dateRow");
  const lbl = /* @__PURE__ */ __name((text2, required = false) => `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:5px;letter-spacing:0.03em;">${escHtml(text2)}${required ? ' <span style="color:#ef4444;">*</span>' : ""}</div>`, "lbl");
  const sec = /* @__PURE__ */ __name((title) => `<div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase;padding-bottom:6px;border-bottom:1px solid #f3f4f6;margin-bottom:12px;margin-top:20px;">${title}</div>`, "sec");
  const ENTRY_COLORS = { "\u65B0\u5352": "#dbeafe", "\u30AD\u30E3\u30EA\u30A2": "#bbf7d0", "\u7E01\u6545": "#fef9c3" };
  const entryColor = ENTRY_COLORS[emp.entry_type ?? ""] ?? "#f3f4f6";
  const content = `
    <div style="max-width:600px;">
      <a href="${ADMIN_PATH}/employees" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#6b7280;text-decoration:none;margin-bottom:14px;" onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#6b7280'">
        \u2190 \u793E\u54E1\u4E00\u89A7\u306B\u623B\u308B
      </a>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:18px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#1d4ed8;flex-shrink:0;">
          ${escHtml((emp.name ?? "").charAt(0))}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:#111827;">${escHtml(emp.name)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">
            \u793E\u54E1\u756A\u53F7: ${escHtml(emp.emp_no)}
            <span style="margin:0 6px;color:#e5e7eb;">|</span>
            <span style="background:${entryColor};padding:1px 7px;border-radius:4px;font-size:11px;">${escHtml(emp.entry_type ?? "")}</span>
          </div>
        </div>
      </div>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px 22px;">
        <form id="edit-form">

          ${sec("\u57FA\u672C\u60C5\u5831")}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl("\u6C0F\u540D", true)}
              ${inp("name", emp.name, "text", "\u4F8B: \u677E\u4E95\u3000\u4EAE\u6597")}
            </div>
            <div>
              ${lbl("\u6C0F\u540D\uFF08\u30AB\u30CA\uFF09")}
              ${inp("name_kana", emp.name_kana, "text", "\u4F8B: \u30DE\u30C4\u30A4\u3000\u30EA\u30E7\u30A6\u30C8")}
            </div>
            <div>
              ${lbl("NO\uFF08\u9806\u756A\uFF09")}
              ${inp("seq_no", emp.seq_no, "number", "\u4F8B: 7")}
            </div>
            <div>
              ${lbl("\u5165\u793E\u533A\u5206")}
              ${sel("entry_type", [["\u65B0\u5352", "\u65B0\u5352"], ["\u30AD\u30E3\u30EA\u30A2", "\u30AD\u30E3\u30EA\u30A2"], ["\u7E01\u6545", "\u7E01\u6545"]], emp.entry_type)}
            </div>
          </div>

          ${sec("\u6240\u5C5E\u30FB\u914D\u5C5E")}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl("\u8AB2")}
              ${sel("division", [["", "\u9078\u629E..."], ["1", "1\u8AB2"], ["2", "2\u8AB2"], ["3", "3\u8AB2"], ["4", "4\u8AB2"]], emp.division)}
            </div>
            <div>
              ${lbl("\u73ED")}
              ${sel("team", [["", "\u9078\u629E..."], ["1", "1\u73ED"], ["2", "2\u73ED"], ["3", "3\u73ED"], ["4", "4\u73ED"], ["5", "5\u73ED"], ["6", "6\u73ED"], ["7", "7\u73ED"], ["8", "8\u73ED"]], emp.team ?? "")}
            </div>
            <div style="grid-column:1/-1;">
              ${lbl("\u914D\u5C5E\u65E5")}
              ${dateRow("hire_date", emp.hire_date)}
            </div>
            <div style="grid-column:1/-1;">
              ${lbl("\u521D\u4E57\u52D9\u65E5")}
              ${dateRow("first_duty_date", emp.first_duty_date)}
            </div>
          </div>

          ${sec("\u500B\u4EBA\u60C5\u5831")}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl("\u751F\u5E74\u6708\u65E5")}
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="date" name="birth_date" id="birth_date" value="${escHtml(emp.birth_date ?? "")}"
                  style="${DS}flex:1;" oninput="updateAge()" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
                <button type="button" onclick="clearField('birth_date')" style="padding:10px 10px;background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:pointer;flex-shrink:0;">\u2715</button>
              </div>
            </div>
            <div>
              ${lbl("\u5E74\u9F62")}
              <div id="age-display" style="padding:11px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;min-height:46px;display:flex;align-items:center;">
                ${emp.birth_date ? (() => {
    const today = /* @__PURE__ */ new Date();
    const birth = new Date(emp.birth_date);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || m === 0 && today.getDate() < birth.getDate())
      age--;
    return age >= 0 ? `<span style="font-size:22px;font-weight:700;color:#1d4ed8;">${age}</span><span style="margin-left:4px;color:#6b7280;">\u6B73</span>` : "\u2014";
  })() : '<span style="color:#d1d5db;">\u672A\u8A2D\u5B9A</span>'}
              </div>
            </div>
            <div>
              ${lbl("\u5E74\u9F62")}
              <div id="age-display" style="padding:9px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;min-height:38px;display:flex;align-items:center;">
                ${emp.birth_date ? (() => {
    const today = /* @__PURE__ */ new Date();
    const birth = new Date(emp.birth_date);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || m === 0 && today.getDate() < birth.getDate())
      age--;
    return age >= 0 ? `<span style="font-size:20px;font-weight:700;color:#1d4ed8;">${age}</span><span style="margin-left:4px;color:#6b7280;">\u6B73</span>` : "\u2014";
  })() : '<span style="color:#d1d5db;">\u672A\u8A2D\u5B9A</span>'}
              </div>
            </div>
            <div>
              ${lbl("\u96FB\u8A71\u756A\u53F7")}
              ${inp("phone", emp.phone, "tel", "\u4F8B: 090-1234-5678")}
            </div>
            <div>
              ${lbl("\u30ED\u30C3\u30AB\u30FC\u756A\u53F7")}
              ${inp("locker_no", emp.locker_no, "text", "\u4F8B: 306")}
            </div>
          </div>

          <div id="form-error" style="color:#dc2626;font-size:13px;margin-top:12px;display:none;"></div>

          <div style="display:flex;gap:10px;margin-top:22px;padding-top:18px;border-top:1px solid #f3f4f6;">
            <button type="submit" id="save-btn"
              style="background:#2563eb;color:white;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:600;border:none;cursor:pointer;transition:background 0.15s;"
              onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
              \u4FDD\u5B58\u3059\u308B
            </button>
            <a href="${ADMIN_PATH}/employees"
              style="padding:10px 20px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#6b7280;text-decoration:none;display:inline-flex;align-items:center;"
              onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
              \u30AD\u30E3\u30F3\u30BB\u30EB
            </a>
          </div>
        </form>
      </div>
    </div>
    <script>
      function setToday(name) {
        const d = new Date();
        document.querySelector('[name="'+name+'"]').value =
          d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        if (name === 'birth_date') updateAge();
      }
      function clearField(name) {
        document.querySelector('[name="'+name+'"]').value = '';
        if (name === 'birth_date') updateAge();
      }
      function updateAge() {
        const val = document.getElementById('birth_date').value;
        const el = document.getElementById('age-display');
        if (!val) { el.innerHTML = '<span style="color:#d1d5db;">\u672A\u8A2D\u5B9A</span>'; return; }
        const today = new Date(), birth = new Date(val);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        el.innerHTML = age >= 0
          ? '<span style="font-size:22px;font-weight:700;color:#1d4ed8;">'+age+'</span><span style="margin-left:4px;color:#6b7280;">\u6B73</span>'
          : '<span style="color:#d1d5db;">\u672A\u8A2D\u5B9A</span>';
      }
    <\/script>
    <script>
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('save-btn');
      btn.disabled = true;
      btn.textContent = '\u4FDD\u5B58\u4E2D...';
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.division    = data.division    ? parseInt(data.division)    : null;
      data.team        = data.team        ? parseInt(data.team)        : null;
      data.seq_no      = data.seq_no      ? parseInt(data.seq_no)      : null;
      data.hire_date   = data.hire_date   || null;
      data.first_duty_date = data.first_duty_date || null;
      data.birth_date  = data.birth_date  || null;
      const res = await fetch('/api/employees/${id}', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        window.location.href = '${ADMIN_PATH}/employees';
      } else {
        const err = document.getElementById('form-error');
        err.textContent = '\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '\u4FDD\u5B58\u3059\u308B';
      }
    });
    <\/script>
  `;
  return c.html(layout(`${emp.name} \u2014 \u7DE8\u96C6`, content, "employees"));
});
app.get("/employees/add", async (c) => {
  const content = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
      <h3 class="font-semibold text-gray-700 mb-4">\u65B0\u4EBA\u3092\u767B\u9332\u3059\u308B</h3>
      <form id="emp-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u793E\u54E1\u756A\u53F7 <span class="text-red-500">*</span></label>
            <input type="text" name="emp_no" required placeholder="\u4F8B: 20241001"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">NO\uFF08\u9806\u756A\uFF09</label>
            <input type="number" name="seq_no" placeholder="\u4F8B: 7"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u6C0F\u540D <span class="text-red-500">*</span></label>
            <input type="text" name="name" required placeholder="\u4F8B: \u5C71\u7530\u3000\u592A\u90CE"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u6C0F\u540D\uFF08\u30AB\u30CA\uFF09</label>
            <input type="text" name="name_kana" placeholder="\u4F8B: \u30E4\u30DE\u30C0\u3000\u30BF\u30ED\u30A6"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u8AB2 <span class="text-red-500">*</span></label>
            <select name="division" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">\u9078\u629E...</option>
              <option value="1">1\u8AB2</option>
              <option value="2">2\u8AB2</option>
              <option value="3">3\u8AB2</option>
              <option value="4">4\u8AB2</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u73ED</label>
            <select name="team" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">\u9078\u629E...</option>
              <option value="1">1\u73ED</option><option value="2">2\u73ED</option><option value="3">3\u73ED</option><option value="4">4\u73ED</option>
              <option value="5">5\u73ED</option><option value="6">6\u73ED</option><option value="7">7\u73ED</option><option value="8">8\u73ED</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u96FB\u8A71\u756A\u53F7</label>
            <input type="tel" name="phone" placeholder="\u4F8B: 090-1234-5678"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u30ED\u30C3\u30AB\u30FC\u756A\u53F7</label>
            <input type="text" name="locker_no" placeholder="\u4F8B: 306"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u5165\u793E\u533A\u5206</label>
            <select name="entry_type" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="\u65B0\u5352">\u65B0\u5352</option>
              <option value="\u30AD\u30E3\u30EA\u30A2">\u30AD\u30E3\u30EA\u30A2</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u914D\u5C5E\u65E5</label>
            <input type="date" name="hire_date" style="border:1px solid #d1d5db;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#d1d5db'">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u751F\u5E74\u6708\u65E5</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input type="date" name="birth_date" id="add_birth_date" style="border:1px solid #d1d5db;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;" oninput="updateAddAge()" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#d1d5db'">
              <span id="add_age_display" style="white-space:nowrap;font-size:13px;font-weight:600;color:#1d4ed8;min-width:36px;"></span>
            </div>
          </div>
        </div>
        <div id="form-error" class="text-red-600 text-sm hidden"></div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">\u767B\u9332\u3059\u308B</button>
          <a href="${ADMIN_PATH}/shift" class="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">\u30B7\u30D5\u30C8\u7BA1\u7406\u3078\u623B\u308B</a>
        </div>
      </form>
    </div>
    <script>
    function updateAddAge() {
      const val = document.getElementById('add_birth_date').value;
      const el = document.getElementById('add_age_display');
      if (!val) { el.textContent = ''; return; }
      const today = new Date(), birth = new Date(val);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      el.textContent = age >= 0 ? age+'\u6B73' : '';
    }
    document.getElementById('emp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.division = data.division ? parseInt(data.division) : null;
      data.team = data.team ? parseInt(data.team) : null;
      data.seq_no = data.seq_no ? parseInt(data.seq_no) : null;
      if (!data.hire_date) data.hire_date = null;
      if (!data.birth_date) data.birth_date = null;

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      let json = {};
      try { json = await res.json(); } catch(_) {}
      if (res.ok) {
        alert('\u767B\u9332\u3057\u307E\u3057\u305F\uFF01');
        window.location.href = '${ADMIN_PATH}/employees';
      } else {
        document.getElementById('form-error').textContent = json.error ?? '\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08' + res.status + '\uFF09';
        document.getElementById('form-error').classList.remove('hidden');
      }
    });
    <\/script>
  `;
  return c.html(layout("\u65B0\u4EBA\u767B\u9332", content, "employees"));
});
app.get("/info", async (c) => {
  const employees = await c.env.DB.prepare(`
    SELECT e.*, i.hobbies, i.favorite_food, i.alcohol, i.alcohol_note,
      i.driving_skill, i.driving_note, i.mental_status, i.mental_note, i.other_notes,
      i.updated_at as info_updated_at
    FROM employees e
    LEFT JOIN new_employee_info i ON e.id = i.emp_id
    WHERE e.is_active = 1 AND e.entry_type = '\u65B0\u5352'
    ORDER BY e.seq_no, e.id
  `).all();
  const MENTAL_COLORS = {
    "\u5B89\u5B9A": "#bbf7d0",
    "\u6CE8\u610F": "#fef08a",
    "\u8981\u30D5\u30A9\u30ED\u30FC": "#fed7aa",
    "\u5371\u967A": "#fecaca"
  };
  const SKILL_COLORS = {
    "A": "#bbf7d0",
    "B": "#dbeafe",
    "C": "#fef9c3",
    "D": "#fed7aa",
    "E": "#fecaca"
  };
  const rows = (employees.results ?? []).map((e) => `
    <tr class="hover:bg-gray-50" onclick="window.location='${ADMIN_PATH}/info/${e.id}'" style="cursor:pointer;">
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${e.division ?? ""}-${e.team ?? ""}</td>
      <td class="px-3 py-2 text-sm font-medium text-gray-800 border-b">
        ${escHtml(e.name)}
        <div class="text-xs text-gray-400">${escHtml(e.emp_no)}</div>
      </td>
      <td class="px-3 py-2 text-xs text-gray-600 border-b">${escHtml(e.phone ?? "")}</td>
      <td class="px-3 py-2 text-xs border-b">
        ${e.driving_skill ? `<span style="background:${SKILL_COLORS[e.driving_skill] ?? "#f3f4f6"};padding:2px 8px;border-radius:4px;font-weight:bold;">${escHtml(e.driving_skill)}</span>` : '<span class="text-gray-300">\u672A\u5165\u529B</span>'}
      </td>
      <td class="px-3 py-2 text-xs border-b">
        ${e.mental_status ? `<span style="background:${MENTAL_COLORS[e.mental_status] ?? "#f3f4f6"};padding:2px 8px;border-radius:4px;">${escHtml(e.mental_status)}</span>` : '<span class="text-gray-300">\u672A\u5165\u529B</span>'}
      </td>
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${e.hobbies ? escHtml(e.hobbies.slice(0, 20)) : ""}</td>
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${e.info_updated_at ? escHtml(e.info_updated_at.slice(0, 10)) : "\u2014"}</td>
    </tr>
  `).join("");
  const content = `
    <div class="flex justify-between items-center mb-4">
      <div class="text-sm text-gray-500">${(employees.results ?? []).length}\u540D</div>
      <a href="${ADMIN_PATH}/info/export" class="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">CSV\u51FA\u529B</a>
    </div>
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u8AB2-\u73ED</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u6C0F\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u96FB\u8A71\u756A\u53F7</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u904B\u8EE2\u6280\u8853</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u30E1\u30F3\u30BF\u30EB</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u8DA3\u5473</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">\u66F4\u65B0\u65E5</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return c.html(layout("\u65B0\u5352Info", content, "info"));
});
app.get("/info/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const emp = await c.env.DB.prepare(`
    SELECT e.*, i.hobbies, i.favorite_food, i.alcohol, i.alcohol_note,
      i.driving_skill, i.driving_note, i.mental_status, i.mental_note, i.other_notes
    FROM employees e LEFT JOIN new_employee_info i ON e.id = i.emp_id WHERE e.id = ?
  `).bind(id).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const sel = /* @__PURE__ */ __name((name, options, val) => `<select name="${name}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
      <option value="">\u9078\u629E...</option>
      ${options.map((o) => `<option value="${o}"${val === o ? " selected" : ""}>${escHtml(o)}</option>`).join("")}
    </select>`, "sel");
  const txt = /* @__PURE__ */ __name((name, val, placeholder = "") => `<input type="text" name="${name}" value="${escHtml(val ?? "")}" placeholder="${escHtml(placeholder)}"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">`, "txt");
  const ta = /* @__PURE__ */ __name((name, val, placeholder = "") => `<textarea name="${name}" placeholder="${escHtml(placeholder)}" rows="3"
      class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">${escHtml(val ?? "")}</textarea>`, "ta");
  const content = `
    <div class="max-w-2xl">
      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-6 pb-4 border-b">
          <div>
            <h2 class="text-lg font-bold text-gray-800">${escHtml(emp.name)}</h2>
            <div class="text-sm text-gray-500">\u793E\u54E1\u756A\u53F7: ${escHtml(emp.emp_no)} \uFF0F ${emp.division ?? ""}\u8AB2 ${emp.team ?? ""}\u73ED</div>
          </div>
        </div>
        <form id="info-form" class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">\u8DA3\u5473</label>
              ${txt("hobbies", emp.hobbies, "\u4F8B: \u91E3\u308A\u3001\u30B2\u30FC\u30E0")}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">\u597D\u304D\u306A\u98DF\u3079\u7269</label>
              ${txt("favorite_food", emp.favorite_food, "\u4F8B: \u30E9\u30FC\u30E1\u30F3\u3001\u5BFF\u53F8")}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">\u304A\u9152</label>
              ${sel("alcohol", ["\u98F2\u3080", "\u98F2\u307E\u306A\u3044", "\u6A5F\u4F1A\u304C\u3042\u308C\u3070"], emp.alcohol)}
              <input type="text" name="alcohol_note" value="${escHtml(emp.alcohol_note ?? "")}" placeholder="\u30B3\u30E1\u30F3\u30C8"
                class="w-full border border-gray-200 rounded-lg px-3 py-1 text-sm mt-1">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">\u904B\u8EE2\u6280\u8853</label>
              ${sel("driving_skill", ["A", "B", "C", "D", "E"], emp.driving_skill)}
              <div class="text-xs text-gray-400 mt-1">A=\u512A\u79C0 B=\u826F\u597D C=\u666E\u901A D=\u8981\u6CE8\u610F E=\u8981\u6307\u5C0E</div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u904B\u8EE2\u6280\u8853\u30EC\u30DD\u30FC\u30C8</label>
            ${ta("driving_note", emp.driving_note, "\u8A73\u7D30\u306A\u30E1\u30E2...")}
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u30E1\u30F3\u30BF\u30EB\u9762</label>
            ${sel("mental_status", ["\u5B89\u5B9A", "\u6CE8\u610F", "\u8981\u30D5\u30A9\u30ED\u30FC", "\u5371\u967A"], emp.mental_status)}
            <div class="mt-2">${ta("mental_note", emp.mental_note, "\u30E1\u30F3\u30BF\u30EB\u9762\u306E\u8A73\u7D30\u30E1\u30E2...")}</div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">\u305D\u306E\u4ED6</label>
            ${ta("other_notes", emp.other_notes, "\u305D\u306E\u4ED6\u306E\u60C5\u5831...")}
          </div>
          <div class="flex gap-3 pt-2">
            <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">\u4FDD\u5B58</button>
            <a href="${ADMIN_PATH}/info" class="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">\u4E00\u89A7\u306B\u623B\u308B</a>
          </div>
        </form>
      </div>
    </div>
    <script>
    document.getElementById('info-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      const res = await fetch('/api/info/${id}', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) { alert('\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF01'); }
      else { alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    });
    <\/script>
  `;
  return c.html(layout(`${emp.name} \u2014 \u65B0\u5352Info`, content, "info"));
});
app.get("/info/export", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT e.division, e.team, e.emp_no, e.name, e.phone, e.entry_type,
      i.hobbies, i.favorite_food, i.alcohol, i.alcohol_note,
      i.driving_skill, i.driving_note, i.mental_status, i.mental_note, i.other_notes,
      i.updated_at
    FROM employees e
    LEFT JOIN new_employee_info i ON e.id = i.emp_id
    WHERE e.is_active = 1 AND e.entry_type = '\u65B0\u5352'
    ORDER BY e.division, e.team, e.seq_no
  `).all();
  const header = ["\u8AB2", "\u73ED", "\u793E\u54E1\u756A\u53F7", "\u6C0F\u540D", "\u96FB\u8A71\u756A\u53F7", "\u5165\u793E\u533A\u5206", "\u8DA3\u5473", "\u597D\u304D\u306A\u98DF\u3079\u7269", "\u304A\u9152", "\u304A\u9152\u30B3\u30E1\u30F3\u30C8", "\u904B\u8EE2\u6280\u8853", "\u904B\u8EE2\u6280\u8853\u30B3\u30E1\u30F3\u30C8", "\u30E1\u30F3\u30BF\u30EB", "\u30E1\u30F3\u30BF\u30EB\u30B3\u30E1\u30F3\u30C8", "\u305D\u306E\u4ED6", "\u66F4\u65B0\u65E5\u6642"];
  const body = (rows.results ?? []).map(
    (r) => [
      r.division ?? "",
      r.team ?? "",
      r.emp_no,
      `"${(r.name ?? "").replace(/"/g, '""')}"`,
      r.phone ?? "",
      r.entry_type ?? "",
      r.hobbies ?? "",
      r.favorite_food ?? "",
      r.alcohol ?? "",
      r.alcohol_note ?? "",
      r.driving_skill ?? "",
      r.driving_note ?? "",
      r.mental_status ?? "",
      r.mental_note ?? "",
      r.other_notes ?? "",
      r.updated_at ?? ""
    ].join(",")
  ).join("\n");
  const csv = `\uFEFF${header.join(",")}
${body}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="new_employee_info.csv"'
    }
  });
});
var admin_default = app;

// src/routes/admin_extra.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// src/html/sales.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var fmt = /* @__PURE__ */ __name((n) => n != null ? n.toLocaleString("ja-JP") : "\u2014", "fmt");
function salesPage(summary, year, month, periodStart, periodEnd) {
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear--;
  }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const periodLabel = `${year}\u5E74${month}\u6708\u5EA6\uFF08${periodStart}\u301C${periodEnd}\uFF09`;
  const totalSales = summary.reduce((s, e) => s + (e.total_amount ?? 0), 0);
  const totalRides = summary.reduce((s, e) => s + (e.total_rides ?? 0), 0);
  const rows = summary.map((e) => {
    const avg = e.avg_amount ? Math.round(e.avg_amount).toLocaleString("ja-JP") : "\u2014";
    return `
      <tr class="hover:bg-gray-50" onclick="window.location='${ADMIN_PATH}/sales/detail?emp_id=${e.id}&year=${year}&month=${month}'" style="cursor:pointer;">
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${e.division ?? ""}\u8AB2</td>
        <td class="px-3 py-2 text-sm font-medium text-gray-800 border-b">${escHtml(e.name)}</td>
        <td class="px-3 py-2 text-sm text-gray-500 border-b">${e.working_days ?? 0}\u65E5</td>
        <td class="px-3 py-2 text-sm font-bold border-b" style="color:#2563eb;">${fmt(e.total_amount)}\u5186</td>
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${fmt(e.total_rides)}\u56DE</td>
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${fmt(e.total_distance)}km</td>
        <td class="px-3 py-2 text-sm text-gray-500 border-b">${avg}\u5186</td>
      </tr>`;
  }).join("");
  const chartLabels = safeJson(summary.map((e) => e.name));
  const chartAmounts = safeJson(summary.map((e) => e.total_amount ?? 0));
  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <!-- \u30CA\u30D3 -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/sales?year=${prevYear}&month=${prevMonth}" class="btn-nav">\u25C0 \u524D\u6708\u5EA6</a>
    <h2 style="font-size:16px;font-weight:bold;color:#1e3a5f;">${escHtml(periodLabel)}</h2>
    <a href="${ADMIN_PATH}/sales?year=${nextYear}&month=${nextMonth}" class="btn-nav">\u6B21\u6708\u5EA6 \u25B6</a>
    <div style="margin-left:auto;">
      <a href="/api/sales/csv?year=${year}&month=${month}" class="btn-secondary">CSV\u51FA\u529B</a>
    </div>
  </div>

  <!-- \u5408\u8A08\u30AB\u30FC\u30C9 -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#2563eb;">${totalSales.toLocaleString("ja-JP")}\u5186</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">\u6708\u5EA6\u5408\u8A08\u58F2\u4E0A</div>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#059669;">${totalRides.toLocaleString("ja-JP")}\u56DE</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">\u6708\u5EA6\u5408\u8A08\u4E57\u8ECA\u56DE\u6570</div>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#7c3aed;">${summary.filter((e) => e.total_amount).length}\u540D</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">\u8A18\u9332\u3042\u308A\u4E57\u52D9\u54E1\u6570</div>
    </div>
  </div>

  <!-- \u30B0\u30E9\u30D5 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:20px;">
    <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">\u6708\u5EA6\u58F2\u4E0A\u6BD4\u8F03</h3>
    <canvas id="sales-chart" height="80"></canvas>
  </div>

  <!-- \u4E00\u89A7\u8868 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#f9fafb;">
        <tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u8AB2</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u51FA\u52E4\u65E5\u6570</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6708\u8A08\u58F2\u4E0A</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u4E57\u8ECA\u56DE\u6570</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u8D70\u884C\u8DDD\u96E2</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u65E5\u5E73\u5747\u58F2\u4E0A</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot style="background:#f0f4ff;">
        <tr>
          <td colspan="3" style="padding:8px 12px;font-size:13px;font-weight:600;border-top:2px solid #d1d5db;">\u5408\u8A08</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#2563eb;border-top:2px solid #d1d5db;">${totalSales.toLocaleString("ja-JP")}\u5186</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;border-top:2px solid #d1d5db;">${totalRides.toLocaleString("ja-JP")}\u56DE</td>
          <td colspan="2" style="border-top:2px solid #d1d5db;"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"><\/script>
<script>
const ctx = document.getElementById('sales-chart').getContext('2d');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ${chartLabels},
    datasets: [{
      label: '\u6708\u5EA6\u58F2\u4E0A\uFF08\u5186\uFF09',
      data: ${chartAmounts},
      backgroundColor: 'rgba(37, 99, 235, 0.7)',
      borderColor: 'rgba(37, 99, 235, 1)',
      borderWidth: 1,
      borderRadius: 4,
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('ja-JP') + '\u5186' } }
    }
  }
});
<\/script>`;
}
__name(salesPage, "salesPage");
function salesDetailPage(emp, records, year, month) {
  const byDate = {};
  for (const r of records)
    byDate[r.date] = r;
  const dates = [];
  const cur = /* @__PURE__ */ new Date(`${year}-${String(month).padStart(2, "0")}-01`);
  let sm = month - 1, sy = year;
  if (sm < 1) {
    sm = 12;
    sy--;
  }
  const start = /* @__PURE__ */ new Date(`${sy}-${String(sm).padStart(2, "0")}-18`);
  const end = /* @__PURE__ */ new Date(`${year}-${String(month).padStart(2, "0")}-17`);
  const c2 = new Date(start);
  while (c2 <= end) {
    dates.push(c2.toISOString().split("T")[0]);
    c2.setDate(c2.getDate() + 1);
  }
  const WEEKDAY = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  const chartDates = JSON.stringify(dates.map((d) => {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  }));
  const chartValues = JSON.stringify(dates.map((d) => byDate[d]?.amount ?? 0));
  const rows = dates.map((d) => {
    const dt = new Date(d);
    const dow = dt.getUTCDay();
    const r = byDate[d];
    const isWeekend = dow === 0 || dow === 6;
    const dayColor = dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : "#374151";
    const rowId = `row-${d}`;
    const amtVal = r?.amount ?? "";
    const rideVal = r?.ride_count ?? "";
    const distVal = r?.distance_km ?? "";
    return `
      <tr id="${rowId}" style="background:${isWeekend ? "#fef2f2" : "white"};">
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:${dayColor};font-size:13px;white-space:nowrap;">${d.slice(5)} (${WEEKDAY[dow]})</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-amt-${d}">
          ${r ? `<span style="color:#2563eb;font-weight:600;">${r.amount.toLocaleString("ja-JP")}\u5186</span>` : '<span style="color:#d1d5db;">\u2014</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-ride-${d}">
          ${r?.ride_count != null ? r.ride_count + "\u56DE" : '<span style="color:#d1d5db;">\u2014</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-dist-${d}">
          ${r?.distance_km != null ? r.distance_km + "km" : '<span style="color:#d1d5db;">\u2014</span>'}
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;" id="btn-cell-${d}">
          <button onclick="openEdit('${d}',${amtVal || 0},${rideVal || 0},${distVal || 0})"
            style="padding:3px 10px;font-size:11px;background:${r ? "#dbeafe" : "#f0fdf4"};color:${r ? "#1d4ed8" : "#166534"};border:1px solid ${r ? "#bfdbfe" : "#bbf7d0"};border-radius:4px;cursor:pointer;">
            ${r ? "\u7DE8\u96C6" : "\u8FFD\u52A0"}
          </button>
          ${r ? `<button onclick="deleteRecord('${d}')"
            style="margin-left:4px;padding:3px 8px;font-size:11px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;cursor:pointer;">\u524A\u9664</button>` : ""}
        </td>
      </tr>
      <!-- \u30A4\u30F3\u30E9\u30A4\u30F3\u7DE8\u96C6\u884C\uFF08\u96A0\u3057\uFF09 -->
      <tr id="edit-${d}" style="display:none;background:#f0f9ff;">
        <td style="padding:6px 12px;border-bottom:1px solid #bfdbfe;color:${dayColor};font-size:13px;font-weight:600;">${d.slice(5)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-amt-${d}" type="number" value="${amtVal}" placeholder="\u58F2\u4E0A\uFF08\u5186\uFF09" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-ride-${d}" type="number" value="${rideVal}" placeholder="\u4E57\u8ECA\u56DE\u6570" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-dist-${d}" type="number" value="${distVal}" placeholder="\u8DDD\u96E2(km)" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;white-space:nowrap;">
          <button onclick="saveRecord('${d}')"
            style="padding:4px 12px;font-size:11px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">\u4FDD\u5B58</button>
          <button onclick="cancelEdit('${d}')"
            style="margin-left:4px;padding:4px 8px;font-size:11px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">\u53D6\u6D88</button>
        </td>
      </tr>`;
  }).join("");
  const total = records.reduce((s, r) => s + r.amount, 0);
  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;max-width:640px;">
  <div style="margin-bottom:12px;">
    <a href="${ADMIN_PATH}/sales?year=${year}&month=${month}" style="color:#2563eb;font-size:13px;">\u2190 \u6708\u5EA6\u4E00\u89A7\u306B\u623B\u308B</a>
  </div>
  <h2 style="font-size:18px;font-weight:bold;color:#1e3a5f;margin-bottom:4px;">${escHtml(emp.name)} \u2014 ${year}\u5E74${month}\u6708\u5EA6</h2>
  <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">\u793E\u54E1\u756A\u53F7: ${escHtml(emp.emp_no)}</div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:16px;">
    <div id="total-sales" style="font-size:28px;font-weight:bold;color:#2563eb;text-align:center;">${total.toLocaleString("ja-JP")}\u5186</div>
    <div style="font-size:12px;color:#6b7280;text-align:center;margin-top:4px;">\u6708\u5EA6\u5408\u8A08\u58F2\u4E0A</div>
  </div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:16px;">
    <canvas id="daily-chart" height="100"></canvas>
  </div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#1e3a5f;color:white;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:12px;">\u65E5\u4ED8</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">\u58F2\u4E0A</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">\u4E57\u8ECA\u56DE\u6570</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">\u8D70\u884C\u8DDD\u96E2</th>
          <th style="padding:8px 12px;font-size:12px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"><\/script>
<script>
const empId = ${emp.id};
new Chart(document.getElementById('daily-chart').getContext('2d'), {
  type: 'line',
  data: {
    labels: ${chartDates},
    datasets: [{ label: '\u65E5\u5225\u58F2\u4E0A\uFF08\u5186\uFF09', data: ${chartValues}, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.1)', fill:true, tension:0.3, pointRadius:3 }]
  },
  options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{callback:v=>v.toLocaleString('ja-JP')}}}}
});

function openEdit(date, amt, ride, dist) {
  // \u4ED6\u306E\u7DE8\u96C6\u884C\u3092\u9589\u3058\u308B
  document.querySelectorAll('[id^="edit-"]').forEach(r => r.style.display='none');
  document.getElementById('edit-' + date).style.display = 'table-row';
  document.getElementById('in-amt-' + date).focus();
}
function cancelEdit(date) {
  document.getElementById('edit-' + date).style.display = 'none';
}
async function saveRecord(date) {
  const amt = parseInt(document.getElementById('in-amt-' + date).value) || 0;
  const ride = parseInt(document.getElementById('in-ride-' + date).value) || null;
  const dist = parseInt(document.getElementById('in-dist-' + date).value) || null;
  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id: empId, date, amount: amt, ride_count: ride, distance_km: dist })
  });
  if (res.ok) { location.reload(); }
  else { alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
}
async function deleteRecord(date) {
  if (!confirm(date + ' \u306E\u58F2\u4E0A\u8A18\u9332\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
  const res = await fetch('/api/sales/' + empId + '/' + date, { method: 'DELETE' });
  if (res.ok) { location.reload(); }
  else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
}
<\/script>`;
}
__name(salesDetailPage, "salesDetailPage");

// src/routes/admin_extra.ts
init_auth();
var app2 = new Hono2();
app2.get("/sales", async (c) => {
  const now = /* @__PURE__ */ new Date();
  const year = parseInt(c.req.query("year") ?? String(now.getFullYear()));
  const month = parseInt(c.req.query("month") ?? String(now.getMonth() + 1));
  const { start, end } = getPeriodRange(year, month);
  const summary = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team,
      SUM(s.amount) as total_amount,
      SUM(s.ride_count) as total_rides,
      SUM(s.distance_km) as total_distance,
      COUNT(s.date) as working_days,
      AVG(s.amount) as avg_amount
    FROM employees e
    LEFT JOIN sales_records s ON e.id = s.emp_id AND s.period_year = ? AND s.period_month = ?
    WHERE e.is_active = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).bind(year, month).all();
  const content = salesPage(summary.results ?? [], year, month, start, end);
  return c.html(layout(`\u58F2\u4E0A\u7BA1\u7406 \u2014 ${year}\u5E74${month}\u6708\u5EA6`, content, "sales"));
});
app2.get("/sales/detail", async (c) => {
  const empId = parseInt(c.req.query("emp_id") ?? "0");
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!empId || !year || !month)
    return c.text("\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3", 400);
  const { start, end } = getPeriodRange(year, month);
  const emp = await c.env.DB.prepare(
    "SELECT id, name, emp_no FROM employees WHERE id = ?"
  ).bind(empId).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const records = await c.env.DB.prepare(
    "SELECT emp_id, date, amount, ride_count, distance_km FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date"
  ).bind(empId, start, end).all();
  const content = salesDetailPage(emp, records.results ?? [], year, month);
  return c.html(layout(`${emp.name} \u58F2\u4E0A\u8A73\u7D30`, content, "sales"));
});
app2.get("/events", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1");
  const limit = 20;
  const offset = (page - 1) * limit;
  const events = await c.env.DB.prepare(`
    SELECT b.id, b.category, b.content, b.feeling, b.admin_memo, b.created_at,
      e.name, e.emp_no, e.division
    FROM bad_events b
    JOIN employees e ON b.emp_id = e.id
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  const totalRow = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM bad_events").first();
  const total = totalRow?.cnt ?? 0;
  const totalPages = Math.ceil(total / limit);
  const CAT_COLORS = {
    "\u30AF\u30EC\u30FC\u30DE\u30FC": "#fecaca",
    "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB": "#fed7aa",
    "\u793E\u5185\u306E\u51FA\u6765\u4E8B": "#e9d5ff",
    "\u305D\u306E\u4ED6": "#e5e7eb"
  };
  const rows = (events.results ?? []).map((e) => `
    <tr class="hover:bg-gray-50">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        <span style="background:${CAT_COLORS[e.category] ?? "#e5e7eb"};padding:2px 8px;border-radius:4px;font-size:12px;">${escHtml(e.category)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">${escHtml(e.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;max-width:300px;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(e.content)}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">${e.created_at.slice(0, 10)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        ${e.admin_memo ? '<span style="background:#bbf7d0;padding:2px 6px;border-radius:4px;font-size:11px;">\u5BFE\u5FDC\u6E08</span>' : '<span style="background:#fee2e2;padding:2px 6px;border-radius:4px;font-size:11px;">\u672A\u5BFE\u5FDC</span>'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="deleteEvent(${e.id})" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">\u524A\u9664</button>
      </td>
    </tr>`).join("");
  const pagination = totalPages > 1 ? `
    <div style="display:flex;gap:4px;margin-top:12px;">
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(
    (p) => `<a href="${ADMIN_PATH}/events?page=${p}" style="padding:4px 10px;border-radius:4px;font-size:13px;${p === page ? "background:#2563eb;color:white;" : "background:#e5e7eb;color:#374151;"}text-decoration:none;">${p}</a>`
  ).join("")}
    </div>` : "";
  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:14px;color:#6b7280;">\u5168 ${total} \u4EF6</div>
      <a href="${ADMIN_PATH}/events/export" style="padding:6px 14px;background:#6b7280;color:white;border-radius:6px;font-size:13px;text-decoration:none;">CSV\u51FA\u529B</a>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u30AB\u30C6\u30B4\u30EA</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u6C0F\u540D</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u5185\u5BB9</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u65E5\u4ED8</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u72B6\u614B</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">\u5831\u544A\u306F\u3042\u308A\u307E\u305B\u3093</td></tr>'}</tbody>
      </table>
    </div>
    ${pagination}
    <script>
    async function deleteEvent(id) {
      if (!confirm('\u3053\u306E\u5831\u544A\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
      const res = await fetch('/api/events/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    <\/script>
  `;
  return c.html(layout("\u5ACC\u306A\u3053\u3068\u5831\u544A\u4E00\u89A7", content, "events"));
});
app2.get("/events/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const event = await c.env.DB.prepare(`
    SELECT b.*, e.name, e.emp_no, e.division, e.team
    FROM bad_events b JOIN employees e ON b.emp_id = e.id WHERE b.id = ?
  `).bind(id).first();
  if (!event)
    return c.text("\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const CAT_COLORS = {
    "\u30AF\u30EC\u30FC\u30DE\u30FC": "#fecaca",
    "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB": "#fed7aa",
    "\u793E\u5185\u306E\u51FA\u6765\u4E8B": "#e9d5ff",
    "\u305D\u306E\u4ED6": "#e5e7eb"
  };
  const content = `
    <div style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <a href="${ADMIN_PATH}/events" style="color:#2563eb;font-size:13px;">\u2190 \u4E00\u89A7\u306B\u623B\u308B</a>
        <button onclick="deleteEvent(${id})" style="padding:4px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">\u{1F5D1}\uFE0F \u3053\u306E\u5831\u544A\u3092\u524A\u9664</button>
      </div>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:24px;margin-top:12px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f3f4f6;">
          <span style="background:${CAT_COLORS[event.category] ?? "#e5e7eb"};padding:4px 12px;border-radius:6px;font-size:13px;">${escHtml(event.category)}</span>
          <div>
            <div style="font-size:16px;font-weight:bold;">${escHtml(event.name)}</div>
            <div style="font-size:12px;color:#6b7280;">${event.division ?? ""}\u8AB2 ${event.team ?? ""}\u73ED \uFF0F ${event.created_at.slice(0, 16)}</div>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">\u{1F4DD} \u7D4C\u7DEF\u30FB\u51FA\u6765\u4E8B</div>
          <div style="background:#f9fafb;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${escHtml(event.content)}</div>
        </div>
        ${event.feeling ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">\u{1F4AD} \u6C17\u6301\u3061\u30FB\u611F\u60F3</div>
          <div style="background:#fffbeb;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${escHtml(event.feeling)}</div>
        </div>` : ""}
        <div>
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">\u{1F4CC} \u7BA1\u7406\u8005\u30E1\u30E2\uFF08\u9762\u8AC7\u8A18\u9332\u7B49\uFF09</div>
          <textarea id="admin-memo" rows="4" placeholder="\u9762\u8AC7\u8A18\u9332\u30FB\u5BFE\u5FDC\u5185\u5BB9\u7B49\u3092\u8A18\u9332..."
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;line-height:1.6;">${escHtml(event.admin_memo ?? "")}</textarea>
          <button onclick="saveMemo()" style="margin-top:8px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\u30E1\u30E2\u3092\u4FDD\u5B58</button>
        </div>
      </div>
    </div>
    <script>
    async function saveMemo() {
      const memo = document.getElementById('admin-memo').value;
      const res = await fetch('/api/events/${id}/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo })
      });
      if (res.ok) alert('\u4FDD\u5B58\u3057\u307E\u3057\u305F');
      else alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
    async function deleteEvent(id) {
      if (!confirm('\u3053\u306E\u5831\u544A\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
      const res = await fetch('/api/events/' + id, { method: 'DELETE' });
      if (res.ok) { window.location.href = '${ADMIN_PATH}/events'; }
      else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    <\/script>
  `;
  return c.html(layout(`\u5831\u544A\u8A73\u7D30 \u2014 ${event.name}`, content, "events"));
});
app2.get("/events/export", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT b.id, b.category, b.content, b.feeling, b.admin_memo, b.created_at,
      e.name, e.emp_no, e.division, e.team
    FROM bad_events b JOIN employees e ON b.emp_id = e.id
    ORDER BY b.created_at DESC
  `).all();
  const header = ["ID", "\u8AB2", "\u73ED", "\u793E\u54E1\u756A\u53F7", "\u6C0F\u540D", "\u30AB\u30C6\u30B4\u30EA", "\u7D4C\u7DEF", "\u6C17\u6301\u3061", "\u7BA1\u7406\u8005\u30E1\u30E2", "\u65E5\u6642"];
  const body = (rows.results ?? []).map(
    (r) => [
      r.id,
      r.division ?? "",
      r.team ?? "",
      r.emp_no,
      `"${(r.name ?? "").replace(/"/g, '""')}"`,
      r.category,
      `"${(r.content ?? "").replace(/"/g, '""')}"`,
      `"${(r.feeling ?? "").replace(/"/g, '""')}"`,
      `"${(r.admin_memo ?? "").replace(/"/g, '""')}"`,
      r.created_at
    ].join(",")
  ).join("\n");
  return new Response(`\uFEFF${header.join(",")}
${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bad_events.csv"'
    }
  });
});
app2.get("/line", async (c) => {
  const codes = await c.env.DB.prepare(`
    SELECT i.code, i.is_used, i.expires_at, i.created_at, i.used_at,
      e.name, e.emp_no
    FROM invite_codes i
    LEFT JOIN employees e ON i.emp_id = e.id
    ORDER BY i.created_at DESC
    LIMIT 50
  `).all();
  const linked = await c.env.DB.prepare(`
    SELECT l.line_uid, l.linked_at, e.name, e.emp_no, e.division
    FROM line_users l JOIN employees e ON l.emp_id = e.id
    ORDER BY l.linked_at DESC
  `).all();
  const employees = await c.env.DB.prepare(
    "SELECT id, name, emp_no FROM employees WHERE is_active = 1 ORDER BY seq_no, id"
  ).all();
  const codeRows = (codes.results ?? []).map((c2) => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const expired = c2.expires_at < now;
    return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:14px;font-weight:bold;letter-spacing:2px;">${escHtml(c2.code)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(c2.name ?? "\u2014")}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">
          ${c2.is_used ? '<span style="background:#bbf7d0;padding:2px 8px;border-radius:4px;font-size:12px;">\u4F7F\u7528\u6E08</span>' : expired ? '<span style="background:#fee2e2;padding:2px 8px;border-radius:4px;font-size:12px;">\u671F\u9650\u5207\u308C</span>' : '<span style="background:#fef9c3;padding:2px 8px;border-radius:4px;font-size:12px;">\u6709\u52B9</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${c2.expires_at.slice(0, 16)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">
          <button onclick="deleteCode('${escHtml(c2.code)}')" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">\u524A\u9664</button>
        </td>
      </tr>`;
  }).join("");
  const linkedRows = (linked.results ?? []).map(
    (l) => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(l.name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${escHtml(l.emp_no)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${l.linked_at.slice(0, 16)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#9ca3af;font-family:monospace;">${escHtml(l.line_uid.slice(0, 12))}\u2026</td>
    </tr>`
  ).join("");
  const empOptions = (employees.results ?? []).map(
    (e) => `<option value="${e.id}">${escHtml(e.name)}\uFF08${escHtml(e.emp_no)}\uFF09</option>`
  ).join("");
  const content = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-family:'Hiragino Sans','Meiryo',sans-serif;">

      <!-- \u62DB\u5F85\u30B3\u30FC\u30C9\u767A\u884C -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">\u62DB\u5F85\u30B3\u30FC\u30C9\u767A\u884C</h3>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">\u5BFE\u8C61\u793E\u54E1\u3092\u9078\u629E</label>
          <select id="emp-select" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
            <option value="">\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044...</option>
            ${empOptions}
          </select>
        </div>
        <button onclick="issueCode()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          \u62DB\u5F85\u30B3\u30FC\u30C9\u3092\u767A\u884C\u3059\u308B
        </button>
        <div id="code-result" style="display:none;margin-top:16px;padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">\u62DB\u5F85\u30B3\u30FC\u30C9\uFF08\u6709\u52B9\u671F\u96507\u65E5\uFF09</div>
          <div id="code-display" style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1e3a5f;font-family:monospace;"></div>
          <div style="font-size:12px;color:#6b7280;margin-top:8px;">\u3053\u306E\u30B3\u30FC\u30C9\u3092LINE\u30EA\u30D5\u306B\u9001\u308B\u3088\u3046\u65B0\u4EBA\u306B\u4F1D\u3048\u3066\u304F\u3060\u3055\u3044</div>
        </div>
      </div>

      <!-- \u30A2\u30F3\u30B1\u30FC\u30C8\u914D\u4FE1 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">\u30A2\u30F3\u30B1\u30FC\u30C8\u914D\u4FE1</h3>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">\u30A2\u30F3\u30B1\u30FC\u30C8\u30BF\u30A4\u30C8\u30EB</label>
          <input type="text" id="survey-title" placeholder="\u4F8B: 6\u6708\u5EA6 \u65B0\u4EBA\u30A2\u30F3\u30B1\u30FC\u30C8"
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">Google Forms URL</label>
          <input type="url" id="survey-url" placeholder="https://forms.gle/..."
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
        </div>
        <button onclick="sendSurvey()" style="width:100%;padding:10px;background:#059669;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          \u5168\u54E1\u306B\u914D\u4FE1\u3059\u308B
        </button>
      </div>
    </div>

    <!-- \u62DB\u5F85\u30B3\u30FC\u30C9\u4E00\u89A7 -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-top:20px;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">\u767A\u884C\u6E08\u307F\u62DB\u5F85\u30B3\u30FC\u30C9</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u30B3\u30FC\u30C9</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u5BFE\u8C61\u793E\u54E1</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u72B6\u614B</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u6709\u52B9\u671F\u9650</th>
            <th style="padding:8px 12px;"></th>
          </tr>
        </thead>
        <tbody>${codeRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093</td></tr>'}</tbody>
      </table>
    </div>

    <!-- LINE\u7D10\u4ED8\u3051\u6E08\u307F\u30E6\u30FC\u30B6\u30FC -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-top:20px;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">LINE\u7D10\u4ED8\u3051\u6E08\u307F\uFF08${(linked.results ?? []).length}\u540D\uFF09</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u6C0F\u540D</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u793E\u54E1\u756A\u53F7</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">\u7D10\u4ED8\u3051\u65E5\u6642</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">LINE UID</th>
          </tr>
        </thead>
        <tbody>${linkedRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">\u7D10\u4ED8\u3051\u6E08\u307F\u30E6\u30FC\u30B6\u30FC\u304C\u3044\u307E\u305B\u3093</td></tr>'}</tbody>
      </table>
    </div>

    <script>
    async function issueCode() {
      const empId = document.getElementById('emp-select').value;
      if (!empId) { alert('\u793E\u54E1\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      const res = await fetch('/api/line/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: parseInt(empId) })
      });
      const json = await res.json();
      if (res.ok) {
        document.getElementById('code-display').textContent = json.code;
        document.getElementById('code-result').style.display = 'block';
      } else {
        alert('\u767A\u884C\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + json.error);
      }
    }

    async function sendSurvey() {
      const title = document.getElementById('survey-title').value.trim();
      const url = document.getElementById('survey-url').value.trim();
      if (!title || !url) { alert('\u30BF\u30A4\u30C8\u30EB\u3068URL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
      if (!confirm(\`\u5168\u7D10\u4ED8\u3051\u6E08\u307F\u793E\u54E1\uFF08${(linked.results ?? []).length}\u540D\uFF09\u306B\u30A2\u30F3\u30B1\u30FC\u30C8\u3092\u914D\u4FE1\u3057\u307E\u3059\u304B\uFF1F\`)) return;
      const res = await fetch('/api/line/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url })
      });
      if (res.ok) alert('\u914D\u4FE1\u3057\u307E\u3057\u305F\uFF01');
      else alert('\u914D\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }

    async function deleteCode(code) {
      if (!confirm('\u62DB\u5F85\u30B3\u30FC\u30C9\u300C' + code + '\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      const res = await fetch('/api/line/invite/' + code, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    <\/script>
  `;
  return c.html(layout("LINE\u7BA1\u7406", content, "line"));
});
var CHK_LABEL = {
  chk_mental_exp: { section: "\u30E1\u30F3\u30BF\u30EB\u9762", label: "\u8868\u60C5\u30FB\u767A\u8A00\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F60A}" },
  chk_mental_stress: { section: "\u30E1\u30F3\u30BF\u30EB\u9762", label: "\u30B9\u30C8\u30EC\u30B9\u3084\u4E0D\u6E80\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F4AD}" },
  chk_mental_family: { section: "\u30E1\u30F3\u30BF\u30EB\u9762", label: "\u5BB6\u65CF\u30FB\u53CB\u4EBA\u3068\u306E\u95A2\u4FC2\u306F", icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}" },
  chk_life_sleep: { section: "\u751F\u6D3B\u9762", label: "\u7761\u7720\u306F\u53D6\u308C\u3066\u3044\u307E\u3059\u304B", icon: "\u{1F634}" },
  chk_life_appetite: { section: "\u751F\u6D3B\u9762", label: "\u98DF\u6B32\u306F\u3042\u308A\u307E\u3059\u304B", icon: "\u{1F371}" },
  chk_life_health: { section: "\u751F\u6D3B\u9762", label: "\u4F53\u8ABF\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F3E5}" },
  chk_work_motivation: { section: "\u696D\u52D9\u306B\u5BFE\u3057\u3066", label: "\u4ED5\u4E8B\u306E\u3084\u308A\u304C\u3044\u306F\u3042\u308A\u307E\u3059\u304B", icon: "\u{1F4AA}" },
  chk_work_instructor: { section: "\u696D\u52D9\u306B\u5BFE\u3057\u3066", label: "\u6307\u5C0E\u8005\u3068\u306E\u95A2\u4FC2\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F91D}" },
  chk_work_rules: { section: "\u696D\u52D9\u306B\u5BFE\u3057\u3066", label: "\u793C\u5100\u30FB\u30EB\u30FC\u30EB\u7B49\u306F\u5B88\u3089\u308C\u3066\u3044\u307E\u3059\u304B", icon: "\u{1F4CB}" },
  chk_money: { section: "\u304A\u91D1\u306B\u5BFE\u3059\u308B\u4E0D\u6E80", label: "\u53CE\u5165\u306B\u5BFE\u3057\u3066\u4E0D\u6E80\u306F\u3042\u308A\u307E\u3059\u304B", icon: "\u{1F4B4}" },
  chk_relation: { section: "\u4EBA\u9593\u95A2\u4FC2", label: "\u4E57\u52D9\u54E1\u540C\u58EB\u306E\u95A2\u4FC2\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F465}" },
  chk_appearance: { section: "\u8EAB\u3060\u3057\u306A\u307F\u30FB\u5C31\u696D\u72B6\u6CC1", label: "\u8EAB\u3060\u3057\u306A\u307F\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u{1F454}" },
  chk_attendance: { section: "\u8EAB\u3060\u3057\u306A\u307F\u30FB\u5C31\u696D\u72B6\u6CC1", label: "\u5C31\u696D\u72B6\u6CC1\u306F\u3069\u3046\u3067\u3059\u304B", icon: "\u23F0" },
  chk_future: { section: "\u4ECA\u5F8C\u306E\u610F\u5411\u78BA\u8A8D", label: "\u4ECA\u5F8C\u3082\u4ED5\u4E8B\u3092\u7D9A\u3051\u305F\u3044\u3067\u3059\u304B", icon: "\u{1F695}" }
};
var CHK_KEYS = Object.keys(CHK_LABEL);
app2.get("/interviews", async (c) => {
  const employees = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.emp_no, e.division, e.team, e.status,
      COUNT(ir.id) as interview_count,
      MAX(ir.interview_date) as last_interview,
      (SELECT ir2.next_interview_date FROM interview_records ir2
        WHERE ir2.emp_id = e.id ORDER BY ir2.interview_date DESC LIMIT 1) as next_interview
    FROM employees e
    LEFT JOIN interview_records ir ON ir.emp_id = e.id
    WHERE e.is_active = 1 AND e.interview_target = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).all();
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const rows = (employees.results ?? []).map((e) => {
    const daysSince = e.last_interview ? Math.floor((new Date(today).getTime() - new Date(e.last_interview).getTime()) / 864e5) : null;
    const isOverdue = e.next_interview && e.next_interview < today;
    const daysColor = daysSince === null ? "#9ca3af" : daysSince <= 14 ? "#166534" : daysSince <= 30 ? "#854d0e" : "#991b1b";
    const STATUS = { training: "\u7814\u4FEE\u4E2D", completed: "\u7814\u4FEE\u7D42\u4E86", unassigned: "\u672A\u914D\u5C5E" };
    const statusLabel = STATUS[e.status ?? "training"] ?? "\u2014";
    return `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 border-b text-sm font-medium">
        <a href="${ADMIN_PATH}/interviews/${e.id}" style="color:#2563eb;">${escHtml(e.name)}</a>
        <div class="text-xs text-gray-400">${e.division ?? ""}\u8AB2 ${e.team ?? ""}\u73ED / ${escHtml(e.emp_no)}</div>
      </td>
      <td class="px-3 py-2 border-b text-xs">${escHtml(statusLabel)}</td>
      <td class="px-3 py-2 border-b text-sm">${e.interview_count}\u56DE</td>
      <td class="px-3 py-2 border-b text-sm" style="color:${daysColor};">
        ${e.last_interview ? escHtml(e.last_interview) + `<div style="font-size:11px;">${daysSince}\u65E5\u524D</div>` : '<span style="color:#d1d5db;">\u672A\u5B9F\u65BD</span>'}
      </td>
      <td class="px-3 py-2 border-b text-sm" style="color:${isOverdue ? "#991b1b" : "#374151"};">
        ${e.next_interview ? escHtml(e.next_interview) + (isOverdue ? ' <span style="font-size:10px;background:#fecaca;color:#991b1b;padding:1px 4px;border-radius:3px;">\u671F\u9650\u8D85\u904E</span>' : "") : "\u2014"}
      </td>
      <td class="px-3 py-2 border-b">
        <a href="${ADMIN_PATH}/interviews/${e.id}/new"
          style="padding:4px 12px;background:#1a3a5c;color:white;border-radius:4px;font-size:12px;text-decoration:none;">
          + \u9762\u8AC7\u8A18\u9332
        </a>
      </td>
    </tr>`;
  }).join("");
  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="text-sm text-gray-500">${(employees.results ?? []).length}\u540D</div>
      <a href="${ADMIN_PATH}/interviews/export" style="padding:6px 14px;background:#6b7280;color:white;border-radius:6px;font-size:13px;text-decoration:none;">CSV\u51FA\u529B</a>
    </div>
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C0F\u540D</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u30B9\u30C6\u30FC\u30BF\u30B9</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9762\u8AC7\u56DE\u6570</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6700\u7D42\u9762\u8AC7\u65E5</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6B21\u56DE\u4E88\u5B9A</th>
            <th class="px-3 py-2 border-b"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">\u9762\u8AC7\u5BFE\u8C61\u306E\u793E\u54E1\u304C\u3044\u307E\u305B\u3093\u3002<br><a href="${ADMIN_PATH}/employees" style="color:#2563eb;">\u793E\u54E1\u7BA1\u7406</a>\u304B\u3089\u300C\u9762\u8AC7\u300D\u5217\u3092\u30AA\u30F3\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout("\u9762\u8AC7\u7BA1\u7406", content, "interviews"));
});
app2.get("/interviews/:empId", async (c) => {
  const empId = parseInt(c.req.param("empId"));
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(empId).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const records = await c.env.DB.prepare(
    "SELECT * FROM interview_records WHERE emp_id = ? ORDER BY interview_date DESC"
  ).bind(empId).all();
  const rows = (records.results ?? []).map((r) => {
    const badCount = CHK_KEYS.filter((k) => r[k] === 1).length;
    const cautionCount = CHK_KEYS.filter((k) => r[k] === 2).length;
    const checkedCount = CHK_KEYS.filter((k) => r[k] != null).length;
    const statusBadge = badCount > 0 ? `<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;">\xD7${badCount}</span>` : cautionCount > 0 ? `<span style="background:#fef9c3;color:#854d0e;padding:2px 6px;border-radius:4px;font-size:11px;">\u25B3${cautionCount}</span>` : checkedCount > 0 ? `<span style="background:#bbf7d0;color:#166534;padding:2px 6px;border-radius:4px;font-size:11px;">\u5168\u3066\u25CB</span>` : '<span style="color:#9ca3af;font-size:11px;">\u672A\u5165\u529B</span>';
    return `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="window.location='${ADMIN_PATH}/interviews/record/${r.id}'">
      <td class="px-3 py-2 border-b text-sm font-medium">${escHtml(r.interview_date)}</td>
      <td class="px-3 py-2 border-b text-xs text-gray-500">${r.interviewer ? escHtml(r.interviewer) : "\u2014"}</td>
      <td class="px-3 py-2 border-b">${statusBadge}</td>
      <td class="px-3 py-2 border-b text-xs text-gray-500 max-w-xs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${r.concerns ? escHtml(r.concerns.slice(0, 40)) : "\u2014"}
      </td>
      <td class="px-3 py-2 border-b text-xs">${r.next_interview_date ? escHtml(r.next_interview_date) : "\u2014"}</td>
    </tr>`;
  }).join("");
  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <a href="${ADMIN_PATH}/interviews" style="color:#2563eb;font-size:13px;">\u2190 \u9762\u8AC7\u4E00\u89A7\u306B\u623B\u308B</a>
        <h2 style="font-size:18px;font-weight:bold;color:#1e3a5f;margin-top:4px;">${escHtml(emp.name)} \u306E\u9762\u8AC7\u5C65\u6B74</h2>
        <div style="font-size:13px;color:#6b7280;">${emp.division ?? ""}\u8AB2 ${emp.team ?? ""}\u73ED / ${escHtml(emp.emp_no)}</div>
      </div>
      <a href="${ADMIN_PATH}/interviews/${empId}/new"
        style="padding:8px 18px;background:#1a3a5c;color:white;border-radius:6px;font-size:13px;text-decoration:none;font-weight:600;">
        + \u9762\u8AC7\u8A18\u9332\u3092\u8FFD\u52A0
      </a>
    </div>
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u9762\u8AC7\u65E5</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u62C5\u5F53\u8005</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u7D50\u679C</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6C17\u306B\u306A\u3063\u305F\u70B9</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">\u6B21\u56DE\u4E88\u5B9A</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">\u9762\u8AC7\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout(`${emp.name} \u2014 \u9762\u8AC7\u5C65\u6B74`, content, "interviews"));
});
function interviewForm(emp, record, isNew) {
  const val = /* @__PURE__ */ __name((key) => record?.[key] ?? "", "val");
  const chkRadio = /* @__PURE__ */ __name((key) => {
    const cur = record?.[key];
    return [3, 2, 1].map((v) => {
      const labels = { 3: "\u25CB", 2: "\u25B3", 1: "\xD7" };
      const colors = { 3: "#166534", 2: "#854d0e", 1: "#991b1b" };
      const bgs = { 3: "#f0fdf4", 2: "#fefce8", 1: "#fef2f2" };
      const checked = cur === v ? "checked" : "";
      return `<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;padding:4px 8px;border-radius:6px;background:${cur === v ? bgs[v] : "#f9fafb"};border:1px solid ${cur === v ? "#d1d5db" : "#e5e7eb"};">
        <input type="radio" name="${key}" value="${v}" ${checked} style="accent-color:${colors[v]};">
        <span style="font-size:15px;font-weight:700;color:${colors[v]};">${labels[v]}</span>
      </label>`;
    }).join("");
  }, "chkRadio");
  const sections = {};
  for (const [key, meta] of Object.entries(CHK_LABEL)) {
    if (!sections[meta.section])
      sections[meta.section] = [];
    sections[meta.section].push(key);
  }
  const checkRows = Object.entries(sections).map(([section, keys]) => {
    const itemRows = keys.map((key) => {
      const meta = CHK_LABEL[key];
      return `
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6;align-items:start;">
          <div>
            <div style="font-size:13px;margin-bottom:4px;">${meta.icon} ${escHtml(meta.label)}</div>
            <input type="text" name="${key}_note" value="${escHtml(String(val(key + "_note")))}" placeholder="\u72B6\u6CC1\u30FB\u8A73\u7D30\u30E1\u30E2"
              style="width:100%;border:1px solid #e5e7eb;border-radius:4px;padding:5px 8px;font-size:12px;font-family:inherit;">
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            ${chkRadio(key)}
          </div>
        </div>`;
    }).join("");
    return `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:#1a3a5c;background:#eff6ff;padding:6px 10px;border-radius:6px;margin-bottom:4px;">${escHtml(section)}</div>
        ${itemRows}
      </div>`;
  }).join("");
  const action = isNew ? `${ADMIN_PATH}/interviews/${emp.id}/new` : `${ADMIN_PATH}/interviews/record/${record?.id}/edit`;
  return `
<div style="max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <a href="${ADMIN_PATH}/interviews/${emp.id}" style="color:#2563eb;font-size:13px;">\u2190 \u5C65\u6B74\u306B\u623B\u308B</a>
    ${!isNew && record ? `<button onclick="if(confirm('\u3053\u306E\u9762\u8AC7\u8A18\u9332\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F'))fetch('/api/interviews/${record.id}',{method:'DELETE'}).then(()=>location.href='${ADMIN_PATH}/interviews/${emp.id}')" style="padding:4px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">\u524A\u9664</button>` : ""}
  </div>

  <!-- \u30D8\u30C3\u30C0\u30FC -->
  <div style="background:#1a3a5c;color:white;border-radius:10px 10px 0 0;padding:16px 20px;">
    <div style="font-size:18px;font-weight:900;letter-spacing:0.1em;text-align:center;margin-bottom:8px;">\u65B0\u4EBA\u96E2\u8077\u9632\u6B62 \u9762\u8AC7\u8A18\u9332\u30B7\u30FC\u30C8</div>
    <div style="font-size:11px;color:#bfdbfe;text-align:center;">\u2014 \u5B89\u5FC3\u3057\u3066\u4E57\u308B\u74B0\u5883\u3065\u304F\u308A\u306E\u305F\u3081\u306B \u2014</div>
  </div>

  <div style="background:white;border:2px solid #1a3a5c;border-top:none;border-radius:0 0 10px 10px;padding:20px;">
    <form id="interview-form">
      <!-- \u57FA\u672C\u60C5\u5831 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:2px solid #e5e7eb;">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">\u9762\u8AC7\u65E5 <span style="color:#ef4444;">*</span></label>
          <input type="date" name="interview_date" value="${escHtml(String(val("interview_date") || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]))}" required
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">\u6B21\u56DE\u9762\u8AC7\u4E88\u5B9A\u65E5</label>
          <input type="date" name="next_interview_date" value="${escHtml(String(val("next_interview_date")))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">\u62C5\u5F53\u8005</label>
          <input type="text" name="interviewer" value="${escHtml(String(val("interviewer")))}" placeholder="\u62C5\u5F53\u8005\u540D"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:13px;">
        <strong>${escHtml(emp.name)}</strong>
        <span style="color:#6b7280;margin-left:8px;">${emp.division ?? ""}\u8AB2 ${emp.team ?? ""}\u73ED / ${escHtml(emp.emp_no)}</span>
      </div>

      <!-- \u30C1\u30A7\u30C3\u30AF\u30EA\u30B9\u30C8 -->
      ${checkRows}

      <!-- \u7DCF\u5408\u6240\u898B -->
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a3a5c;">\u{1F4CC} \u9762\u8AC7\u3067\u6C17\u306B\u306A\u3063\u305F\u70B9\u30FB\u6C17\u3065\u304D</label>
          <textarea name="concerns" rows="4" placeholder="\u6C17\u306B\u306A\u308B\u69D8\u5B50\u3001\u767A\u8A00\u3001\u5909\u5316\u306A\u3069..."
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val("concerns")))}</textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a3a5c;">\u{1F4CB} \u4ECA\u5F8C\u306E\u30D5\u30A9\u30ED\u30FC\u5185\u5BB9\u30FB\u6CE8\u610F\u4E8B\u9805</label>
          <textarea name="followup_plan" rows="4" placeholder="\u30D5\u30A9\u30ED\u30FC\u65B9\u91DD\u3001\u6CE8\u610F\u70B9\u3001\u5BFE\u5FDC\u4E88\u5B9A\u306A\u3069..."
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val("followup_plan")))}</textarea>
        </div>
      </div>
      <div style="margin-top:12px;">
        <label style="font-size:12px;font-weight:700;color:#1a3a5c;">\u{1F4AC} \u672C\u4EBA\u304B\u3089\u306E\u30B3\u30E1\u30F3\u30C8</label>
        <textarea name="employee_comment" rows="3" placeholder="\u672C\u4EBA\u306E\u8A00\u8449\u30FB\u8981\u671B\u30FB\u611F\u60F3\u306A\u3069..."
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val("employee_comment")))}</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
        <a href="${ADMIN_PATH}/interviews/${emp.id}" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;text-decoration:none;color:#374151;">\u30AD\u30E3\u30F3\u30BB\u30EB</a>
        <button type="button" onclick="savePrint()" style="padding:10px 16px;background:#6b7280;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\u4FDD\u5B58\u3057\u3066\u5370\u5237</button>
        <button type="button" onclick="saveRecord()" style="padding:10px 24px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">\u4FDD\u5B58</button>
      </div>
    </form>
  </div>
</div>
<script>
const empId = ${emp.id};
const recordId = ${record?.id ?? "null"};
const isNew = ${isNew};
const adminPath = '${ADMIN_PATH}';

function collectData() {
  const fd = new FormData(document.getElementById('interview-form'));
  const data = { emp_id: empId };
  fd.forEach((v, k) => {
    if (k.startsWith('chk_') && !k.endsWith('_note')) {
      data[k] = parseInt(v) || null;
    } else {
      data[k] = v || null;
    }
  });
  return data;
}

async function saveRecord(andPrint) {
  const data = collectData();
  const url = isNew ? '/api/interviews' : '/api/interviews/' + recordId;
  const method = isNew ? 'POST' : 'PUT';
  const res = await fetch(url, {
    method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (res.ok) {
    if (andPrint) {
      const json = await res.json();
      const id = isNew ? json.id : recordId;
      window.open(adminPath + '/interviews/record/' + id + '/print', '_blank');
    }
    window.location.href = adminPath + '/interviews/' + empId;
  } else { alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
}
function savePrint() { saveRecord(true); }
<\/script>`;
}
__name(interviewForm, "interviewForm");
app2.get("/interviews/:empId/new", async (c) => {
  const empId = parseInt(c.req.param("empId"));
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(empId).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  return c.html(layout(`${emp.name} \u2014 \u9762\u8AC7\u8A18\u9332`, interviewForm(emp, null, true), "interviews"));
});
app2.get("/interviews/record/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const record = await c.env.DB.prepare(
    "SELECT ir.*, e.name, e.emp_no, e.division, e.team FROM interview_records ir JOIN employees e ON ir.emp_id = e.id WHERE ir.id = ?"
  ).bind(id).first();
  if (!record)
    return c.text("\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const emp = { id: record.emp_id, name: record.name, emp_no: record.emp_no, division: record.division, team: record.team };
  return c.html(layout(`${record.name} \u2014 \u9762\u8AC7\u8A18\u9332\u7DE8\u96C6`, interviewForm(emp, record, false), "interviews"));
});
app2.get("/interviews/record/:id/print", async (c) => {
  const id = parseInt(c.req.param("id"));
  const r = await c.env.DB.prepare(
    "SELECT ir.*, e.name, e.emp_no, e.division, e.team FROM interview_records ir JOIN employees e ON ir.emp_id = e.id WHERE ir.id = ?"
  ).bind(id).first();
  if (!r)
    return c.text("\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  const sections = {};
  for (const [key, meta] of Object.entries(CHK_LABEL)) {
    if (!sections[meta.section])
      sections[meta.section] = [];
    sections[meta.section].push(key);
  }
  const chkSymbol = /* @__PURE__ */ __name((v) => v === 3 ? "\u25CB" : v === 2 ? "\u25B3" : v === 1 ? "\xD7" : "\u2014", "chkSymbol");
  const chkColor = /* @__PURE__ */ __name((v) => v === 3 ? "#166534" : v === 2 ? "#854d0e" : v === 1 ? "#991b1b" : "#9ca3af", "chkColor");
  const checkTable = Object.entries(sections).map(([section, keys]) => {
    const itemRows = keys.map((key) => {
      const meta = CHK_LABEL[key];
      const val = r[key];
      const note = r[key + "_note"] ?? "";
      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:5px 8px;font-size:12px;width:50%;">${meta.icon} ${meta.label}</td>
        <td style="padding:5px 8px;text-align:center;font-size:16px;font-weight:700;color:${chkColor(val)};width:8%;">${chkSymbol(val)}</td>
        <td style="padding:5px 8px;font-size:11px;color:#6b7280;">${note ? escHtml(note) : ""}</td>
      </tr>`;
    }).join("");
    return `<tr><td colspan="3" style="background:#eff6ff;padding:5px 8px;font-size:12px;font-weight:700;color:#1a3a5c;">${escHtml(section)}</td></tr>${itemRows}`;
  }).join("");
  const html = `<!DOCTYPE html><html lang="ja"><head>
  <meta charset="UTF-8"><meta name="robots" content="noindex">
  <title>\u9762\u8AC7\u8A18\u9332 \u2014 ${escHtml(r.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 16px; background: white; font-size: 12px; }
    .no-print { margin-bottom: 10px; }
    @media print { .no-print { display: none; } @page { margin: 8mm; } }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #d1d5db; }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;">\u{1F5A8}\uFE0F \u5370\u5237</button>
  </div>
  <div style="text-align:center;font-size:18px;font-weight:900;letter-spacing:0.3em;margin-bottom:4px;border-bottom:2px solid #1a3a5c;padding-bottom:6px;">\u65B0\u4EBA\u96E2\u8077\u9632\u6B62 \u9762\u8AC7\u8A18\u9332\u30B7\u30FC\u30C8</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;padding-top:4px;">
    <div>\u9762\u8AC7\u65E5: <strong>${escHtml(r.interview_date)}</strong> &nbsp; \u6B21\u56DE: ${r.next_interview_date ? escHtml(r.next_interview_date) : "\u2014"}</div>
    <div>${r.division ?? ""}\u8AB2 ${r.team ?? ""}\u73ED &nbsp; <strong>${escHtml(r.emp_no)}</strong> &nbsp; ${escHtml(r.name)} \u69D8 &nbsp; \u62C5\u5F53: ${r.interviewer ? escHtml(r.interviewer) : "\u2014"}</div>
  </div>
  <table style="margin-bottom:8px;">
    <thead><tr style="background:#1a3a5c;color:white;">
      <th style="padding:5px 8px;text-align:left;">\u9805\u76EE</th>
      <th style="padding:5px 8px;width:8%;">\u5224\u5B9A</th>
      <th style="padding:5px 8px;text-align:left;">\u72B6\u6CC1\u30FB\u8A73\u7D30</th>
    </tr></thead>
    <tbody>${checkTable}</tbody>
  </table>
  <table style="margin-bottom:8px;">
    <tr>
      <td style="padding:6px 8px;width:50%;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">\u{1F4CC} \u6C17\u306B\u306A\u3063\u305F\u70B9\u30FB\u6C17\u3065\u304D</div>
        <div style="font-size:12px;min-height:40px;">${r.concerns ? escHtml(r.concerns) : ""}</div>
      </td>
      <td style="padding:6px 8px;width:50%;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">\u{1F4CB} \u30D5\u30A9\u30ED\u30FC\u5185\u5BB9\u30FB\u6CE8\u610F\u4E8B\u9805</div>
        <div style="font-size:12px;min-height:40px;">${r.followup_plan ? escHtml(r.followup_plan) : ""}</div>
      </td>
    </tr>
  </table>
  <table>
    <tr>
      <td style="padding:6px 8px;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">\u{1F4AC} \u672C\u4EBA\u304B\u3089\u306E\u30B3\u30E1\u30F3\u30C8</div>
        <div style="font-size:12px;min-height:30px;">${r.employee_comment ? escHtml(r.employee_comment) : ""}</div>
      </td>
    </tr>
  </table>
</body></html>`;
  return c.html(html);
});
app2.get("/interviews/export", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT ir.*, e.name, e.emp_no, e.division, e.team, e.entry_type
    FROM interview_records ir
    JOIN employees e ON ir.emp_id = e.id
    ORDER BY ir.interview_date DESC, e.division, e.team
  `).all();
  const chkSymbol = /* @__PURE__ */ __name((v) => v === 3 ? "\u25CB" : v === 2 ? "\u25B3" : v === 1 ? "\xD7" : "", "chkSymbol");
  const headerBase = ["\u9762\u8AC7\u65E5", "\u6B21\u56DE\u4E88\u5B9A\u65E5", "\u62C5\u5F53\u8005", "\u8AB2", "\u73ED", "\u793E\u54E1\u756A\u53F7", "\u6C0F\u540D", "\u533A\u5206"];
  const headerChk = CHK_KEYS.flatMap((k) => [CHK_LABEL[k].label, CHK_LABEL[k].label + "_\u30E1\u30E2"]);
  const headerText = ["\u6C17\u306B\u306A\u3063\u305F\u70B9", "\u30D5\u30A9\u30ED\u30FC\u5185\u5BB9", "\u672C\u4EBA\u30B3\u30E1\u30F3\u30C8"];
  const header = [...headerBase, ...headerChk, ...headerText].join(",");
  const body = (rows.results ?? []).map((r) => {
    const base = [
      r.interview_date,
      r.next_interview_date ?? "",
      r.interviewer ?? "",
      r.division ?? "",
      r.team ?? "",
      r.emp_no,
      `"${(r.name ?? "").replace(/"/g, '""')}"`,
      r.entry_type ?? ""
    ];
    const chkCols = CHK_KEYS.flatMap((k) => [
      chkSymbol(r[k]),
      `"${(r[k + "_note"] ?? "").replace(/"/g, '""')}"`
    ]);
    const textCols = [
      `"${(r.concerns ?? "").replace(/"/g, '""')}"`,
      `"${(r.followup_plan ?? "").replace(/"/g, '""')}"`,
      `"${(r.employee_comment ?? "").replace(/"/g, '""')}"`
    ];
    return [...base, ...chkCols, ...textCols].join(",");
  }).join("\n");
  return new Response(`\uFEFF${header}
${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="interviews_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`
    }
  });
});
app2.get("/announcements", async (c) => {
  const employees = await c.env.DB.prepare(
    `SELECT e.id, e.name, e.emp_no, e.hire_date,
       CASE WHEN lu.emp_id IS NOT NULL THEN 1 ELSE 0 END as has_line
     FROM employees e
     LEFT JOIN line_users lu ON lu.emp_id = e.id
     WHERE e.is_active = 1
     ORDER BY e.division, e.team, e.seq_no`
  ).all();
  const history = await c.env.DB.prepare(
    "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 30"
  ).all();
  const linkedCount = (employees.results ?? []).filter((e) => e.has_line).length;
  const months = [...new Set(
    (employees.results ?? []).filter((e) => e.hire_date).map((e) => e.hire_date.slice(0, 7))
  )].sort().reverse();
  const empOptions = (employees.results ?? []).map(
    (e) => `<option value="${e.id}" ${!e.has_line ? 'style="color:#9ca3af;"' : ""}>
      ${escHtml(e.name)}\uFF08${escHtml(e.emp_no)}\uFF09${e.has_line ? "" : " \u203BLINE\u672A\u7D10\u4ED8"}
    </option>`
  ).join("");
  const monthOptions = months.map(
    (m) => `<option value="${m}">${m.replace("-", "\u5E74")}\u6708\u5165\u793E</option>`
  ).join("");
  const TARGET_LABEL = {
    all: "\u5168\u54E1",
    entry_month: "\u5165\u793E\u6708",
    individual: "\u500B\u5225\u6307\u5B9A"
  };
  const historyRows = (history.results ?? []).map(
    (r) => `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="showDetail(${r.id})">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">
        <span style="background:#eff6ff;color:#1d4ed8;padding:2px 7px;border-radius:4px;">${escHtml(TARGET_LABEL[r.target_type] ?? r.target_type)}</span>
        ${r.target_data ? `<span style="margin-left:4px;font-size:11px;color:#9ca3af;">${escHtml(r.target_data)}</span>` : ""}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">
        <span style="font-weight:700;color:#1a3a5c;">${r.sent_count}</span><span style="font-size:11px;color:#6b7280;">\u540D</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${r.created_at.slice(0, 16)}</td>
    </tr>`
  ).join("");
  const content = `
<div style="max-width:800px;font-family:'Hiragino Sans','Meiryo',sans-serif;">

  <!-- \u914D\u4FE1\u30D5\u30A9\u30FC\u30E0 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:24px;margin-bottom:24px;">
    <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">\u{1F4E2} \u304A\u77E5\u3089\u305B\u3092\u914D\u4FE1\u3059\u308B</h3>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">\u30BF\u30A4\u30C8\u30EB <span style="color:#ef4444;">*</span></label>
      <input type="text" id="ann-title" placeholder="\u4F8B: 6\u6708\u5EA6 \u7814\u4FEE\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u5909\u66F4\u306E\u304A\u77E5\u3089\u305B"
        style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:9px 12px;font-size:13px;font-family:inherit;">
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">\u672C\u6587 <span style="color:#ef4444;">*</span></label>
      <textarea id="ann-message" rows="5" placeholder="\u914D\u4FE1\u3059\u308B\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044..."
        style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:9px 12px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
    </div>

    <!-- \u5BFE\u8C61\u9078\u629E -->
    <div style="margin-bottom:16px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:8px;">\u914D\u4FE1\u5BFE\u8C61</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-all">
          <input type="radio" name="target_type" value="all" checked onchange="onTargetChange(this.value)">
          \u5168\u54E1\uFF08LINE\u7D10\u4ED8 ${linkedCount}\u540D\uFF09
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-month">
          <input type="radio" name="target_type" value="entry_month" onchange="onTargetChange(this.value)">
          \u5165\u793E\u6708\u3067\u7D5E\u308B
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-ind">
          <input type="radio" name="target_type" value="individual" onchange="onTargetChange(this.value)">
          \u500B\u5225\u6307\u5B9A
        </label>
      </div>
      <!-- \u5165\u793E\u6708\u9078\u629E -->
      <div id="entry-month-sel" style="display:none;margin-top:10px;">
        <select id="ann-entry-month" style="border:1px solid #d1d5db;border-radius:7px;padding:7px 12px;font-size:13px;">
          ${monthOptions || '<option value="">\u5165\u793E\u6708\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</option>'}
        </select>
      </div>
      <!-- \u500B\u5225\u793E\u54E1\u9078\u629E -->
      <div id="individual-sel" style="display:none;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Ctrl / Cmd + \u30AF\u30EA\u30C3\u30AF\u3067\u8907\u6570\u9078\u629E</div>
        <select id="ann-employees" multiple size="6"
          style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:6px;font-size:13px;">
          ${empOptions}
        </select>
      </div>
    </div>

    <!-- \u30D7\u30EC\u30D3\u30E5\u30FC -->
    <div id="preview-box" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:#166534;margin-bottom:6px;">\u{1F4F1} LINE\u3067\u306E\u8868\u793A\u30D7\u30EC\u30D3\u30E5\u30FC</div>
      <div id="preview-text" style="font-size:13px;white-space:pre-wrap;color:#1a3a5c;"></div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="showPreview()" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;cursor:pointer;background:white;">\u30D7\u30EC\u30D3\u30E5\u30FC</button>
      <button onclick="sendAnnouncement()" style="padding:9px 24px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">\u914D\u4FE1\u3059\u308B</button>
    </div>
  </div>

  <!-- \u914D\u4FE1\u5C65\u6B74 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">\u914D\u4FE1\u5C65\u6B74</h3>
      <span style="font-size:12px;color:#9ca3af;">\u6700\u65B030\u4EF6</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u30BF\u30A4\u30C8\u30EB</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u5BFE\u8C61</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u9001\u4FE1\u6570</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u914D\u4FE1\u65E5\u6642</th>
        </tr>
      </thead>
      <tbody id="history-body">
        ${historyRows || '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">\u914D\u4FE1\u5C65\u6B74\u304C\u3042\u308A\u307E\u305B\u3093</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- \u8A73\u7D30\u30E2\u30FC\u30C0\u30EB -->
  <div id="detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;">
    <div style="background:white;border-radius:12px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 id="modal-title" style="font-size:16px;font-weight:bold;color:#1e3a5f;"></h3>
        <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">\xD7</button>
      </div>
      <div id="modal-body" style="font-size:13px;white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:14px;line-height:1.7;"></div>
      <div id="modal-meta" style="margin-top:12px;font-size:12px;color:#9ca3af;"></div>
    </div>
  </div>
</div>

<script>
const annHistory = ${safeJson(history.results ?? [])};

function onTargetChange(val) {
  document.getElementById('entry-month-sel').style.display = val === 'entry_month' ? 'block' : 'none';
  document.getElementById('individual-sel').style.display = val === 'individual' ? 'block' : 'none';
}

function getTarget() {
  const type = document.querySelector('input[name="target_type"]:checked')?.value ?? 'all';
  let data = null;
  if (type === 'entry_month') {
    data = document.getElementById('ann-entry-month').value;
  } else if (type === 'individual') {
    const sel = document.getElementById('ann-employees');
    const ids = Array.from(sel.selectedOptions).map(o => o.value).join(',');
    data = ids || null;
  }
  return { type, data };
}

function showPreview() {
  const title = document.getElementById('ann-title').value.trim();
  const msg = document.getElementById('ann-message').value.trim();
  if (!title && !msg) return;
  const box = document.getElementById('preview-box');
  document.getElementById('preview-text').textContent = '\u{1F4E2} ' + (title || '\uFF08\u30BF\u30A4\u30C8\u30EB\uFF09') + '\\n\\n' + (msg || '\uFF08\u672C\u6587\uFF09');
  box.style.display = 'block';
}

async function sendAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const message = document.getElementById('ann-message').value.trim();
  if (!title || !message) { alert('\u30BF\u30A4\u30C8\u30EB\u3068\u672C\u6587\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }

  const { type, data } = getTarget();

  const targetLabel = type === 'all' ? '\u5168\u54E1' : type === 'entry_month' ? (data + '\u5165\u793E') : '\u500B\u5225\u6307\u5B9A';
  if (!confirm('\u300C' + title + '\u300D\u3092 ' + targetLabel + ' \u306B\u914D\u4FE1\u3057\u307E\u3059\u304B\uFF1F\\n\\n' + message)) return;

  const res = await fetch('/api/line/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message, target_type: type, target_data: data })
  });
  const json = await res.json();
  if (res.ok) {
    const warn = json.warning ? '\\n\u26A0\uFE0F ' + json.warning : '';
    alert('\u914D\u4FE1\u3057\u307E\u3057\u305F\uFF01\uFF08\u9001\u4FE1\u6570: ' + json.sent + '\u540D\uFF09' + warn);
    location.reload();
  } else {
    alert('\u914D\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + (json.error ?? '\u4E0D\u660E\u306A\u30A8\u30E9\u30FC'));
  }
}

function showDetail(id) {
  const r = annHistory.find(a => a.id === id);
  if (!r) return;
  const TARGET_LABEL = { all: '\u5168\u54E1', entry_month: '\u5165\u793E\u6708', individual: '\u500B\u5225\u6307\u5B9A' };
  document.getElementById('modal-title').textContent = r.title;
  document.getElementById('modal-body').textContent = r.message;
  document.getElementById('modal-meta').textContent =
    '\u5BFE\u8C61: ' + (TARGET_LABEL[r.target_type] ?? r.target_type) +
    (r.target_data ? ' (' + r.target_data + ')' : '') +
    '\u3000\u9001\u4FE1\u6570: ' + r.sent_count + '\u540D\u3000' + r.created_at.slice(0, 16);
  const modal = document.getElementById('detail-modal');
  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

document.getElementById('detail-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
<\/script>
`;
  return c.html(layout("\u304A\u77E5\u3089\u305B\u914D\u4FE1", content, "announcements"));
});
app2.get("/vehicles", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  let results = [];
  let searched = false;
  if (q.length > 0) {
    searched = true;
    const res = await c.env.DB.prepare(`
      SELECT v.*, o.phone AS office_phone,
        CASE WHEN CAST(v.radio_no AS TEXT) = ? THEN 0 ELSE 1 END AS _sort
      FROM vehicles v
      LEFT JOIN offices o ON o.name = v.office2
      WHERE CAST(v.radio_no AS TEXT) = ? OR v.plate_num = ?
      ORDER BY _sort, v.radio_no
      LIMIT 50
    `).bind(q, q, q).all();
    results = res.results ?? [];
  }
  const rows = results.map((v) => `
    <tr class="hover:bg-gray-50">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${v.radio_no ?? "-"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.plate_no ?? "-")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.car_type ?? "-")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.office ?? "-")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.division ?? "-")}</td>
    </tr>`).join("");
  const emptyMsg = searched ? `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">\u300C${escHtml(q)}\u300D\u306E\u691C\u7D22\u7D50\u679C\u306F\u3042\u308A\u307E\u305B\u3093</td></tr>` : `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;">\u4E0A\u306E\u691C\u7D22\u30DC\u30C3\u30AF\u30B9\u306B\u756A\u53F7\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044</td></tr>`;
  const content = `
    <form method="get" style="display:flex;gap:8px;margin-bottom:20px;">
      <input name="q" value="${escHtml(q)}" placeholder="\u7121\u7DDA\u756A\u53F7 or \u30CA\u30F3\u30D0\u30FC\uFF08\u4F8B: 6677\uFF09"
        style="flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;"
        autofocus autocomplete="off">
      <button type="submit" style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">\u691C\u7D22</button>
      ${q ? `<a href="${ADMIN_PATH}/vehicles" style="padding:10px 16px;background:#e5e7eb;color:#374151;border-radius:8px;font-size:14px;text-decoration:none;display:flex;align-items:center;">\u30AF\u30EA\u30A2</a>` : ""}
    </form>

    ${searched ? `<div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${results.length}\u4EF6\u30D2\u30C3\u30C8${results.length >= 50 ? "\uFF08\u4E0A\u4F4D50\u4EF6\u8868\u793A\uFF09" : ""}</div>` : ""}

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:700px;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u7121\u7DDA\u756A\u53F7</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u8ECA\u4E21\u756A\u53F7</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u8ECA\u7A2E</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u55B6\u696D\u6240</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u8AB2</th>
          </tr>
        </thead>
        <tbody>${rows || emptyMsg}</tbody>
      </table>
    </div>
  `;
  return c.html(layout("\u8ECA\u4E21\u691C\u7D22", content, "vehicles"));
});
app2.get("/settings/vehicle-admins", async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, name, line_uid, created_at FROM vehicle_search_admins ORDER BY created_at DESC"
  ).all();
  const admins = res.results ?? [];
  const rows = admins.length === 0 ? `<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093</td></tr>` : admins.map((a) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(a.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-family:monospace;color:#6b7280;">
        ${escHtml(a.line_uid.slice(0, 8))}\u2026${escHtml(a.line_uid.slice(-4))}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${a.created_at.slice(0, 10)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="forceRemove(${a.id}, '${escHtml(a.name)}')"
          style="padding:4px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:600;">
          \u5F37\u5236\u89E3\u9664
        </button>
      </td>
    </tr>`).join("");
  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">\u2190 \u8A2D\u5B9A\u306B\u623B\u308B</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">\u8ECA\u756A\u691C\u7D22\u7BA1\u7406\u8005\u4E00\u89A7</h2>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;max-width:720px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">LINE\u3067\u300C\u8ECA\u756A\u9023\u643A\u300D\u3092\u884C\u3044\u8ECA\u756A\u691C\u7D22\u6A29\u9650\u3092\u6301\u3064\u30E6\u30FC\u30B6\u30FC\u306E\u4E00\u89A7\u3067\u3059\u3002\u5F37\u5236\u89E3\u9664\u3059\u308B\u3068\u305D\u306E\u30E6\u30FC\u30B6\u30FC\u306F\u691C\u7D22\u3067\u304D\u306A\u304F\u306A\u308A\u307E\u3059\u3002</p>
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u540D\u524D</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">LINE UID\uFF08\u30DE\u30B9\u30AF\uFF09</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u9023\u643A\u65E5</th>
              <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <script>
    async function forceRemove(id, name) {
      if (!confirm(name + ' \u306E\u8ECA\u756A\u691C\u7D22\u6A29\u9650\u3092\u5F37\u5236\u89E3\u9664\u3057\u307E\u3059\u304B\uFF1F')) return;
      const res = await fetch('${ADMIN_PATH}/api/vehicle-admins/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('\u89E3\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002'); }
    }
    <\/script>`;
  return c.html(layout("\u8ECA\u756A\u691C\u7D22\u7BA1\u7406\u8005\u4E00\u89A7", html, "settings"));
});
app2.delete("/api/vehicle-admins/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (!id)
    return c.text("Bad Request", 400);
  await c.env.DB.prepare("DELETE FROM vehicle_search_admins WHERE id = ?").bind(id).run();
  return c.text("OK");
});
app2.get("/settings/offices", async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, name, short_name, phone, address, note FROM offices ORDER BY sort_order, id"
  ).all();
  const offices = res.results ?? [];
  const rows = offices.map((o) => `
    <tr id="row-${o.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escHtml(o.short_name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="tel" value="${escHtml(o.phone ?? "")}" id="phone-${o.id}" placeholder="03-XXXX-XXXX"
          style="width:140px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(o.address ?? "")}" id="address-${o.id}" placeholder="\u4F4F\u6240\uFF08\u4EFB\u610F\uFF09"
          style="width:220px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(o.note ?? "")}" id="note-${o.id}" placeholder="\u5099\u8003\uFF08\u4EFB\u610F\uFF09"
          style="width:160px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
    </tr>`).join("");
  const ids = offices.map((o) => o.id);
  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">\u2190 \u8A2D\u5B9A\u306B\u623B\u308B</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">\u55B6\u696D\u6240\u7BA1\u7406</h2>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;max-width:800px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">\u5404\u55B6\u696D\u6240\u306E\u96FB\u8A71\u756A\u53F7\u30FB\u4F4F\u6240\u3092\u8A2D\u5B9A\u3057\u307E\u3059\u3002\u8ECA\u4E21\u691C\u7D22\u306E\u7D50\u679C\u306B\u53CD\u6620\u3055\u308C\u307E\u3059\u3002</p>
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u55B6\u696D\u6240</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u96FB\u8A71\u756A\u53F7</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u4F4F\u6240</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u5099\u8003</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
        <button onclick="saveAll()" id="save-btn"
          style="padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          \u4FDD\u5B58
        </button>
        <span id="save-msg" style="font-size:13px;color:#16a34a;display:none;">\u4FDD\u5B58\u3057\u307E\u3057\u305F</span>
      </div>
    </div>
    <script>
      var IDS = ${JSON.stringify(ids)};
      async function saveAll() {
        var btn = document.getElementById('save-btn');
        btn.disabled = true; btn.textContent = '\u4FDD\u5B58\u4E2D...';
        var payload = IDS.map(function(id) {
          return {
            id: id,
            phone:   document.getElementById('phone-'   + id).value.trim(),
            address: document.getElementById('address-' + id).value.trim(),
            note:    document.getElementById('note-'    + id).value.trim()
          };
        });
        var res = await fetch('${ADMIN_PATH}/api/offices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        btn.disabled = false;
        if (res.ok) {
          btn.textContent = '\u4FDD\u5B58';
          var msg = document.getElementById('save-msg');
          msg.style.display = 'inline';
          setTimeout(function() { msg.style.display = 'none'; }, 2500);
        } else {
          btn.textContent = '\u4FDD\u5B58';
          alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        }
      }
    <\/script>`;
  return c.html(layout("\u55B6\u696D\u6240\u7BA1\u7406", html, "settings"));
});
app2.post("/api/offices", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body))
    return c.text("Bad Request", 400);
  const stmts = body.map(
    (item) => c.env.DB.prepare("UPDATE offices SET phone = ?, address = ?, note = ? WHERE id = ?").bind(item.phone || null, item.address || null, item.note || null, item.id)
  );
  await c.env.DB.batch(stmts);
  return c.text("OK");
});
var admin_extra_default = app2;

// src/routes/admin_staff.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app3 = new Hono2();
var START_TIMES = {
  a: ["6:00", "6:50", "8:00"],
  b: ["18:00", "19:00"],
  B: ["6:00", "6:50", "8:00"],
  D: ["9:30"],
  H: ["15:00", "16:00"]
};
var ALL_TIMES = ["6:00", "6:50", "8:00", "9:30", "15:00", "16:00", "18:00", "19:00"];
function calcAge(birthDate) {
  if (!birthDate)
    return null;
  const today = /* @__PURE__ */ new Date();
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || m === 0 && today.getDate() < bd.getDate())
    age--;
  return age;
}
__name(calcAge, "calcAge");
var ENROLLMENT_COLORS = {
  "\u901A\u5E38": "#bbf7d0",
  "\u80B2\u4F11": "#dbeafe",
  "\u75C5\u6B20": "#fed7aa",
  "\u50B7\u75C5": "#fecaca"
};
var ENROLLMENT_TEXT_COLORS = {
  "\u901A\u5E38": "#166534",
  "\u80B2\u4F11": "#1e40af",
  "\u75C5\u6B20": "#92400e",
  "\u50B7\u75C5": "#991b1b"
};
app3.get("/staff", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const filterDiv = c.req.query("div") ?? "all";
  const filterStatus = c.req.query("enrollment") ?? "all";
  const filterActive = c.req.query("active") ?? "1";
  const conditions = [];
  if (filterActive === "1")
    conditions.push("is_active = 1");
  if (filterDiv !== "all")
    conditions.push(`division = ${parseInt(filterDiv)}`);
  const VALID_ENROLLMENT_FILTER = ["\u901A\u5E38", "\u80B2\u4F11", "\u75C5\u6B20", "\u50B7\u75C5"];
  if (filterStatus !== "all" && VALID_ENROLLMENT_FILTER.includes(filterStatus)) {
    conditions.push(`enrollment_status = '${filterStatus}'`);
  }
  if (q) {
    const safe = q.replace(/'/g, "''");
    conditions.push(`(name LIKE '%${safe}%' OR name_kana LIKE '%${safe}%' OR emp_no LIKE '%${safe}%')`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const staffRows = await c.env.DB.prepare(
    `SELECT * FROM employees ${where} ORDER BY division, team, seq_no, id`
  ).all();
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1e3);
  const todayStr = nowJST.toISOString().split("T")[0];
  const in30Days = new Date(nowJST.getTime() + 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const upcomingRetirements = await c.env.DB.prepare(`
    SELECT id, name, retirement_date
    FROM employees
    WHERE is_active = 1
      AND retirement_date IS NOT NULL
      AND retirement_date != ''
      AND retirement_date >= ?
      AND retirement_date <= ?
    ORDER BY retirement_date ASC
  `).bind(todayStr, in30Days).all();
  const retirementBanner = (() => {
    const list = upcomingRetirements.results ?? [];
    if (list.length === 0)
      return "";
    const todayMidnight = (/* @__PURE__ */ new Date(todayStr + "T00:00:00+09:00")).getTime();
    const items = list.map((r) => {
      const d = /* @__PURE__ */ new Date(r.retirement_date + "T00:00:00+09:00");
      const diff = Math.ceil((d.getTime() - todayMidnight) / (1e3 * 60 * 60 * 24));
      const label = diff === 0 ? "\u672C\u65E5\u9000\u8077" : diff === 1 ? "\u660E\u65E5\u9000\u8077" : `\u3042\u3068${diff}\u65E5`;
      const urgentColor = diff <= 3 ? "#dc2626" : "#d97706";
      return `<a href="${ADMIN_PATH}/staff/${r.id}" style="display:inline-flex;align-items:center;gap:6px;background:white;border:1px solid #fde68a;border-radius:6px;padding:4px 10px;text-decoration:none;color:#1f2937;font-size:12px;">
        <span style="color:${urgentColor};font-weight:700;">${label}</span>
        <span>${escHtml(r.name)}</span>
        <span style="color:#9ca3af;">${escHtml(r.retirement_date)}</span>
      </a>`;
    }).join("");
    return `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;">\u9000\u8077\u4E88\u5B9A ${list.length}\u540D\uFF0830\u65E5\u4EE5\u5185\uFF09\u2014 \u9000\u8077\u65E5\u5230\u9054\u6642\u306B\u81EA\u52D5\u3067\u540D\u7C3F\u304B\u3089\u9664\u5916\u3055\u308C\u307E\u3059</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${items}</div>
    </div>`;
  })();
  const makeFilter = /* @__PURE__ */ __name((key, val, base2) => {
    const p = { ...base2, [key]: val };
    if (key !== "q")
      delete p.q;
    return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  }, "makeFilter");
  const base = { div: filterDiv, enrollment: filterStatus, active: filterActive };
  const divBtns = [["all", "\u5168\u8AB2"], ["1", "1\u8AB2"], ["2", "2\u8AB2"], ["3", "3\u8AB2"], ["4", "4\u8AB2"]].map(
    ([v, l]) => `<a href="${ADMIN_PATH}/staff?${makeFilter("div", v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterDiv === v ? "background:#1a3a5c;color:white;" : "background:#f3f4f6;color:#374151;"}">${l}</a>`
  ).join("");
  const enrollBtns = [["all", "\u5168\u54E1"], ["\u901A\u5E38", "\u901A\u5E38"], ["\u80B2\u4F11", "\u80B2\u4F11"], ["\u75C5\u6B20", "\u75C5\u6B20"], ["\u50B7\u75C5", "\u50B7\u75C5"]].map(
    ([v, l]) => `<a href="${ADMIN_PATH}/staff?${makeFilter("enrollment", v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterStatus === v ? "background:#1a3a5c;color:white;" : "background:#f3f4f6;color:#374151;"}">${l}</a>`
  ).join("");
  const activeBtns = [["1", "\u5728\u7C4D"], ["0", "\u9000\u8077"], ["", "\u5168\u3066"]].map(
    ([v, l]) => `<a href="${ADMIN_PATH}/staff?${makeFilter("active", v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterActive === v ? "background:#1a3a5c;color:white;" : "background:#f3f4f6;color:#374151;"}">${l}</a>`
  ).join("");
  const C = "padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;";
  const rows = (staffRows.results ?? []).map((e) => {
    const age = calcAge(e.birth_date);
    const enStatus = e.enrollment_status ?? "\u901A\u5E38";
    const bg = ENROLLMENT_COLORS[enStatus] ?? "#f3f4f6";
    const tc = ENROLLMENT_TEXT_COLORS[enStatus] ?? "#374151";
    const isRetiringSoon = e.retirement_date && e.retirement_date >= todayStr && e.retirement_date <= in30Days;
    const rowBg = isRetiringSoon ? "#fffbeb" : "white";
    const rowHover = isRetiringSoon ? "#fef9c3" : "#f8fafc";
    return `
    <tr style="cursor:pointer;background:${rowBg};"
      onmouseover="this.style.background='${rowHover}'" onmouseout="this.style.background='${rowBg}'"
      onclick="location.href='${ADMIN_PATH}/staff/${e.id}'">
      <td style="${C}font-size:12px;font-family:monospace;color:#6b7280;white-space:nowrap;">${escHtml(e.emp_no)}</td>
      <td style="${C}">
        <div style="font-size:13px;font-weight:600;color:#1f2937;">${escHtml(e.name)}</div>
        ${e.name_kana ? `<div style="font-size:11px;color:#9ca3af;">${escHtml(e.name_kana)}</div>` : ""}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">${e.division ? e.division + "\u8AB2" : ""}${e.team ? " " + e.team + "\u73ED" : ""}${!e.division && !e.team ? "\u2014" : ""}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;">${e.work_schedule ?? "\u2014"}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;">${e.start_time ?? "\u2014"}</td>
      <td style="${C}font-size:12px;white-space:nowrap;">
        ${e.car_no ? `<span style="font-family:monospace;">${escHtml(e.car_no)}</span>` : "\u2014"}
      </td>
      <td style="${C}white-space:nowrap;">
        <span style="background:${bg};color:${tc};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(enStatus)}</span>
        ${isRetiringSoon ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;">\u9000\u8077\u4E88\u5B9A</span>` : ""}
      </td>
      <td style="${C}white-space:nowrap;text-align:center;">
        ${e.is_caution ? '<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">\u6CE8\u610F</span>' : "\u2014"}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">
        ${e.birth_date ? `${e.birth_date.slice(0, 10)} (${age}\u6B73)` : "\u2014"}
        ${isRetiringSoon ? `<div style="font-size:10px;color:#d97706;font-weight:600;">${escHtml(e.retirement_date)} \u9000\u8077</div>` : ""}
      </td>
    </tr>`;
  }).join("");
  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">

  ${retirementBanner}

  <!-- \u30D5\u30A3\u30EB\u30BF\u30FC -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px;margin-bottom:16px;">
    <form method="get" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <input type="hidden" name="div" value="${escHtml(filterDiv)}">
      <input type="hidden" name="enrollment" value="${escHtml(filterStatus)}">
      <input type="hidden" name="active" value="${escHtml(filterActive)}">
      <input name="q" value="${escHtml(q)}" placeholder="\u6C0F\u540D\u30FB\u30D5\u30EA\u30AC\u30CA\u30FB\u793E\u54E1\u756A\u53F7\u3067\u691C\u7D22"
        style="flex:1;min-width:200px;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;">
      <button type="submit" style="padding:7px 16px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\u691C\u7D22</button>
      ${q ? `<a href="${ADMIN_PATH}/staff" style="padding:7px 14px;background:#e5e7eb;color:#374151;border-radius:6px;font-size:13px;text-decoration:none;">\u30AF\u30EA\u30A2</a>` : ""}
    </form>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">\u8AB2</span>${divBtns}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">\u72B6\u614B</span>${enrollBtns}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">\u5728\u7C4D</span>${activeBtns}
      </div>
    </div>
  </div>

  <!-- \u30D8\u30C3\u30C0\u30FC -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <span style="font-size:13px;color:#6b7280;">${(staffRows.results ?? []).length}\u540D</span>
    <div style="display:flex;gap:8px;">
      <button onclick="toggleCsvImport()" style="padding:8px 14px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">
        CSV\u30A4\u30F3\u30DD\u30FC\u30C8
      </button>
      <a href="${ADMIN_PATH}/staff/new" style="padding:8px 18px;background:#1a3a5c;color:white;border-radius:7px;font-size:13px;font-weight:600;text-decoration:none;">\uFF0B \u65B0\u898F\u767B\u9332</a>
    </div>
  </div>

  <!-- CSV\u30A4\u30F3\u30DD\u30FC\u30C8\u30D1\u30CD\u30EB -->
  <div id="csv-import-panel" style="display:none;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
    <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">
      CSV \u30A4\u30F3\u30DD\u30FC\u30C8\uFF08\u661F\u4E57\u52D9\u54E1\u540D\u7C3F\u5F62\u5F0F\uFF09
    </h3>
    <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
      \u51FA\u5EAB\u30C7\u30FC\u30BFCSV\uFF08Shift-JIS\uFF09\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u793E\u54E1\u756A\u53F7\u3092\u30AD\u30FC\u306B\u65E2\u5B58\u793E\u54E1\u306F\u66F4\u65B0\u3001\u672A\u767B\u9332\u793E\u54E1\u306F\u65B0\u898F\u8FFD\u52A0\u3057\u307E\u3059\u3002
    </p>

    <!-- \u30D5\u30A1\u30A4\u30EB\u9078\u629E\u30A8\u30EA\u30A2 -->
    <div id="csv-drop-zone"
      style="border:2px dashed #d1d5db;border-radius:8px;padding:28px;text-align:center;cursor:pointer;margin-bottom:14px;transition:border-color 0.2s;"
      onclick="document.getElementById('csv-file-input').click()"
      ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
      ondragleave="this.style.borderColor='#d1d5db'"
      ondrop="handleCsvDrop(event)">
      <div style="font-size:13px;color:#6b7280;">\u30AF\u30EA\u30C3\u30AF\u307E\u305F\u306F\u30C9\u30E9\u30C3\u30B0\u3067CSV\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Shift-JIS / UTF-8 \u4E21\u5BFE\u5FDC</div>
    </div>
    <input type="file" id="csv-file-input" accept=".csv,.CSV" style="display:none" onchange="handleCsvFile(this.files[0])">

    <!-- \u30D7\u30EC\u30D3\u30E5\u30FC -->
    <div id="csv-preview" style="display:none;">
      <div id="csv-summary" style="font-size:13px;color:#374151;margin-bottom:10px;"></div>
      <div style="overflow-x:auto;max-height:320px;border:1px solid #e5e7eb;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:860px;">
          <thead style="background:#f9fafb;position:sticky;top:0;">
            <tr>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u72B6\u614B</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u793E\u54E1\u756A\u53F7</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u6C0F\u540D / \u8AAD\u307F\u4EEE\u540D</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u8AB2\u30FB\u73ED</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u52E4\u52D9\u4F53\u7CFB</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u51FA\u52E4\u6642\u9593</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u4F7F\u7528\u8ECA\u756A\uFF08\u983B\u5EA6\u9806\uFF09</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u5E73\u5747\u5E30\u5EAB</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u5099\u8003</th>
            </tr>
          </thead>
          <tbody id="csv-preview-body"></tbody>
        </table>
      </div>
      <!-- \u9000\u8077\u5019\u88DC\u30EA\u30B9\u30C8 -->
      <div id="csv-retirement-candidates" style="display:none;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:12px;"></div>
      <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
        <button onclick="clearCsvImport()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
        <button id="csv-import-btn" onclick="executeCsvImport()"
          style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
          \u30A4\u30F3\u30DD\u30FC\u30C8\u5B9F\u884C
        </button>
      </div>
    </div>
    <div id="csv-result" style="display:none;"></div>
  </div>

  <!-- \u30C6\u30FC\u30D6\u30EB -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:760px;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u793E\u54E1\u756A\u53F7</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;">\u6C0F\u540D</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u8AB2\u30FB\u73ED</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u52E4\u52D9\u4F53\u7CFB</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u51FA\u52E4\u6642\u9593</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u8ECA\u756A</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u5728\u7C4D\u72B6\u614B</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u8981\u6CE8\u610F</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">\u751F\u5E74\u6708\u65E5</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:#9ca3af;">\u8A72\u5F53\u3059\u308B\u793E\u54E1\u304C\u3044\u307E\u305B\u3093</td></tr>'}
      </tbody>
    </table>
  </div>
</div>

<script>
// ===== CSV \u30A4\u30F3\u30DD\u30FC\u30C8 =====

const ADMIN_PATH = '${ADMIN_PATH}';
let csvParsedData = [];
const EXISTING_EMP_NOS = new Set(${JSON.stringify((staffRows.results ?? []).map((e) => e.emp_no))});

// ===== kuromoji \u8AAD\u307F\u4EEE\u540D\u30A8\u30F3\u30B8\u30F3 =====
let _tokenizer = null, _tokenizerLoading = false;

function setKuroStatus(msg, color) {
  const el = document.getElementById('kuromoji-status');
  if (el) { el.textContent = msg; el.style.color = color || '#9ca3af'; }
}

function setImportBtnReady(ready) {
  const btn = document.getElementById('csv-import-btn');
  if (!btn) return;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.5';
  btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
  if (!ready) btn.textContent = '\u8AAD\u307F\u4EEE\u540D\u751F\u6210\u4E2D\u2026';
  else btn.textContent = '\u30A4\u30F3\u30DD\u30FC\u30C8\u5B9F\u884C';
}

function loadKuromoji() {
  if (_tokenizer || _tokenizerLoading) return;
  _tokenizerLoading = true;
  setKuroStatus('\u8AAD\u307F\u4EEE\u540D\u30A8\u30F3\u30B8\u30F3\u8AAD\u8FBC\u4E2D\u2026', '#d97706');
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
  s.onload = () => {
    kuromoji.builder({ dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' })
      .build((err, tok) => {
        _tokenizerLoading = false;
        if (err) {
          setKuroStatus('\u8AAD\u307F\u4EEE\u540D\u30A8\u30F3\u30B8\u30F3\u5931\u6557\uFF08\u624B\u52D5\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09', '#dc2626');
          setImportBtnReady(true); // \u5931\u6557\u3067\u3082\u30A4\u30F3\u30DD\u30FC\u30C8\u306F\u8A31\u53EF
          return;
        }
        _tokenizer = tok;
        setKuroStatus('\u8AAD\u307F\u4EEE\u540D\u751F\u6210OK \u2713', '#166534');
        if (csvParsedData.length) { generateAllFurigana(); renderCsvPreview(); }
        setImportBtnReady(true);
      });
  };
  s.onerror = () => {
    _tokenizerLoading = false;
    setKuroStatus('\u8AAD\u307F\u4EEE\u540D\u30A8\u30F3\u30B8\u30F3\u5931\u6557\uFF08\u624B\u52D5\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09', '#dc2626');
    setImportBtnReady(true);
  };
  document.head.appendChild(s);
}

function toKatakana(str) {
  return str.replace(/[\\u3041-\\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

function getFurigana(name) {
  if (!_tokenizer || !name) return null;
  const tokens = _tokenizer.tokenize(name.replace(/[\\s\\u3000]/g, ''));
  return toKatakana(tokens.map(t => t.reading || t.surface_form).join(''));
}

function generateAllFurigana() {
  for (const emp of csvParsedData) {
    if (!emp.name_kana) emp.name_kana = getFurigana(emp.name) || null;
  }
}

// ===== UI \u64CD\u4F5C =====
function toggleCsvImport() {
  const panel = document.getElementById('csv-import-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadKuromoji();
}

function handleCsvDrop(event) {
  event.preventDefault();
  document.getElementById('csv-drop-zone').style.borderColor = '#d1d5db';
  const file = event.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}

function handleCsvFile(file) {
  if (!file) return;
  document.getElementById('csv-drop-zone').style.borderColor = '#1a3a5c';
  const reader = new FileReader();
  reader.onload = e => {
    const buf = e.target.result;
    let text;
    try { text = new TextDecoder('shift-jis').decode(buf); }
    catch { text = new TextDecoder('utf-8').decode(buf); }
    parseCsvText(text);
  };
  reader.readAsArrayBuffer(file);
}

// ===== \u5B9A\u6570 =====
const WORK_TYPE_MAP = {
  '\u65E5\u52E4A':'a','\u65E5\u52E4\uFF21':'a','\u65E5\u52E4B':'B','\u65E5\u52E4\uFF22':'B',
  'D\u52E4':'D','\uFF24\u52E4':'D','B\u52E4':'b','\uFF22\u52E4':'b',
  'H\u52E4':'H','\uFF28\u52E4':'H','\u516CH':'H','\u516C\uFF28':'H',
};
const TIME_CANDS = [6.0,6.5,8.0,9.5,15.0,16.0,18.0,19.0];
const TIME_LABELS = {6.0:'6:00',6.5:'6:50',8.0:'8:00',9.5:'9:30',15.0:'15:00',16.0:'16:00',18.0:'18:00',19.0:'19:00'};

function snapStartTime(h) {
  let best=TIME_CANDS[0], bd=Math.abs(h-best);
  for (const c of TIME_CANDS) { const d=Math.abs(h-c); if(d<bd){bd=d;best=c;} }
  return TIME_LABELS[best]||null;
}
function fmtHours(h) {
  if(isNaN(h)||h<0) return null;
  const hr=Math.floor(h)%24, mn=Math.round((h-Math.floor(h))*60);
  return String(hr).padStart(2,'0')+':'+String(mn<60?mn:59).padStart(2,'0');
}
function modeOf(arr) {
  if(!arr.length) return null;
  const f={}; for(const v of arr) f[v]=(f[v]||0)+1;
  return Object.entries(f).sort((a,b)=>b[1]-a[1])[0][0];
}
function avgOf(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

// ===== CSV \u89E3\u6790\uFF08\u65E5\u4ED8\u8FFD\u8DE1\u30FB\u8ECA\u756A\u983B\u5EA6\u30FB\u9000\u8077\u5019\u88DC\uFF09 =====
function parseCsvText(text) {
  const lines = text.split(/\\r?\\n/);
  const empMap = {};
  let csvMaxDate = '';

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const dateRaw = cols[0]?.trim();
    const teamRaw = cols[2]?.trim();
    const empNo   = cols[3]?.trim();
    const name    = cols[4]?.trim();
    const workRaw = cols[5]?.trim();
    const carRaw  = cols[6]?.trim();
    const startRaw = parseFloat(cols[7]?.trim());
    const retRaw   = parseFloat(cols[8]?.trim());

    if (!empNo || !name || !/^\\d{8}$/.test(empNo)) continue;
    if (dateRaw && dateRaw > csvMaxDate) csvMaxDate = dateRaw;

    if (!empMap[empNo]) {
      empMap[empNo] = { emp_no:empNo, name, team:parseInt(teamRaw)||null,
        workTypes:[], carFreq:{}, startEntries:[], returnTimes:[], dates:[] };
    }
    const e = empMap[empNo];
    const mapped = WORK_TYPE_MAP[workRaw];
    if (mapped) e.workTypes.push(mapped);
    if (carRaw && /^\\d+$/.test(carRaw)) e.carFreq[carRaw] = (e.carFreq[carRaw]||0)+1;
    if (!isNaN(startRaw) && startRaw>0) e.startEntries.push({date:dateRaw, time:startRaw});
    if (!isNaN(retRaw) && retRaw>0) e.returnTimes.push(retRaw);
    if (dateRaw) e.dates.push(dateRaw);
  }

  // \u76F4\u8FD130\u65E5\u306E\u5883\u754C
  let recentCutoff = '';
  if (csvMaxDate) {
    const ms = new Date(csvMaxDate.replace(/\\//g,'-')).getTime() - 30*86400000;
    recentCutoff = new Date(ms).toISOString().slice(0,10).replace(/-/g,'/');
  }

  csvParsedData = Object.values(empMap).map(e => {
    const work_schedule = modeOf(e.workTypes);
    const allTimes = e.startEntries.map(s=>s.time);
    const start_time = avgOf(allTimes) !== null ? snapStartTime(avgOf(allTimes)) : null;

    // \u4F7F\u7528\u8ECA\u756A\uFF08\u983B\u5EA6\u9806 Top5\u3001\u62C5\u5F53\u8ECA\u756A\u3068\u3057\u3066DB\u306B\u4FDD\u5B58\u3057\u306A\u3044\uFF09
    const sortedCars = Object.entries(e.carFreq).sort((a,b)=>b[1]-a[1]).map(([c])=>c);
    const used_cars = sortedCars.length ? JSON.stringify(sortedCars.slice(0,5)) : null;
    const topCarsDisplay = sortedCars.slice(0,3).join(' / ') || '\u2014';

    const avg_return_time = fmtHours(avgOf(e.returnTimes));
    const division = e.team ? Math.ceil(e.team/2) : null;

    // \u6700\u7D42\u51FA\u52E4\u65E5\u30FB\u9577\u671F\u4E0D\u5728\u30C1\u30A7\u30C3\u30AF\uFF083\u30F6\u6708\u4EE5\u4E0A\uFF09
    const uniqDates = [...new Set(e.dates)].sort();
    const lastDate = uniqDates[uniqDates.length-1] || null;
    let daysSinceLast = null;
    if (lastDate && csvMaxDate) {
      daysSinceLast = Math.floor(
        (new Date(csvMaxDate.replace(/\\//g,'-')) - new Date(lastDate.replace(/\\//g,'-'))) / 86400000
      );
    }
    const isLongAbsent = daysSinceLast !== null && daysSinceLast >= 90;

    // \u51FA\u52E4\u30B7\u30D5\u30C8\u5909\u5316\u30C1\u30A7\u30C3\u30AF\uFF08\u76F4\u8FD130\u65E5 vs \u4EE5\u524D \u3067 2h \u4EE5\u4E0A\u30BA\u30EC\uFF09
    let hasTimeChange=false, recentAvg=null, earlyAvg=null;
    if (recentCutoff && e.startEntries.length >= 6) {
      const rec = e.startEntries.filter(s=>s.date>=recentCutoff).map(s=>s.time);
      const ear = e.startEntries.filter(s=>s.date< recentCutoff).map(s=>s.time);
      if (rec.length>=3 && ear.length>=3) {
        recentAvg=avgOf(rec); earlyAvg=avgOf(ear);
        hasTimeChange = Math.abs(recentAvg-earlyAvg) >= 2;
      }
    }

    return {
      emp_no:e.emp_no, name:e.name, name_kana:null,
      division, team:e.team,
      work_schedule, start_time,
      used_cars, topCarsDisplay,
      avg_return_time,
      lastDate, daysSinceLast, isLongAbsent,
      hasTimeChange, recentAvg, earlyAvg,
    };
  });

  generateAllFurigana();
  renderCsvPreview();
}

// ===== \u30D7\u30EC\u30D3\u30E5\u30FC\u63CF\u753B =====
function renderCsvPreview() {
  const newCnt    = csvParsedData.filter(e=>!EXISTING_EMP_NOS.has(e.emp_no)).length;
  const updCnt    = csvParsedData.filter(e=> EXISTING_EMP_NOS.has(e.emp_no)).length;
  const absCnt    = csvParsedData.filter(e=>e.isLongAbsent).length;
  const chgCnt    = csvParsedData.filter(e=>e.hasTimeChange).length;

  document.getElementById('csv-summary').innerHTML =
    '\u89E3\u6790: <strong>'+csvParsedData.length+'\u540D</strong> \u2014 '+
    '<span style="color:#166534;">\u65B0\u898F '+newCnt+'\u540D</span> / '+
    '<span style="color:#1d4ed8;">\u66F4\u65B0 '+updCnt+'\u540D</span>'+
    (absCnt ? ' / <span style="color:#dc2626;">\u9577\u671F\u4E0D\u5728 '+absCnt+'\u540D</span>' : '')+
    (chgCnt ? ' / <span style="color:#d97706;">\u30B7\u30D5\u30C8\u5909\u5316 '+chgCnt+'\u540D</span>' : '')+
    ' &nbsp;<span id="kuromoji-status" style="font-size:11px;"></span>';

  const tbody = document.getElementById('csv-preview-body');
  tbody.innerHTML = csvParsedData.map(e => {
    const isNew = !EXISTING_EMP_NOS.has(e.emp_no);
    const badge = isNew
      ? '<span style="background:#dcfce7;color:#166534;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">\u65B0\u898F</span>'
      : '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">\u66F4\u65B0</span>';
    const flags = [];
    if (e.isLongAbsent)  flags.push('<span style="background:#fee2e2;color:#dc2626;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">\u4E0D\u5728'+e.daysSinceLast+'\u65E5</span>');
    if (e.hasTimeChange) {
      const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
      const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
      flags.push('<span style="background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">'+from+'\u2192'+to+'</span>');
    }
    const rowBg = e.isLongAbsent?'#fff1f2':e.hasTimeChange?'#fffbeb':'';
    return '<tr style="border-bottom:1px solid #f3f4f6;'+(rowBg?'background:'+rowBg+';':'')+'">' +
      '<td style="padding:5px 8px;">'+badge+'</td>' +
      '<td style="padding:5px 8px;font-family:monospace;color:#6b7280;font-size:11px;">'+e.emp_no+'</td>' +
      '<td style="padding:5px 8px;"><div style="font-weight:600;font-size:12px;">'+(e.name||'\u2014')+'</div>'+
        '<div style="font-size:11px;color:#9ca3af;">'+(e.name_kana||'<i style=color:#d1d5db>\u751F\u6210\u4E2D\u2026</i>')+'</div></td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.division?e.division+'\u8AB2 ':'')+( e.team?e.team+'\u73ED':'\u2014')+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.work_schedule||'\u2014')+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.start_time||'\u2014')+'</td>' +
      '<td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#374151;">'+(e.topCarsDisplay)+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;color:#6b7280;">'+(e.avg_return_time||'\u2014')+'</td>' +
      '<td style="padding:5px 8px;">'+flags.join(' ')+'</td>' +
      '</tr>';
  }).join('');

  // \u9000\u8077\u5019\u88DC\u30EA\u30B9\u30C8
  const absent  = csvParsedData.filter(e=>e.isLongAbsent);
  const changed = csvParsedData.filter(e=>e.hasTimeChange);
  const retDiv  = document.getElementById('csv-retirement-candidates');
  if (retDiv) {
    if (!absent.length && !changed.length) {
      retDiv.style.display = 'none';
    } else {
      let h = '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;">\u9000\u8077\u5019\u88DC\u30EA\u30B9\u30C8\uFF08\u8981\u78BA\u8A8D\uFF09</div>';
      if (absent.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:6px;">\u9577\u671F\u4E0D\u5728\uFF083\u30F6\u6708\u4EE5\u4E0A\u51FA\u52E4\u306A\u3057\uFF09</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">';
        for (const e of absent) {
          h += '<span style="background:white;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;font-size:11px;">'+
            '<b>'+e.name+'</b> <span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>'+
            '<span style="color:#dc2626;"> \u6700\u7D42:'+e.lastDate+'\uFF08'+e.daysSinceLast+'\u65E5\u524D\uFF09</span></span>';
        }
        h += '</div>';
      }
      if (changed.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:6px;">\u51FA\u52E4\u30B7\u30D5\u30C8\u5909\u5316\uFF08\u76F4\u8FD130\u65E5\uFF09</div><div style="display:flex;flex-wrap:wrap;gap:5px;">';
        for (const e of changed) {
          const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
          const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
          h += '<span style="background:white;border:1px solid #fde68a;border-radius:5px;padding:3px 8px;font-size:11px;">'+
            '<b>'+e.name+'</b> <span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>'+
            '<span style="color:#d97706;"> '+from+'\u2192'+to+'</span></span>';
        }
        h += '</div>';
      }
      retDiv.innerHTML = h;
      retDiv.style.display = 'block';
    }
  }

  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('csv-result').style.display = 'none';

  // kuromoji \u304C\u307E\u3060\u8AAD\u8FBC\u4E2D\u306A\u3089\u30A4\u30F3\u30DD\u30FC\u30C8\u30DC\u30BF\u30F3\u3092\u7121\u52B9\u5316
  const kuroReady = !!_tokenizer || (!_tokenizerLoading);
  setImportBtnReady(kuroReady);
}

// ===== \u30A4\u30F3\u30DD\u30FC\u30C8\u5B9F\u884C =====
async function executeCsvImport() {
  if (!csvParsedData.length) return;
  // kuromoji \u304C\u9593\u306B\u5408\u3063\u3066\u3044\u308C\u3070\u6700\u7D42\u78BA\u8A8D\u3067\u518D\u751F\u6210
  generateAllFurigana();
  const btn = document.getElementById('csv-import-btn');
  btn.disabled = true; btn.textContent = '\u30A4\u30F3\u30DD\u30FC\u30C8\u4E2D...';

  // \u62C5\u5F53\u8ECA\u756A (car_no) \u306F\u9001\u3089\u306A\u3044 \u2014 \u624B\u52D5\u5165\u529B\u306B\u59D4\u306D\u308B
  const payload = csvParsedData.map(e => ({
    emp_no: e.emp_no, name: e.name,
    name_kana: e.name_kana || null,
    division: e.division, team: e.team,
    work_schedule: e.work_schedule, start_time: e.start_time,
    avg_return_time: e.avg_return_time,
    used_cars: e.used_cars,
  }));

  try {
    const res = await fetch('/api/employees/csv-import', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ employees: payload })
    });
    const json = await res.json();
    const resultDiv = document.getElementById('csv-result');
    if (res.ok) {
      resultDiv.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;font-size:13px;color:#166534;">'+
        '\u30A4\u30F3\u30DD\u30FC\u30C8\u5B8C\u4E86: <strong>\u65B0\u898F '+json.inserted+'\u540D</strong> / <strong>\u66F4\u65B0 '+json.updated+'\u540D</strong>'+
        (json.errors?.length?'<div style="margin-top:8px;color:#dc2626;font-size:12px;">\u30A8\u30E9\u30FC: '+json.errors.join('\u3001')+'</div>':'')+
        '<div style="margin-top:10px;"><a href="'+ADMIN_PATH+'/staff" style="color:#1d4ed8;font-size:13px;">\u2192 \u793E\u54E1\u4E00\u89A7\u3092\u66F4\u65B0</a></div></div>';
      resultDiv.style.display='block';
      document.getElementById('csv-preview').style.display='none';
      document.getElementById('csv-retirement-candidates').style.display='none';
    } else {
      resultDiv.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;color:#dc2626;font-size:13px;">\u30A8\u30E9\u30FC: '+(json.error||'\u4E0D\u660E\u306A\u30A8\u30E9\u30FC')+'</div>';
      resultDiv.style.display='block';
    }
  } catch { alert('\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F'); }
  finally { btn.disabled=false; btn.textContent='\u30A4\u30F3\u30DD\u30FC\u30C8\u5B9F\u884C'; }
}

function clearCsvImport() {
  csvParsedData = [];
  ['csv-preview','csv-result','csv-retirement-candidates'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  document.getElementById('csv-file-input').value='';
  document.getElementById('csv-drop-zone').style.borderColor='#d1d5db';
  document.getElementById('csv-import-panel').style.display='none';
}
<\/script>`;
  return c.html(layout("\u793E\u54E1\u7BA1\u7406", content, "staff"));
});
app3.get("/staff/new", (c) => {
  return c.html(layout("\u793E\u54E1\u7BA1\u7406 \u2014 \u65B0\u898F\u767B\u9332", staffForm(null), "staff"));
});
app3.get("/staff/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first();
  if (!emp)
    return c.text("\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093", 404);
  return c.html(layout(`${emp.name} \u2014 \u793E\u54E1\u60C5\u5831`, staffForm(emp), "staff"));
});
function staffForm(emp) {
  const isNew = !emp;
  const v = /* @__PURE__ */ __name((key) => emp ? String(emp[key] ?? "") : "", "v");
  const checked = /* @__PURE__ */ __name((key) => emp && emp[key] ? "checked" : "", "checked");
  const scheduleOptions = ["", "a", "b", "B", "D", "H"].map(
    (s) => `<option value="${s}" ${v("work_schedule") === s ? "selected" : ""}>${s === "" ? "\u2014 \u672A\u8A2D\u5B9A \u2014" : s}</option>`
  ).join("");
  const timeOptions = /* @__PURE__ */ __name((selected) => ["", ...ALL_TIMES].map(
    (t) => `<option value="${t}" ${selected === t ? "selected" : ""}>${t === "" ? "\u2014 \u672A\u8A2D\u5B9A \u2014" : t}</option>`
  ).join(""), "timeOptions");
  const enrollOptions = ["\u901A\u5E38", "\u80B2\u4F11", "\u75C5\u6B20", "\u50B7\u75C5"].map(
    (s) => `<option value="${s}" ${v("enrollment_status") === s ? "selected" : ""}>${s}</option>`
  ).join("");
  const workHoursOptions = ["", "\u52B4\u30D5\u30EB", "\u52B4\u77ED"].map(
    (s) => `<option value="${s}" ${v("work_hours_type") === s ? "selected" : ""}>${s === "" ? "\u2014 \u672A\u8A2D\u5B9A \u2014" : s}</option>`
  ).join("");
  const age = emp ? calcAge(emp.birth_date) : null;
  const problemNotesHtml = emp?.problem_notes ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.8;white-space:pre-wrap;margin-bottom:8px;">${escHtml(emp.problem_notes)}</div>` : `<div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">\u8A18\u9332\u306A\u3057</div>`;
  const START_TIMES_JSON = JSON.stringify(START_TIMES);
  return `
<div style="max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <!-- \u30D8\u30C3\u30C0\u30FC -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <a href="${ADMIN_PATH}/staff" style="color:#2563eb;font-size:13px;text-decoration:none;">\u2190 \u793E\u54E1\u4E00\u89A7\u306B\u623B\u308B</a>
    ${!isNew ? `
    <div style="display:flex;gap:8px;">
      ${emp.is_active ? `<button onclick="retireStaff(${emp.id},'${escHtml(emp.name)}')" style="padding:5px 14px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">\u9000\u8077\u51E6\u7406</button>` : `<button onclick="reinstateStaff(${emp.id},'${escHtml(emp.name)}')" style="padding:5px 14px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;cursor:pointer;">\u5728\u7C4D\u306B\u623B\u3059</button>`}
      <button onclick="purgeStaff(${emp.id},'${escHtml(emp.name)}')" style="padding:5px 12px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">\u5B8C\u5168\u524A\u9664</button>
    </div>` : ""}
  </div>

  ${!emp?.is_active && emp ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;">\u3053\u306E\u793E\u54E1\u306F\u9000\u8077\u6E08\u307F\u3067\u3059\u3002\u9000\u8077\u65E5: ${escHtml(emp.retirement_date ?? "\u2014")}</div>` : ""}

  <form id="staff-form">

    <!-- \u30BB\u30AF\u30B7\u30E7\u30F3: \u57FA\u672C\u60C5\u5831 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">\u57FA\u672C\u60C5\u5831</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u793E\u54E1\u756A\u53F7 <span style="color:#ef4444;">*</span> <span style="font-weight:400;font-size:10px;">\uFF088\u6841\uFF09</span></label>
          <input type="text" id="f-emp_no" value="${escHtml(v("emp_no"))}" maxlength="8" pattern="\\d{8}"
            placeholder="12345678"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u6C0F\u540D\uFF08\u6F22\u5B57\uFF09 <span style="color:#ef4444;">*</span></label>
          <input type="text" id="f-name" value="${escHtml(v("name"))}"
            placeholder="\u5F01\u5929 \u592A\u90CE"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u30D5\u30EA\u30AC\u30CA</label>
          <input type="text" id="f-name_kana" value="${escHtml(v("name_kana"))}"
            placeholder="\u30D9\u30F3\u30C6\u30F3 \u30BF\u30ED\u30A6"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u96FB\u8A71\u756A\u53F7</label>
          <input type="tel" id="f-phone" value="${escHtml(v("phone"))}"
            placeholder="090-0000-0000"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u751F\u5E74\u6708\u65E5${age !== null ? `<span style="font-weight:400;margin-left:6px;">(${age}\u6B73)</span>` : ""}</label>
          <input type="date" id="f-birth_date" value="${escHtml(v("birth_date"))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u8AB2</label>
          <select id="f-division" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            <option value="">\u2014 \u672A\u8A2D\u5B9A \u2014</option>
            ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${v("division") === String(n) ? "selected" : ""}>${n}\u8AB2</option>`).join("")}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u73ED</label>
          <input type="number" id="f-team" value="${escHtml(v("team"))}" min="1" max="99"
            placeholder="\u73ED\u756A\u53F7"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u5165\u793E\u65E5</label>
          <input type="date" id="f-hire_date" value="${escHtml(v("hire_date"))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u9000\u8077\u65E5</label>
          <input type="date" id="f-retirement_date" value="${escHtml(v("retirement_date"))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

      </div>
    </div>

    <!-- \u30BB\u30AF\u30B7\u30E7\u30F3: \u52E4\u52D9\u60C5\u5831 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">\u52E4\u52D9\u60C5\u5831</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u52E4\u52D9\u4F53\u7CFB</label>
          <select id="f-work_schedule" onchange="updateStartTimes()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${scheduleOptions}
          </select>
          <div style="font-size:10px;color:#9ca3af;margin-top:3px;">a/B: \u65E9\u756A &nbsp;b: \u591C\u756A &nbsp;D: \u65E5\u52E4 &nbsp;H: \u534A\u591C</div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u51FA\u52E4\u6642\u9593</label>
          <select id="f-start_time" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${timeOptions(v("start_time"))}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u62C5\u5F53\u8ECA\u756A</label>
          <input type="text" id="f-car_no" value="${escHtml(v("car_no"))}" maxlength="4" pattern="\\d{1,4}"
            placeholder="\u4F8B: 1234"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u5728\u7C4D\u72B6\u614B</label>
          <select id="f-enrollment_status" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${enrollOptions}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u52B4\u30D5\u30EB / \u52B4\u77ED</label>
          <select id="f-work_hours_type" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${workHoursOptions}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">\u5E73\u5747\u5E30\u5EAB\u6642\u9593 <span style="font-weight:400;font-size:10px;">\uFF08CSV\u304B\u3089\u96C6\u8A08\uFF09</span></label>
          <input type="text" id="f-avg_return_time" value="${escHtml(v("avg_return_time"))}" placeholder="\u4F8B: 11:30"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

      </div>
    </div>

    <!-- \u30BB\u30AF\u30B7\u30E7\u30F3: \u30D5\u30E9\u30B0 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">\u30D5\u30E9\u30B0\u8A2D\u5B9A</h3>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 18px;border:1.5px solid #d1d5db;border-radius:8px;min-width:160px;">
          <input type="checkbox" id="f-is_caution" ${checked("is_caution")}
            style="width:17px;height:17px;accent-color:#dc2626;cursor:pointer;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1f2937;">\u8981\u6CE8\u610F</div>
            <div style="font-size:11px;color:#9ca3af;">\u6CE8\u610F\u304C\u5FC5\u8981\u306A\u793E\u54E1</div>
          </div>
        </label>

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 18px;border:1.5px solid #d1d5db;border-radius:8px;min-width:160px;">
          <input type="checkbox" id="f-is_sales_followup" ${checked("is_sales_followup")}
            style="width:17px;height:17px;accent-color:#d97706;cursor:pointer;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1f2937;">\u58F2\u4E0A\u8981\u5F8C\u8FFD\u3044</div>
            <div style="font-size:11px;color:#9ca3af;">\u58F2\u4E0A\u30D5\u30A9\u30ED\u30FC\u5BFE\u8C61</div>
          </div>
        </label>

      </div>
    </div>

    <!-- \u30BB\u30AF\u30B7\u30E7\u30F3: \u554F\u984C\u884C\u52D5\u8A18\u9332 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">\u554F\u984C\u884C\u52D5\u8A18\u9332</h3>
      ${problemNotesHtml}
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <textarea id="f-new-note" rows="3" placeholder="\u65B0\u3057\u3044\u8A18\u9332\u3092\u8FFD\u8A18\uFF08\u8FFD\u8A18\u30DC\u30BF\u30F3\u3067\u73FE\u5728\u306E\u8A18\u9332\u306B\u8FFD\u52A0\u3055\u308C\u307E\u3059\uFF09"
          style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
        <button type="button" onclick="appendNote()" style="padding:8px 14px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">\u8FFD\u8A18</button>
      </div>
    </div>

    <!-- \u4FDD\u5B58\u30DC\u30BF\u30F3 -->
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/staff" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;text-decoration:none;color:#374151;">\u30AD\u30E3\u30F3\u30BB\u30EB</a>
      <button type="button" onclick="saveStaff()" style="padding:10px 28px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">
        ${isNew ? "\u767B\u9332\u3059\u308B" : "\u5909\u66F4\u3092\u4FDD\u5B58"}
      </button>
    </div>

  </form>
</div>

<script>
const IS_NEW = ${isNew};
const STAFF_ID = ${emp?.id ?? "null"};
const ADMIN_PATH = '${ADMIN_PATH}';
const CURRENT_NOTES = ${emp?.problem_notes ? JSON.stringify(emp.problem_notes) : "null"};
const START_TIMES_MAP = ${START_TIMES_JSON};

function updateStartTimes() {
  const sched = document.getElementById('f-work_schedule').value;
  const sel = document.getElementById('f-start_time');
  const current = sel.value;
  const allowed = sched ? START_TIMES_MAP[sched] : null;
  sel.innerHTML = '<option value="">\u2014 \u672A\u8A2D\u5B9A \u2014</option>';
  const opts = allowed || ${JSON.stringify(ALL_TIMES)};
  opts.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    if (t === current || (allowed && allowed.length === 1)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (allowed && allowed.length === 1) sel.value = allowed[0];
}

function collectData() {
  const empNo = document.getElementById('f-emp_no').value.trim();
  const name = document.getElementById('f-name').value.trim();
  if (!empNo || !name) { alert('\u793E\u54E1\u756A\u53F7\u3068\u6C0F\u540D\u306F\u5FC5\u9808\u3067\u3059'); return null; }
  if (!/^\\d{8}$/.test(empNo)) { alert('\u793E\u54E1\u756A\u53F7\u306F8\u6841\u306E\u6570\u5B57\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return null; }
  const carNo = document.getElementById('f-car_no').value.trim();
  if (carNo && !/^\\d{1,4}$/.test(carNo)) { alert('\u62C5\u5F53\u8ECA\u756A\u306F\u6700\u59274\u6841\u306E\u6570\u5B57\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return null; }
  return {
    emp_no: empNo,
    name: name,
    name_kana: document.getElementById('f-name_kana').value.trim() || null,
    division: parseInt(document.getElementById('f-division').value) || null,
    team: parseInt(document.getElementById('f-team').value) || null,
    phone: document.getElementById('f-phone').value.trim() || null,
    birth_date: document.getElementById('f-birth_date').value || null,
    hire_date: document.getElementById('f-hire_date').value || null,
    retirement_date: document.getElementById('f-retirement_date').value || null,
    work_schedule: document.getElementById('f-work_schedule').value || null,
    start_time: document.getElementById('f-start_time').value || null,
    car_no: carNo || null,
    enrollment_status: document.getElementById('f-enrollment_status').value || '\u901A\u5E38',
    work_hours_type: document.getElementById('f-work_hours_type').value || null,
    is_caution: document.getElementById('f-is_caution').checked ? 1 : 0,
    is_sales_followup: document.getElementById('f-is_sales_followup').checked ? 1 : 0,
    avg_return_time: document.getElementById('f-avg_return_time').value.trim() || null,
  };
}

async function saveStaff() {
  const data = collectData();
  if (!data) return;
  const url = IS_NEW ? '/api/employees' : '/api/employees/' + STAFF_ID;
  const method = IS_NEW ? 'POST' : 'PUT';
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    const id = IS_NEW ? json.id : STAFF_ID;
    window.location.href = ADMIN_PATH + '/staff/' + id;
  } else {
    alert('\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + (json.error ?? '\u4E0D\u660E\u306A\u30A8\u30E9\u30FC'));
  }
}

async function appendNote() {
  const note = document.getElementById('f-new-note').value.trim();
  if (!note) { alert('\u8FFD\u8A18\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
  if (!STAFF_ID) { alert('\u5148\u306B\u793E\u54E1\u3092\u767B\u9332\u3057\u3066\u304F\u3060\u3055\u3044'); return; }
  const now = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const newEntry = '\u30FB' + now + '\\n' + note;
  const merged = CURRENT_NOTES ? CURRENT_NOTES + '\\n' + newEntry : newEntry;
  const res = await fetch('/api/employees/' + STAFF_ID, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_notes: merged })
  });
  if (res.ok) { location.reload(); }
  else { alert('\u8FFD\u8A18\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
}

async function retireStaff(id, name) {
  const retireDate = document.getElementById('f-retirement_date').value;
  if (!confirm(name + ' \u3092\u9000\u8077\u51E6\u7406\u3057\u307E\u3059\u304B\uFF1F')) return;
  const res = await fetch('/api/employees/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retirement_date: retireDate || new Date().toISOString().slice(0,10) })
  });
  if (!res.ok) { alert('\u9000\u8077\u65E5\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); return; }
  const res2 = await fetch('/api/employees/' + id, { method: 'DELETE' });
  if (res2.ok) { window.location.href = ADMIN_PATH + '/staff'; }
  else { alert('\u9000\u8077\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
}

async function reinstateStaff(id, name) {
  if (!confirm(name + ' \u3092\u5728\u7C4D\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F')) return;
  const res = await fetch('/api/employees/' + id + '/reinstate', { method: 'POST' });
  if (res.ok) { location.reload(); }
  else { alert('\u5FA9\u5E30\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
}

async function purgeStaff(id, name) {
  if (!confirm('\u300C' + name + '\u300D\u3092\u5B8C\u5168\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\\n\u30B7\u30D5\u30C8\u30FB\u58F2\u4E0A\u30FB\u9762\u8AC7\u8A18\u9332\u306A\u3069\u3059\u3079\u3066\u524A\u9664\u3055\u308C\u307E\u3059\u3002\\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002')) return;
  const res = await fetch('/api/employees/' + id + '/purge', { method: 'DELETE' });
  if (res.ok) { window.location.href = ADMIN_PATH + '/staff'; }
  else { alert('\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F'); }
}

// \u521D\u671F\u5316\u6642\u306B\u6642\u9593\u9078\u629E\u80A2\u3092\u66F4\u65B0
updateStartTimes();
<\/script>`;
}
__name(staffForm, "staffForm");
var admin_staff_default = app3;

// src/routes/api/shift.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app4 = new Hono2();
app4.post("/", async (c) => {
  const body = await c.req.json();
  const { emp_id, date } = body;
  if (!emp_id || !date)
    return c.json({ error: "\u5FC5\u9808\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ error: "\u65E5\u4ED8\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u30A8\u30E9\u30FC" }, 400);
  const entry_am = body.entry_am?.trim() || null;
  const entry_pm = body.entry_pm?.trim() || null;
  const coach_id = body.coach_id != null && !isNaN(Number(body.coach_id)) ? Number(body.coach_id) : null;
  await c.env.DB.prepare(`
    INSERT INTO shift_entries (emp_id, date, entry_am, entry_pm, coach_id, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      entry_am  = excluded.entry_am,
      entry_pm  = excluded.entry_pm,
      coach_id  = excluded.coach_id,
      updated_at = datetime('now', 'localtime')
  `).bind(emp_id, date, entry_am, entry_pm, coach_id).run();
  return c.json({ ok: true });
});
app4.get("/period", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.json({ error: "\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  const { getShiftDisplayRange: getShiftDisplayRange2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
  const { dates } = getShiftDisplayRange2(year, month);
  const rows = await c.env.DB.prepare(`
    SELECT emp_id, date, entry_am, entry_pm, coach_id
    FROM shift_entries WHERE date >= ? AND date <= ?
    ORDER BY emp_id, date
  `).bind(dates[0], dates[dates.length - 1]).all();
  return c.json({ entries: rows.results, dates });
});
app4.post("/batch", async (c) => {
  const body = await c.req.json();
  if (!Array.isArray(body?.entries) || body.entries.length === 0) {
    return c.json({ error: "\u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  }
  const stmt = c.env.DB.prepare(`
    INSERT INTO shift_entries (emp_id, date, entry_am, entry_pm, coach_id, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      entry_am   = excluded.entry_am,
      entry_pm   = excluded.entry_pm,
      coach_id   = excluded.coach_id,
      updated_at = datetime('now', 'localtime')
  `);
  const ops = [];
  for (const e of body.entries) {
    if (!e.emp_id || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
      continue;
    const entry_am = (typeof e.entry_am === "string" ? e.entry_am.trim() : null) || null;
    const entry_pm = (typeof e.entry_pm === "string" ? e.entry_pm.trim() : null) || null;
    const coach_id = e.coach_id != null && !isNaN(Number(e.coach_id)) ? Number(e.coach_id) : null;
    ops.push(stmt.bind(e.emp_id, e.date, entry_am, entry_pm, coach_id));
  }
  if (ops.length === 0)
    return c.json({ error: "\u6709\u52B9\u306A\u30A8\u30F3\u30C8\u30EA\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  await c.env.DB.batch(ops);
  return c.json({ ok: true, count: ops.length });
});
app4.get("/lock", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.json({ error: "\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  const lock = await c.env.DB.prepare(`
    SELECT admin_id, admin_name, locked_at, expires_at
    FROM shift_edit_locks WHERE year = ? AND month = ?
  `).bind(year, month).first();
  if (!lock)
    return c.json({ locked: false });
  if (new Date(lock.expires_at) < /* @__PURE__ */ new Date()) {
    await c.env.DB.prepare(`DELETE FROM shift_edit_locks WHERE year = ? AND month = ?`).bind(year, month).run();
    return c.json({ locked: false });
  }
  const adminId = c.get("adminId");
  if (lock.admin_id === adminId)
    return c.json({ locked: false });
  return c.json({ locked: true, admin_name: lock.admin_name, locked_at: lock.locked_at });
});
app4.post("/lock", async (c) => {
  const body = await c.req.json();
  const { year, month } = body;
  if (!year || !month)
    return c.json({ error: "\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  const adminId = c.get("adminId");
  const admin = await c.env.DB.prepare(`SELECT username FROM admins WHERE id = ?`).bind(adminId).first();
  if (!admin)
    return c.json({ error: "\u7BA1\u7406\u8005\u60C5\u5831\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093" }, 500);
  const now = /* @__PURE__ */ new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1e3);
  const existing = await c.env.DB.prepare(`
    SELECT admin_id, admin_name, expires_at FROM shift_edit_locks WHERE year = ? AND month = ?
  `).bind(year, month).first();
  if (existing && new Date(existing.expires_at) >= now && existing.admin_id !== adminId) {
    return c.json({ locked: true, admin_name: existing.admin_name });
  }
  await c.env.DB.prepare(`
    INSERT INTO shift_edit_locks (year, month, admin_id, admin_name, locked_at, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)
    ON CONFLICT(year, month) DO UPDATE SET
      admin_id   = excluded.admin_id,
      admin_name = excluded.admin_name,
      locked_at  = CASE WHEN admin_id = excluded.admin_id THEN locked_at ELSE excluded.locked_at END,
      expires_at = excluded.expires_at
  `).bind(year, month, adminId, admin.username, expires.toISOString()).run();
  return c.json({ ok: true });
});
app4.post("/lock-release", async (c) => {
  const body = await c.req.json();
  const { year, month } = body;
  const adminId = c.get("adminId");
  if (year && month) {
    await c.env.DB.prepare(`
      DELETE FROM shift_edit_locks WHERE year = ? AND month = ? AND admin_id = ?
    `).bind(year, month, adminId).run();
  }
  return c.json({ ok: true });
});
var shift_default = app4;

// src/routes/api/employees.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app5 = new Hono2();
app5.get("/", async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM employees WHERE is_active = 1 ORDER BY entry_type, seq_no, id
  `).all();
  return c.json({ employees: rows.results });
});
app5.post("/", async (c) => {
  const data = await c.req.json();
  if (!data.emp_no || !data.name) {
    return c.json({ error: "\u793E\u54E1\u756A\u53F7\u3068\u6C0F\u540D\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  }
  if (!/^\d{8}$/.test(data.emp_no)) {
    return c.json({ error: "\u793E\u54E1\u756A\u53F7\u306F8\u6841\u306E\u6570\u5B57\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400);
  }
  const VALID_SCHEDULES = ["a", "b", "B", "D", "H"];
  if (data.work_schedule && !VALID_SCHEDULES.includes(data.work_schedule)) {
    return c.json({ error: "\u52E4\u52D9\u4F53\u7CFB\u304C\u4E0D\u6B63\u3067\u3059" }, 400);
  }
  const VALID_ENROLLMENT = ["\u901A\u5E38", "\u80B2\u4F11", "\u75C5\u6B20", "\u50B7\u75C5"];
  if (data.enrollment_status && !VALID_ENROLLMENT.includes(data.enrollment_status)) {
    return c.json({ error: "\u5728\u7C4D\u72B6\u614B\u304C\u4E0D\u6B63\u3067\u3059" }, 400);
  }
  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO employees (emp_no, name, name_kana, division, team, locker_no, phone, entry_type,
        hire_date, birth_date, seq_no, work_schedule, start_time, car_no, enrollment_status,
        work_hours_type, is_caution, is_sales_followup, problem_notes, retirement_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.emp_no,
      data.name,
      data.name_kana ?? null,
      data.division ?? null,
      data.team ?? null,
      data.locker_no ?? null,
      data.phone ?? null,
      data.entry_type ?? "\u65B0\u5352",
      data.hire_date ?? null,
      data.birth_date ?? null,
      data.seq_no ?? null,
      data.work_schedule ?? null,
      data.start_time ?? null,
      data.car_no ?? null,
      data.enrollment_status ?? "\u901A\u5E38",
      data.work_hours_type ?? null,
      data.is_caution ?? 0,
      data.is_sales_followup ?? 0,
      data.problem_notes ?? null,
      data.retirement_date ?? null
    ).run();
    return c.json({ ok: true, id: result.meta.last_row_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return c.json({ error: `\u793E\u54E1\u756A\u53F7\u300C${data.emp_no}\u300D\u306F\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059` }, 400);
    }
    return c.json({ error: `\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${msg}` }, 500);
  }
});
app5.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const data = await c.req.json();
  const sets = [];
  const vals = [];
  if (data.name !== void 0) {
    sets.push("name = COALESCE(?, name)");
    vals.push(data.name);
  }
  if (data.name_kana !== void 0) {
    sets.push("name_kana = ?");
    vals.push(data.name_kana ?? null);
  }
  if (data.division !== void 0) {
    sets.push("division = ?");
    vals.push(data.division ?? null);
  }
  if (data.team !== void 0) {
    sets.push("team = ?");
    vals.push(data.team ?? null);
  }
  if (data.locker_no !== void 0) {
    sets.push("locker_no = ?");
    vals.push(data.locker_no ?? null);
  }
  if (data.phone !== void 0) {
    sets.push("phone = ?");
    vals.push(data.phone ?? null);
  }
  if (data.entry_type !== void 0) {
    sets.push("entry_type = COALESCE(?, entry_type)");
    vals.push(data.entry_type);
  }
  if (data.hire_date !== void 0) {
    sets.push("hire_date = ?");
    vals.push(data.hire_date ?? null);
  }
  if (data.first_duty_date !== void 0) {
    sets.push("first_duty_date = ?");
    vals.push(data.first_duty_date ?? null);
  }
  if (data.birth_date !== void 0) {
    sets.push("birth_date = ?");
    vals.push(data.birth_date ?? null);
  }
  if (data.seq_no !== void 0) {
    sets.push("seq_no = ?");
    vals.push(data.seq_no ?? null);
  }
  if (data.training_completed !== void 0) {
    sets.push("training_completed = ?");
    vals.push(data.training_completed);
  }
  if (data.status !== void 0) {
    sets.push("status = ?");
    vals.push(data.status);
  }
  if (data.interview_target !== void 0) {
    sets.push("interview_target = ?");
    vals.push(data.interview_target);
  }
  if (data.work_schedule !== void 0) {
    sets.push("work_schedule = ?");
    vals.push(data.work_schedule ?? null);
  }
  if (data.start_time !== void 0) {
    sets.push("start_time = ?");
    vals.push(data.start_time ?? null);
  }
  if (data.car_no !== void 0) {
    sets.push("car_no = ?");
    vals.push(data.car_no ?? null);
  }
  if (data.enrollment_status !== void 0) {
    sets.push("enrollment_status = ?");
    vals.push(data.enrollment_status ?? "\u901A\u5E38");
  }
  if (data.work_hours_type !== void 0) {
    sets.push("work_hours_type = ?");
    vals.push(data.work_hours_type ?? null);
  }
  if (data.is_caution !== void 0) {
    sets.push("is_caution = ?");
    vals.push(data.is_caution);
  }
  if (data.is_sales_followup !== void 0) {
    sets.push("is_sales_followup = ?");
    vals.push(data.is_sales_followup);
  }
  if (data.problem_notes !== void 0) {
    sets.push("problem_notes = ?");
    vals.push(data.problem_notes ?? null);
  }
  if (data.retirement_date !== void 0) {
    sets.push("retirement_date = ?");
    vals.push(data.retirement_date ?? null);
  }
  if (data.avg_return_time !== void 0) {
    sets.push("avg_return_time = ?");
    vals.push(data.avg_return_time ?? null);
  }
  if (sets.length === 0)
    return c.json({ ok: true });
  sets.push("updated_at = datetime('now', 'localtime')");
  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE employees SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...vals).run();
  return c.json({ ok: true });
});
app5.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare(
    "UPDATE employees SET is_active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(id).run();
  return c.json({ ok: true });
});
app5.post("/:id/reinstate", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare(
    "UPDATE employees SET is_active = 1, retirement_date = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(id).run();
  return c.json({ ok: true });
});
app5.post("/csv-import", async (c) => {
  const data = await c.req.json();
  if (!Array.isArray(data?.employees) || data.employees.length === 0) {
    return c.json({ error: "\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  }
  const valid = data.employees.filter(
    (emp) => emp.emp_no && emp.name && /^\d{8}$/.test(emp.emp_no)
  );
  if (valid.length === 0)
    return c.json({ error: "\u6709\u52B9\u306A\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093" }, 400);
  const inClause = valid.map((e) => `'${e.emp_no.replace(/'/g, "''")}'`).join(",");
  const existingRows = await c.env.DB.prepare(
    `SELECT emp_no FROM employees WHERE emp_no IN (${inClause})`
  ).all();
  const existingSet = new Set((existingRows.results ?? []).map((r) => r.emp_no));
  const toInsert = valid.filter((e) => !existingSet.has(e.emp_no));
  const toUpdate = valid.filter((e) => existingSet.has(e.emp_no));
  const statements = [];
  for (const emp of toInsert) {
    statements.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO employees
           (emp_no, name, name_kana, division, team, work_schedule, start_time, avg_return_time, used_cars)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        emp.emp_no,
        emp.name,
        emp.name_kana ?? null,
        emp.division ?? null,
        emp.team ?? null,
        emp.work_schedule ?? null,
        emp.start_time ?? null,
        emp.avg_return_time ?? null,
        emp.used_cars ?? null
      )
    );
  }
  for (const emp of toUpdate) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE employees SET
           name_kana       = COALESCE(?, name_kana),
           division        = COALESCE(?, division),
           team            = COALESCE(?, team),
           work_schedule   = COALESCE(?, work_schedule),
           start_time      = COALESCE(?, start_time),
           avg_return_time = COALESCE(?, avg_return_time),
           used_cars       = ?,
           updated_at      = datetime('now', 'localtime')
         WHERE emp_no = ?`
      ).bind(
        emp.name_kana ?? null,
        emp.division ?? null,
        emp.team ?? null,
        emp.work_schedule ?? null,
        emp.start_time ?? null,
        emp.avg_return_time ?? null,
        emp.used_cars ?? null,
        emp.emp_no
      )
    );
  }
  const CHUNK = 100;
  const errors = [];
  for (let i = 0; i < statements.length; i += CHUNK) {
    try {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    } catch (e) {
      errors.push(`batch[${i}\u2013${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return c.json({ ok: true, inserted: toInsert.length, updated: toUpdate.length, errors });
});
app5.delete("/:id/purge", async (c) => {
  const id = parseInt(c.req.param("id"));
  const tables = [
    "shift_entries",
    "sales_records",
    "bad_events",
    "new_employee_info",
    "invite_codes",
    "line_users",
    "interview_records"
  ];
  for (const table of tables) {
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE emp_id = ?`).bind(id).run();
  }
  await c.env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
var employees_default = app5;

// src/routes/api/sales.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();
var app6 = new Hono2();
app6.post("/", async (c) => {
  const data = await c.req.json();
  if (!data.emp_id || !data.date || data.amount === void 0) {
    return c.json({ error: "\u5FC5\u9808\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return c.json({ error: "\u65E5\u4ED8\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u30A8\u30E9\u30FC" }, 400);
  }
  const { year, month } = getPeriod(data.date);
  await c.env.DB.prepare(`
    INSERT INTO sales_records (emp_id, date, amount, ride_count, distance_km, period_year, period_month, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      amount = excluded.amount,
      ride_count = excluded.ride_count,
      distance_km = excluded.distance_km,
      period_year = excluded.period_year,
      period_month = excluded.period_month,
      updated_at = datetime('now', 'localtime')
  `).bind(
    data.emp_id,
    data.date,
    data.amount,
    data.ride_count ?? null,
    data.distance_km ?? null,
    year,
    month
  ).run();
  return c.json({ ok: true });
});
app6.delete("/:emp_id/:date", async (c) => {
  const empId = parseInt(c.req.param("emp_id"));
  const date = c.req.param("date");
  await c.env.DB.prepare(
    "DELETE FROM sales_records WHERE emp_id = ? AND date = ?"
  ).bind(empId, date).run();
  return c.json({ ok: true });
});
app6.get("/period", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.json({ error: "\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT s.*, e.name, e.emp_no, e.division, e.team
    FROM sales_records s
    JOIN employees e ON s.emp_id = e.id
    WHERE s.period_year = ? AND s.period_month = ?
    ORDER BY e.division, e.team, e.seq_no, s.date
  `).bind(year, month).all();
  return c.json({ records: rows.results });
});
app6.get("/summary", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.json({ error: "\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team,
      SUM(s.amount) as total_amount,
      SUM(s.ride_count) as total_rides,
      SUM(s.distance_km) as total_distance,
      COUNT(s.date) as working_days,
      AVG(s.amount) as avg_amount
    FROM employees e
    LEFT JOIN sales_records s ON e.id = s.emp_id AND s.period_year = ? AND s.period_month = ?
    WHERE e.is_active = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).bind(year, month).all();
  return c.json({ summary: rows.results });
});
app6.get("/csv", async (c) => {
  const year = parseInt(c.req.query("year") ?? "0");
  const month = parseInt(c.req.query("month") ?? "0");
  if (!year || !month)
    return c.text("\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3", 400);
  const { getPeriodRange: getPeriodRange2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
  const { start, end } = getPeriodRange2(year, month);
  const employees = await c.env.DB.prepare(
    "SELECT id, name, emp_no, division, team FROM employees WHERE is_active = 1 ORDER BY division, team, seq_no"
  ).all();
  const records = await c.env.DB.prepare(
    "SELECT emp_id, date, amount, ride_count, distance_km FROM sales_records WHERE period_year = ? AND period_month = ? ORDER BY emp_id, date"
  ).bind(year, month).all();
  const dates = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  const saleMap = {};
  for (const r of records.results ?? []) {
    saleMap[`${r.emp_id}_${r.date}`] = {
      amount: r.amount,
      rides: r.ride_count,
      dist: r.distance_km
    };
  }
  const header = ["\u8AB2", "\u73ED", "\u793E\u54E1\u756A\u53F7", "\u6C0F\u540D", ...dates.flatMap((d) => [`${d}_\u58F2\u4E0A`, `${d}_\u4E57\u8ECA`, `${d}_\u8DDD\u96E2`]), "\u6708\u8A08\u58F2\u4E0A", "\u6708\u8A08\u4E57\u8ECA", "\u6708\u8A08\u8DDD\u96E2"].join(",");
  const body = (employees.results ?? []).map((e) => {
    let totalAmt = 0, totalRides = 0, totalDist = 0;
    const cells = dates.flatMap((d) => {
      const s = saleMap[`${e.id}_${d}`];
      const amt = s?.amount ?? 0;
      const rides = s?.rides ?? 0;
      const dist = s?.dist ?? 0;
      totalAmt += amt;
      totalRides += rides;
      totalDist += dist;
      return [amt || "", rides || "", dist || ""];
    });
    return [e.division ?? "", e.team ?? "", e.emp_no, `"${e.name}"`, ...cells, totalAmt, totalRides, totalDist].join(",");
  }).join("\n");
  const csv = `\uFEFF${header}
${body}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales_${year}_${month}.csv"`
    }
  });
});
var sales_default = app6;

// src/routes/api/info.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app7 = new Hono2();
app7.put("/:id", async (c) => {
  const empId = parseInt(c.req.param("id"));
  const data = await c.req.json();
  await c.env.DB.prepare(`
    INSERT INTO new_employee_info
      (emp_id, hobbies, favorite_food, alcohol, alcohol_note, driving_skill, driving_note, mental_status, mental_note, other_notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id) DO UPDATE SET
      hobbies = excluded.hobbies,
      favorite_food = excluded.favorite_food,
      alcohol = excluded.alcohol,
      alcohol_note = excluded.alcohol_note,
      driving_skill = excluded.driving_skill,
      driving_note = excluded.driving_note,
      mental_status = excluded.mental_status,
      mental_note = excluded.mental_note,
      other_notes = excluded.other_notes,
      updated_at = datetime('now', 'localtime')
  `).bind(
    empId,
    data.hobbies || null,
    data.favorite_food || null,
    data.alcohol || null,
    data.alcohol_note || null,
    data.driving_skill || null,
    data.driving_note || null,
    data.mental_status || null,
    data.mental_note || null,
    data.other_notes || null
  ).run();
  return c.json({ ok: true });
});
var info_default = app7;

// src/routes/api/instructor.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app8 = new Hono2();
app8.post("/", async (c) => {
  const { instructor_id, date, entry, note } = await c.req.json();
  if (!instructor_id || !date) {
    return c.json({ error: "\u5FC5\u9808\u30D1\u30E9\u30E1\u30FC\u30BF\u4E0D\u8DB3" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "\u65E5\u4ED8\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u30A8\u30E9\u30FC" }, 400);
  }
  await c.env.DB.prepare(`
    INSERT INTO instructor_schedules (instructor_id, date, entry, note, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(instructor_id, date) DO UPDATE SET
      entry = excluded.entry,
      note = excluded.note,
      updated_at = datetime('now', 'localtime')
  `).bind(instructor_id, date, entry || null, note || null).run();
  return c.json({ ok: true });
});
var instructor_default = app8;

// src/routes/api/events.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app9 = new Hono2();
app9.post("/:id/memo", async (c) => {
  const id = parseInt(c.req.param("id"));
  const { memo } = await c.req.json();
  await c.env.DB.prepare(
    "UPDATE bad_events SET admin_memo = ? WHERE id = ?"
  ).bind(memo || null, id).run();
  return c.json({ ok: true });
});
app9.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM bad_events WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
app9.get("/by-emp/:empId", async (c) => {
  const empId = parseInt(c.req.param("empId"));
  const rows = await c.env.DB.prepare(
    "SELECT id, category, content, created_at FROM bad_events WHERE emp_id = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(empId).all();
  return c.json({ events: rows.results });
});
var events_default = app9;

// src/routes/api/line_api.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();
var app10 = new Hono2();
async function lineMulticast(token, uids, messages) {
  const batches = [];
  for (let i = 0; i < uids.length; i += 500)
    batches.push(uids.slice(i, i + 500));
  const results = await Promise.allSettled(batches.map(
    (batch) => fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: batch, messages })
    }).then((res) => {
      if (!res.ok)
        throw new Error(`LINE multicast failed: ${res.status}`);
    })
  ));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0)
    console.error(`LINE multicast: ${failed.length}/${batches.length} batches failed`, failed);
}
__name(lineMulticast, "lineMulticast");
app10.post("/invite", async (c) => {
  const { emp_id } = await c.req.json();
  if (!emp_id)
    return c.json({ error: "\u793E\u54E1ID\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  const emp = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ? AND is_active = 1").bind(emp_id).first();
  if (!emp)
    return c.json({ error: "\u793E\u54E1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO invite_codes (code, emp_id, expires_at) VALUES (?, ?, ?)"
  ).bind(code, emp_id, expiresAt).run();
  return c.json({ ok: true, code, expires_at: expiresAt });
});
app10.delete("/invite/:code", async (c) => {
  const code = c.req.param("code");
  await c.env.DB.prepare("DELETE FROM invite_codes WHERE code = ?").bind(code).run();
  return c.json({ ok: true });
});
app10.get("/announcements", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50"
  ).all();
  return c.json({ announcements: rows.results ?? [] });
});
app10.post("/announcements", async (c) => {
  const { title, message, target_type, target_data } = await c.req.json();
  if (!title || !message)
    return c.json({ error: "\u30BF\u30A4\u30C8\u30EB\u3068\u672C\u6587\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  if (!c.env.LINE_CHANNEL_ACCESS_TOKEN)
    return c.json({ error: "LINE\u672A\u8A2D\u5B9A" }, 500);
  let uids = [];
  if (target_type === "all") {
    const rows = await c.env.DB.prepare("SELECT line_uid FROM line_users").all();
    uids = (rows.results ?? []).map((u) => u.line_uid);
  } else if (target_type === "entry_month" && target_data) {
    const rows = await c.env.DB.prepare(`
      SELECT lu.line_uid FROM line_users lu
      JOIN employees e ON lu.emp_id = e.id
      WHERE e.hire_date LIKE ? AND e.is_active = 1
    `).bind(`${target_data}%`).all();
    uids = (rows.results ?? []).map((u) => u.line_uid);
  } else if (target_type === "individual" && target_data) {
    const empIds = target_data.split(",").map((s) => parseInt(s.trim())).filter(Boolean);
    if (empIds.length > 0) {
      const placeholders = empIds.map(() => "?").join(",");
      const rows = await c.env.DB.prepare(
        `SELECT line_uid FROM line_users WHERE emp_id IN (${placeholders})`
      ).bind(...empIds).all();
      uids = (rows.results ?? []).map((r) => r.line_uid);
    }
  }
  if (uids.length === 0) {
    await c.env.DB.prepare(
      "INSERT INTO announcements (title, message, target_type, target_data, sent_count) VALUES (?, ?, ?, ?, 0)"
    ).bind(title, message, target_type, target_data ?? null).run();
    return c.json({ ok: true, sent: 0, warning: "\u9001\u4FE1\u5BFE\u8C61\u306ELINE\u7D10\u4ED8\u304D\u793E\u54E1\u304C\u3044\u307E\u305B\u3093" });
  }
  const lineMessage = [{ type: "text", text: `\u{1F4E2} ${title}

${message}` }];
  await lineMulticast(c.env.LINE_CHANNEL_ACCESS_TOKEN, uids, lineMessage);
  await c.env.DB.prepare(
    "INSERT INTO announcements (title, message, target_type, target_data, sent_count) VALUES (?, ?, ?, ?, ?)"
  ).bind(title, message, target_type, target_data ?? null, uids.length).run();
  return c.json({ ok: true, sent: uids.length });
});
app10.post("/survey", async (c) => {
  const { title, url } = await c.req.json();
  if (!title || !url)
    return c.json({ error: "\u30BF\u30A4\u30C8\u30EB\u3068URL\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error();
  } catch {
    return c.json({ error: "\u6709\u52B9\u306AURL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044" }, 400);
  }
  if (!c.env.LINE_CHANNEL_ACCESS_TOKEN)
    return c.json({ error: "LINE\u672A\u8A2D\u5B9A" }, 500);
  const users = await c.env.DB.prepare("SELECT line_uid FROM line_users").all();
  await c.env.DB.prepare(
    "INSERT INTO survey_logs (title, url, target_type) VALUES (?, ?, ?)"
  ).bind(title, url, "all").run();
  const messages = [
    { type: "text", text: `\u{1F4CB} \u30A2\u30F3\u30B1\u30FC\u30C8\u306E\u304A\u9858\u3044

\u300C${title}\u300D

\u3054\u56DE\u7B54\u3092\u304A\u9858\u3044\u3057\u307E\u3059\u3002
${url}` }
  ];
  const uids = (users.results ?? []).map((u) => u.line_uid);
  await lineMulticast(c.env.LINE_CHANNEL_ACCESS_TOKEN, uids, messages);
  return c.json({ ok: true, sent: uids.length });
});
var line_api_default = app10;

// src/routes/api/schedule_types.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app11 = new Hono2();
app11.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM schedule_types ORDER BY sort_order, id"
  ).all();
  return c.json({ types: rows.results });
});
app11.post("/", async (c) => {
  const { code, color, sort_order } = await c.req.json();
  if (!code?.trim())
    return c.json({ error: "\u533A\u5206\u540D\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  try {
    const r = await c.env.DB.prepare(
      "INSERT INTO schedule_types (code, color, sort_order) VALUES (?, ?, ?)"
    ).bind(code.trim(), color ?? "#f3f4f6", sort_order ?? 99).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return c.json({ error: "\u3059\u3067\u306B\u540C\u3058\u533A\u5206\u540D\u304C\u5B58\u5728\u3057\u307E\u3059" }, 409);
  }
});
app11.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const hasTarget = "target" in body;
  const targetSql = hasTarget ? ", target = ?" : "";
  const params = [
    body.code ?? null,
    body.color ?? null,
    body.sort_order ?? null,
    body.is_active ?? null
  ];
  if (hasTarget)
    params.push(body.target ?? null);
  params.push(id);
  await c.env.DB.prepare(
    `UPDATE schedule_types SET
      code = COALESCE(?, code),
      color = COALESCE(?, color),
      sort_order = COALESCE(?, sort_order),
      is_active = COALESCE(?, is_active)
      ${targetSql}
     WHERE id = ?`
  ).bind(...params).run();
  return c.json({ ok: true });
});
app11.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM schedule_types WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
var schedule_types_default = app11;

// src/routes/api/interviews.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app12 = new Hono2();
var FIELDS = [
  "chk_mental_exp",
  "chk_mental_stress",
  "chk_mental_family",
  "chk_life_sleep",
  "chk_life_appetite",
  "chk_life_health",
  "chk_work_motivation",
  "chk_work_instructor",
  "chk_work_rules",
  "chk_money",
  "chk_relation",
  "chk_appearance",
  "chk_attendance",
  "chk_future"
];
app12.get("/by-emp/:empId", async (c) => {
  const empId = parseInt(c.req.param("empId"));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM interview_records WHERE emp_id = ? ORDER BY interview_date DESC"
  ).bind(empId).all();
  return c.json({ records: rows.results });
});
app12.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM interview_records WHERE id = ?").bind(id).first();
  if (!row)
    return c.json({ error: "\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  return c.json(row);
});
app12.post("/", async (c) => {
  const data = await c.req.json();
  if (!data.emp_id || !data.interview_date)
    return c.json({ error: "\u5FC5\u9808\u9805\u76EE\u4E0D\u8DB3" }, 400);
  const cols = [
    "emp_id",
    "interview_date",
    "next_interview_date",
    "interviewer",
    ...FIELDS.flatMap((f) => [f, f + "_note"]),
    "concerns",
    "followup_plan",
    "employee_comment"
  ];
  const vals = cols.map((k) => data[k] ?? null);
  const r = await c.env.DB.prepare(
    `INSERT INTO interview_records (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
  ).bind(...vals).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});
app12.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const data = await c.req.json();
  const cols = [
    "interview_date",
    "next_interview_date",
    "interviewer",
    ...FIELDS.flatMap((f) => [f, f + "_note"]),
    "concerns",
    "followup_plan",
    "employee_comment"
  ];
  const sets = cols.map((k) => `${k} = ?`).join(", ");
  const vals = [...cols.map((k) => data[k] ?? null), id];
  await c.env.DB.prepare(
    `UPDATE interview_records SET ${sets}, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(...vals).run();
  return c.json({ ok: true });
});
app12.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM interview_records WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
var interviews_default = app12;

// src/routes/api/coaches.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app13 = new Hono2();
app13.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM coaches WHERE is_active = 1 ORDER BY sort_order, id"
  ).all();
  return c.json({ coaches: rows.results });
});
app13.post("/", async (c) => {
  const { name, sort_order } = await c.req.json();
  if (!name?.trim())
    return c.json({ error: "\u540D\u524D\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO coaches (name, sort_order) VALUES (?, ?)"
  ).bind(name.trim(), sort_order ?? 0).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});
app13.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const data = await c.req.json();
  const sets = [];
  const vals = [];
  if (data.name !== void 0) {
    sets.push("name = ?");
    vals.push(data.name.trim());
  }
  if (data.sort_order !== void 0) {
    sets.push("sort_order = ?");
    vals.push(data.sort_order);
  }
  if (data.is_active !== void 0) {
    sets.push("is_active = ?");
    vals.push(data.is_active);
  }
  if (sets.length === 0)
    return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE coaches SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});
app13.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("UPDATE coaches SET is_active = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
var coaches_default = app13;

// src/routes/api/instructors.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app14 = new Hono2();
app14.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM instructors ORDER BY sort_order, id"
  ).all();
  return c.json({ instructors: rows.results });
});
app14.post("/", async (c) => {
  const { name, role, sort_order } = await c.req.json();
  if (!name?.trim())
    return c.json({ error: "\u540D\u524D\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO instructors (name, role, sort_order) VALUES (?, ?, ?)"
  ).bind(name.trim(), role?.trim() || null, sort_order ?? 0).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});
app14.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const data = await c.req.json();
  const sets = [];
  const vals = [];
  if (data.name !== void 0) {
    sets.push("name = ?");
    vals.push(data.name.trim());
  }
  if (data.role !== void 0) {
    sets.push("role = ?");
    vals.push(data.role?.trim() || null);
  }
  if (data.sort_order !== void 0) {
    sets.push("sort_order = ?");
    vals.push(data.sort_order);
  }
  if (data.is_active !== void 0) {
    sets.push("is_active = ?");
    vals.push(data.is_active);
  }
  if (sets.length === 0)
    return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE instructors SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});
app14.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("UPDATE instructors SET is_active = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
var instructors_default = app14;

// src/routes/api/period_settings.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();
var app15 = new Hono2();
app15.get("/", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM period_settings ORDER BY month").all();
  return c.json({ settings: rows.results });
});
app15.post("/", async (c) => {
  const { month, close_day, start_day } = await c.req.json();
  if (!month || month < 1 || month > 12)
    return c.json({ error: "\u7121\u52B9\u306A\u6708\u5EA6" }, 400);
  if (!close_day || close_day < 1 || close_day > 31)
    return c.json({ error: "\u7121\u52B9\u306A\u7DE0\u3081\u65E5" }, 400);
  if (!start_day || start_day < 1 || start_day > 31)
    return c.json({ error: "\u7121\u52B9\u306A\u958B\u59CB\u65E5" }, 400);
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO period_settings (month, close_day, start_day) VALUES (?, ?, ?)"
  ).bind(month, close_day, start_day).run();
  invalidatePeriodSettingsCache();
  return c.json({ ok: true });
});
var period_settings_default = app15;

// src/routes/api/notifications.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var app16 = new Hono2();
app16.get("/", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM notification_settings ORDER BY type").all();
  return c.json({ settings: rows.results });
});
app16.put("/:type", async (c) => {
  const type = c.req.param("type");
  const data = await c.req.json();
  const sets = [];
  const vals = [];
  if (data.send_hour !== void 0) {
    sets.push("send_hour = ?");
    vals.push(data.send_hour);
  }
  if (data.send_minute !== void 0) {
    sets.push("send_minute = ?");
    vals.push(data.send_minute);
  }
  if (data.is_enabled !== void 0) {
    sets.push("is_enabled = ?");
    vals.push(data.is_enabled);
  }
  if (sets.length === 0)
    return c.json({ ok: true });
  sets.push("updated_at = datetime('now','localtime')");
  vals.push(type);
  await c.env.DB.prepare(`UPDATE notification_settings SET ${sets.join(", ")} WHERE type = ?`).bind(...vals).run();
  return c.json({ ok: true });
});
app16.post("/reset", async (c) => {
  const body = await c.req.json();
  if (body.type) {
    await c.env.DB.prepare("UPDATE notification_settings SET last_sent_date = NULL WHERE type = ?").bind(body.type).run();
  } else {
    await c.env.DB.prepare("UPDATE notification_settings SET last_sent_date = NULL").run();
  }
  return c.json({ ok: true });
});
app16.post("/send", async (c) => {
  const { type } = await c.req.json();
  if (!type)
    return c.json({ error: "type \u306F\u5FC5\u9808\u3067\u3059" }, 400);
  const { runNotification: runNotification2 } = await Promise.resolve().then(() => (init_cron(), cron_exports));
  await runNotification2(c.env, type);
  return c.json({ ok: true });
});
var notifications_default = app16;

// src/routes/api/instructor_invite.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();
var app17 = new Hono2();
app17.post("/", async (c) => {
  const { instructor_id } = await c.req.json();
  if (!instructor_id)
    return c.json({ error: "instructor_id \u306F\u5FC5\u9808\u3067\u3059" }, 400);
  const inst = await c.env.DB.prepare("SELECT id, name FROM instructors WHERE id = ? AND is_active = 1").bind(instructor_id).first();
  if (!inst)
    return c.json({ error: "\u6307\u5B9A\u3055\u308C\u305F\u73ED\u9577\u30FB\u6307\u5C0E\u8005\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  await c.env.DB.prepare("DELETE FROM invite_codes WHERE instructor_id = ? AND is_used = 0").bind(instructor_id).run();
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO invite_codes (code, instructor_id, expires_at) VALUES (?, ?, ?)"
  ).bind(code, instructor_id, expiresAt).run();
  return c.json({ ok: true, code, expires_at: expiresAt });
});
app17.delete("/:instructorId", async (c) => {
  const instructorId = parseInt(c.req.param("instructorId"));
  await c.env.DB.prepare("UPDATE instructors SET line_uid = NULL WHERE id = ?").bind(instructorId).run();
  return c.json({ ok: true });
});
var instructor_invite_default = app17;

// src/line_bot.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
init_auth();
async function searchVehicles(db, query) {
  const result = await db.prepare(`
    SELECT v.*, o.phone AS office_phone,
      CASE WHEN CAST(v.radio_no AS TEXT) = ? THEN 0 ELSE 1 END AS _sort
    FROM vehicles v
    LEFT JOIN offices o ON o.name = v.office2
    WHERE CAST(v.radio_no AS TEXT) = ? OR v.plate_num = ?
    ORDER BY _sort
    LIMIT 10
  `).bind(query, query, query).all();
  return result.results ?? [];
}
__name(searchVehicles, "searchVehicles");
function formatVehicleResults(query, vehicles) {
  if (vehicles.length === 0) {
    return `\u{1F50D} \u300C${query}\u300D\u306E\u691C\u7D22\u7D50\u679C

\u8A72\u5F53\u3059\u308B\u8ECA\u4E21\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002`;
  }
  const lines = [`\u{1F50D} \u300C${query}\u300D\u306E\u691C\u7D22\u7D50\u679C\uFF08${vehicles.length}\u4EF6\uFF09`];
  for (const v of vehicles) {
    const isRadioMatch = v.radio_no != null && String(v.radio_no) === query;
    const label = isRadioMatch ? "\u3010\u7121\u7DDA\u756A\u53F7\u4E00\u81F4\u3011" : "\u3010\u30CA\u30F3\u30D0\u30FC\u4E00\u81F4\u3011";
    lines.push("");
    lines.push(`\u2501\u2501 ${label} \u2501\u2501`);
    if (v.radio_no != null)
      lines.push(`\u7121\u7DDA\u756A\u53F7: ${v.radio_no}`);
    if (v.plate_no)
      lines.push(`\u8ECA\u4E21\u756A\u53F7: ${v.plate_no}`);
    if (v.car_type)
      lines.push(`\u8ECA\u7A2E: ${v.car_type}`);
    if (v.office)
      lines.push(`\u55B6\u696D\u6240: ${v.office}`);
    if (v.division)
      lines.push(`\u8AB2: ${v.division}`);
  }
  return lines.join("\n");
}
__name(formatVehicleResults, "formatVehicleResults");
async function getState(db, lineUid) {
  const row = await db.prepare(
    "SELECT state, data FROM line_conv_states WHERE line_uid = ?"
  ).bind(lineUid).first();
  return {
    state: row?.state ?? "idle",
    data: row?.data ? JSON.parse(row.data) : {}
  };
}
__name(getState, "getState");
async function setState(db, lineUid, state, data = {}) {
  await db.prepare(`
    INSERT INTO line_conv_states (line_uid, state, data, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(line_uid) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at
  `).bind(lineUid, state, JSON.stringify(data)).run();
}
__name(setState, "setState");
async function reply(token, accessToken, messages) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken: token, messages })
  });
}
__name(reply, "reply");
var text = /* @__PURE__ */ __name((msg) => ({ type: "text", text: msg }), "text");
async function assignRichMenu(userId, richMenuId, accessToken) {
  if (!richMenuId)
    return;
  await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
__name(assignRichMenu, "assignRichMenu");
async function removeRichMenu(userId, accessToken) {
  await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
__name(removeRichMenu, "removeRichMenu");
var textWithQuickReply = /* @__PURE__ */ __name((msg, items) => ({
  type: "text",
  text: msg,
  quickReply: {
    items: items.map((i) => ({
      type: "action",
      action: { type: "message", label: i.label, text: i.text }
    }))
  }
}), "textWithQuickReply");
function todayJST() {
  const now = /* @__PURE__ */ new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1e3);
  return jst.toISOString().split("T")[0];
}
__name(todayJST, "todayJST");
async function handleLineEvent(env, event) {
  const lineUid = event.source?.userId;
  if (!lineUid)
    return;
  const replyToken = event.replyToken;
  const at = env.LINE_CHANNEL_ACCESS_TOKEN;
  const [vehicleSearchAdmin, instructor] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM vehicle_search_admins WHERE line_uid = ?").bind(lineUid).first(),
    env.DB.prepare("SELECT id, name FROM instructors WHERE line_uid = ? AND is_active = 1").bind(lineUid).first()
  ]);
  const canVehicleSearch = !!vehicleSearchAdmin || !!instructor;
  if (instructor || vehicleSearchAdmin) {
    if (event.type === "message" && event.message?.type === "text") {
      const inputText2 = (event.message?.text ?? "").trim();
      if (inputText2 === "\u308C\u3093\u3051\u3044\u304B\u3044\u3058\u3087") {
        if (instructor) {
          await env.DB.prepare("UPDATE instructors SET line_uid = NULL, can_vehicle_search = 0 WHERE id = ?").bind(instructor.id).run();
          await env.DB.prepare("DELETE FROM line_conv_states WHERE line_uid = ?").bind(lineUid).run();
        } else if (vehicleSearchAdmin) {
          await env.DB.prepare("DELETE FROM vehicle_search_admins WHERE id = ?").bind(vehicleSearchAdmin.id).run();
        }
        await removeRichMenu(lineUid, at);
        await reply(replyToken, at, [text("LINE\u9023\u643A\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002")]);
      } else if (inputText2 === "\u8ECA\u756A\u691C\u7D22") {
        await reply(replyToken, at, [text("\u691C\u7D22\u3057\u305F\u3044\u7121\u7DDA\u756A\u53F7\u307E\u305F\u306F\u30CA\u30F3\u30D0\u30FC\u306E\u6570\u5B57\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\u4F8B\uFF09\u300C1988\u300D")]);
      } else if (/^\d{1,6}$/.test(inputText2)) {
        if (canVehicleSearch) {
          const vehicles = await searchVehicles(env.DB, inputText2);
          await reply(replyToken, at, [text(formatVehicleResults(inputText2, vehicles))]);
        } else {
          await reply(replyToken, at, [text("\u8ECA\u756A\u691C\u7D22\u3092\u5229\u7528\u3059\u308B\u306B\u306F\u3001\u7BA1\u7406\u8005\u306B\u6A29\u9650\u4ED8\u4E0E\u3092\u4F9D\u983C\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
        }
      } else if (inputText2 === "UID" || inputText2 === "uid") {
        await reply(replyToken, at, [text(`\u3042\u306A\u305F\u306ELINE UID:
${lineUid}`)]);
      } else if (canVehicleSearch) {
        await reply(replyToken, at, [text("\u6570\u5B57\u3092\u9001\u4FE1\u3059\u308B\u3068\u8ECA\u4E21\u60C5\u5831\u3092\u691C\u7D22\u3057\u307E\u3059\u3002\n\u4F8B\uFF09\u300C6677\u300D")]);
      }
    }
    return;
  }
  const VEHICLE_LINK_PASSWORD = "km5931#!";
  const rawMsg = event.type === "message" && event.message?.type === "text" ? (event.message?.text ?? "").trim() : "";
  if (rawMsg === "\u8ECA\u756A\u9023\u643A") {
    await setState(env.DB, lineUid, "vehicle_link_name");
    await reply(replyToken, at, [text("\u3042\u306A\u305F\u306E\u540D\u524D\u3092\u6F22\u5B57\u30D5\u30EB\u30CD\u30FC\u30E0\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
    return;
  }
  const linkConv = await getState(env.DB, lineUid);
  if (linkConv.state.startsWith("vehicle_link_")) {
    if (linkConv.state === "vehicle_link_name") {
      await setState(env.DB, lineUid, "vehicle_link_password", { name: rawMsg });
      await reply(replyToken, at, [text("\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
      return;
    }
    if (linkConv.state === "vehicle_link_password") {
      const name = String(linkConv.data.name ?? "");
      if (rawMsg === VEHICLE_LINK_PASSWORD) {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO vehicle_search_admins (name, line_uid) VALUES (?, ?)"
        ).bind(name, lineUid).run();
        await setState(env.DB, lineUid, "idle");
        await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN2 ?? "", at);
        await reply(replyToken, at, [text(`${name}\u3055\u3093\u306E\u8ECA\u756A\u691C\u7D22\u6A29\u9650\u304C\u767B\u9332\u3055\u308C\u307E\u3057\u305F\u3002
\u6570\u5B57\u3092\u9001\u4FE1\u3059\u308B\u3068\u8ECA\u4E21\u60C5\u5831\u3092\u691C\u7D22\u3067\u304D\u307E\u3059\u3002
\u4F8B\uFF09\u300C6677\u300D`)]);
      } else {
        await setState(env.DB, lineUid, "idle");
        await reply(replyToken, at, [text("\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002\u6700\u521D\u304B\u3089\u3084\u308A\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
      }
      return;
    }
  }
  const lineUser = await env.DB.prepare(
    "SELECT emp_id FROM line_users WHERE line_uid = ?"
  ).bind(lineUid).first();
  if (!lineUser) {
    if (event.type === "message" && event.message?.type === "text") {
      const inputCode = (event.message?.text ?? "").trim().toUpperCase();
      if (inputCode === "UID" || inputCode === "LINEID") {
        await reply(replyToken, at, [text(`\u3042\u306A\u305F\u306ELINE UID:
${lineUid}

\u7BA1\u7406\u8005\u306B\u4F1D\u3048\u3066LINE\u7BA1\u7406\u8005\u3068\u3057\u3066\u767B\u9332\u3057\u3066\u3082\u3089\u3063\u3066\u304F\u3060\u3055\u3044\u3002`)]);
        return;
      }
      const invite = await env.DB.prepare(
        "SELECT id, emp_id, instructor_id, expires_at FROM invite_codes WHERE code = ? AND is_used = 0"
      ).bind(inputCode).first();
      if (invite && invite.expires_at > (/* @__PURE__ */ new Date()).toISOString()) {
        await env.DB.prepare(
          "UPDATE invite_codes SET is_used = 1, used_at = datetime('now', 'localtime') WHERE id = ?"
        ).bind(invite.id).run();
        if (invite.instructor_id) {
          await env.DB.prepare(
            "UPDATE instructors SET line_uid = ? WHERE id = ?"
          ).bind(lineUid, invite.instructor_id).run();
          const inst = await env.DB.prepare("SELECT name FROM instructors WHERE id = ?").bind(invite.instructor_id).first();
          const instName = inst?.name ?? "";
          await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN2 ?? "", at);
          await reply(replyToken, at, [text(
            `\u2728 ${instName}\u3055\u3093\u3001ITABASHI\u3078\u3088\u3046\u3053\u305D\uFF01

\u983C\u308C\u308B\u7BA1\u7406\u30B9\u30BF\u30C3\u30D5\u3068\u3057\u3066\u767B\u9332\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u{1F3AF}
\u30B7\u30D5\u30C8\u72B6\u6CC1\u3084\u51FA\u52E4\u30EC\u30DD\u30FC\u30C8\u3092\u304A\u5C4A\u3051\u3057\u307E\u3059\u3002
\u3088\u308D\u3057\u304F\u304A\u9858\u3044\u3057\u307E\u3059\uFF01`
          )]);
        } else if (invite.emp_id) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO line_users (line_uid, emp_id) VALUES (?, ?)"
          ).bind(lineUid, invite.emp_id).run();
          const emp = await env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(invite.emp_id).first();
          const empName = emp?.name ?? "";
          await assignRichMenu(lineUid, env.RICHMENU_ID_PATTERN1 ?? "", at);
          await reply(replyToken, at, [text(
            `\u{1F389} ${empName}\u3055\u3093\u3001ITABASHI\u3078\u3088\u3046\u3053\u305D\uFF01

\u56F0\u3063\u305F\u3053\u3068\u30FB\u5ACC\u306A\u3053\u3068\u304C\u3042\u308C\u3070
\u3044\u3064\u3067\u3082\u6C17\u8EFD\u306B\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002
\u3042\u306A\u305F\u306E\u3053\u3068\u3092\u3057\u3063\u304B\u308A\u30B5\u30DD\u30FC\u30C8\u3057\u307E\u3059\u{1F4AA}`
          )]);
        }
      } else {
        await reply(replyToken, at, [text("\u62DB\u5F85\u30B3\u30FC\u30C9\u304C\u6B63\u3057\u304F\u306A\u3044\u304B\u3001\u6709\u52B9\u671F\u9650\u5207\u308C\u3067\u3059\u3002\n\u7BA1\u7406\u8005\u306B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
      }
    }
    return;
  }
  const empId = lineUser.emp_id;
  let { state, data } = await getState(env.DB, lineUid);
  if (event.type !== "message" && event.type !== "postback")
    return;
  let inputText = "";
  if (event.type === "message" && event.message?.type === "text") {
    inputText = (event.message?.text ?? "").trim();
  }
  if (event.type === "postback") {
    inputText = event.postback?.data ?? "";
  }
  if (inputText === "\u30AD\u30E3\u30F3\u30BB\u30EB" || inputText === "cancel") {
    await setState(env.DB, lineUid, "idle");
    await reply(replyToken, at, [text("\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002")]);
    return;
  }
  const MENU_CMDS = ["\u58F2\u4E0A\u8A18\u9332", "\u58F2\u4E0A\u3092\u8A18\u9332", "\u5ACC\u306A\u3053\u3068\u5831\u544A", "\u5831\u544A", "\u30B7\u30D5\u30C8\u78BA\u8A8D"];
  if (state !== "idle" && MENU_CMDS.includes(inputText)) {
    await setState(env.DB, lineUid, "idle");
    state = "idle";
    data = {};
  }
  if (inputText === "\u308C\u3093\u3051\u3044\u304B\u3044\u3058\u3087") {
    await env.DB.prepare("DELETE FROM line_users WHERE line_uid = ?").bind(lineUid).run();
    await env.DB.prepare("DELETE FROM line_conv_states WHERE line_uid = ?").bind(lineUid).run();
    await removeRichMenu(lineUid, at);
    await reply(replyToken, at, [text("LINE\u9023\u643A\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002\n\u518D\u5EA6\u5229\u7528\u3059\u308B\u5834\u5408\u306F\u62DB\u5F85\u30B3\u30FC\u30C9\u3092\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002")]);
    return;
  }
  if (state === "idle") {
    if (inputText === "\u58F2\u4E0A\u8A18\u9332" || inputText === "\u58F2\u4E0A\u3092\u8A18\u9332") {
      const today = todayJST();
      const existing = await env.DB.prepare(
        "SELECT amount FROM sales_records WHERE emp_id = ? AND date = ?"
      ).bind(empId, today).first();
      if (existing) {
        await setState(env.DB, lineUid, "sales_confirm_overwrite", { date: today, prev: existing.amount });
        await reply(replyToken, at, [textWithQuickReply(
          `\u4ECA\u65E5(${today})\u306F\u3059\u3067\u306B ${existing.amount.toLocaleString("ja-JP")}\u5186 \u304C\u8A18\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002
\u4E0A\u66F8\u304D\u3057\u307E\u3059\u304B\uFF1F`,
          [{ label: "\u4E0A\u66F8\u304D\u3059\u308B", text: "\u4E0A\u66F8\u304D" }, { label: "\u30AD\u30E3\u30F3\u30BB\u30EB", text: "\u30AD\u30E3\u30F3\u30BB\u30EB" }]
        )]);
      } else {
        await setState(env.DB, lineUid, "sales_amount", { date: today });
        await reply(replyToken, at, [text(`\u4ECA\u65E5(${today})\u306E\u58F2\u4E0A\u91D1\u984D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002
\uFF08\u5186\u3002\u4F8B: 18500\uFF09`)]);
      }
      return;
    }
    if (inputText === "\u5ACC\u306A\u3053\u3068\u5831\u544A" || inputText === "\u5831\u544A") {
      await setState(env.DB, lineUid, "event_category");
      await reply(replyToken, at, [textWithQuickReply(
        "\u5831\u544A\u306E\u30AB\u30C6\u30B4\u30EA\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002",
        [
          { label: "\u30AF\u30EC\u30FC\u30DE\u30FC", text: "\u30AF\u30EC\u30FC\u30DE\u30FC" },
          { label: "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB", text: "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB" },
          { label: "\u793E\u5185\u306E\u51FA\u6765\u4E8B", text: "\u793E\u5185\u306E\u51FA\u6765\u4E8B" },
          { label: "\u305D\u306E\u4ED6", text: "\u305D\u306E\u4ED6" }
        ]
      )]);
      return;
    }
    if (inputText === "\u30B7\u30D5\u30C8\u78BA\u8A8D") {
      const today = todayJST();
      const { getPeriod: getPeriod2, getPeriodRange: getPeriodRange2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
      const { year, month } = getPeriod2(today);
      const { start, end } = getPeriodRange2(year, month);
      const shifts = await env.DB.prepare(
        "SELECT date, entry_main FROM shift_entries WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date"
      ).bind(empId, start, end).all();
      const WEEKDAY = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
      let msg = `\u{1F4C5} ${year}\u5E74${month}\u6708\u5EA6\u306E\u30B7\u30D5\u30C8
`;
      msg += `\uFF08${start}\u301C${end}\uFF09

`;
      const shiftMap = {};
      for (const s of shifts.results ?? []) {
        shiftMap[s.date] = s.entry_main ?? "";
      }
      const cur = new Date(today);
      const endDate = new Date(end);
      let count = 0;
      while (cur <= endDate && count < 14) {
        const d = cur.toISOString().split("T")[0];
        const dt = new Date(d);
        const dow = WEEKDAY[dt.getUTCDay()];
        const entry = shiftMap[d] ?? "";
        if (entry) {
          msg += `${d.slice(5)} (${dow}): ${entry}
`;
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (count === 0)
        msg += "\uFF08\u307E\u3060\u30B7\u30D5\u30C8\u304C\u5165\u529B\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF09";
      await reply(replyToken, at, [text(msg)]);
      return;
    }
    await reply(replyToken, at, [textWithQuickReply(
      "\u30EA\u30C3\u30C1\u30E1\u30CB\u30E5\u30FC\u304B\u3089\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u3002",
      [
        { label: "\u58F2\u4E0A\u8A18\u9332", text: "\u58F2\u4E0A\u8A18\u9332" },
        { label: "\u5ACC\u306A\u3053\u3068\u5831\u544A", text: "\u5ACC\u306A\u3053\u3068\u5831\u544A" },
        { label: "\u30B7\u30D5\u30C8\u78BA\u8A8D", text: "\u30B7\u30D5\u30C8\u78BA\u8A8D" }
      ]
    )]);
    return;
  }
  if (state === "sales_confirm_overwrite") {
    if (inputText === "\u4E0A\u66F8\u304D") {
      await setState(env.DB, lineUid, "sales_amount", { date: data.date });
      await reply(replyToken, at, [text(`\u58F2\u4E0A\u91D1\u984D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002
\uFF08\u5186\u3002\u4F8B: 18500\uFF09`)]);
    } else {
      await setState(env.DB, lineUid, "idle");
      await reply(replyToken, at, [text("\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002")]);
    }
    return;
  }
  if (state === "sales_amount") {
    const amount = parseInt(inputText.replace(/[^0-9]/g, ""));
    if (isNaN(amount) || amount < 0 || amount > 999999) {
      await reply(replyToken, at, [text("\u91D1\u984D\u3092\u6B63\u3057\u304F\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08\u4F8B: 18500\uFF09")]);
      return;
    }
    await setState(env.DB, lineUid, "sales_rides", { ...data, amount });
    await reply(replyToken, at, [text("\u4E57\u8ECA\u56DE\u6570\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08\u4F8B: 8\uFF09")]);
    return;
  }
  if (state === "sales_rides") {
    const rides = parseInt(inputText.replace(/[^0-9]/g, ""));
    if (isNaN(rides) || rides < 0 || rides > 999) {
      await reply(replyToken, at, [text("\u4E57\u8ECA\u56DE\u6570\u3092\u6B63\u3057\u304F\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08\u4F8B: 8\uFF09")]);
      return;
    }
    await setState(env.DB, lineUid, "sales_distance", { ...data, ride_count: rides });
    await reply(replyToken, at, [text("\u8D70\u884C\u8DDD\u96E2\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08km\u3002\u4F8B: 120\uFF09")]);
    return;
  }
  if (state === "sales_distance") {
    const dist = parseInt(inputText.replace(/[^0-9]/g, ""));
    if (isNaN(dist) || dist < 0 || dist > 9999) {
      await reply(replyToken, at, [text("\u8D70\u884C\u8DDD\u96E2\u3092\u6B63\u3057\u304F\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08\u4F8B: 120\uFF09")]);
      return;
    }
    const newData = { ...data, distance_km: dist };
    await setState(env.DB, lineUid, "sales_confirm", newData);
    await reply(replyToken, at, [textWithQuickReply(
      `\u2705 \u5185\u5BB9\u78BA\u8A8D

\u{1F4C5} \u65E5\u4ED8: ${data.date}
\u{1F4B0} \u58F2\u4E0A: ${data.amount.toLocaleString("ja-JP")}\u5186
\u{1F695} \u4E57\u8ECA: ${data.ride_count}\u56DE
\u{1F5FA}\uFE0F \u8DDD\u96E2: ${dist}km

\u767B\u9332\u3057\u307E\u3059\u304B\uFF1F`,
      [{ label: "\u2705 \u767B\u9332\u3059\u308B", text: "\u767B\u9332" }, { label: "\u274C \u30AD\u30E3\u30F3\u30BB\u30EB", text: "\u30AD\u30E3\u30F3\u30BB\u30EB" }]
    )]);
    return;
  }
  if (state === "sales_confirm") {
    if (inputText === "\u767B\u9332") {
      const { year, month } = getPeriod(data.date);
      await env.DB.prepare(`
        INSERT INTO sales_records (emp_id, date, amount, ride_count, distance_km, period_year, period_month, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(emp_id, date) DO UPDATE SET
          amount = excluded.amount, ride_count = excluded.ride_count,
          distance_km = excluded.distance_km, updated_at = datetime('now', 'localtime')
      `).bind(empId, data.date, data.amount, data.ride_count ?? null, data.distance_km ?? null, year, month).run();
      await setState(env.DB, lineUid, "idle");
      await reply(replyToken, at, [text(`\u2705 \u767B\u9332\u3057\u307E\u3057\u305F\uFF01
${data.date}
\u58F2\u4E0A: ${data.amount.toLocaleString("ja-JP")}\u5186`)]);
    } else {
      await setState(env.DB, lineUid, "idle");
      await reply(replyToken, at, [text("\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002")]);
    }
    return;
  }
  if (state === "event_category") {
    const validCats = ["\u30AF\u30EC\u30FC\u30DE\u30FC", "\u4EA4\u901A\u30C8\u30E9\u30D6\u30EB", "\u793E\u5185\u306E\u51FA\u6765\u4E8B", "\u305D\u306E\u4ED6"];
    if (!validCats.includes(inputText)) {
      await reply(replyToken, at, [textWithQuickReply(
        "\u30AB\u30C6\u30B4\u30EA\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        validCats.map((c) => ({ label: c, text: c }))
      )]);
      return;
    }
    await setState(env.DB, lineUid, "event_content", { category: inputText });
    await reply(replyToken, at, [text(`\u300C${inputText}\u300D\u306B\u3064\u3044\u3066\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002

\u3069\u3093\u306A\u51FA\u6765\u4E8B\u304C\u3042\u3063\u305F\u304B\u3001\u7D4C\u7DEF\u3092\u8A73\u3057\u304F\u66F8\u3044\u3066\u304F\u3060\u3055\u3044\u3002
\uFF08\u9001\u4FE1\u3059\u308B\u3068\u304D\u3001\u9577\u6587\u3067\u3082\u5927\u4E08\u592B\u3067\u3059\uFF09`)]);
    return;
  }
  if (state === "event_content") {
    if (inputText.length < 5) {
      await reply(replyToken, at, [text("\u3082\u3046\u5C11\u3057\u8A73\u3057\u304F\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002")]);
      return;
    }
    await setState(env.DB, lineUid, "event_feeling", { ...data, content: inputText });
    await reply(replyToken, at, [textWithQuickReply(
      "\u305D\u306E\u6642\u306E\u6C17\u6301\u3061\u3084\u611F\u60F3\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002\n\uFF08\u4EFB\u610F\u3002\u30B9\u30AD\u30C3\u30D7\u3059\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\uFF09",
      [{ label: "\u30B9\u30AD\u30C3\u30D7", text: "\u30B9\u30AD\u30C3\u30D7" }]
    )]);
    return;
  }
  if (state === "event_feeling") {
    const feeling = inputText === "\u30B9\u30AD\u30C3\u30D7" ? "" : inputText;
    await env.DB.prepare(
      "INSERT INTO bad_events (emp_id, category, content, feeling) VALUES (?, ?, ?, ?)"
    ).bind(empId, data.category, data.content, feeling || null).run();
    await setState(env.DB, lineUid, "idle");
    await reply(replyToken, at, [text(
      "\u2705 \u8A18\u9332\u3057\u307E\u3057\u305F\u3002\n\n\u8A71\u3057\u3066\u304F\u308C\u3066\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002\n\u7BA1\u7406\u8005\u304C\u78BA\u8A8D\u3057\u307E\u3059\u3002\n\n\u3044\u3064\u3067\u3082\u6C17\u306B\u306A\u308B\u3053\u3068\u304C\u3042\u308C\u3070\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    )]);
    return;
  }
  await setState(env.DB, lineUid, "idle");
  await reply(replyToken, at, [text("\u30EA\u30C3\u30C1\u30E1\u30CB\u30E5\u30FC\u304B\u3089\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u3002")]);
}
__name(handleLineEvent, "handleLineEvent");

// src/index.ts
init_cron();
var app18 = new Hono2();
app18.use("*", (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  return next();
});
app18.use("*", requireJapan);
app18.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Robots-Tag", "noindex, nofollow");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net; frame-ancestors 'none';"
  );
});
app18.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));
app18.use(`/${SECRET}/admin/*`, async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const re = new RegExp(`^\\/${SECRET}\\/admin\\/(login|logout|setup)`);
  if (re.test(path))
    return next();
  return requireAuth(c, next);
});
app18.route(`/${SECRET}/admin`, admin_default);
app18.route(`/${SECRET}/admin`, admin_extra_default);
app18.route(`/${SECRET}/admin`, admin_staff_default);
app18.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/line/webhook")
    return next();
  return requireAuth(c, next);
});
app18.route("/api/shift", shift_default);
app18.route("/api/instructor-schedule", instructor_default);
app18.route("/api/employees", employees_default);
app18.route("/api/sales", sales_default);
app18.route("/api/info", info_default);
app18.route("/api/events", events_default);
app18.route("/api/line", line_api_default);
app18.route("/api/schedule-types", schedule_types_default);
app18.route("/api/interviews", interviews_default);
app18.route("/api/coaches", coaches_default);
app18.route("/api/instructors", instructors_default);
app18.route("/api/period-settings", period_settings_default);
app18.route("/api/notifications", notifications_default);
app18.route("/api/instructor-invite", instructor_invite_default);
app18.post("/api/line/webhook", async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  if (!channelSecret)
    return c.text("LINE\u672A\u8A2D\u5B9A", 500);
  const signature = c.req.header("x-line-signature");
  if (!signature)
    return c.text("Unauthorized", 401);
  const body = await c.req.text();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  if (signature !== expectedSig)
    return c.text("Invalid signature", 401);
  const events = JSON.parse(body)?.events ?? [];
  c.executionCtx.waitUntil(
    Promise.all(events.map((event) => handleLineEvent(c.env, event)))
  );
  return c.text("OK");
});
app18.get("/", (c) => c.redirect(`${ADMIN_PATH}/login`));
var src_default = {
  fetch: app18.fetch.bind(app18),
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-RzJpx9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-RzJpx9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map

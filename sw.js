// StepBible — 오프라인 지원
// 앱 내용을 고쳐서 다시 올릴 때는 아래 버전 숫자를 하나 올려 주세요 (v1 → v2).
const VERSION = "bible-v99";
const CORE = ["./", "./index.html", "./bible.json", "./manifest.webmanifest", "./sb2-icon-192.png", "./sb2-icon-512.png", "./sb2-touch-180.png", "./thumb.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const font = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (u.origin !== location.origin && !font) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(r, {ignoreSearch: true});
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === "opaque")) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

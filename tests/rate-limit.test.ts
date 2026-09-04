import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimitIzniVar, istekIpAdresi } from "../lib/rate-limit.ts";

test("limit altında kalan istekler izin verir", () => {
  const anahtar = `test-${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert.equal(rateLimitIzniVar(anahtar, 5, 60_000), true);
  }
});

test("limit aşılınca reddedilir", () => {
  const anahtar = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) rateLimitIzniVar(anahtar, 3, 60_000);
  assert.equal(rateLimitIzniVar(anahtar, 3, 60_000), false);
});

test("farklı anahtarlar birbirini etkilemez", () => {
  const a = `test-a-${Math.random()}`;
  const b = `test-b-${Math.random()}`;
  for (let i = 0; i < 3; i++) rateLimitIzniVar(a, 3, 60_000);
  assert.equal(rateLimitIzniVar(a, 3, 60_000), false);
  assert.equal(rateLimitIzniVar(b, 3, 60_000), true);
});

test("pencere dolunca eski istekler sayılmaz", () => {
  const anahtar = `test-${Math.random()}`;
  assert.equal(rateLimitIzniVar(anahtar, 1, 1), true);
  assert.equal(rateLimitIzniVar(anahtar, 1, 1), false);
});

test("x-forwarded-for içindeki ilk IP alınır", () => {
  const istek = new Request("http://localhost", {
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
  });
  assert.equal(istekIpAdresi(istek), "1.2.3.4");
});

test("x-forwarded-for yoksa x-real-ip kullanılır", () => {
  const istek = new Request("http://localhost", {
    headers: { "x-real-ip": "9.9.9.9" },
  });
  assert.equal(istekIpAdresi(istek), "9.9.9.9");
});

test("hiçbiri yoksa bilinmeyen döner", () => {
  const istek = new Request("http://localhost");
  assert.equal(istekIpAdresi(istek), "bilinmeyen");
});

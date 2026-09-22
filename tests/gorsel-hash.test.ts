import { test } from "node:test";
import assert from "node:assert/strict";
import { hammingMesafesi, GORSEL_HASH_ESIK } from "../lib/gorsel-hash.ts";

test("aynı hash sıfır mesafe üretir", () => {
  assert.equal(hammingMesafesi("a1b2c3d4e5f60718", "a1b2c3d4e5f60718"), 0);
});

test("tek bit farkı bir mesafe üretir", () => {
  // ...0718 (0111 0001 1000) vs ...0719 (0111 0001 1001) — son bit farklı.
  assert.equal(hammingMesafesi("a1b2c3d4e5f60718", "a1b2c3d4e5f60719"), 1);
});

test("tamamen farklı hash eşik üstü mesafe üretir", () => {
  const mesafe = hammingMesafesi("0000000000000000", "ffffffffffffffff");
  assert.equal(mesafe, 64);
  assert.ok(mesafe! > GORSEL_HASH_ESIK);
});

test("geçersiz hex'te null döner", () => {
  assert.equal(hammingMesafesi("gecersiz", "a1b2c3d4e5f60718"), null);
});

test("boş/null değerlerde null döner", () => {
  assert.equal(hammingMesafesi(null, "a1b2c3d4e5f60718"), null);
  assert.equal(hammingMesafesi("a1b2c3d4e5f60718", undefined), null);
});

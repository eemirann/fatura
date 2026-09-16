import { test } from "node:test";
import assert from "node:assert/strict";
import { csvAlan } from "../lib/csv.ts";

// --------------------------------------------------------- temel kaçışlar

test("sade metin olduğu gibi kalır", () => {
  assert.equal(csvAlan("A Blok"), "A Blok");
});

test("null ve undefined boş dizeye döner", () => {
  assert.equal(csvAlan(null), "");
  assert.equal(csvAlan(undefined), "");
});

test("virgül içeren alan tırnaklanır", () => {
  assert.equal(csvAlan("Ahmet, Mehmet"), '"Ahmet, Mehmet"');
});

test("tırnak ikilenir ve alan tırnaklanır", () => {
  assert.equal(csvAlan('Ali "Usta"'), '"Ali ""Usta"""');
});

test("satır sonu içeren alan tırnaklanır", () => {
  assert.equal(csvAlan("ilk\nikinci"), '"ilk\nikinci"');
});

// ------------------------------------------------------- formül enjeksiyonu

test("eşittir ile başlayan hücre metne sabitlenir", () => {
  // Excel bunu formül olarak çalıştırmamalı.
  assert.equal(csvAlan("=1+1"), "'=1+1");
});

test("artı, eksi ve @ önekleri de kaçırılır", () => {
  assert.equal(csvAlan("+1"), "'+1");
  assert.equal(csvAlan("-1"), "'-1");
  assert.equal(csvAlan("@SUM(A1)"), "'@SUM(A1)");
});

test("formül öneki ve virgül birlikte gelirse önce kaçış sonra tırnak", () => {
  assert.equal(csvAlan("=HYPERLINK(1,2)"), '"\'=HYPERLINK(1,2)"');
});

test("ortasında eşittir olan metne dokunulmaz", () => {
  assert.equal(csvAlan("A=B"), "A=B");
});

test("negatif tutar metni de kaçırılır (bilinçli)", () => {
  // "-250,00" gibi bir değer formül olarak yorumlanabildiği için kaçış
  // yapıyoruz; Excel'de görünümde tırnak çıkmaz.
  assert.equal(csvAlan("-250,00"), '"\'-250,00"');
});

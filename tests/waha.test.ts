import { test } from "node:test";
import assert from "node:assert/strict";
import { wahaGonderenNumarasi, wahaAktifMi } from "../lib/waha-ayristir.ts";

test("lid modunda gerçek numara remoteJidAlt'tan çıkarılır", () => {
  const numara = wahaGonderenNumarasi({
    from: "214216107667587@lid",
    _data: { key: { remoteJidAlt: "905386139401@s.whatsapp.net" } },
  });
  assert.equal(numara, "905386139401");
});

test("klasik @c.us formatında from doğrudan kullanılır", () => {
  const numara = wahaGonderenNumarasi({ from: "905321112233@c.us" });
  assert.equal(numara, "905321112233");
});

test("remoteJidAlt yoksa ve from @c.us değilse null döner", () => {
  const numara = wahaGonderenNumarasi({ from: "214216107667587@lid" });
  assert.equal(numara, null);
});

test("from hiç yoksa null döner", () => {
  assert.equal(wahaGonderenNumarasi({}), null);
});

test("WAHA_URL tanımlı değilse wahaAktifMi false döner", () => {
  const oncekiDeger = process.env.WAHA_URL;
  delete process.env.WAHA_URL;
  assert.equal(wahaAktifMi(), false);
  if (oncekiDeger !== undefined) process.env.WAHA_URL = oncekiDeger;
});

test("WAHA_URL tanımlıysa wahaAktifMi true döner", () => {
  const oncekiDeger = process.env.WAHA_URL;
  process.env.WAHA_URL = "http://localhost:3001";
  assert.equal(wahaAktifMi(), true);
  if (oncekiDeger === undefined) delete process.env.WAHA_URL;
  else process.env.WAHA_URL = oncekiDeger;
});

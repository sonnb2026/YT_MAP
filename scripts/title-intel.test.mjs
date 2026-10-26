// Chạy: node --test scripts/title-intel.test.mjs
// Kiểm tra bộ nhận diện ngôn ngữ / quốc gia / châu lục (public/title-intel.js + public/geo-data.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import vm from "vm";

const pub = new URL("../public/", import.meta.url);
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["geo-data.js", "title-intel.js"]) vm.runInContext(fs.readFileSync(new URL(f, pub), "utf8"), ctx);
const TI = ctx.TitleIntel;
const a = (t) => {
  const r = TI.analyze(t);
  return { lang: r.lang, countries: [...r.countries], continents: [...r.continents] };
};

test("dữ liệu: đủ ~250 quốc gia & vùng lãnh thổ, mỗi nước có châu lục", () => {
  const codes = Object.keys(TI.countries);
  assert.ok(codes.length >= 245, `chỉ có ${codes.length}`);
  for (const c of codes) assert.ok(TI.countries[c].c.startsWith("Châu"), c);
});

test("tiêu đề tiếng Tây Ban Nha", () => {
  assert.deepEqual(a("Así es la VIDA REAL en GUYANA: el único país de Sudamérica que habla inglés"), {
    lang: "es", countries: ["GY"], continents: ["Châu Mỹ"],
  });
  assert.deepEqual(a("La Ciudad Donde No Existe el Espacio | Daca, Bangladesh #shorts").countries, ["BD"]);
  assert.deepEqual(a("Así se vive en Kiribati y Tuvalu").countries, ["KI", "TV"]);
});

test("nhiều thứ tiếng và chữ viết", () => {
  assert.deepEqual(a("日本の田舎の生活"), { lang: "ja", countries: ["JP"], continents: ["Châu Á"] });
  assert.deepEqual(a("Жизнь в Японии и Китае"), { lang: "ru", countries: ["JP", "CN"], continents: ["Châu Á"] });
  assert.deepEqual(a("الحياة في مصر"), { lang: "ar", countries: ["EG"], continents: ["Châu Phi"] });
  assert.deepEqual(a("ชีวิตในประเทศไทย").countries, ["TH"]);
  assert.deepEqual(a("Cuộc sống thật ở Nhật Bản và Mỹ"), { lang: "vi", countries: ["JP", "US"], continents: ["Châu Á", "Châu Mỹ"] });
  assert.deepEqual(a("Vida Real na COREIA DO SUL: Porões de Parasita"), { lang: "pt", countries: ["KR"], continents: ["Châu Á"] });
  assert.deepEqual(a("La VRAIE VIE au BURUNDI : dormir SANS LIT"), { lang: "fr", countries: ["BI"], continents: ["Châu Phi"] });
  assert.equal(a("Leben in Österreich").countries[0], "AT");
  assert.equal(a("Życie w Polsce i w Niemczech").countries.join(), "PL,DE");
  assert.equal(a("भारत में जीवन").countries[0], "IN");
});

test("so sánh / ẩn dụ không tính là quốc gia chính", () => {
  assert.deepEqual(a("Ruanda, la Suiza de África").countries, ["RW"]);
  assert.deepEqual(a("más barato que Turquía: así es Georgia").countries, ["GE"]);
  assert.ok(TI.analyze("más barato que Turquía: así es Georgia").mentions.has("TR")); // vẫn tìm kiếm được
});

test("tên gọi dân tộc / tính từ châu lục chỉ dùng khi không có địa danh", () => {
  assert.deepEqual(a("FRANCIA: el país más africano de Europa"), { lang: "es", countries: ["FR"], continents: ["Châu Âu"] });
  assert.deepEqual(a("Los peruanos más pobres").countries, ["PE"]);
  assert.deepEqual(a("Vida en los Países Más Baratos de Asia").continents, ["Châu Á"]);
});

test("không nhầm từ thông dụng thành quốc gia", () => {
  assert.deepEqual(a("😱 INDIA Sin Filtros: un Millón en un Barrio").countries, ["IN"]); // "sin" = Trung Quốc (Hausa)
  assert.deepEqual(a("Así es la VIDA REAL en INDIA: se gana $3 al día").countries, ["IN"]); // "gana" != Ghana
  assert.deepEqual(a("LIFE IN FINLAND: MUJERES HERMOSAS, LAGOS CONGELADOS").countries, ["FI"]); // "lagos" = các hồ
  assert.deepEqual(a("El Salvador: la ira de Bukele").countries, ["SV"]); // "ira" != Iran
  assert.deepEqual(a("Los 10 Lugares MÁS EXTREMOS de la Tierra").countries, []);
});

test("ô tìm kiếm: tên quốc gia / châu lục / ngôn ngữ bằng mọi thứ tiếng", () => {
  for (const q of ["Nhật Bản", "japón", "Japan", "日本", "Япония", "tokio"]) assert.equal(TI.lookupTerm(q)?.country, "JP", q);
  for (const q of ["châu phi", "África", "afrique"]) assert.equal(TI.lookupTerm(q)?.continent, "Châu Phi", q);
  for (const q of ["tiếng bồ đào nha", "portugués", "portuguese"]) assert.equal(TI.lookupTerm(q)?.language, "pt", q);
});

// public/title-intel.js
//
// Nhận diện NGÔN NGỮ, QUỐC GIA và CHÂU LỤC trong tiêu đề video - chạy hoàn toàn trong trình duyệt,
// không gọi API nào. Dữ liệu tên quốc gia/châu lục/thành phố lấy từ public/geo-data.js (CLDR, ~250
// quốc gia & vùng lãnh thổ, ~80 thứ tiếng - kể cả chữ không phải Latin: 日本, Япония, اليابان...).
//
//   TitleIntel.analyze(title) -> {
//     lang:        "es" | "pt" | "en" | ... | null   (ngôn ngữ của tiêu đề)
//     countries:   ["PE", "BO"]   quốc gia CHÍNH được nhắc tới, theo thứ tự xuất hiện
//     continents:  ["Châu Mỹ"]    châu lục (từ quốc gia + tên châu lục/khu vực trong tiêu đề)
//     mentions:    Set mã quốc gia nhắc tới ở bất kỳ vai trò nào (kể cả so sánh) - dùng cho tìm kiếm
//     mentionedContinents: Set châu lục nhắc tới ở bất kỳ vai trò nào
//   }
//   TitleIntel.lookupTerm(text) -> { country } | { continent } | { language } | null   (cho ô tìm kiếm)
//
// Quy tắc:
//  - Cụm dài được khớp trước ("Guinea Ecuatorial" không bị hiểu thành "Guinea").
//  - Địa danh chỉ được nhắc để SO SÁNH / ẩn dụ là phụ: "más barato que Turquía", "la Suiza de África".
//    Địa danh phụ chỉ được tính khi tiêu đề không có địa danh chính nào.
//  - Tên gọi dân tộc ("peruanos", "japonesas") và tính từ châu lục ("africano") chỉ dùng khi tiêu đề
//    không có địa danh cụ thể. Vd "FRANCIA: el país más africano de Europa" -> chỉ Pháp, Châu Âu.
//  - Tên ngắn 1 chữ dễ trùng từ thường (tên tiếng Việt "Ý", "Mỹ", "Nga"; "Oma"...) chỉ được khớp khi
//    tiêu đề viết đúng ngôn ngữ của tên đó.
(function (global) {
  "use strict";

  // ---------- Chuẩn hoá (phải khớp norm() trong scripts/build-geo-data.py) ----------
  function normalizeKey(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .normalize("NFC")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .replace(/ß/g, "ss")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
      .trim();
  }

  // Chữ viết không có dấu cách giữa các từ -> dò theo chuỗi con thay vì theo từ.
  const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

  // ================= NGÔN NGỮ =================
  // 1) Chữ viết riêng (Cyrillic, Ả Rập, Hán, Thái...) -> xác định ngay, kèm vài chữ cái đặc trưng.
  // 2) Chữ Latin -> chấm điểm theo từ chức năng phổ biến + chữ cái có dấu đặc trưng của từng tiếng.
  const SCRIPTS = [
    ["Hangul", /\p{Script=Hangul}/gu],
    ["Kana", /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ["Han", /\p{Script=Han}/gu],
    ["Cyrillic", /\p{Script=Cyrillic}/gu],
    ["Arabic", /\p{Script=Arabic}/gu],
    ["Hebrew", /\p{Script=Hebrew}/gu],
    ["Greek", /\p{Script=Greek}/gu],
    ["Thai", /\p{Script=Thai}/gu],
    ["Lao", /\p{Script=Lao}/gu],
    ["Khmer", /\p{Script=Khmer}/gu],
    ["Myanmar", /\p{Script=Myanmar}/gu],
    ["Devanagari", /\p{Script=Devanagari}/gu],
    ["Bengali", /\p{Script=Bengali}/gu],
    ["Gurmukhi", /\p{Script=Gurmukhi}/gu],
    ["Gujarati", /\p{Script=Gujarati}/gu],
    ["Tamil", /\p{Script=Tamil}/gu],
    ["Telugu", /\p{Script=Telugu}/gu],
    ["Kannada", /\p{Script=Kannada}/gu],
    ["Malayalam", /\p{Script=Malayalam}/gu],
    ["Sinhala", /\p{Script=Sinhala}/gu],
    ["Georgian", /\p{Script=Georgian}/gu],
    ["Armenian", /\p{Script=Armenian}/gu],
    ["Ethiopic", /\p{Script=Ethiopic}/gu],
    ["Latin", /\p{Script=Latin}/gu],
  ];
  const SIMPLE_SCRIPT_LANG = {
    Hangul: "ko", Hebrew: "he", Greek: "el", Thai: "th", Lao: "lo", Khmer: "km", Myanmar: "my",
    Devanagari: "hi", Bengali: "bn", Gurmukhi: "pa", Gujarati: "gu", Tamil: "ta", Telugu: "te",
    Kannada: "kn", Malayalam: "ml", Sinhala: "si", Georgian: "ka", Armenian: "hy", Ethiopic: "am",
  };

  function cyrillicLang(t) {
    if (/[әғқңұһ]/i.test(t)) return "kk";
    if (/[өү]/i.test(t)) return "mn";
    if (/[ђћџ]/i.test(t)) return "sr";
    if (/[ѓќѕ]/i.test(t)) return "mk";
    if (/[јљњ]/i.test(t)) return "sr";
    if (/ў/i.test(t)) return "be";
    if (/[їєґ]/i.test(t) || (/і/i.test(t) && !/[ыэё]/i.test(t))) return "uk";
    if (/ъ/i.test(t) && !/[ыэё]/i.test(t)) return "bg";
    return "ru";
  }
  function arabicLang(t) {
    if (/[ٹڈڑںےۓ]/.test(t)) return "ur";
    if (/[پچژگ]/.test(t) || /[یک]/.test(t)) return "fa";
    return "ar";
  }

  // Từ chức năng / từ rất phổ biến trong tiêu đề. Từ có trọng số 2 = đặc trưng mạnh của ngôn ngữ đó.
  const WORDS = {
    es: "el los las del de la que no a y en un una con por para es son está están estar ser fue era más muy se su sus al lo le les me te nos mi tu ya como donde cuando qué cómo así hay este esta estos estas ese esa nadie nunca sin pero porque hasta también aquí allí tiene tienen puede pueden hace hacer ver otro otra otros otras sobre entre desde solo sola cada nada algo todo toda todos todas mujeres mujer hombres hombre ciudad ciudades pueblo pueblos ningún ninguna vive viven vivir país países mundo vida real día años increíble peor mejor dónde quién documental viaje viajes viajar lugares lugar cosas tierra tribu tribus hechos verdad secreto secretos gente conocen hermosas oculto prohibido|el:2 los:2 las:2 del:2 y:2 más:2 así:2 qué:2 cómo:2 hay:2 dónde:2 mujeres:2 ciudad:2 ningún:2 está:2 están:2 este:2 viven:2 documental:2 lugares:2 hechos:2 un:1.5 una:1.5",
    pt: "o os as a do da dos das de que e é não em no na nos nas um uma uns umas com por para mais muito muita são se seu sua seus suas ao aos como onde quando assim aqui também já sem mas porque até cidade cidades mulheres mulher homens homem ninguém nunca vida mundo país países você isso isto aquilo ela ele eles elas viver vivem pior melhor sobre entre tem têm pode fazer ver outro outra coisas lugares viagem documentário verdade segredo gente lindas dentro real|o:2 os:2 do:2 da:2 dos:2 das:2 não:3 em:2 um:2 uma:2 mais:2 muito:2 são:3 você:3 cidade:2 ninguém:3 coisas:3 têm:3 isso:3 aquilo:3 pessoas:3",
    en: "the of and in to is a an with for on this that from by at why how what who where when most people life world inside living real country countries city never ever every you your they their we our are was were has have it its than|the:3 of:2 and:2 why:2 how:2 what:2 people:2 most:2 inside:2 living:2 you:2 your:2 is:2 world:2",
    fr: "le la les des du de et un une est sont dans pour avec sur qui que au aux ce cette ces pays vie monde plus pas ne où comment pourquoi villes ville femmes homme hommes jamais tout tous très|le:2 les:2 des:2 du:2 et:2 est:2 dans:2 pour:2 avec:2 où:2 pourquoi:3 femmes:2 très:2",
    it: "il lo la gli le di del della dei delle e è un una uno per con che non nel nella più sono vita paese mondo città donne uomo uomini come dove perché mai tutto tutti molto|il:2 gli:3 della:3 delle:3 dei:2 è:2 nel:2 nella:3 più:2 sono:2 città:3 perché:3 donne:3",
    de: "der die das und ist in mit von zu den dem ein eine einen nicht auf für im so wie leben welt land stadt frauen mann männer warum wo nie alle sehr hier|der:2 die:2 das:2 und:3 ist:2 mit:2 von:2 nicht:3 für:3 warum:3 frauen:3",
    nl: "de het een en van in is op met voor niet dat zijn leven wereld land stad vrouwen man mannen waarom waar nooit alle heel hier|het:3 een:2 niet:3 zijn:2 waarom:3 vrouwen:3",
    ca: "el la els les de del i amb per que és un una al als més no on com dones ciutat vida món país|els:3 amb:3 és:2 més:2 dones:3 ciutat:3 món:3",
    ro: "și în de la cu pe un o care este nu din mai pentru viața țara lume oraș femei bărbați cum unde|și:3 în:2 pentru:3 viața:3 țara:3 femei:3",
    pl: "i w z na się nie do to jest że jak o co życie kraj świat miasto kobiety mężczyźni dlaczego gdzie|się:3 nie:2 jest:2 że:3 jak:2 życie:3 dlaczego:3 kobiety:3",
    cs: "a v se na je že to s z do jak co život země svět město ženy muži proč kde|že:2 je:2 život:3 země:3 proč:3 ženy:3",
    sk: "a v sa na je že to s z do ako čo život krajina svet mesto ženy muži prečo kde|sa:2 ako:2 život:2 krajina:3 prečo:3",
    hu: "a az és hogy nem egy is ez meg van élet ország világ város nők férfiak miért hol|az:2 és:3 hogy:3 nem:2 egy:3 élet:3 ország:3 miért:3",
    sv: "och i att det som en på är med för inte av liv land världen stad kvinnor män varför var aldrig|och:3 är:3 på:2 inte:3 världen:3 kvinnor:3 varför:3",
    da: "og i at det som en på er med for ikke af liv land verden by kvinder mænd hvorfor hvor aldrig|og:2 er:2 ikke:3 af:2 kvinder:3 hvorfor:3",
    no: "og i at det som en på er med for ikke av liv land verden by kvinner menn hvorfor hvor aldri|og:2 er:2 ikke:3 av:2 kvinner:3 hvorfor:3",
    fi: "ja on ei se että kun mutta elämä maa maailma kaupunki naiset miehet miksi missä|ja:2 on:2 että:3 elämä:3 maailma:3 miksi:3",
    tr: "ve bir bu da de ile için çok ne gibi en hayat ülke dünya şehir kadınlar erkekler neden nerede|ve:3 bir:3 ile:3 için:3 çok:3 hayat:3 ülke:3 dünya:3",
    vi: "của và là những các người cuộc sống đất nước thế giới ở có không một này đó với cho được khi tại sao nơi phụ nữ đàn ông thành phố|của:3 và:3 là:2 những:3 các:2 người:3 không:3 được:3",
    id: "dan yang di ini itu dengan untuk dari tidak ada kehidupan negara dunia kota wanita pria mengapa kenapa dimana orang|yang:3 dan:2 ini:2 itu:2 dengan:3 untuk:3 tidak:3 kehidupan:3",
    tl: "ang ng mga sa na at ay ito si buhay bansa mundo lungsod babae lalaki bakit saan|ang:3 ng:3 mga:3 ay:3 buhay:3",
    sw: "na ya wa kwa ni za katika la maisha nchi dunia mji wanawake wanaume kwa nini wapi|ya:2 wa:2 kwa:3 katika:3 maisha:3 nchi:3",
    hr: "i u je na se da za od s sa ne kako što život zemlja svijet grad žene muškarci zašto gdje|je:2 se:2 kako:2 život:2 zemlja:3 svijet:3 zašto:3",
    sl: "in je v na se da za z ne kako življenje država svet mesto ženske moški zakaj kje|in:2 je:2 življenje:3 zakaj:3",
    sq: "dhe në të një për me nga është jeta vendi bota qyteti gratë burrat pse ku|dhe:3 në:3 të:3 një:3 është:3",
    et: "ja on ei see et kui elu maa maailm linn naised mehed miks kus|ja:2 on:2 elu:3 maailm:3 miks:3",
    lv: "un ir ar uz no par ka dzīve valsts pasaule pilsēta sievietes vīrieši kāpēc kur|ir:2 dzīve:3 kāpēc:3",
    lt: "ir yra kad su į iš gyvenimas šalis pasaulis miestas moterys vyrai kodėl kur|ir:2 yra:3 gyvenimas:3 kodėl:3",
    az: "və bir bu ilə üçün həyat ölkə dünya şəhər qadınlar kişilər niyə harada|və:3 ilə:3 üçün:3 həyat:3",
    uz: "va bu bilan uchun hayot mamlakat dunyo shahar ayollar erkaklar nega qayerda|va:2 bilan:3 uchun:3 hayot:3",
  };
  // Chữ cái có dấu đặc trưng: [regex, { ngôn ngữ: điểm }]
  const CHAR_HINTS = [
    [/[ñ¿¡]/g, { es: 3 }],
    [/[ãõ]/g, { pt: 3 }],
    [/ç/g, { pt: 1, fr: 1, ca: 1, tr: 0.5, sq: 1 }],
    [/[ơưăđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, { vi: 4 }],
    [/ß/g, { de: 3 }],
    [/[äöü]/g, { de: 1, fi: 0.7, et: 0.7, sv: 0.5, hu: 0.5, tr: 0.3, az: 0.3 }],
    [/å/g, { sv: 1.5, da: 1, no: 1 }],
    [/[øæ]/g, { da: 1.5, no: 1.5 }],
    [/[őű]/g, { hu: 3 }],
    [/[łżźśćńęą]/g, { pl: 2 }],
    [/[řěů]/g, { cs: 3 }],
    [/[ľĺŕô]/g, { sk: 2 }],
    [/[şğı]/g, { tr: 2, az: 1 }],
    [/ə/g, { az: 4 }],
    [/[șțâîă]/g, { ro: 1.5 }],
    [/ë/g, { sq: 2 }],
    [/õ/g, { et: 1 }],
    [/[āēīūķļņģ]/g, { lv: 2 }],
    [/[ėįųū]/g, { lt: 2 }],
    [/[čšž]/g, { hr: 0.7, sl: 0.7, cs: 0.5, sk: 0.5, lt: 0.3, lv: 0.3 }],
    [/ć/g, { hr: 1, pl: 0.5 }],
    [/[àèìòù]/g, { it: 0.6, fr: 0.4, ca: 0.4, vi: 0.3 }],
    [/[êôâ]/g, { fr: 0.5, pt: 0.5, vi: 0.2 }],
    [/[áéíóú]/g, { es: 0.25, pt: 0.2, ca: 0.1, hu: 0.1, cs: 0.1, sk: 0.1, vi: 0.1 }],
  ];
  // Đuôi từ đặc trưng: [regex trên từng từ, { ngôn ngữ: điểm }]
  const SUFFIX_HINTS = [
    [/ción$|ciones$|cía$|iendo$|ísimo$|mente$/, { es: 1 }],
    [/ção$|ções$|ões$|ão$|inho$|inha$/, { pt: 2 }],
    [/tion$|ment$|eux$|euse$|ée$/, { fr: 0.7, en: 0.3 }],
    [/zione$|zioni$|mente$/, { it: 1 }],
    [/ing$|ness$|ship$/, { en: 1 }],
    [/ung$|keit$|heit$|lich$|schaft$/, { de: 1.5 }],
  ];
  const WORD_SCORES = {}; // lang -> Map(word -> weight)
  const STOPWORD_SET = new Set(); // mọi từ chức năng - tên địa danh trùng các từ này bị coi là "dễ nhầm"
  for (const [lang, spec] of Object.entries(WORDS)) {
    const [list, strong] = spec.split("|");
    const m = new Map();
    for (const w of list.split(/\s+/).filter(Boolean)) m.set(w, 1);
    for (const pair of (strong || "").split(/\s+/).filter(Boolean)) {
      const [w, n] = pair.split(":");
      m.set(w, Number(n));
    }
    WORD_SCORES[lang] = m;
    for (const w of m.keys()) STOPWORD_SET.add(normalizeKey(w));
  }

  function cleanForLang(title) {
    return String(title || "")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[#@][\p{L}\p{N}_]+/gu, " ") // #shorts, @kenh
      .replace(/\p{N}+/gu, " ");
  }

  function detectLanguage(title) {
    const t = cleanForLang(title);
    const counts = {};
    let total = 0;
    for (const [name, re] of SCRIPTS) {
      const n = (t.match(re) || []).length;
      if (n) {
        counts[name] = n;
        total += n;
      }
    }
    if (!total) return null;
    const nonLatin = Object.entries(counts).filter(([k]) => k !== "Latin").sort((a, b) => b[1] - a[1]);
    // Chữ không phải Latin chiếm >= 40% số chữ cái -> theo chữ viết đó.
    if (nonLatin.length && nonLatin[0][1] / total >= 0.4) {
      if (counts.Kana) return "ja";
      if (counts.Hangul && counts.Hangul >= (counts.Han || 0)) return "ko";
      const top = nonLatin[0][0];
      if (top === "Han") return "zh";
      if (top === "Cyrillic") return cyrillicLang(t);
      if (top === "Arabic") return arabicLang(t);
      return SIMPLE_SCRIPT_LANG[top] || null;
    }
    // Chữ Latin.
    const lower = t.toLowerCase();
    const words = lower.split(/[^\p{L}\p{M}']+/u).filter(Boolean);
    const scores = {};
    for (const [lang, m] of Object.entries(WORD_SCORES)) {
      let s = 0;
      for (const w of words) s += m.get(w) || 0;
      if (s) scores[lang] = s;
    }
    for (const w of words) {
      if (w.length < 5) continue;
      for (const [re, add] of SUFFIX_HINTS) {
        if (!re.test(w)) continue;
        for (const [lang, pts] of Object.entries(add)) scores[lang] = (scores[lang] || 0) + pts;
      }
    }
    for (const [re, add] of CHAR_HINTS) {
      const n = (lower.match(re) || []).length;
      if (!n) continue;
      const k = Math.min(n, 3);
      for (const [lang, pts] of Object.entries(add)) scores[lang] = (scores[lang] || 0) + pts * k;
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 1.5) return null;
    return ranked[0][0];
  }

  // ================= QUỐC GIA / CHÂU LỤC =================
  const DATA = global.GEO_DATA || { countries: {}, names: {}, languages: {} };
  const COUNTRIES = DATA.countries;
  const LANGUAGES = DATA.languages;
  const TIER_RANK = { C: 0, P: 1, T: 2, R: 3, D: 4, G: 5 };
  // Cấp: C quốc gia, P địa danh viết tay, T thành phố (CLDR), R châu lục/khu vực -> "địa danh chính".
  //      D tên gọi dân tộc, G tính từ châu lục -> chỉ dùng khi không có địa danh chính.

  const NAME_MAP = new Map(); // tên đã chuẩn hoá (cách nhau 1 dấu cách) -> entry
  const NO_SPACE_NAMES = []; // tên viết bằng chữ không có dấu cách: [tên, entry], dài trước
  let MAX_TOKENS = 1;

  function makeEntry(target, tier, langs) {
    const isContinent = target.startsWith("@");
    return {
      target,
      tier,
      iso: isContinent ? null : target,
      continent: isContinent ? target.slice(1) : COUNTRIES[target]?.c || null,
      langs: langs === "*" ? null : new Set(langs.split(",")),
    };
  }

  for (const [target, tiers] of Object.entries(DATA.names)) {
    for (const [tier, packed] of Object.entries(tiers)) {
      for (const item of packed.split("|")) {
        if (!item) continue;
        const [rawName, langs = "*"] = item.split("~");
        const name = normalizeKey(rawName);
        if (!name) continue;
        const entry = makeEntry(target, tier, langs);
        const cur = NAME_MAP.get(name);
        if (cur && TIER_RANK[cur.tier] <= TIER_RANK[tier]) continue;
        NAME_MAP.set(name, entry);
        if (NO_SPACE_SCRIPT.test(name)) NO_SPACE_NAMES.push([name, entry]);
        else MAX_TOKENS = Math.max(MAX_TOKENS, name.split(" ").length);
      }
    }
  }
  NO_SPACE_NAMES.sort((a, b) => b[0].length - a[0].length);

  // Ngôn ngữ biến đổi đuôi từ (Японии, Китае, Polsce, Suomessa, Türkiye'de...): tên 1 chữ >= 5 ký tự
  // được nhận cả khi đuôi từ trong tiêu đề khác 1-3 ký tự cuối. Chỉ bật cho các ngôn ngữ này.
  const INFLECTING_LANGS = new Set(["ru", "uk", "be", "bg", "sr", "mk", "pl", "cs", "sk", "hr", "sl", "fi", "et", "hu", "tr", "az", "uz", "kk", "lt", "lv", "ka", "hy", "el", "ro", "sq", "de", "is"]);
  const STEM_MAP = new Map(); // gốc từ (bỏ ký tự cuối) -> entry
  for (const [name, entry] of NAME_MAP) {
    if (name.includes(" ") || name.length < 5 || NO_SPACE_SCRIPT.test(name)) continue;
    if (TIER_RANK[entry.tier] > 2) continue;
    const stem = name.slice(0, -1);
    if (!STEM_MAP.has(stem)) STEM_MAP.set(stem, entry);
  }
  function stemLookup(token) {
    for (let cut = 0; cut <= 4; cut++) {
      const t = cut ? token.slice(0, -cut) : token;
      if (t.length < 4) break;
      const e = STEM_MAP.get(t);
      if (e) return [t, e];
    }
    return null;
  }
  MAX_TOKENS = Math.min(MAX_TOKENS, 7);

  // Tên dễ trùng từ thường chỉ khớp khi tiêu đề viết đúng ngôn ngữ của tên đó:
  //  - tên rất ngắn hoặc trùng 1 từ chức năng ("la", "de"...);
  //  - tên tiếng Việt 1 âm tiết ("Nga", "Mỹ", "Ý", "Pháp" -> "nga", "my", "y", "phap").
  // Tên trùng từ thông dụng của tiếng Tây Ban Nha/Bồ Đào Nha/Anh/Pháp ("sin", "lagos", "ira"...) đã bị
  // loại ngay khi sinh dữ liệu (COMMON_WORD_BLOCK trong scripts/build-geo-data.py).
  function allowedFor(name, entry, lang) {
    if (!entry.langs) return true; // danh sách viết tay: tin cậy
    if (name.length <= 2 || STOPWORD_SET.has(name)) return Boolean(lang && entry.langs.has(lang));
    // Tên tiếng Việt 1 âm tiết ("nga", "phap", "duc", "my"...): chỉ khi tiêu đề là tiếng Việt.
    if (!name.includes(" ") && entry.langs.size <= 2 && entry.langs.has("vi") && lang !== "vi") {
      return [...entry.langs].some((l) => l !== "vi" && l === lang);
    }
    return true;
  }

  // Ngữ cảnh so sánh / ẩn dụ (Tây Ban Nha, Bồ Đào Nha, Anh, Pháp).
  const COMPARE_PREV1 = new Set(["que", "como", "hasta", "contra", "mini", "than", "like", "comme", "quanto"]);
  const COMPARE_PREV2 = new Set(["fuera de", "como en", "enfrenta a", "igual que", "parecido a", "mas que", "menos que"]);
  const METAPHOR_PREV = new Set(["la", "el", "un", "una", "o", "a", "the", "le"]);
  const OF_WORDS = new Set(["de", "del", "da", "do", "of", "du"]);

  function isSecondary(tokens, start, end) {
    const p1 = tokens[start - 1];
    const p2 = start >= 2 ? `${tokens[start - 2]} ${p1}` : "";
    if ((p1 && COMPARE_PREV1.has(p1)) || (p2 && COMPARE_PREV2.has(p2))) return true;
    if (p1 && METAPHOR_PREV.has(p1)) {
      // "la Suiza de África", "el Dubái de América" (từ "de" trong 4 từ sau, còn chữ phía sau)
      for (let j = end; j < Math.min(tokens.length - 1, end + 4); j++) if (OF_WORDS.has(tokens[j])) return true;
    }
    return false;
  }

  function scanTitle(norm, lang) {
    const tokens = norm.split(" ").filter(Boolean);
    const hits = []; // { entry, pos, secondary }
    const used = new Array(tokens.length).fill(false);
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      for (let n = Math.min(MAX_TOKENS, tokens.length - i); n >= 1; n--) {
        let key = tokens.slice(i, i + n).join(" ");
        let entry = NAME_MAP.get(key);
        if (!entry && n === 1) {
          // "Japón2026" -> "japon"
          const stripped = key.replace(/\p{N}+$/u, "");
          if (stripped !== key && stripped.length >= 3) {
            key = stripped;
            entry = NAME_MAP.get(key);
          }
        }
        if (!entry && n === 1 && lang && INFLECTING_LANGS.has(lang)) {
          const found = stemLookup(key);
          if (found) [key, entry] = found;
        }
        if (!entry || !allowedFor(key, entry, lang)) continue;
        hits.push({ entry, pos: i, secondary: isSecondary(tokens, i, i + n) });
        for (let k = i; k < i + n; k++) used[k] = true;
        break;
      }
    }
    // Chữ không có dấu cách (Hán, Nhật, Thái...): dò chuỗi con, dài trước, đã khớp thì xoá đi.
    if (NO_SPACE_SCRIPT.test(norm)) {
      let rest = norm;
      for (const [name, entry] of NO_SPACE_NAMES) {
        const at = rest.indexOf(name);
        if (at === -1) continue;
        hits.push({ entry, pos: 1000 + at, secondary: false });
        rest = rest.split(name).join(" ");
      }
    }
    return hits.sort((a, b) => a.pos - b.pos);
  }

  function analyze(title) {
    const lang = detectLanguage(title);
    const norm = normalizeKey(title);
    const hits = scanTitle(norm, lang);
    const strong = hits.filter((h) => TIER_RANK[h.entry.tier] <= 3);
    const weak = hits.filter((h) => TIER_RANK[h.entry.tier] > 3);
    let pool = strong.filter((h) => !h.secondary);
    if (!pool.length) pool = strong;
    if (!pool.length) pool = weak;

    const countries = [];
    const continents = [];
    for (const h of pool) {
      if (h.entry.iso && !countries.includes(h.entry.iso)) countries.push(h.entry.iso);
      if (h.entry.continent && !continents.includes(h.entry.continent)) continents.push(h.entry.continent);
    }
    // Có quốc gia cụ thể thì châu lục = châu lục của các quốc gia đó + châu lục được gọi tên trực tiếp
    // (tính từ chung như "africano" không tính khi đã có quốc gia).
    const mentions = new Set();
    const mentionedContinents = new Set();
    for (const h of hits) {
      if (h.entry.iso) mentions.add(h.entry.iso);
      if (h.entry.continent) mentionedContinents.add(h.entry.continent);
    }
    return { lang, countries, continents, mentions, mentionedContinents };
  }

  // ---------- Ô tìm kiếm ----------
  const LANGUAGE_NAME_MAP = new Map(); // "tieng tay ban nha" / "espanol" / "spanish" / "es" -> "es"
  for (const [code, info] of Object.entries(LANGUAGES)) {
    for (const n of info.names || []) {
      const k = normalizeKey(n);
      if (k) LANGUAGE_NAME_MAP.set(k.replace(/\s+/g, ""), code);
      // "tiếng Tây Ban Nha" -> cũng nhận "tây ban nha" khi gõ kèm chữ "tiếng"
    }
  }
  const COMPACT_NAME_MAP = new Map(); // tên bỏ hết dấu cách -> entry ("vietnam" = "viet nam")
  for (const [name, entry] of NAME_MAP) {
    const k = name.replace(/\s+/g, "");
    const cur = COMPACT_NAME_MAP.get(k);
    if (!cur || TIER_RANK[entry.tier] < TIER_RANK[cur.tier]) COMPACT_NAME_MAP.set(k, entry);
  }

  // Nhận 1 từ khoá gõ vào ô tìm kiếm -> châu lục / quốc gia / ngôn ngữ, hoặc null.
  function lookupTerm(text) {
    const norm = normalizeKey(text);
    if (!norm) return null;
    const compact = norm.replace(/\s+/g, "");
    // "tiếng X", "ngôn ngữ X", "lang:es" -> luôn hiểu là ngôn ngữ
    const langMatch = norm.match(/^(?:tieng|ngon ngu|lang|language|idioma|lingua|langue)\s+(.+)$/);
    if (langMatch) {
      const code = LANGUAGE_NAME_MAP.get(langMatch[1].replace(/\s+/g, "")) ||
        LANGUAGE_NAME_MAP.get(("tieng" + langMatch[1]).replace(/\s+/g, "")) ||
        (LANGUAGES[langMatch[1]] ? langMatch[1] : null);
      if (code) return { language: code };
    }
    const entry = COMPACT_NAME_MAP.get(compact);
    if (entry && TIER_RANK[entry.tier] <= 3) {
      return entry.iso ? { country: entry.iso } : { continent: entry.continent };
    }
    const code = LANGUAGE_NAME_MAP.get(compact);
    if (code && compact.length > 2) return { language: code };
    if (entry) return entry.iso ? { country: entry.iso } : { continent: entry.continent };
    return null;
  }

  function countryLabel(iso, lang = "vi") {
    const c = COUNTRIES[iso];
    return c ? c[lang] || c.vi || iso : iso;
  }
  function languageLabel(code) {
    if (!code) return "";
    const l = LANGUAGES[code];
    if (!l) return code;
    const vi = l.vi || code;
    return vi.charAt(0).toUpperCase() + vi.slice(1);
  }

  global.TitleIntel = {
    analyze,
    detectLanguage,
    lookupTerm,
    countryLabel,
    languageLabel,
    normalizeKey,
    countries: COUNTRIES,
    languages: LANGUAGES,
    nameCount: NAME_MAP.size,
  };
})(typeof window !== "undefined" ? window : globalThis);

#!/usr/bin/env python3
"""
scripts/build-geo-data.py

Sinh public/geo-data.js - bộ dữ liệu nhận diện QUỐC GIA / CHÂU LỤC / NGÔN NGỮ trong tiêu đề video.

Nguồn: CLDR (Unicode Common Locale Data Repository) qua thư viện Babel:
  - Tên của TẤT CẢ quốc gia & vùng lãnh thổ (~250 mã ISO) bằng ~80 thứ tiếng
    (gồm cả chữ không phải Latin: 日本, Япония, اليابان, ญี่ปุ่น...).
  - Tên châu lục / khu vực (Europa, Sudeste asiático, Латинская Америка...) bằng các thứ tiếng đó.
  - Tên thành phố lớn (theo múi giờ CLDR: Tokio, Moscú, Daca...) bằng các thứ tiếng đó.
  - Tên ngôn ngữ bằng tiếng Việt / Tây Ban Nha / Anh / Bồ Đào Nha (để tìm kiếm theo ngôn ngữ).
Cộng thêm danh sách viết tay (EXTRA_PLACES, DEMONYMS) cho mảng du lịch: vùng, thành phố, bộ tộc,
tên gọi dân tộc ("peruanos", "japonesas"...).

Chạy lại khi muốn sửa danh sách viết tay:
    pip install babel
    python3 scripts/build-geo-data.py
File public/geo-data.js là file sinh tự động - KHÔNG sửa tay.
"""
import json
import os
import re
import unicodedata

from babel import Locale
from babel.core import get_global
from babel.dates import get_timezone_location

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "geo-data.js")

# ---------------------------------------------------------------------------
# Các thứ tiếng lấy tên quốc gia / châu lục / thành phố.
NAME_LOCALES = [
    "es", "pt", "en", "fr", "it", "de", "nl", "ca", "gl", "eu", "ro", "pl", "cs", "sk", "hu",
    "sv", "da", "nb", "fi", "is", "et", "lv", "lt", "sl", "hr", "bs", "sr", "sr_Latn", "mk",
    "bg", "ru", "uk", "be", "el", "sq", "tr", "az", "ka", "hy", "kk", "uz", "ky", "mn",
    "ar", "he", "fa", "ur", "ps", "hi", "bn", "ne", "pa", "gu", "mr", "ta", "te", "kn", "ml",
    "si", "th", "lo", "km", "my", "vi", "id", "ms", "fil", "jv", "ja", "ko", "zh", "zh_Hant",
    "sw", "am", "so", "ha", "yo", "zu", "af", "ga", "cy", "mt", "lb", "eo",
]

# ---------------------------------------------------------------------------
# Châu lục của từng mã ISO 3166-1 (theo UN M49), giữ đúng cách xếp các nước "nằm giữa 2 châu"
# mà app đang dùng: Nga, Síp -> Châu Âu | Thổ Nhĩ Kỳ, Trung Đông, Georgia, Armenia, Azerbaijan,
# Kazakhstan, Indonesia -> Châu Á | Ai Cập -> Châu Phi | Panama, Caribe, Greenland -> Châu Mỹ.
CONTINENTS = {
    "Châu Á": "AE AF AM AZ BD BH BN BT CC CN CX CY_ GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ "
              "LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
    "Châu Âu": "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT "
               "JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK",
    "Châu Phi": "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY "
                "MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW "
                "TF BV AC TA DG IC EA",
    "Châu Mỹ": "AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GS GT GY "
               "HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI UM",
    "Châu Đại Dương": "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS",
    "Châu Nam Cực": "AQ HM",
}
ISO_CONTINENT = {}
for cont, codes in CONTINENTS.items():
    for c in codes.split():
        if c.endswith("_"):
            continue
        ISO_CONTINENT[c] = cont

# Mã khu vực CLDR (M49) -> châu lục. Tên các khu vực này bằng mọi thứ tiếng được dùng làm
# từ khoá cấp CHÂU LỤC (không chỉ ra quốc gia cụ thể).
REGION_CONTINENT = {
    "142": "Châu Á", "030": "Châu Á", "034": "Châu Á", "035": "Châu Á", "143": "Châu Á", "145": "Châu Á",
    "150": "Châu Âu", "151": "Châu Âu", "154": "Châu Âu", "039": "Châu Âu", "155": "Châu Âu", "EU": "Châu Âu",
    "002": "Châu Phi", "015": "Châu Phi", "202": "Châu Phi", "011": "Châu Phi", "014": "Châu Phi",
    "017": "Châu Phi", "018": "Châu Phi",
    "019": "Châu Mỹ", "419": "Châu Mỹ", "005": "Châu Mỹ", "013": "Châu Mỹ", "021": "Châu Mỹ",
    "003": "Châu Mỹ", "029": "Châu Mỹ",
    "009": "Châu Đại Dương", "053": "Châu Đại Dương", "054": "Châu Đại Dương", "057": "Châu Đại Dương",
    "061": "Châu Đại Dương",
}

# Mã CLDR không phải quốc gia thật / trùng -> bỏ.
SKIP_TERRITORIES = {"ZZ", "QO", "EZ", "UN", "EU", "XA", "XB", "CP", "CQ", "AC", "TA", "DG", "IC", "EA"}

# ---------------------------------------------------------------------------
# Thành phố theo múi giờ CLDR: bỏ các múi giờ có tên trùng tên người / từ thường, và
# các thị trấn nhỏ của Mỹ (Indiana, Kentucky...) không có ích cho mảng du lịch.
ZONE_PREFIX_SKIP = ("Antarctica/", "America/Indiana/", "America/Kentucky/", "America/North_Dakota/", "Etc/")
ZONE_CITY_SKIP = {
    "casey", "davis", "mawson", "stanley", "regina", "victoria", "knox", "marengo", "vevay", "winamac",
    "monticello", "center", "beulah", "new salem", "boise", "nome", "sitka", "yakutat", "adak", "metlakatla",
    "menominee", "glace bay", "goose bay", "moncton", "swift current", "creston", "dawson", "dawson creek",
    "whitehorse", "inuvik", "rankin inlet", "resolute", "cambridge bay", "thule", "danmarkshavn",
    "scoresbysund", "fort nelson", "atikokan", "coral harbour", "blanc sablon", "thunder bay", "nipigon",
    "rainy river", "pangnirtung", "iqaluit", "yellowknife", "edmonton", "halifax", "st johns", "macquarie",
    "lord howe", "broken hill", "currie", "lindeman", "eucla", "wake", "midway", "johnston", "easter",
    "chatham", "norfolk", "palmer", "troll", "vostok", "syowa", "rothera", "mcmurdo", "dumont d urville",
    "kerguelen", "mahe", "reunion", "mayotte", "christmas", "cocos", "chagos", "galapagos", "noronha",
    "araguaina", "santarem", "rio branco", "porto velho", "boa vista", "eirunepe", "cuiaba", "campo grande",
    "belem", "maceio", "recife", "fortaleza", "bahia", "manaus", "matamoros", "ojinaga", "bahia banderas",
    "merida", "chihuahua", "hermosillo", "mazatlan", "cancun", "tijuana", "santa isabel", "monterrey",
    "punta arenas", "salta", "jujuy", "tucuman", "catamarca", "la rioja", "san juan", "mendoza", "san luis",
    "rio gallegos", "ushuaia", "cordoba", "port of spain", "marigot", "lower princes", "kralendijk",
    "grand turk", "cayman", "anguilla", "montserrat", "dominica", "grenada", "st kitts", "st lucia",
    "st vincent", "st barthelemy", "st thomas", "tortola", "guadeloupe", "martinique", "miquelon",
    "aruba", "curacao", "bermuda", "jersey", "guernsey", "isle of man", "gibraltar", "faroe", "longyearbyen",
    "mariehamn", "busingen", "andorra", "monaco", "san marino", "vatican", "luxembourg", "malta",
    "antigua", "domingo", "damas", "ama", "santo domingo", "anadyr", "chita", "srednekolymsk", "ust nera", "khandyga", "kamchatka", "magadan", "sakhalin",
    "novokuznetsk", "barnaul", "tomsk", "omsk", "novosibirsk", "krasnoyarsk", "irkutsk", "yakutsk",
    "volgograd", "saratov", "ulyanovsk", "astrakhan", "kirov", "samara", "yekaterinburg", "kaliningrad",
    "aqtau", "aqtobe", "atyrau", "oral", "qostanay", "qyzylorda", "hovd", "choibalsan", "famagusta",
    "hebron", "urumqi", "kashgar", "pontianak", "makassar", "jayapura", "kuching", "dili", "kosrae",
    "pohnpei", "chuuk", "kwajalein", "majuro", "tarawa", "kanton", "kiritimati", "enderbury", "fakaofo",
    "funafuti", "wallis", "gambier", "marquesas", "pitcairn", "niue", "rarotonga", "pago pago", "apia",
    "tongatapu", "fiji", "efate", "noumea", "guadalcanal", "bougainville", "port moresby", "guam", "saipan",
    "palau", "nauru", "auckland", "honolulu",
}

# Tên CLDR trùng từ thông dụng trong tiếng Tây Ban Nha / Bồ Đào Nha / Anh / Pháp / Ý -> bỏ hẳn.
# (vd "sin" = Trung Quốc tiếng Hausa nhưng là "không có" tiếng Tây Ban Nha; "lagos" = "các hồ";
#  "ira" = "cơn giận"; "sul" = "phía nam" tiếng Bồ Đào Nha; "man" (Đảo Man) = "man" tiếng Anh.)
COMMON_WORD_BLOCK = set("""
sin cin cada cadas cado cadi cad gana gane ganao adan aman amano aten atene atena bene bec becs gene gine gini
kena lime limo loom man mon oma omo pala pole polish rim rom roum sam sec sip sul tai tau toga togas vin vine
wina sofia helena jordan darwin bert juno zuno cuno lagos vena rige rigo tocala romo ira naso gasa kota polan
dako lati nepa japo kair kube sile sili cili pert perto juba pala dunaj papu salvador victoria george santiago
colombo nice turin bar ama damas domingo antigua mar sol cayenne kingston hamilton charlotte
""".split())

# ---------------------------------------------------------------------------
# Danh sách viết tay (mảng du lịch). Khoá = mã ISO, hoặc "@<châu lục>" cho từ khoá chỉ ra châu lục.
# Lấy từ CONTINENT_KEYWORDS / COUNTRY_TABLE cũ trong app.js + bổ sung.
EXTRA_PLACES = {
    "@Châu Á": "medio oriente, oriente medio, oriente proximo, middle east, moyen orient, oriente medio, "
               "sudeste asiatico, sureste asiatico, sudeste asiatico, himalaya, himalaia, himalayas, himalayan, "
               "bajau, sama bajau, asia central, ruta de la seda, golfo persico",
    "@Châu Âu": "balcanes, balkans, balcas, escandinavia, scandinavia, escandinavia, europa del este, "
                "europa occidental, laponia, lapland, mar baltico, balticos, paises balticos",
    "@Châu Phi": "sahara, sahel, magreb, maghreb, africa subsahariana, cuerno de africa, tuareg, tuaregs, "
                 "bosquimanos, pigmeos, pigmeus, bantu",
    "@Châu Mỹ": "latinoamerica, america latina, latin america, sudamerica, suramerica, south america, "
                "amerique du sud, america do sul, centroamerica, america central, norteamerica, caribe, "
                "caribbean, amazonas, amazonia, amazon, patagonia, andes, maya, mayas",
    "@Châu Đại Dương": "polinesia, polynesia, melanesia, micronesia",
    "@Châu Nam Cực": "polo sur, south pole",
    "CN": "tibet, tibete, xinjiang, tres gargantas, guangzhou, shenzhen, chongqing, chengdu, "
          "xian, hangzhou, wuhan, harbin, uigur, uigures, uyghur, gran muralla",
    "JP": "kioto, kyoto, osaka, hiroshima, nagasaki, okinawa, hokkaido, sapporo, fukushima",
    "KR": "seul, seoul, busan, corea del sur",
    "KP": "pyongyang, kim jong, kim jong un, corea del norte, norcorea",
    "TW": "taipei",
    "VN": "hanoi, ha long, halong, ho chi minh, saigon, sai gon, da nang",
    "TH": "bangkok, phuket, chiang mai, pattaya",
    "KH": "angkor, phnom penh, siem reap",
    "MM": "yangon, rangun, birmania",
    "ID": "bali, mentawai, sumatra, borneo, bawean, java, yakarta, jakarta, jacarta, lombok, sulawesi, "
          "korowai, toraja, asmat",
    "PH": "manila, mindanao, palawan, cebu",
    "MY": "kuala lumpur",
    "IN": "bombay, mumbai, delhi, nueva delhi, new delhi, calcuta, kolkata, varanasi, benares, goa, "
          "rajastan, rajasthan, cachemira, kashmir, sentinel, sentinela, sentinelese, agra, taj mahal",
    "PK": "kalash, karachi, lahore, islamabad",
    "AF": "kabul, talibanes, talibanes",
    "IR": "teheran, ormuz",
    "IQ": "bagdad, baghdad, iraq, irak",
    "IL": "jerusalen, jerusalem, tel aviv",
    "PS": "gaza, cisjordania",
    "AE": "dubai, dubái, abu dabi, abu dhabi",
    "QA": "doha",
    "SA": "la meca, meca, mecca, riad, riyadh",
    "TR": "estambul, istambul, istanbul, capadocia, cappadocia, ankara",
    "GE": "tbilisi, tiflis",
    "AM": "erevan, yerevan",
    "IO": "diego garcia",
    "NP": "katmandu, kathmandu, everest",
    "BD": "daca, dhaka",
    "ES": "canarias, tenerife, mallorca, ibiza, benidorm, madrid, barcelona, sevilla, andalucia, galicia, "
          "cataluna, pais vasco, valencia",
    "PT": "lisboa, lisbon, oporto, madeira, azores, acores, algarve",
    "FR": "paris, marsella, marseille, corcega, corse, normandia, provenza",
    "IT": "roma, rome, venecia, veneza, venice, florencia, florenca, florence, milan, napoles, napoli, "
          "sicilia, cerdena, toscana, calcio storico, pompeya",
    "DE": "berlin, munich, hamburgo, baviera",
    "AT": "viena, vienna",
    "NL": "amsterdam, holanda",
    "BE": "bruselas, brussels",
    "GB": "inglaterra, england, escocia, scotland, ecosse, gales, pais de gales, wales, irlanda del norte, "
          "northern ireland, londres, london, gran bretana, great britain, uk, reino unido",
    "IE": "dublin",
    "GR": "atenas, athens, creta, santorini",
    "CZ": "praga, prague, chequia",
    "HU": "budapest",
    "MD": "transnistria",
    "RU": "moscu, moscou, moscow, san petersburgo, siberia, kamchatka, kamchata, chukotka, yakutia, "
          "oymyakon, vladivostok, yakutsk, norilsk, chechenia",
    "UA": "kiev, kyiv, chernobil, chernobyl",
    "FI": "helsinki",
    "NO": "oslo",
    "SE": "estocolmo, stockholm",
    "IS": "reikiavik, reykjavik",
    "EG": "el cairo, cairo, luxor, piramides de giza, giza",
    "MA": "marrakech, marraquexe, casablanca, fez",
    "EH": "saharaui, sahrawi",
    "KE": "nairobi, masai, maasai, massai, masai mara",
    "TZ": "zanzibar, hadza, serengeti, kilimanjaro",
    "SS": "dinka",
    "ET": "mursi, suri, omo",
    "NA": "himba",
    "ZA": "johannesburgo, ciudad del cabo, cidade do cabo, cape town, zulu, zulues, soweto",
    "NG": "lagos de nigeria, abuya, abuja",
    "SH": "santa elena, tristan da cunha, tristan de acuna",
    "US": "estados unidos, eeuu, ee uu, eua, usa, nueva york, nova york, new york, miami, los angeles, "
          "las vegas, chicago, detroit, michigan, texas, california, florida, alaska, hawai, hawaii, "
          "nueva orleans, filadelfia, philadelphia, pensilvania, pennsylvania, centralia, skid row, "
          "comanche, comanches, apache, apaches, sioux, navajo, navajos, amish, grandes llanuras, great plains, "
          "kensington, appalachia, apalaches, san francisco, washington",
    "MX": "cancun, riviera maya, tulum, oaxaca, chiapas, yucatan, xochimilco, tijuana, acapulco, monterrey, "
          "guadalajara, ciudad de mexico, cdmx, culiacan, sinaloa, azteca, aztecas, tarahumara, raramuri",
    "SV": "cecot",
    "CU": "la habana, havana",
    "CO": "bogota, medellin, cartagena, cali",
    "VE": "caracas",
    "EC": "quito, galapagos, waorani, huaorani",
    "PE": "lima, cusco, cuzco, machu picchu, iquitos, rinconada, la rinconada, uros, titicaca, inca, incas",
    "BO": "potosi, la paz, uyuni",
    "CL": "santiago de chile, atacama, rapa nui, isla de pascua",
    "AR": "buenos aires",
    "BR": "rio de janeiro, sao paulo, favela, favelas, yanomami, kayapo, piraha, salvador de bahia",
    "AU": "sidney, sydney, melbourne, aborigen, aborigenes, aboriginal",
    "NZ": "maori, maories",
    "PG": "papua, nueva guinea, nova guine",
    "PF": "tahiti",
    "CX": "isla de navidad, christmas island",
    "PN": "pitcairn, islas pitcairn",
    "AQ": "antartida, antarctica",
    "VA": "vaticano, vatican, santa sede, holy see",
    "YE": "socotra, socotora, sanaa",
}
for _iso, _more in {
    "TZ": "hadzabe, dar es salaam",
    "CO": "santa cruz del islote",
    "BR": "brasilia, isla de las serpientes, ilha da queimada grande, manaos, manaus",
}.items():
    EXTRA_PLACES[_iso] = EXTRA_PLACES[_iso] + ", " + _more

# Thủ đô của mọi quốc gia (tên tiếng Anh + Tây Ban Nha/Bồ Đào Nha khi khác) - CLDR chỉ có thành phố theo
# múi giờ nên thiếu nhiều thủ đô (Canberra, Ottawa, Brasília, Abuja, Ankara...). Bỏ các tên trùng từ
# thường: Praia (= bãi biển), Male, Victoria, Kingston, Sucre...
CAPITALS = {
    "AF": "kabul", "AL": "tirana", "DZ": "argel, algiers", "AD": "andorra la vieja", "AO": "luanda",
    "AR": "buenos aires", "AM": "erevan, yerevan", "AU": "canberra", "AT": "viena, vienna", "AZ": "baku, bakú",
    "BS": "nasau, nassau", "BH": "manama", "BD": "daca, dhaka", "BB": "bridgetown", "BY": "minsk",
    "BE": "bruselas, brussels", "BZ": "belmopan", "BJ": "porto novo", "BT": "timbu, thimphu", "BO": "la paz",
    "BA": "sarajevo", "BW": "gaborone", "BR": "brasilia", "BN": "bandar seri begawan", "BG": "sofia de bulgaria",
    "BF": "uagadugu, ouagadougou", "BI": "gitega, buyumbura, bujumbura", "KH": "phnom penh, nom pen",
    "CM": "yaunde, yaounde, duala", "CA": "ottawa, toronto, montreal, vancouver", "CV": "ciudad de praia",
    "CF": "bangui", "TD": "yamena, n djamena", "CL": "santiago de chile", "CN": "pekin, beijing, shanghai, shanghái",
    "CO": "bogota", "KM": "moroni", "CG": "brazzaville", "CD": "kinsasa, kinshasa, goma", "CR": "san jose de costa rica",
    "CI": "yamusukro, abiyan, abidjan", "HR": "zagreb", "CU": "la habana", "CY": "nicosia", "CZ": "praga",
    "DK": "copenhague, copenhagen", "DJ": "yibuti", "DM": "roseau", "DO": "santo domingo", "EC": "quito, guayaquil",
    "EG": "el cairo", "SV": "san salvador", "GQ": "malabo", "ER": "asmara", "EE": "tallin, tallinn",
    "SZ": "mbabane", "ET": "adis abeba, addis ababa", "FJ": "suva", "FI": "helsinki", "FR": "paris",
    "GA": "libreville", "GM": "banjul", "GE": "tiflis, tbilisi", "DE": "berlin", "GH": "accra, acra",
    "GR": "atenas", "GD": "saint george s", "GT": "ciudad de guatemala", "GN": "conakri, conakry",
    "GW": "bisau, bissau", "GY": "georgetown", "HT": "puerto principe, port au prince", "HN": "tegucigalpa",
    "HU": "budapest", "IS": "reikiavik", "IN": "nueva delhi", "ID": "yakarta", "IR": "teheran", "IQ": "bagdad",
    "IE": "dublin", "IL": "jerusalen", "IT": "roma", "JM": "jamaica kingston", "JP": "tokio",
    "JO": "aman de jordania, amman", "KZ": "astana, almaty", "KE": "nairobi", "KI": "tarawa", "KW": "kuwait city",
    "KG": "biskek, bishkek", "LA": "vientian, vientiane", "LV": "riga", "LB": "beirut", "LS": "maseru",
    "LR": "monrovia", "LY": "tripoli, tripoli de libia, bengasi", "LI": "vaduz", "LT": "vilna, vilnius",
    "LU": "luxemburgo", "MG": "antananarivo", "MW": "lilongue, lilongwe", "MY": "kuala lumpur", "MV": "male de maldivas",
    "ML": "bamako, tombuctu, timbuktu", "MT": "la valeta, valletta", "MH": "majuro", "MR": "nuakchot, nouakchott",
    "MU": "port louis", "MX": "ciudad de mexico", "FM": "palikir", "MD": "chisinau, kishinev", "MC": "monaco",
    "MN": "ulan bator, ulaanbaatar", "ME": "podgorica", "MA": "rabat", "MZ": "maputo", "MM": "naipyido, naypyidaw",
    "NA": "windhoek", "NR": "yaren", "NP": "katmandu", "NL": "amsterdam", "NZ": "wellington, auckland",
    "NI": "managua", "NE": "niamey", "NG": "abuja", "KP": "pyongyang", "MK": "skopie, skopje", "NO": "oslo",
    "OM": "mascate, muscat", "PK": "islamabad", "PW": "ngerulmud", "PS": "ramala, ramallah", "PA": "ciudad de panama",
    "PG": "port moresby", "PY": "asuncion", "PE": "lima", "PH": "manila", "PL": "varsovia, warsaw, cracovia",
    "PT": "lisboa", "QA": "doha", "RO": "bucarest, bucharest", "RU": "moscu", "RW": "kigali",
    "KN": "basseterre", "LC": "castries", "VC": "kingstown", "WS": "apia", "SM": "san marino", "ST": "santo tome",
    "SA": "riad", "SN": "dakar", "RS": "belgrado, belgrade", "SC": "victoria de seychelles", "SL": "freetown",
    "SG": "singapur", "SK": "bratislava", "SI": "liubliana, ljubljana", "SB": "honiara", "SO": "mogadiscio, mogadishu",
    "ZA": "pretoria, johannesburgo, durban", "KR": "seul", "SS": "yuba de sudan", "ES": "madrid", "LK": "colombo de sri lanka, kandy",
    "SD": "jartum, khartoum", "SR": "paramaribo", "SE": "estocolmo", "CH": "berna, bern, zurich, ginebra, geneva",
    "SY": "damasco, damascus, alepo, aleppo", "TW": "taipei", "TJ": "dusambe, dushanbe", "TZ": "dodoma",
    "TH": "bangkok", "TL": "dili", "TG": "lome", "TO": "nukualofa", "TT": "puerto espana, port of spain",
    "TN": "tunez capital", "TR": "ankara", "TM": "asjabad, ashgabat", "TV": "funafuti", "UG": "kampala",
    "UA": "kiev, kyiv, odesa, odessa, jarkov", "AE": "abu dabi", "GB": "londres", "US": "washington dc",
    "UY": "montevideo", "UZ": "taskent, tashkent, samarcanda, samarkand", "VU": "port vila", "VE": "caracas, maracaibo",
    "VN": "hanoi", "YE": "sana", "ZM": "lusaka", "ZW": "harare",
}
# Thành phố lớn khác hay gặp trong tiêu đề du lịch.
BIG_CITIES = {
    "US": "cincinnati, oakland, baltimore, atlanta, houston, dallas, seattle, boston, san diego, memphis, "
          "san luis missouri, st louis, saint louis, nueva orleans, new orleans, portland, denver, phoenix, "
          "kansas city, cleveland, milwaukee, minneapolis, nashville, austin, el paso, san antonio, honolulu, "
          "anchorage, compton, harlem, bronx, brooklyn, manhattan, flint, gary indiana, camden, tulsa",
    "CA": "calgary, edmonton, quebec, winnipeg",
    "MX": "puebla, merida, juarez, ciudad juarez, leon guanajuato, morelia, veracruz",
    "BR": "salvador de bahia, fortaleza, recife, belem, porto alegre, curitiba, belo horizonte",
    "IN": "bangalore, bengaluru, chennai, madras, hyderabad, jaipur, ahmedabad, pune, calcuta",
    "CN": "hong kong, macao, nankin, nanjing, tianjin, suzhou",
    "JP": "yokohama, nagoya, kobe, fukuoka",
    "RU": "novosibirsk, ekaterimburgo, yekaterinburg, kazan, murmansk, norilsk, magadan, irkutsk",
    "TR": "esmirna, izmir, antalya, bursa",
    "IT": "turin, torino, bolonia, bologna, genova, palermo, napoles",
    "ES": "bilbao, malaga, zaragoza, granada, cordoba de espana",
    "FR": "lyon, niza, burdeos, bordeaux, toulouse, estrasburgo",
    "DE": "frankfurt, francfort, colonia, koln, dusseldorf, stuttgart",
    "GB": "manchester, liverpool, birmingham, glasgow, edimburgo, edinburgh",
    "NG": "kano, ibadan",
    "PK": "peshawar, rawalpindi, quetta",
    "ID": "surabaya, bandung, medan, yogyakarta",
    "PH": "davao, quezon",
    "VN": "hai phong, can tho, nha trang",
    "TH": "chiang rai, krabi, koh samui",
    "EG": "alejandria, alexandria, asuan, aswan",
    "MA": "tanger, tangier, agadir",
    "AR": "rosario, mendoza, cordoba argentina, ushuaia",
    "CO": "barranquilla, cucuta",
    "PE": "arequipa, trujillo",
    "BO": "santa cruz de la sierra, el alto, cochabamba",
    "VE": "valencia venezuela, barquisimeto",
}

# Tên gọi dân tộc / tính từ quốc gia (chỉ dùng khi tiêu đề KHÔNG có địa danh cụ thể).
# Tiếng Tây Ban Nha: chỉ cần dạng giống đực số ít - script tự sinh giống cái + số nhiều.
DEMONYMS_ES = {
    "AF": "afgano", "AL": "albanes", "DE": "aleman", "DZ": "argelino", "AR": "argentino", "AM": "armenio",
    "AU": "australiano", "AT": "austriaco", "AZ": "azerbaiyano", "BD": "bangladesi", "BE": "belga",
    "BY": "bielorruso", "BO": "boliviano", "BA": "bosnio", "BR": "brasileno", "BG": "bulgaro",
    "KH": "camboyano", "CM": "camerunes", "CA": "canadiense", "CL": "chileno", "CN": "chino",
    "CO": "colombiano", "KR": "surcoreano", "KP": "norcoreano", "CR": "costarricense", "HR": "croata",
    "CU": "cubano", "DK": "danes", "EC": "ecuatoriano", "EG": "egipcio", "SV": "salvadoreno",
    "AE": "emirati", "SK": "eslovaco", "SI": "esloveno", "ES": "espanol", "US": "estadounidense",
    "EE": "estonio", "ET": "etiope", "PH": "filipino", "FI": "finlandes", "FR": "frances", "GE": "georgiano",
    "GH": "ghanes", "GR": "griego", "GT": "guatemalteco", "HT": "haitiano", "HN": "hondureno",
    "HU": "hungaro", "ID": "indonesio", "IQ": "iraqui", "IR": "irani", "IE": "irlandes", "IS": "islandes",
    "IL": "israeli", "IT": "italiano", "JM": "jamaicano", "JP": "japones", "JO": "jordano",
    "KZ": "kazajo", "KE": "keniano", "LA": "laosiano", "LV": "leton", "LB": "libanes", "LY": "libio",
    "LT": "lituano", "MY": "malasio", "MA": "marroqui", "MX": "mexicano", "MN": "mongol", "NP": "nepali",
    "NI": "nicaraguense", "NG": "nigeriano", "NO": "noruego", "NZ": "neozelandes", "NL": "neerlandes",
    "PK": "pakistani", "PS": "palestino", "PA": "panameno", "PY": "paraguayo", "PE": "peruano",
    "PL": "polaco", "PT": "portugues", "PR": "puertorriqueno", "GB": "britanico", "CZ": "checo",
    "DO": "dominicano", "RO": "rumano", "RU": "ruso", "SN": "senegales", "RS": "serbio", "SG": "singapurense",
    "SY": "sirio", "SO": "somali", "LK": "ceilanes", "ZA": "sudafricano", "SD": "sudanes", "SE": "sueco",
    "CH": "suizo", "TH": "tailandes", "TW": "taiwanes", "TZ": "tanzano", "TN": "tunecino", "TR": "turco",
    "UA": "ucraniano", "UG": "ugandes", "UY": "uruguayo", "UZ": "uzbeko", "VE": "venezolano",
    "VN": "vietnamita", "YE": "yemeni", "ZW": "zimbabuense", "SA": "saudi", "QA": "catari", "KW": "kuwaiti",
    "OM": "omani", "BT": "butanes", "MM": "birmano", "TJ": "tayiko", "TM": "turkmeno", "KG": "kirguis",
    "AO": "angoleno", "MZ": "mozambiqueno", "MG": "malgache", "RW": "ruandes", "CD": "congoleno",
    "SS": "sursudanes", "ER": "eritreo", "ML": "maliense", "NE": "nigerino", "TD": "chadiano",
    "MD": "moldavo", "ME": "montenegrino", "MK": "macedonio", "CY": "chipriota", "MT": "maltes",
    "LU": "luxemburgues", "GL": "groenlandes", "BZ": "beliceno", "BS": "bahameno", "TT": "trinitense",
    "GY": "guyanes", "SR": "surinames", "FJ": "fiyiano", "PG": "papu", "MV": "maldivo", "BN": "bruneano",
    "TL": "timorense",
}
# Tiếng Bồ Đào Nha + tiếng Anh + tiếng Pháp: liệt kê đủ dạng.
DEMONYMS_OTHER = {
    "BR": "brasileiro, brasileira, brasileiros, brasileiras, brazilian, brazilians, bresilien, bresiliens",
    "PT": "portuguesa, portuguesas, portuguese",
    "JP": "japonesa, japoneses, japanese, japonais, japonaise",
    "CN": "chinesa, chineses, chinese, chinois, chinoise",
    "KR": "coreano, coreana, coreanos, coreanas, korean, koreans, coreen, coreenne",
    "RU": "russo, russa, russos, russas, russian, russians, russe, russes",
    "IN": "indiano, indiana, indianos, indianas, indian, indians, hindu, hindues",
    "MX": "mexican, mexicans, mexicain, mexicaine",
    "US": "american, americans, americain, americaine, gringo, gringos, gringa, gringas",
    "FR": "french, francaise, francais, francesa, franceses",
    "DE": "german, germans, allemand, allemande, alemao, alema, alemaes",
    "IT": "italian, italians, italien, italienne",
    "ES": "spanish, espagnol, espagnole, espanhol, espanhola",
    "GB": "british, english, ingles, inglesa, ingleses, inglesas, escoces, escocesa, escoceses",
    "TR": "turkish, turc, turque",
    "AU": "australian, australians",
    "PH": "filipina, filipinas, filipinos, filipinas",
    "KP": "north korean, norcoreanos",
    "VN": "vietnamese, vietnamien, vietnamienne",
    "TH": "thai, tailandesa",
    "ID": "indonesian, indonesiens",
    "UA": "ukrainian, ukrainien",
    "PL": "polish, polonais",
    "SE": "swedish, suedois",
    "NO": "norwegian, norvegien",
    "IL": "israeli, israelien",
    "IR": "iranian, iranien, iraniano, iraniana",
    "SA": "saudita, sauditas, saudies",
    "EG": "egyptian, egyptien",
    "NG": "nigerian",
    "AR": "argentinian, argentine",
}
# Từ chỉ ra CHÂU LỤC (không chỉ 1 nước): dùng khi tiêu đề không có địa danh cụ thể.
CONTINENT_GENERIC = {
    "Châu Á": "asiatico, asiatica, asiaticos, asiaticas, asian, asiatique, arabe, arabes, arab, musulman, "
              "musulmanes, mongoles, a chau",
    "Châu Âu": "europeo, europea, europeos, europeas, european, europeen, europeu, europeia, vikingo, vikingos, "
               "viking, vikings, vikinga, vikingas, siberiano, siberianos, siberiana, siberianas, au chau",
    "Châu Phi": "africano, africana, africanos, africanas, african, africain, africaine, phi chau",
    "Châu Mỹ": "americano, americana, americanos, americanas, latino, latinos, latina, latinas, latinoamericano, "
               "latinoamericanos, andino, andina, andinos, andinas, indigenas del amazonas, my chau",
    "Châu Đại Dương": "polinesio, polinesios, polinesia, oceanico, dai duong",
    "Châu Nam Cực": "antartico, antartica, antarctic",
}

# Tiếng Việt: chỉ tên có dấu chuẩn từ CLDR + tên gọi khác thường gặp.
VI_ALIASES = {
    "US": "Hoa Kỳ, Mỹ, Nước Mỹ", "CN": "Trung Quốc, Tàu", "JP": "Nhật Bản, Nhật", "KR": "Hàn Quốc, Nam Hàn",
    "KP": "Triều Tiên, Bắc Triều Tiên, Bắc Hàn", "GB": "Anh, Vương quốc Anh, Anh Quốc", "KH": "Campuchia, Cam Bốt",
    "MM": "Myanmar, Miến Điện", "MY": "Malaysia, Mã Lai", "SG": "Singapore, Tân Gia Ba", "ID": "Indonesia, Nam Dương",
    "PH": "Philippines, Phi Luật Tân", "AU": "Úc, Australia", "NZ": "New Zealand, Tân Tây Lan", "DE": "Đức",
    "FR": "Pháp", "IT": "Ý, Italia", "RU": "Nga", "ES": "Tây Ban Nha", "PT": "Bồ Đào Nha", "IN": "Ấn Độ",
    "TH": "Thái Lan", "TR": "Thổ Nhĩ Kỳ", "AE": "UAE, Các Tiểu vương quốc Ả Rập Thống nhất", "SA": "Ả Rập Xê Út",
    "MA": "Ma-rốc, Maroc", "GL": "Greenland, Đảo Xanh", "IS": "Iceland, Băng Đảo", "CZ": "Séc, Cộng hòa Séc",
    "VA": "Vatican, Tòa Thánh", "BY": "Belarus, Bạch Nga", "GE": "Georgia, Gruzia",
}

# Tên tiếng Việt hiển thị trên bảng (ngắn gọn hơn tên CLDR nếu cần).
VI_LABEL_OVERRIDE = {
    "US": "Mỹ", "GB": "Anh", "KR": "Hàn Quốc", "KP": "Triều Tiên", "CZ": "Séc", "AE": "UAE",
    "CD": "CHDC Congo", "CG": "Congo", "MK": "Bắc Macedonia", "PS": "Palestine", "HK": "Hồng Kông",
    "MO": "Ma Cao", "VA": "Vatican", "BA": "Bosnia & Herzegovina", "CV": "Cabo Verde", "SH": "Saint Helena",
}
EN_LABEL_OVERRIDE = {"US": "United States", "GB": "United Kingdom", "CD": "DR Congo", "PS": "Palestine"}

# Ngôn ngữ app nhận diện được (mã ISO 639-1). Tên hiển thị lấy từ CLDR (tiếng Việt).
DETECT_LANGS = [
    "es", "pt", "en", "fr", "it", "de", "nl", "ca", "ro", "pl", "cs", "sk", "hu", "sv", "da", "no", "fi",
    "tr", "vi", "id", "ms", "tl", "sw", "hr", "sl", "sq", "et", "lv", "lt", "az", "uz",
    "ru", "uk", "bg", "sr", "mk", "kk", "mn", "be", "el", "ar", "fa", "ur", "he", "hi", "bn", "pa", "gu",
    "ta", "te", "kn", "ml", "si", "th", "lo", "km", "my", "ka", "hy", "am", "ja", "ko", "zh",
]

# ---------------------------------------------------------------------------


def norm(s):
    """Phải khớp normalizeKey() trong public/title-intel.js."""
    s = unicodedata.normalize("NFD", str(s))
    s = re.sub(r"[̀-ͯ]", "", s)
    s = unicodedata.normalize("NFC", s)
    s = s.replace("đ", "d").replace("Đ", "d").replace("ß", "ss").lower()
    s = "".join(ch if unicodedata.category(ch)[0] in "LNM" else " " for ch in s)
    return re.sub(r"\s+", " ", s).strip()


def split_list(s):
    return [x.strip() for x in s.split(",") if x.strip()]


def es_inflect(base):
    """Sinh giống cái + số nhiều cho tính từ quốc gia tiếng Tây Ban Nha (đã bỏ dấu)."""
    if base.endswith("o"):
        r = base[:-1]
        return [base, r + "a", r + "os", r + "as"]
    if base.endswith("es"):  # frances
        return [base, base + "a", base + "es", base + "as"]
    if base.endswith(("an", "on", "in")):  # aleman, leton, kirguis? (an/on)
        return [base, base + "a", base + "es", base + "as"]
    if base.endswith(("i", "u")):  # iraqui, hindu
        return [base, base + "es", base + "s"]
    if base.endswith("e"):  # nicaraguense
        return [base, base + "s"]
    if base.endswith("a"):  # belga, croata
        return [base, base + "s"]
    if base.endswith("l"):  # espanol, mongol
        return [base, base + "a", base + "es", base + "as"]
    if base.endswith("s"):  # kirguis
        return [base, base + "a", base + "es", base + "as"]
    return [base]


def main():
    countries = {}  # iso -> {vi, en, es, c}
    # name entries: key(normalized) -> {"t": tier, "v": iso or "@continent", "l": set(langs)}
    entries = {}

    def add(raw, target, tier, lang):
        k = norm(raw)
        if lang != "*" and k in COMMON_WORD_BLOCK:
            return
        if not k or len(k) < 2 or k.split(" ")[0] in ("de", "del", "da", "do", "la", "el", "le", "the", "of"):
            if not (k and k.split(" ")[0] in ("la", "el", "le") and tier in ("place", "country")):
                return
        cur = entries.get(k)
        rank = {"country": 0, "place": 1, "city": 2, "region": 3, "demonym": 4, "generic": 5}
        if cur is None:
            entries[k] = {"t": tier, "v": target, "l": {lang}}
            return
        if cur["v"] == target:
            cur["l"].add(lang)
            if rank[tier] < rank[cur["t"]]:
                cur["t"] = tier
            return
        # Trùng tên giữa 2 nơi khác nhau: giữ nơi có cấp ưu tiên cao hơn (quốc gia > địa danh > ...).
        if rank[tier] < rank[cur["t"]]:
            entries[k] = {"t": tier, "v": target, "l": {lang}}

    vi = Locale("vi")
    en = Locale("en")
    es = Locale("es")
    iso_codes = sorted(
        c for c in en.territories if len(c) == 2 and c.isalpha() and c not in SKIP_TERRITORIES
    )
    missing = [c for c in iso_codes if c not in ISO_CONTINENT]
    if missing:
        raise SystemExit(f"Thiếu châu lục cho: {missing}")
    for c in iso_codes:
        countries[c] = {
            "vi": VI_LABEL_OVERRIDE.get(c) or vi.territories.get(c, c),
            "en": EN_LABEL_OVERRIDE.get(c) or en.territories.get(c, c),
            "es": es.territories.get(c, c),
            "c": ISO_CONTINENT[c],
        }

    zone_terr = get_global("zone_territories")
    for loc_id in NAME_LOCALES:
        try:
            loc = Locale.parse(loc_id)
        except Exception:
            continue
        lang = loc_id.split("_")[0]
        for c in iso_codes:
            name = loc.territories.get(c)
            if name:
                add(name, c, "country", lang)
                # "República Checa" -> thêm cả "Checa"? Không: dễ nhầm. Chỉ bỏ ngoặc "(...)".
                if "(" in name:
                    add(re.sub(r"\s*\(.*?\)", "", name), c, "country", lang)
        for region, cont in REGION_CONTINENT.items():
            name = loc.territories.get(region)
            if name:
                add(name, "@" + cont, "region", lang)
        for zone, terr in zone_terr.items():
            if zone.startswith(ZONE_PREFIX_SKIP) or terr not in countries:
                continue
            try:
                city = get_timezone_location(zone, locale=loc, return_city=True)
            except Exception:
                continue
            if not city or norm(city) in ZONE_CITY_SKIP or norm(zone.split("/")[-1].replace("_", " ")) in ZONE_CITY_SKIP:
                continue
            add(city, terr, "city", lang)

    for key, raw in EXTRA_PLACES.items():
        target = key if key.startswith("@") else key
        tier = "region" if key.startswith("@") else "place"
        for name in split_list(raw):
            add(name, target, tier, "*")
    for table in (CAPITALS, BIG_CITIES):
        for iso, raw in table.items():
            for name in split_list(raw):
                add(name, iso, "place", "*")
    for iso, aliases in VI_ALIASES.items():
        for name in split_list(aliases):
            add(name, iso, "country", "vi")
    for iso, base in DEMONYMS_ES.items():
        for form in es_inflect(norm(base)):
            add(form, iso, "demonym", "es")
    for iso, raw in DEMONYMS_OTHER.items():
        for name in split_list(raw):
            add(name, iso, "demonym", "*")
    for cont, raw in CONTINENT_GENERIC.items():
        for name in split_list(raw):
            add(name, "@" + cont, "generic", "*")

    # Tên ngôn ngữ (để gõ "tiếng Bồ Đào Nha" / "portugués" / "portuguese" vào ô tìm kiếm).
    lang_info = {}
    for code in DETECT_LANGS:
        cldr = {"no": "nb"}.get(code, code)
        lang_info[code] = {
            "vi": vi.languages.get(cldr, code),
            "en": en.languages.get(cldr, code),
            "names": sorted(
                {norm(n) for n in [
                    vi.languages.get(cldr), en.languages.get(cldr), es.languages.get(cldr),
                    Locale("pt").languages.get(cldr), Locale("fr").languages.get(cldr),
                    Locale.parse(cldr).languages.get(cldr) if cldr not in ("tl",) else "tagalog",
                ] if n}
            ),
        }
    lang_info["zh"]["vi"] = "Tiếng Trung"

    # Tên 1 chữ chỉ dùng ở < 12 thứ tiếng: kèm danh sách ngôn ngữ - chỉ được dò trong tiêu đề viết đúng
    # ngôn ngữ đó (vd "sin" = Trung Quốc tiếng Hausa không bị khớp vào "sin" tiếng Tây Ban Nha).
    def lang_tag(k, e):
        if "*" in e["l"] or " " in k or len(e["l"]) >= 12:
            return "*"
        return ",".join(sorted(e["l"]))

    # Gói gọn theo đích + cấp: { "JP": { "C": "japon|japan|日本|...", "T": "tokio|..." }, "@Châu Á": {...} }
    # Tên ngắn kèm ngôn ngữ: "nga~vi".
    tier_code = {"country": "C", "place": "P", "city": "T", "region": "R", "demonym": "D", "generic": "G"}
    grouped = {}
    for k, e in sorted(entries.items()):
        tag = lang_tag(k, e)
        grouped.setdefault(e["v"], {}).setdefault(tier_code[e["t"]], []).append(k if tag == "*" else f"{k}~{tag}")
    names = {v: {t: "|".join(lst) for t, lst in tiers.items()} for v, tiers in grouped.items()}
    data = {"countries": countries, "names": names, "languages": lang_info}
    js = (
        "// public/geo-data.js - FILE SINH TỰ ĐỘNG bởi scripts/build-geo-data.py (dữ liệu CLDR + danh sách bổ sung).\n"
        "// Không sửa tay: sửa trong script rồi chạy lại `python3 scripts/build-geo-data.py`.\n"
        f"window.GEO_DATA = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"{len(countries)} quốc gia/vùng lãnh thổ, {len(entries)} tên, {len(lang_info)} ngôn ngữ -> {OUT} ({len(js.encode()) // 1024} KB)")


if __name__ == "__main__":
    main()

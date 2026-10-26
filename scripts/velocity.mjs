// scripts/velocity.mjs
//
// Logic tính view/giờ (VPH) và nhận diện live/công chiếu. Tách riêng khỏi
// fetch-data.mjs để test được mà không cần API key (xem velocity.test.mjs).
//
// VPH = (view hiện tại - view ở mốc so sánh) / số giờ giữa 2 mốc.
// Mỗi video lưu tối đa MAX_SNAPSHOTS mốc [thời điểm (epoch ms), lượt xem] - mỗi mốc là số view
// ĐỌC THẬT từ YouTube tại đúng thời điểm đó. Không bao giờ dựng mốc giả.
//
// Cấu hình qua env (đều tuỳ chọn):
//   MIN_VPH_INTERVAL_HOURS   default 6   - 2 lần fetch của cùng 1 video cách nhau ít hơn mức này
//                            thì giữ nguyên VPH lần trước, không ghi mốc mới.
//   VPH_TARGET_HOURS         default 24  - độ dài cửa sổ mong muốn: chọn mốc có tuổi GẦN 24h NHẤT,
//                            để VPH luôn là trung bình ~1 ngày (không bị lệch theo giờ cao điểm
//                            khi có thêm lần chạy tay giữa ngày).
//   VPH_FALLBACK_MAX_HOURS   default 48  - mốc cũ hơn mức này không dùng làm mốc so sánh.
//   YOUNG_VIDEO_HOURS        default 48  - video đăng chưa quá mức này mà chưa có mốc so sánh thì
//                            dùng trung bình từ lúc đăng (hợp lý vì video còn rất mới). Video cũ hơn
//                            mà chưa có mốc -> VPH để trống ("pending"), chờ lần chạy sau.
//   MAX_SNAPSHOTS            default 8   - số mốc giữ lại cho mỗi video.

const HOUR_MS = 3600000;

const numEnv = (name, def) => {
  const n = parseFloat(process.env[name] || "");
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const CONFIG = {
  minIntervalHours: numEnv("MIN_VPH_INTERVAL_HOURS", 6),
  targetHours: numEnv("VPH_TARGET_HOURS", 24),
  fallbackMaxHours: numEnv("VPH_FALLBACK_MAX_HOURS", 48),
  youngVideoHours: numEnv("YOUNG_VIDEO_HOURS", 48),
  maxSnapshots: Math.floor(numEnv("MAX_SNAPSHOTS", 8)),
};

// ---------- Live / công chiếu ----------
//
// liveBroadcastContent (trong snippet) cho biết trạng thái HIỆN TẠI:
//   "live" | "upcoming" | "none".
// Khi live/công chiếu đã kết thúc, giá trị này quay về "none" - lúc đó chỉ còn
// liveStreamingDetails là dấu vết cho thấy video từng là live/công chiếu:
//   "live" đang phát | "upcoming" chưa phát | "ended" đã kết thúc (bản VOD) | "none" video thường
export function deriveLiveStatus(snippet, liveStreamingDetails) {
  const lbc = snippet?.liveBroadcastContent || "none";
  const d = liveStreamingDetails || null;
  if (lbc === "live") {
    // Đôi khi liveBroadcastContent trễ vài phút so với actualEndTime.
    return d?.actualEndTime ? "ended" : "live";
  }
  if (lbc === "upcoming") return "upcoming";
  return d ? "ended" : "none";
}

// Chỉ giữ các trường thời gian cần dùng, để file JSON không phình.
export function pickLiveDetails(d) {
  if (!d) return undefined;
  const out = {};
  for (const k of ["scheduledStartTime", "actualStartTime", "actualEndTime"]) {
    if (d[k]) out[k] = d[k];
  }
  return Object.keys(out).length ? out : undefined;
}

// Video đang live/sắp phát thì view chưa phản ánh "tốc độ tăng view" của video thường.
export const isVphExcluded = (liveStatus) => liveStatus === "live" || liveStatus === "upcoming";

// ---------- Snapshot ----------

// Chỉ đọc các mốc thật đã lưu, sắp xếp cũ -> mới.
export function readSnapshots(prev) {
  if (!Array.isArray(prev?.snapshots)) return [];
  return prev.snapshots
    .filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]))
    .sort((a, b) => a[0] - b[0]);
}

// Chọn mốc so sánh: trong các mốc có tuổi [minInterval, fallbackMax], lấy mốc có tuổi GẦN
// targetHours (24h) nhất; bằng nhau thì lấy mốc cũ hơn (cửa sổ dài hơn, ít nhiễu hơn).
export function pickBaseline(snaps, nowMs, cfg = CONFIG) {
  const minAge = cfg.minIntervalHours * HOUR_MS;
  const maxAge = cfg.fallbackMaxHours * HOUR_MS;
  const target = cfg.targetHours * HOUR_MS;
  let best = null;
  let bestDiff = Infinity;
  for (const s of snaps) {
    const age = nowMs - s[0];
    if (age < minAge || age > maxAge) continue;
    const diff = Math.abs(age - target);
    if (diff < bestDiff || (diff === bestDiff && s[0] < best[0])) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

// Tính VPH tại thời điểm atMs (số view lúc đó = views) dựa trên các mốc CŨ HƠN.
function velocityAt({ views, atMs, publishedAt, olderSnaps, cfg }) {
  const base = pickBaseline(olderSnaps, atMs, cfg);
  if (base) {
    const hours = (atMs - base[0]) / HOUR_MS;
    return {
      viewsPerHour: Math.round(Math.max(0, views - base[1]) / hours),
      viewsPerHourSource: "recent",
      vphWindowHours: Math.round(hours * 10) / 10,
    };
  }
  const hoursSincePublish = (atMs - new Date(publishedAt).getTime()) / HOUR_MS;
  if (Number.isFinite(hoursSincePublish) && hoursSincePublish <= cfg.youngVideoHours) {
    // Video mới đăng: trung bình từ lúc đăng chính là tốc độ gần đây.
    return {
      viewsPerHour: Math.round(views / Math.max(hoursSincePublish, 1)),
      viewsPerHourSource: "lifetime",
    };
  }
  // Video cũ chưa có mốc so sánh: KHÔNG lấy trung bình cả đời (thường sai lệch rất xa so với
  // tốc độ hiện tại). Để trống, lần chạy sau sẽ có mốc thật.
  return { viewsPerHour: null, viewsPerHourSource: "pending" };
}

// ---------- VPH ----------
//
// Trả về { viewsPerHour, viewsPerHourSource, vphWindowHours?, snapshots }.
// viewsPerHourSource:
//   "recent"   - delta view thật giữa 2 mốc (cửa sổ gần 24h nhất, tối thiểu 6h, tối đa 48h)
//   "lifetime" - video mới đăng (< 48h) chưa có mốc: trung bình từ lúc đăng
//   "pending"  - video cũ chưa có mốc so sánh: chưa tính (null), chờ lần chạy sau
//   "live"     - video đang live/sắp phát: không tính (null)
export function computeVelocity({ video, prev, liveStatus, nowMs, cfg = CONFIG }) {
  const snaps = readSnapshots(prev);

  // Live / sắp phát: không tính VPH và KHÔNG ghi snapshot (mốc lúc đang live sẽ làm sai delta
  // của lần tính đầu tiên sau khi video kết thúc).
  if (isVphExcluded(liveStatus)) {
    return { viewsPerHour: null, viewsPerHourSource: "live", snapshots: snaps };
  }

  // Quá gần mốc trước: giữ nguyên kết quả cũ, không thêm mốc. (viewCount vẫn được cập nhật ở nơi gọi.)
  const last = snaps[snaps.length - 1];
  if (last && nowMs - last[0] < cfg.minIntervalHours * HOUR_MS && prev && prev.viewsPerHourSource !== "live") {
    return {
      viewsPerHour: prev.viewsPerHour ?? null,
      viewsPerHourSource: prev.viewsPerHourSource || (prev.viewsPerHour == null ? "pending" : "recent"),
      ...(prev.vphWindowHours !== undefined ? { vphWindowHours: prev.vphWindowHours } : {}),
      snapshots: snaps,
    };
  }

  const nextSnaps = [...snaps, [nowMs, video.viewCount]].slice(-cfg.maxSnapshots);
  return {
    ...velocityAt({ views: video.viewCount, atMs: nowMs, publishedAt: video.publishedAt, olderSnaps: snaps, cfg }),
    snapshots: nextSnaps,
  };
}

// ---------- Dọn mốc giả trong dữ liệu cũ ----------
//
// Bản cũ của script, khi gặp video chưa có snapshot, đã DỰNG mốc giả: lấy số view cũ (có thể từ
// nhiều tuần trước) gắn với thời điểm của lần chạy trước. Delta nhiều tuần bị chia cho vài giờ ->
// VPH bị thổi phồng hàng chục lần.
// Mốc thật luôn được ghi theo thời điểm đọc số liệu của TỪNG kênh, nên 2 kênh khác nhau không bao
// giờ có mốc trùng nhau tới từng mili-giây. Mốc giả thì dùng chung 1 thời điểm cho mọi kênh ->
// nhận ra được: thời điểm nào xuất hiện ở >= 2 kênh khác nhau là mốc giả.
export function findFakeSnapshotTimes(videos) {
  const channelsByTime = new Map();
  for (const v of videos) {
    for (const s of readSnapshots(v)) {
      let set = channelsByTime.get(s[0]);
      if (!set) channelsByTime.set(s[0], (set = new Set()));
      set.add(v.channelId);
    }
  }
  const fake = new Set();
  for (const [t, set] of channelsByTime) if (set.size >= 2) fake.add(t);
  return fake;
}

// Bỏ mốc giả khỏi 1 video và tính lại VPH tại mốc thật mới nhất của nó.
// Trả về bản ghi mới, hoặc null nếu video không có mốc giả nào.
export function repairVideoVelocity(v, fakeTimes, cfg = CONFIG) {
  const snaps = readSnapshots(v);
  const clean = snaps.filter((s) => !fakeTimes.has(s[0]));
  if (clean.length === snaps.length) return null;
  const out = { ...v, snapshots: clean };
  delete out.vphWindowHours;
  if (isVphExcluded(v.liveStatus)) return { ...out, viewsPerHour: null, viewsPerHourSource: "live" };
  const last = clean[clean.length - 1];
  if (!last) return { ...out, viewsPerHour: null, viewsPerHourSource: "pending" };
  return {
    ...out,
    ...velocityAt({ views: last[1], atMs: last[0], publishedAt: v.publishedAt, olderSnaps: clean.slice(0, -1), cfg }),
  };
}

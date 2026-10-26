// public/app.js

let allVideos = [];
// Thời điểm cập nhật dữ liệu của tab (meta.lastUpdated) - dùng để nhận ra VPH đã cũ.
let dataUpdatedMs = 0;
let filteredVideos = [];
let currentComments = [];
let sortField = "publishedAt";
let sortDir = "desc";
let commentSortField = "likeCount";
let commentSortDir = "desc";
let allChannelIds = [];
let selectedChannelIds = new Set(); // empty set = all channels selected
let currentList = "MyTab"; // which named channel list (tab) is active

const els = {
  tbody: document.getElementById("videoTableBody"),
  marketTabs: document.getElementById("marketTabs"),
  filterVph: document.getElementById("filterVph"),
  vphDash: document.getElementById("vphDash"),
  search: document.getElementById("searchInput"),
  sortField: document.getElementById("sortField"),
  sortDir: document.getElementById("sortDir"),
  channelFilterWrap: document.getElementById("channelFilterWrap"),
  channelFilterBtn: document.getElementById("channelFilterBtn"),
  channelFilterPanel: document.getElementById("channelFilterPanel"),
  channelFilterList: document.getElementById("channelFilterList"),
  channelFilterLabel: document.getElementById("channelFilterLabel"),
  selectAllChannels: document.getElementById("selectAllChannels"),
  clearAllChannels: document.getElementById("clearAllChannels"),
  metaViews1d: document.getElementById("metaViews1d"),
  metaViews7d: document.getElementById("metaViews7d"),
  metaTotalVph: document.getElementById("metaTotalVph"),
  metaChannels: document.getElementById("metaChannels"),
  metaVideos: document.getElementById("metaVideos"),
  metaUpdated: document.getElementById("metaUpdated"),
  fetchTriggerWrap: document.getElementById("fetchTriggerWrap"),
  fetchTriggerBtn: document.getElementById("fetchTriggerBtn"),
  fetchTriggerPanel: document.getElementById("fetchTriggerPanel"),
  fetchForceRefresh: document.getElementById("fetchForceRefresh"),
  fetchFullHistory: document.getElementById("fetchFullHistory"),
  fetchTriggerSubmit: document.getElementById("fetchTriggerSubmit"),
  fetchTriggerStatus: document.getElementById("fetchTriggerStatus"),
  manageChannelsWrap: document.getElementById("manageChannelsWrap"),
  manageChannelsBtn: document.getElementById("manageChannelsBtn"),
  manageChannelsPanel: document.getElementById("manageChannelsPanel"),
  manageChannelsStatus: document.getElementById("manageChannelsStatus"),
  mcTabSelect: document.getElementById("mcTabSelect"),
  mcChannelInput: document.getElementById("mcChannelInput"),
  mcAddChannelBtn: document.getElementById("mcAddChannelBtn"),
  mcNewTabName: document.getElementById("mcNewTabName"),
  mcNewTabChannel: document.getElementById("mcNewTabChannel"),
  mcAddTabBtn: document.getElementById("mcAddTabBtn"),
  mcChannelList: document.getElementById("mcChannelList"),
  mcRenameTabInput: document.getElementById("mcRenameTabInput"),
  mcRenameTabBtn: document.getElementById("mcRenameTabBtn"),
  mcDeleteTabBtn: document.getElementById("mcDeleteTabBtn"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  channelModalOverlay: document.getElementById("channelModalOverlay"),
  channelModalClose: document.getElementById("channelModalClose"),
  channelModalAvatar: document.getElementById("channelModalAvatar"),
  channelModalName: document.getElementById("channelModalName"),
  channelModalSub: document.getElementById("channelModalSub"),
  channelModalGrid: document.getElementById("channelModalGrid"),
  channelModalRevenue: document.getElementById("channelModalRevenue"),
  channelRpmMin: document.getElementById("channelRpmMin"),
  channelRpmMax: document.getElementById("channelRpmMax"),
  modalThumb: document.getElementById("modalThumb"),
  modalTitle: document.getElementById("modalTitle"),
  modalChannel: document.getElementById("modalChannel"),
  modalStats: document.getElementById("modalStats"),
  commentsList: document.getElementById("commentsList"),
  commentSortField: document.getElementById("commentSortField"),
  commentSortDir: document.getElementById("commentSortDir"),
  videoTableColgroup: document.getElementById("videoTableColgroup"),
  videoTableHeadRow: document.getElementById("videoTableHeadRow"),
  channelGroupSummary: document.getElementById("channelGroupSummary"),
  exportExcelBtn: document.getElementById("exportExcelBtn"),
};

// Tạo Intl formatter 1 lần rồi dùng lại. Tạo mới mỗi lần gọi (new Intl.NumberFormat /
// toLocaleDateString) rất tốn - bảng gọi các hàm này hàng chục nghìn lần mỗi lần vẽ lại.
const NUMBER_FMT = new Intl.NumberFormat("vi-VN");
const DATE_FMT = new Intl.DateTimeFormat("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
const DATETIME_FMT = new Intl.DateTimeFormat("vi-VN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtNumber(n) {
  if (n === null || n === undefined) return "–";
  return NUMBER_FMT.format(n);
}

// viewsPerHourSource: "recent" (view tăng thật giữa 2 lần lấy dữ liệu, ~24h) | "lifetime" (video
// mới đăng < 48h chưa có mốc so sánh: trung bình từ lúc đăng) | "pending" (video cũ chưa có mốc
// so sánh: chưa tính) | "live".
function fmtViewsPerHour(v) {
  const state = vphState(v);
  if (state === "live") {
    return `<span class="vph-live" title="Video dạng Live (${escapeAttr(LIVE_STATUS_LABELS[v.liveStatus].short.toLowerCase())}) - không tính view/giờ và không cộng vào Tổng VPH">–</span>`;
  }
  if (state === "pending") {
    return `<span class="vph-live" title="Chưa đủ dữ liệu: cần thêm 1 lần cập nhật nữa để đo view tăng thật - chưa cộng vào Tổng VPH">–</span>`;
  }
  if (state === "stale") {
    return `<span class="vph-live" title="Số liệu của video này chưa được cập nhật hơn 48 giờ (kênh lỗi, video bị ẩn/xoá...) - không cộng vào Tổng VPH">–</span>`;
  }
  const num = fmtNumber(v.viewsPerHour);
  if (v.viewsPerHourSource === "lifetime") {
    return `${num} <span class="vph-badge" title="Video mới đăng, chưa có mốc so sánh - đây là trung bình từ lúc đăng tới nay">~</span>`;
  }
  if (v.vphWindowHours) {
    return `<span title="Tính trên ${escapeAttr(String(v.vphWindowHours))} giờ gần nhất">${num}</span>`;
  }
  return num;
}

function fmtDate(iso) {
  if (!iso) return "–";
  return DATE_FMT.format(new Date(iso));
}

function fmtDateTime(iso) {
  if (!iso) return "–";
  return DATETIME_FMT.format(new Date(iso));
}

function parseDurationToSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

function fmtDuration(iso) {
  const total = parseDurationToSeconds(iso);
  if (!total) return "–";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Phân loại theo thời lượng: Video ngắn (< 60 phút) / Video dài (từ 60 phút trở
// lên). Không hiển thị trong bảng dữ liệu - chỉ dùng khi xuất Excel.
function classifyVideoLength(v) {
  const minutes = parseDurationToSeconds(v.duration) / 60;
  return minutes >= 60 ? "Video dài" : "Video ngắn";
}

// ---------- Biến phân tích mở rộng (Lịch sử đăng / Tương tác / Nhóm kênh) ----------
// Các cột này LUÔN hiển thị trong bảng cùng các cột cơ bản - không còn cơ chế
// ẩn/hiện cột nữa.

const DAY_MS = 24 * 60 * 60 * 1000;

function getDaysAgo(v) {
  if (!v.publishedAt) return null;
  return Math.floor((Date.now() - new Date(v.publishedAt).getTime()) / DAY_MS);
}

// Video đăng từ bao nhiêu ngày trở lên thì số ở cột "Lịch sử đăng" được đổi màu (xem .days-old trong style.css).
const OLD_VIDEO_DAYS = 30;

function isOldVideo(v) {
  const d = getDaysAgo(v);
  return d !== null && d >= OLD_VIDEO_DAYS;
}

function renderDaysAgoCell(v) {
  const text = fmtDaysAgo(v);
  if (!isOldVideo(v)) return `<td class="col-num">${text}</td>`;
  return `<td class="col-num"><span class="days-old" title="Đã đăng từ ${OLD_VIDEO_DAYS} ngày trở lên">${text}</span></td>`;
}

function fmtDaysAgo(v) {
  const d = getDaysAgo(v);
  if (d === null) return "–";
  // Hiển thị thuần số (số ngày kể từ khi đăng), không kèm chữ. Đăng hôm nay = 0.
  return fmtNumber(Math.max(0, d));
}

// Tỷ lệ tương tác = (lượt thích + bình luận) / lượt xem. likeCount có thể null
// (kênh ẩn số liệu) - khi đó coi như 0 trong công thức, không loại cả video ra.
function getEngagementRate(v) {
  if (!v.viewCount) return null;
  const likes = v.likeCount || 0;
  const comments = v.commentCount || 0;
  return (likes + comments) / v.viewCount;
}

function fmtEngagement(v) {
  const r = getEngagementRate(v);
  if (r === null) return "–";
  return `${(r * 100).toFixed(2)}%`;
}

// Phân nhóm kênh theo sub: Kênh mới (<2K) / Kênh nhỏ (2K-10K) / Kênh lớn (>10K).
function classifyChannelGroup(subscriberCount) {
  if (subscriberCount === null || subscriberCount === undefined) {
    return { label: "Không rõ", cls: "unknown", rank: 0 };
  }
  if (subscriberCount < 2000) return { label: "Kênh mới", cls: "new", rank: 1 };
  if (subscriberCount <= 10000) return { label: "Kênh nhỏ", cls: "small", rank: 2 };
  return { label: "Kênh lớn", cls: "large", rank: 3 };
}

// Nhận xét nhanh khi di chuột vào lượt xem: Thất bại / Bình thường / Tiềm năng / Top View.
function classifyViewRating(viewCount) {
  if (viewCount === null || viewCount === undefined) return null;
  if (viewCount < 5000) return { label: "Thất bại", cls: "fail" };
  if (viewCount < 20000) return { label: "Bình thường", cls: "normal" };
  if (viewCount <= 100000) return { label: "Tiềm năng", cls: "potential" };
  return { label: "Top View", cls: "top" };
}

// ---------- Live / công chiếu ----------
// liveStatus do scripts/fetch-data.mjs ghi (từ liveBroadcastContent + liveStreamingDetails):
//   "live" đang phát | "upcoming" sắp phát | "ended" từng live/công chiếu, nay là bản VOD | "none".
// API không phân biệt được live với công chiếu (premiere), nên dùng chung 1 nhãn.
const LIVE_STATUS_LABELS = {
  live: { short: "Đang live/công chiếu", text: "🔴 LIVE", cls: "live" },
  upcoming: { short: "Sắp phát", text: "⏳ Sắp phát", cls: "upcoming" },
  ended: { short: "Đã live/công chiếu", text: "Từng live", cls: "ended" },
};

// VPH chỉ tính cho dạng "Video". Mọi video dạng "Live" (đang live, sắp phát, đã từng
// live/công chiếu) không hiện view/giờ và không cộng vào Tổng VPH.
const VPH_EXCLUDED_LIVE_STATES = new Set(["live", "upcoming", "ended"]);

function isVphExcluded(v) {
  return VPH_EXCLUDED_LIVE_STATES.has(v.liveStatus);
}

// VPH chỉ được dùng (hiện số, cộng tổng, sắp xếp) khi là số liệu MỚI: mốc view gần nhất của
// video không cũ hơn 48h so với lần cập nhật dữ liệu. VPH cũ hơn (kênh lỗi, video bị xoá/ẩn,
// hết quota...) không còn phản ánh tốc độ hiện tại nên bị bỏ ra, thay vì cộng số "đóng băng".
const VPH_MAX_AGE_MS = 48 * 3600 * 1000;

function vphState(v) {
  if (isVphExcluded(v)) return "live";
  if (v.viewsPerHour === null || v.viewsPerHour === undefined) return "pending";
  const snaps = v.snapshots;
  const lastMs = Array.isArray(snaps) && snaps.length ? snaps[snaps.length - 1][0] : 0;
  if (!lastMs || (dataUpdatedMs && dataUpdatedMs - lastMs > VPH_MAX_AGE_MS)) return "stale";
  // Trung bình từ lúc đăng chỉ có nghĩa với video mới đăng (< 48h). Dữ liệu cũ còn sót số kiểu này
  // cho video lâu năm thì coi như chưa đủ dữ liệu.
  if (v.viewsPerHourSource === "lifetime" && lastMs - Date.parse(v.publishedAt) > VPH_MAX_AGE_MS) return "pending";
  return "ok";
}

// Giá trị VPH dùng được, hoặc null.
function getVph(v) {
  return vphState(v) === "ok" ? v.viewsPerHour : null;
}

// ---------- Loại video: "Video" (thường) hoặc "Live" (đang/sắp/đã từng live hoặc công chiếu) ----------
function classifyVideoType(v) {
  if (v.liveStatus === "live" || v.liveStatus === "upcoming" || v.liveStatus === "ended") {
    return { label: "Live", cls: "live", rank: 1 };
  }
  return { label: "Video", cls: "video", rank: 0 };
}

function renderLiveBadge(v) {
  const info = LIVE_STATUS_LABELS[v.liveStatus];
  if (!info) return "";
  const d = v.liveStreamingDetails || {};
  let tip = info.short;
  if (v.liveStatus === "upcoming" && d.scheduledStartTime) tip += ` - dự kiến ${fmtDateTime(d.scheduledStartTime)}`;
  if (v.liveStatus === "live" && d.actualStartTime) tip += ` - bắt đầu ${fmtDateTime(d.actualStartTime)}`;
  if (v.liveStatus === "ended" && d.actualEndTime) tip += ` - kết thúc ${fmtDateTime(d.actualEndTime)}`;
  return `<span class="live-badge live-badge--${info.cls}" title="${escapeAttr(tip)}">${info.text}</span> `;
}

// ---------- Bộ lọc nhanh trên thanh tóm tắt phía trên bảng ----------
// Rỗng = không lọc (hiện tất cả). Có ≥1 phần tử = chỉ hiện video thuộc các nhóm đã chọn.
let selectedChannelGroups = new Set(); // "new" | "small" | "large" | "unknown"
let selectedTimeGroups = new Set(); // "lt2" | "lt10" | "10to30" | "0to30" | "gte30"
// Khoảng thời gian đăng của Dashboard (KHÔNG chồng lên nhau, khác với các nút thời gian ở trên bảng):
//   Dưới 3 ngày  : ngày 0 – 2   (tính hết ngày thứ 2)
//   Dưới 10 ngày : ngày 3 – 9   (tính hết ngày thứ 9)
//   Dưới 30 ngày : ngày 10 – 30 (tính cả ngày thứ 30)
//   Trên 30 ngày : từ ngày 31 trở đi
// Số ngày tính như cột "Lịch sử đăng". Bấm vào dòng trên Dashboard = lọc bảng theo khoảng đó.
const DASH_TIME_BUCKETS = [
  { cls: "d0to2", label: "Dưới 3 ngày", note: "0 – 2 ngày", match: (d) => d <= 2 },
  { cls: "d3to9", label: "Dưới 10 ngày", note: "3 – 9 ngày", match: (d) => d >= 3 && d <= 9 },
  { cls: "d10to30", label: "Dưới 30 ngày", note: "10 – 30 ngày", match: (d) => d >= 10 && d <= 30 },
  { cls: "d31plus", label: "Trên 30 ngày", note: "từ ngày 31", match: (d) => d > 30 },
];
let selectedDashTimes = new Set();

function inDashTimeBucket(v, cls) {
  const d = getDaysAgo(v);
  const b = DASH_TIME_BUCKETS.find((x) => x.cls === cls);
  return d !== null && Boolean(b && b.match(d));
}

// Nhóm theo thời gian đăng (số ngày kể từ khi đăng, cùng cách tính với cột "Lịch sử đăng"):
//   Dưới 2 ngày    : 0 – 2 ngày (tính cả video đăng đúng 2 ngày)
//   Dưới 10 ngày   : 0 – 9 ngày   (bao gồm cả các video "Dưới 2 ngày")
//   Từ 10 - 30 ngày: 10 – 29 ngày
//   0 - 30 ngày    : 0 – 30 ngày (tính cả video đăng đúng 30 ngày)
//   Trên 30 ngày   : từ 30 ngày trở lên
// "Dưới 2 ngày" nằm TRONG "Dưới 10 ngày" nên 1 video có thể thuộc 2 nhóm -
// vì vậy mỗi nhóm là 1 điều kiện riêng (match), không phải phân loại duy nhất.
// Chọn nhiều nhóm = hiện video thuộc BẤT KỲ nhóm nào đã chọn.
const TIME_GROUPS = [
  { cls: "lt2", label: "Dưới 2 ngày", match: (d) => d <= 2 },
  { cls: "lt10", label: "Dưới 10 ngày", match: (d) => d < 10 },
  { cls: "10to30", label: "Từ 10 - 30 ngày", match: (d) => d >= 10 && d < 30 },
  { cls: "0to30", label: "0 - 30 ngày", match: (d) => d <= 30 },
  { cls: "gte30", label: "Trên 30 ngày", match: (d) => d >= 30 },
];

function inTimeGroup(v, cls) {
  const d = getDaysAgo(v);
  if (d === null) return false;
  const g = TIME_GROUPS.find((x) => x.cls === cls);
  return Boolean(g && g.match(d));
}

function renderViewCountCell(v) {
  const rating = classifyViewRating(v.viewCount);
  const num = fmtNumber(v.viewCount);
  if (!rating) return num;
  return `<span class="view-rating view-rating--${rating.cls}" data-tooltip="${escapeAttr(rating.label)}">${num}</span>`;
}

// ---------- Định nghĩa cột: 6 cột cơ bản + 5 cột "biến" - TẤT CẢ luôn hiển thị ----------
// (Thích/Bình luận KHÔNG còn là cột trên bảng.)

const BASE_COLUMNS = [
  {
    key: "video",
    label: "Video",
    headClass: "col-video",
    colClass: "cg-video",
    sortField: null,
    renderCell: (v) => `
      <td>
        <div class="video-cell">
          <a class="video-cell__thumb-link" href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener" title="Mở video trên YouTube">
            <img src="${v.thumbnail}" alt="" loading="lazy" />
          </a>
          <div class="video-cell__info">
            <div class="video-cell__title" data-video-id="${v.videoId}">${renderLiveBadge(v)}${escapeHtml(v.title)}</div>
            <div class="video-cell__actions">
              <button class="comments-btn" data-video-id="${v.videoId}">💬 Xem bình luận</button>
              <button class="comments-btn comments-export-btn" data-video-id="${v.videoId}" title="Xuất tối đa 100 bình luận nhiều like nhất (kèm bản dịch tiếng Việt) ra file Excel">⬇ Excel</button>
            </div>
          </div>
        </div>
      </td>`,
    excelValue: (v) => v.title || "",
  },
  {
    // ID video do YouTube Data API trả về (videos.list -> id), chính xác 11 ký tự, phân biệt hoa/thường.
    key: "videoId",
    label: "ID video",
    headClass: "col-id",
    colClass: "cg-id",
    sortField: null,
    renderCell: (v) => `
      <td class="col-id">
        <button type="button" class="video-id-btn" data-copy-id="${escapeAttr(v.videoId)}" title="Bấm để copy ID video">${escapeHtml(v.videoId)}</button>
      </td>`,
    excelValue: (v) => v.videoId || "",
  },
  {
    key: "channel",
    label: "Kênh",
    headClass: "col-channel",
    colClass: "cg-channel",
    sortField: null,
    renderCell: (v) => `
      <td class="channel-cell" data-channel-id="${v.channelId}">
        <img class="channel-cell__avatar" src="${v.channelThumbnail}" alt="" loading="lazy" />
        <span>${escapeHtml(v.channelTitle)}</span>
      </td>`,
    excelValue: (v) => v.channelTitle || "",
  },
  {
    key: "publishedAt",
    label: "Ngày đăng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "publishedAt",
    renderCell: (v) => `<td class="col-num">${fmtDate(v.publishedAt)}</td>`,
    excelValue: (v) => fmtDate(v.publishedAt),
  },
  {
    key: "duration",
    label: "Thời lượng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "duration",
    renderCell: (v) => `<td class="col-num">${fmtDuration(v.duration)}</td>`,
    excelValue: (v) => fmtDuration(v.duration),
  },
  {
    key: "viewCount",
    label: "Lượt xem",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "viewCount",
    renderCell: (v) => `<td class="col-num">${renderViewCountCell(v)}</td>`,
    excelValue: (v) => v.viewCount ?? "",
  },
  {
    key: "subscriberCount",
    label: "Sub kênh",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "subscriberCount",
    renderCell: (v) => `<td class="col-num">${fmtNumber(v.subscriberCount)}</td>`,
    excelValue: (v) => v.subscriberCount ?? "",
  },
];

// 5 cột "biến" mở rộng - luôn hiển thị trong bảng cùng BASE_COLUMNS.
const METRIC_COLUMNS = {
  viewsPerHour: {
    key: "viewsPerHour",
    label: "View/giờ",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "viewsPerHour",
    headTitle: "Tốc độ tăng view (view/giờ) = số view tăng thật trong ~24 giờ gần nhất. Dấu ~ = video mới đăng chưa có mốc so sánh, đang là trung bình từ lúc đăng. Dấu – = video Live, chưa đủ dữ liệu hoặc chưa cập nhật > 48 giờ (không cộng vào Tổng VPH).",
    renderCell: (v) => `<td class="col-num">${fmtViewsPerHour(v)}</td>`,
    excelValue: (v) => {
      const state = vphState(v);
      if (state === "live") return LIVE_STATUS_LABELS[v.liveStatus].short;
      if (state === "pending") return "Chưa đủ dữ liệu";
      if (state === "stale") return "Chưa cập nhật";
      return v.viewsPerHour;
    },
  },
  daysAgo: {
    key: "daysAgo",
    label: "Lịch sử đăng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "daysAgo",
    headTitle: `Số ngày kể từ khi video được đăng. Từ ${OLD_VIDEO_DAYS} ngày trở lên hiển thị màu khác.`,
    renderCell: (v) => renderDaysAgoCell(v),
    excelValue: (v) => getDaysAgo(v) ?? "",
  },
  engagement: {
    key: "engagement",
    label: "Tương tác",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "engagement",
    headTitle: "Tỷ lệ tương tác = (Lượt thích + Bình luận) / Lượt xem.",
    renderCell: (v) => `<td class="col-num">${fmtEngagement(v)}</td>`,
    excelValue: (v) => {
      const r = getEngagementRate(v);
      return r === null ? "" : +(r * 100).toFixed(2);
    },
  },
  channelGroup: {
    key: "channelGroup",
    label: "Nhóm kênh",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "channelGroup",
    headTitle: "Phân nhóm theo sub kênh: Kênh mới (<2K) / Kênh nhỏ (2K-10K) / Kênh lớn (>10K).",
    renderCell: (v) => {
      const g = classifyChannelGroup(v.subscriberCount);
      return `<td class="col-num"><span class="channel-group-badge channel-group-badge--${g.cls}">${g.label}</span></td>`;
    },
    excelValue: (v) => classifyChannelGroup(v.subscriberCount).label,
  },
  videoType: {
    key: "videoType",
    label: "Loại video",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "videoType",
    headTitle: "Phân loại video: Video (video thường) hoặc Live (đang live/sắp phát/đã từng live hoặc công chiếu).",
    renderCell: (v) => {
      const t = classifyVideoType(v);
      return `<td class="col-num"><span class="channel-group-badge channel-group-badge--${t.cls}">${t.label}</span></td>`;
    },
    excelValue: (v) => classifyVideoType(v).label,
  },
};

// Cả 5 biến (View/giờ, Lịch sử đăng, Tương tác, Nhóm kênh, Loại video) luôn hiện trong bảng.
const ALWAYS_VISIBLE_METRICS = ["viewsPerHour", "daysAgo", "engagement", "channelGroup", "videoType"];

function getActiveColumns() {
  const metricCols = ALWAYS_VISIBLE_METRICS.map((k) => METRIC_COLUMNS[k]);
  return [...BASE_COLUMNS, ...metricCols];
}

function getSortValue(v, field) {
  switch (field) {
    case "viewsPerHour":
      // video dạng Live không có VPH -> luôn xếp sau video thường khi sắp xếp giảm dần
      return getVph(v) ?? -1;
    case "publishedAt":
      return new Date(v.publishedAt).getTime();
    case "duration":
      return parseDurationToSeconds(v.duration);
    case "daysAgo": {
      const d = getDaysAgo(v);
      return d === null ? -1 : d;
    }
    case "engagement": {
      const r = getEngagementRate(v);
      return r === null ? -1 : r;
    }
    case "channelGroup":
      return classifyChannelGroup(v.subscriberCount).rank;
    case "videoType":
      return classifyVideoType(v).rank;
    default:
      return v[field] ?? -1;
  }
}

async function loadData() {
  els.tbody.innerHTML = `<tr><td colspan="${getActiveColumns().length}" class="empty-state"><span class="loading-plane">✈️</span> Đang tải dữ liệu...</td></tr>`;
  try {
    const [videosRes, metaRes] = await Promise.all([
      fetch(`data/videos-${currentList}.json`, { cache: "no-cache" }),
      fetch(`data/meta-${currentList}.json`, { cache: "no-cache" }),
    ]);
    allVideos = videosRes.ok ? await videosRes.json() : [];
    const meta = metaRes.ok ? await metaRes.json() : null;
    // Lịch sử tổng view kênh + View 7 ngày nhập tay (file có thể chưa tồn tại -> bỏ qua).
    const [statsJson, manualJson] = await Promise.all(
      [`data/channel-stats-${currentList}.json`, `data/manual-views7d-${currentList}.json`].map((u) =>
        fetch(u, { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({}))
      )
    );
    channelStats = statsJson || {};
    manualViews7d = manualJson || {};
    dataUpdatedMs = meta?.lastUpdated ? Date.parse(meta.lastUpdated) || 0 : 0;

    populateChannelFilter();
    if (meta) {
      els.metaChannels.textContent = meta.channelCount ?? "–";
      els.metaVideos.textContent = meta.videoCount ?? allVideos.length;
      els.metaUpdated.textContent = meta.lastUpdated ? fmtDateTime(meta.lastUpdated) : "–";
    } else {
      els.metaVideos.textContent = allVideos.length;
    }
    // Tổng view 1/7 ngày = tổng lượt xem (hiện tại) của các video ĐĂNG trong
    // khoảng thời gian đó - không phải tốc độ tăng view.
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let views1d = 0;
    let views7d = 0;
    for (const v of allVideos) {
      if (!v.publishedAt) continue;
      const ageMs = now - new Date(v.publishedAt).getTime();
      if (ageMs <= 7 * DAY_MS) views7d += v.viewCount || 0;
      if (ageMs <= DAY_MS) views1d += v.viewCount || 0;
    }
    els.metaViews1d.textContent = fmtNumber(views1d);
    els.metaViews7d.textContent = fmtNumber(views7d);
    // Tổng VPH của cả tab - tính trên toàn bộ video của danh sách đang chọn,
    // không bị ảnh hưởng bởi tìm kiếm/lọc kênh hiện tại.
    // Video dạng Live KHÔNG được cộng vào (xem isVphExcluded).
    const t = sumVph(allVideos);
    els.metaTotalVph.textContent = fmtNumber(t.total);
    const vphChip = els.metaTotalVph.parentElement;
    if (vphChip) vphChip.title = vphExcludedNote(t) || "Tổng view/giờ của tất cả video trong tab";
    applyFilters();
  } catch (err) {
    els.tbody.innerHTML = `<tr><td colspan="${getActiveColumns().length}" class="empty-state">Không tải được dữ liệu. Hãy chắc chắn GitHub Action đã chạy ít nhất 1 lần và public/data/videos-${currentList}.json tồn tại.</td></tr>`;
    els.metaTotalVph.textContent = "–";
    els.metaViews1d.textContent = "–";
    els.metaViews7d.textContent = "–";
    console.error(err);
  }
}

function switchList(listName) {
  if (listName === currentList) return;
  currentList = listName;
  els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
    const isActive = btn.dataset.list === currentList;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  els.search.value = "";
  selectedChannelGroups.clear();
  selectedTimeGroups.clear();
  selectedDashTimes.clear();
  loadData();
}

// Tab được tạo tự động từ public/data/tabs.json - thêm/xoá tab trong
// channels.json (kể cả qua bảng "Quản lý kênh") là đủ, không cần sửa HTML.
async function loadTabs() {
  try {
    const res = await fetch("data/tabs.json", { cache: "no-cache" });
    const tabs = res.ok ? await res.json() : [];
    renderTabs(tabs.length ? tabs : [currentList]);
  } catch (err) {
    console.error("Không tải được danh sách tab:", err);
    renderTabs([currentList]);
  }
}

function renderTabs(tabs) {
  if (!tabs.includes(currentList)) currentList = tabs[0];
  els.marketTabs.innerHTML = tabs
    .map(
      (t) =>
        `<button type="button" class="market-tab${t === currentList ? " active" : ""}" data-list="${escapeAttr(t)}" role="tab" aria-selected="${t === currentList}">${escapeHtml(t)}</button>`
    )
    .join("");
  els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchList(btn.dataset.list));
  });
  populateManageTabSelect(tabs);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

function populateChannelFilter() {
  const channels = new Map();
  for (const v of allVideos) {
    if (!channels.has(v.channelId)) {
      channels.set(v.channelId, { title: v.channelTitle, thumbnail: v.channelThumbnail || "" });
    }
  }
  const sorted = [...channels.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  allChannelIds = sorted.map(([id]) => id);
  // Empty selection means "all channels" - start with nothing checked = show everything.
  selectedChannelIds = new Set();

  els.channelFilterList.innerHTML = sorted
    .map(
      ([id, info]) => `
    <div class="channel-filter__item" data-id="${id}">
      <input type="checkbox" value="${id}" />
      <a class="channel-filter__link" href="https://www.youtube.com/channel/${id}" target="_blank" rel="noopener" title="Mở kênh trên YouTube">
        <img class="channel-filter__avatar" src="${info.thumbnail}" alt="" loading="lazy" />
        <span>${escapeHtml(info.title)}</span>
      </a>
    </div>`
    )
    .join("");

  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedChannelIds.add(cb.value);
      else selectedChannelIds.delete(cb.value);
      updateChannelFilterLabel();
      applyFilters();
    });
  });

  // Clicking anywhere on the row still toggles the filter checkbox, except
  // when the click is on the avatar/name link, which navigates to YouTube instead.
  els.channelFilterList.querySelectorAll(".channel-filter__item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".channel-filter__link")) return;
      if (e.target.tagName === "INPUT") return;
      const cb = item.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  updateChannelFilterLabel();
}

function updateChannelFilterLabel() {
  if (selectedChannelIds.size === 0 || selectedChannelIds.size === allChannelIds.length) {
    els.channelFilterLabel.textContent = "Tất cả kênh";
  } else if (selectedChannelIds.size === 1) {
    const id = [...selectedChannelIds][0];
    const cb = els.channelFilterList.querySelector(`input[value="${id}"]`);
    els.channelFilterLabel.textContent = cb ? cb.parentElement.querySelector("span").textContent : "1 kênh";
  } else {
    els.channelFilterLabel.textContent = `${selectedChannelIds.size} kênh đã chọn`;
  }
}

function toggleChannelPanel(forceOpen) {
  const isOpen = els.channelFilterWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.channelFilterWrap.classList.toggle("open", shouldOpen);
}

els.channelFilterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleChannelPanel();
});

document.addEventListener("click", (e) => {
  if (!els.channelFilterWrap.contains(e.target)) toggleChannelPanel(false);
  if (!els.fetchTriggerWrap.contains(e.target)) toggleFetchPanel(false);
  if (!els.manageChannelsWrap.contains(e.target)) toggleManagePanel(false);
});

function toggleFetchPanel(forceOpen) {
  const isOpen = els.fetchTriggerWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.fetchTriggerWrap.classList.toggle("open", shouldOpen);
  if (shouldOpen) setFetchStatus("");
}

els.fetchTriggerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFetchPanel();
});

function setFetchStatus(message, kind) {
  els.fetchTriggerStatus.textContent = message;
  els.fetchTriggerStatus.classList.toggle("visible", Boolean(message));
  els.fetchTriggerStatus.classList.remove("fetch-trigger__status--ok", "fetch-trigger__status--error");
  if (kind) els.fetchTriggerStatus.classList.add(`fetch-trigger__status--${kind}`);
}

async function submitFetchTrigger() {
  els.fetchTriggerSubmit.disabled = true;
  setFetchStatus("Đang gửi yêu cầu...", "");

  try {
    const res = await fetch("/api/trigger-fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forceRefreshComments: els.fetchForceRefresh.checked,
        fullChannelHistory: els.fetchFullHistory.checked,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setFetchStatus(
        "Đã kích hoạt! Quá trình lấy dữ liệu chạy nền vài phút, tải lại trang sau đó để xem kết quả mới.",
        "ok"
      );
    } else {
      setFetchStatus(data.error || "Có lỗi xảy ra, thử lại sau.", "error");
    }
  } catch (err) {
    setFetchStatus("Không kết nối được tới server.", "error");
  } finally {
    els.fetchTriggerSubmit.disabled = false;
  }
}

els.fetchTriggerSubmit.addEventListener("click", submitFetchTrigger);

// ===== Quản lý kênh (thêm/xoá kênh, thêm/xoá tab) =====

let mcTabsCache = {}; // { tabName: [channel, ...] }

function toggleManagePanel(forceOpen) {
  const isOpen = els.manageChannelsWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.manageChannelsWrap.classList.toggle("open", shouldOpen);
  if (shouldOpen) {
    setManageStatus("");
    loadManageTabs();
  }
}

els.manageChannelsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleManagePanel();
});

function setManageStatus(message, kind) {
  els.manageChannelsStatus.textContent = message;
  els.manageChannelsStatus.classList.toggle("visible", Boolean(message));
  els.manageChannelsStatus.classList.remove("fetch-trigger__status--ok", "fetch-trigger__status--error");
  if (kind) els.manageChannelsStatus.classList.add(`fetch-trigger__status--${kind}`);
}

function populateManageTabSelect(tabs) {
  const prevValue = els.mcTabSelect.value;
  els.mcTabSelect.innerHTML = tabs.map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
  if (tabs.includes(prevValue)) els.mcTabSelect.value = prevValue;
}

async function loadManageTabs() {
  try {
    const res = await fetch("/api/manage-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listTabs" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.channels) {
      mcTabsCache = data.channels;
      populateManageTabSelect(Object.keys(mcTabsCache));
      renderManageChannelList();
    }
  } catch (err) {
    // Im lặng - danh sách kênh vẫn dùng được từ cache trước đó (nếu có).
  }
}

function renderManageChannelList() {
  const tab = els.mcTabSelect.value;
  const list = mcTabsCache[tab] || [];
  if (!list.length) {
    els.mcChannelList.innerHTML = `<div class="manage-channels__empty">Chưa có kênh nào trong tab này.</div>`;
    return;
  }
  els.mcChannelList.innerHTML = list
    .map(
      (c) =>
        `<div class="manage-channels__item">
          <span class="manage-channels__item-text">${escapeHtml(c)}</span>
          <button type="button" class="manage-channels__remove" data-channel="${escapeAttr(c)}" title="Xoá kênh này">✕</button>
        </div>`
    )
    .join("");
  els.mcChannelList.querySelectorAll(".manage-channels__remove").forEach((btn) => {
    btn.addEventListener("click", () => removeChannel(tab, btn.dataset.channel));
  });
}

els.mcTabSelect.addEventListener("change", renderManageChannelList);

async function callManageChannels(payload, busyBtn) {
  if (busyBtn) busyBtn.disabled = true;
  setManageStatus("Đang xử lý...", "");
  try {
    const res = await fetch("/api/manage-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setManageStatus("Xong! Dữ liệu sẽ tự cập nhật trong vài phút.", "ok");
      await loadManageTabs();
      await loadTabs();
      return true;
    }
    setManageStatus(data.error || "Có lỗi xảy ra, thử lại sau.", "error");
    return false;
  } catch (err) {
    setManageStatus("Không kết nối được tới server.", "error");
    return false;
  } finally {
    if (busyBtn) busyBtn.disabled = false;
  }
}

els.mcAddChannelBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  const channel = els.mcChannelInput.value.trim();
  if (!tab) return setManageStatus("Chưa có tab nào - tạo tab mới trước đã.", "error");
  if (!channel) return setManageStatus("Dán link/handle kênh trước đã.", "error");
  const ok = await callManageChannels({ action: "addChannel", tab, channel }, els.mcAddChannelBtn);
  if (ok) els.mcChannelInput.value = "";
});

els.mcAddTabBtn.addEventListener("click", async () => {
  const tab = els.mcNewTabName.value.trim();
  const channel = els.mcNewTabChannel.value.trim();
  if (!tab) return setManageStatus("Nhập tên tab mới trước đã.", "error");
  if (!channel) return setManageStatus("Dán link/handle kênh đầu tiên trước đã.", "error");
  const ok = await callManageChannels({ action: "addTab", tab, channel }, els.mcAddTabBtn);
  if (ok) {
    els.mcNewTabName.value = "";
    els.mcNewTabChannel.value = "";
    els.mcTabSelect.value = tab;
    renderManageChannelList();
  }
});

els.mcRenameTabBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  const newTabName = els.mcRenameTabInput.value.trim();
  if (!tab) return setManageStatus("Chưa có tab nào để đổi tên.", "error");
  if (!newTabName) return setManageStatus("Nhập tên mới cho tab trước đã.", "error");
  const wasCurrent = tab === currentList;
  const ok = await callManageChannels({ action: "renameTab", tab, newTab: newTabName }, els.mcRenameTabBtn);
  if (ok) {
    els.mcRenameTabInput.value = "";
    els.mcTabSelect.value = newTabName;
    renderManageChannelList();
    if (wasCurrent) {
      currentList = newTabName;
      els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
        const isActive = btn.dataset.list === currentList;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
      loadData();
    }
  }
});

els.mcDeleteTabBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  if (!tab) return setManageStatus("Chưa có tab nào để xoá.", "error");
  if (Object.keys(mcTabsCache).length <= 1) {
    return setManageStatus("Không thể xoá tab cuối cùng - cần ít nhất 1 tab.", "error");
  }
  if (!confirm(`Xoá toàn bộ tab "${tab}" và danh sách kênh trong đó? Không thể hoàn tác.`)) return;
  const wasCurrent = tab === currentList;
  const ok = await callManageChannels({ action: "removeTab", tab }, els.mcDeleteTabBtn);
  // Nếu vừa xoá đúng tab đang xem, loadTabs() bên trong callManageChannels đã
  // tự chuyển currentList sang tab đầu tiên còn lại - chỉ cần tải lại dữ liệu.
  if (ok && wasCurrent) loadData();
});

async function removeChannel(tab, channel) {
  if (!confirm(`Xoá kênh này khỏi tab "${tab}"?\n${channel}`)) return;
  await callManageChannels({ action: "removeChannel", tab, channel });
}

els.selectAllChannels.addEventListener("click", () => {
  selectedChannelIds = new Set(allChannelIds);
  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
  updateChannelFilterLabel();
  applyFilters();
});

els.clearAllChannels.addEventListener("click", () => {
  selectedChannelIds = new Set();
  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  updateChannelFilterLabel();
  applyFilters();
});

// ---------- Nhận diện NGÔN NGỮ / QUỐC GIA / CHÂU LỤC trong tiêu đề video ----------
// Bộ máy nằm ở public/title-intel.js, dữ liệu ở public/geo-data.js (sinh bởi scripts/build-geo-data.py từ
// CLDR): ~250 quốc gia & vùng lãnh thổ, tên bằng ~80 thứ tiếng (kể cả 日本, Япония, اليابان...), thủ đô &
// thành phố lớn, tên châu lục/khu vực, tên gọi dân tộc. Ngôn ngữ tiêu đề nhận diện được ~60 thứ tiếng.
// Mỗi video chỉ phân tích 1 lần (nhớ theo đối tượng video).
const TI = window.TitleIntel || null;
const EMPTY_INTEL = { lang: null, countries: [], continents: [], mentions: new Set(), mentionedContinents: new Set() };
const intelCache = new WeakMap();
function titleIntel(v) {
  if (!TI) return EMPTY_INTEL;
  let r = intelCache.get(v);
  if (!r) {
    r = TI.analyze(v.title || "");
    intelCache.set(v, r);
  }
  return r;
}
// Danh sách châu lục chính của video (có thể nhiều hơn 1, hoặc rỗng).
function detectContinents(v) {
  return titleIntel(v).continents;
}

// Chuẩn hoá để tìm kiếm: bỏ dấu, chữ thường ("Việt Nam" khớp "VIETNAM", "Perú" khớp "peru").
function normalizeSearch(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

const searchKeyCache = new WeakMap();
function videoSearchKey(v) {
  let k = searchKeyCache.get(v);
  if (!k) {
    // Gồm cả ID video: dán ID vào ô tìm kiếm là ra đúng video đó.
    const text = normalizeSearch(`${v.title} ${v.channelTitle} ${v.videoId}`);
    k = { text, compact: text.replace(/\s+/g, "") };
    searchKeyCache.set(v, k);
  }
  return k;
}

// Ô tìm kiếm: nhiều từ khoá cách nhau dấu phẩy = khớp BẤT KỲ từ khoá nào ("peru, bolivia").
// Không phân biệt dấu và khoảng trắng ("viet nam" khớp "vietnam").
// Gõ bằng thứ tiếng nào cũng được:
//   - Tên châu lục ("châu á", "asia", "Asien", "Азия"...) -> lọc theo châu lục tự nhận diện.
//   - Tên quốc gia / thủ đô ("Nhật Bản", "Japón", "Japan", "日本", "Tokio"...) -> mọi video nhắc tới
//     quốc gia đó, dù tiêu đề viết bằng thứ tiếng nào.
//   - Ngôn ngữ ("tiếng Bồ Đào Nha", "portugués", "french", "tiếng pháp"...) -> video có tiêu đề viết
//     bằng ngôn ngữ đó.
//   - Từ khác ("phụ nữ", "Frauen"...) -> app tự dịch sang Tây Ban Nha / Bồ Đào Nha / Anh /
//     Pháp (Google Dịch) rồi tìm cả từ gốc lẫn bản dịch.
const searchTranslations = new Map(); // từ khoá (đã chuẩn hoá) -> { alts, continent, country } | "pending"
const TRANSLATE_LANGS = ["es", "pt", "en", "fr"];

async function translateSearchTerm(raw, key) {
  searchTranslations.set(key, "pending");
  const alts = new Set();
  await Promise.all(
    TRANSLATE_LANGS.map(async (tl) => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(raw)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const out = normalizeSearch((json[0] || []).map((chunk) => chunk[0]).join("")).replace(/[.!?¿¡"]/g, "").trim();
        if (out && out !== key && out.length >= 3) alts.add(out);
      } catch {
        // mất mạng / bị chặn -> chỉ tìm theo từ gốc
      }
    })
  );
  let continent = null;
  let country = null;
  for (const a of alts) {
    const hit = TI ? TI.lookupTerm(a) : null;
    continent = continent || hit?.continent || null;
    country = country || hit?.country || null;
  }
  searchTranslations.set(key, { alts: [...alts], continent, country });
  // Người dùng vẫn đang tìm từ này -> lọc lại với bản dịch.
  if (getSearchTerms().some((t) => t.text === key)) applyFilters();
}

let translateTimer = null;
function scheduleSearchTranslations(terms) {
  clearTimeout(translateTimer);
  const todo = terms.filter((t) => !t.continent && !t.country && !t.language && t.text.length >= 3 && !searchTranslations.has(t.text));
  if (!todo.length) return;
  // Chờ gõ xong (~0,7 giây) rồi mới dịch, tránh dịch từng chữ đang gõ dở.
  translateTimer = setTimeout(() => todo.forEach((t) => translateSearchTerm(t.raw, t.text)), 700);
}

function getSearchTerms() {
  return els.search.value
    .split(",")
    .map((raw) => ({ raw: raw.trim(), text: normalizeSearch(raw).trim() }))
    .filter((t) => t.text)
    .map(({ raw, text }) => {
      const term = { raw, text, compact: text.replace(/\s+/g, ""), alts: [], viaTranslation: false };
      // continent = tên châu lục (vd "Châu Á"), country = mã ISO (vd "JP"), language = mã ngôn ngữ (vd "pt")
      const hit = TI ? TI.lookupTerm(raw) : null;
      term.continent = hit?.continent || null;
      term.country = hit?.country || null;
      term.language = hit?.language || null;
      const tr = searchTranslations.get(text);
      if (!term.continent && !term.country && !term.language && tr && tr !== "pending") {
        if (tr.continent) term.continent = tr.continent;
        else if (tr.country) term.country = tr.country;
        else term.alts = tr.alts;
        term.viaTranslation = true;
      }
      return term;
    });
}

function matchesSearch(v, terms) {
  if (!terms.length) return true;
  const k = videoSearchKey(v);
  return terms.some((t) => {
    if (t.continent) return detectContinents(v).includes(t.continent);
    // Quốc gia: mọi video NHẮC TỚI quốc gia đó (kể cả khi chỉ so sánh: "más barato que Turquía").
    if (t.country) return titleIntel(v).mentions.has(t.country);
    if (t.language) return titleIntel(v).lang === t.language;
    return (
      k.text.includes(t.text) ||
      k.compact.includes(t.compact) ||
      t.alts.some((a) => k.text.includes(a))
    );
  });
}

function applyFilters() {
  const terms = getSearchTerms();
  scheduleSearchTranslations(terms);
  const filterActive = selectedChannelIds.size > 0 && selectedChannelIds.size < allChannelIds.length;

  // Bước 1: tìm kiếm + lọc kênh riêng lẻ.
  const base = allVideos.filter((v) => {
    if (filterActive && !selectedChannelIds.has(v.channelId)) return false;
    if (selectedDashTimes.size && ![...selectedDashTimes].some((c) => inDashTimeBucket(v, c))) return false;
    return matchesSearch(v, terms);
  });

  const inChannelGroups = (v) =>
    selectedChannelGroups.size === 0 || selectedChannelGroups.has(classifyChannelGroup(v.subscriberCount).cls);
  const inTimeGroups = (v) =>
    selectedTimeGroups.size === 0 || [...selectedTimeGroups].some((cls) => inTimeGroup(v, cls));

  // Bước 2: lọc theo các badge đang bấm trên thanh tóm tắt (nhóm kênh + thời gian đăng).
  filteredVideos = base.filter((v) => inChannelGroups(v) && inTimeGroups(v));

  sortVideos();
  renderTable();
  // Số đếm của mỗi hàng badge tính theo bộ lọc của hàng KIA (không tính bộ lọc
  // của chính nó), để khi đang chọn 1 nhóm thì các nhóm cùng hàng vẫn hiện số
  // và bấm thêm/đổi được.
  renderFilterSummary(base.filter(inTimeGroups), base.filter(inChannelGroups));
  // View 14/30 ngày: theo ô tìm kiếm + chiều KÊNH (chọn kênh, nhóm kênh); không theo bộ lọc thời gian.
  const viewBase = allVideos.filter(
    (v) => (!filterActive || selectedChannelIds.has(v.channelId)) && inChannelGroups(v) && matchesSearch(v, terms)
  );
  renderFilterVph(viewBase);
  renderVphDashboard();
}

// ---------- Tổng VPH theo bộ lọc đang chọn (cạnh hàng tab) ----------
// Cộng view/giờ của đúng các video đang hiện trong bảng (tìm kiếm + chọn kênh +
// nhóm kênh + thời gian đăng). Video dạng Live không tính.
// Tổng view của video đăng trong vòng N ngày (tính cả ngày thứ N, cùng cách đếm ngày
// với cột "Lịch sử đăng"). Chỉ lọc theo ô tìm kiếm (không theo kênh / nhóm kênh /
// nút thời gian đăng). Chỉ tính video dạng "Video" - video dạng Live không cộng.
const VIEW_WINDOWS = [14, 30];

function sumViewsWithinDays(list, days) {
  let views = 0;
  let count = 0;
  for (const v of list) {
    const d = getDaysAgo(v);
    if (d === null || d > days || isVphExcluded(v)) continue;
    views += v.viewCount || 0;
    count++;
  }
  return { views, count };
}

// Cộng VPH, đếm riêng các video không được cộng theo lý do.
function sumVph(list) {
  const out = { total: 0, live: 0, pending: 0, stale: 0 };
  for (const v of list) {
    const state = vphState(v);
    if (state === "ok") out.total += v.viewsPerHour || 0;
    else out[state]++;
  }
  return out;
}

function vphExcludedNote(t) {
  const parts = [];
  if (t.live) parts.push(`${fmtNumber(t.live)} video dạng Live`);
  if (t.pending) parts.push(`${fmtNumber(t.pending)} video chưa đủ dữ liệu`);
  if (t.stale) parts.push(`${fmtNumber(t.stale)} video chưa cập nhật > 48 giờ`);
  return parts.length ? `Không tính: ${parts.join(", ")}` : "";
}

// ---------- Dashboard tổng hợp VPH ----------
// Tính trên TOÀN BỘ video của tab - không phụ thuộc ô tìm kiếm hay các bộ lọc nhóm kênh /
// thời gian / chọn kênh, để luôn là bức tranh tổng quan. Bấm vào 1 dòng = bật/tắt
// bộ lọc tương ứng cho bảng bên dưới. VPH chỉ tính video dạng Video có số liệu mới (getVph).
// Ngưỡng "video đang chạy tốt" hiển thị dưới mỗi kênh trong Top 10 VPH.
const DASH_HOT_VPH = 100;

const DASH_GROUPS = [
  { cls: "new", label: "Kênh mới", note: "< 2K sub" },
  { cls: "small", label: "Kênh nhỏ", note: "2K – 10K sub" },
  { cls: "large", label: "Kênh lớn", note: "> 10K sub" },
  { cls: "unknown", label: "Không rõ", note: "ẩn sub" },
];

function fmtPct(part, total) {
  if (!total) return "0%";
  const p = (part / total) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1).replace(".", ",")}%`;
}

function dashRow({ kind, value, color, label, note, vph, total, barPct, count, countUnit, active, filtering, avatar, extra, metaText }) {
  const state = filtering ? (active ? " is-active" : " is-dimmed") : "";
  return `<button type="button" class="dash-row dash-row--${color}${state}" data-dash-kind="${kind}" data-dash-value="${escapeAttr(value)}" aria-pressed="${active}"
      title="${active ? "Bấm để bỏ lọc" : "Bấm để lọc bảng theo mục này"}">
    <span class="dash-row__name">
      ${avatar !== undefined ? `<img class="dash-row__avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy" />` : `<span class="dash-row__dot"></span>`}
      <span class="dash-row__label">${escapeHtml(label)}</span>
    </span>
    <span class="dash-row__nums">
      <span class="dash-row__vph">${fmtNumber(vph)}</span>
      <span class="dash-row__pct">${fmtPct(vph, total)}</span>
    </span>
    <span class="dash-row__foot">
      <span class="dash-row__bar"><span style="width:${Math.max(0, Math.min(100, barPct)).toFixed(1)}%"></span></span>
      <span class="dash-row__meta">${note ? `${escapeHtml(note)} · ` : ""}${metaText ?? `${fmtNumber(count)} ${countUnit}`}${extra || ""}</span>
    </span>
  </button>`;
}

// ---------- View 7 ngày của KÊNH ----------
// = tổng view kênh hôm nay - tổng view kênh 7 ngày trước (tổng view kênh = statistics.viewCount do
// YouTube cung cấp, đã gồm MỌI video của kênh). Phần chênh lệch = view tăng thêm của video cũ + toàn bộ
// view của video mới đăng trong 7 ngày (lúc trước chúng chưa tồn tại, tính là 0).
// Lịch sử lấy từ data/channel-stats-<tab>.json (mỗi lần chạy 1 mốc); chấp nhận mốc cách 6,5 - 8 ngày
// rồi quy đổi về đúng 7 ngày.
// Kênh chưa đủ 7 ngày lịch sử -> dùng số NHẬP TAY (data/manual-views7d-<tab>.json) nếu có.
// Đủ dữ liệu thì luôn dùng số tự động, không nhập tay.
const DAY_MS_DASH = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS_DASH;
let channelStats = {};
let manualViews7d = {};

function channelWeekViews(channelId) {
  const hist = channelStats[channelId];
  let days = 0;
  if (Array.isArray(hist) && hist.length) {
    const last = hist[hist.length - 1];
    days = (last[0] - hist[0][0]) / DAY_MS_DASH;
    let best = null;
    let bestDiff = Infinity;
    for (const p of hist) {
      const age = last[0] - p[0];
      if (age < 6.5 * DAY_MS_DASH || age > 8 * DAY_MS_DASH) continue;
      const diff = Math.abs(age - WEEK_MS);
      if (diff < bestDiff) {
        best = p;
        bestDiff = diff;
      }
    }
    if (best) {
      const views = Math.round((Math.max(0, last[1] - best[1]) * WEEK_MS) / (last[0] - best[0]));
      return { views, source: "auto", days };
    }
  }
  const m = manualViews7d[channelId];
  if (m && Number.isFinite(m.views)) return { views: m.views, source: "manual", at: m.at, days };
  return { views: null, source: null, days };
}

function fmtShortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderVphDashboard() {
  if (!els.vphDash) return;

  // Phạm vi theo chiều KÊNH: chọn kênh (ô "Tất cả kênh" hoặc bấm kênh ở bảng xếp hạng) và nhóm kênh.
  // Không phụ thuộc ô tìm kiếm và các bộ lọc thời gian.
  const chFilter = selectedChannelIds.size > 0 && selectedChannelIds.size < allChannelIds.length;
  const inGroups = (v) =>
    selectedChannelGroups.size === 0 || selectedChannelGroups.has(classifyChannelGroup(v.subscriberCount).cls);
  const scoped = chFilter ? allVideos.filter((v) => selectedChannelIds.has(v.channelId)) : allVideos; // ô nhóm kênh
  const timeBase = scoped.filter(inGroups); // ô thời gian đăng
  const rankBase = allVideos.filter(inGroups); // 2 bảng xếp hạng kênh

  // --- Nhóm kênh ---
  const groups = Object.fromEntries(DASH_GROUPS.map((g) => [g.cls, { vph: 0, videos: 0 }]));
  let groupTotal = 0;
  for (const v of scoped) {
    const vph = getVph(v);
    if (vph === null) continue;
    groupTotal += vph;
    const g = groups[classifyChannelGroup(v.subscriberCount).cls];
    g.vph += vph;
    g.videos++;
  }

  // --- Thời gian đăng ---
  const times = Object.fromEntries(DASH_TIME_BUCKETS.map((b) => [b.cls, { vph: 0, videos: 0 }]));
  let timeTotal = 0;
  let older = 0;
  for (const v of timeBase) {
    const vph = getVph(v);
    if (vph === null) continue;
    timeTotal += vph;
    const d = getDaysAgo(v);
    const bucket = d === null ? null : DASH_TIME_BUCKETS.find((b) => b.match(d));
    if (bucket) {
      times[bucket.cls].vph += vph;
      times[bucket.cls].videos++;
    } else older += vph;
  }

  // --- Kênh (cho 2 bảng xếp hạng) ---
  const channels = new Map();
  for (const v of rankBase) {
    let ch = channels.get(v.channelId);
    if (!ch) {
      ch = { id: v.channelId, title: v.channelTitle, thumb: v.channelThumbnail || "", sub: v.subscriberCount, vph: 0, videos: 0, hot: 0 };
      channels.set(v.channelId, ch);
    }
    const vph = getVph(v);
    if (vph === null) continue;
    ch.vph += vph;
    ch.videos++;
    if (vph > DASH_HOT_VPH) ch.hot++;
  }
  const rankTotal = [...channels.values()].reduce((s, c) => s + c.vph, 0);

  const singleChannel = selectedChannelIds.size === 1 ? [...selectedChannelIds][0] : null;
  const chLabels = { new: "Kênh mới", small: "Kênh nhỏ", large: "Kênh lớn", unknown: "Không rõ" };
  const groupScope = selectedChannelGroups.size ? [...selectedChannelGroups].map((c) => chLabels[c]).join(" + ") : "";
  let scopeLabel = "tất cả kênh";
  if (chFilter) scopeLabel = singleChannel ? channels.get(singleChannel)?.title || els.channelFilterLabel.textContent : `${selectedChannelIds.size} kênh`;
  const timeScope = [chFilter ? scopeLabel : "", groupScope].filter(Boolean).join(" · ") || "tất cả kênh";

  const withRank = (html, i) =>
    html.replace('<span class="dash-row__name">', `<span class="dash-row__name"><span class="dash-row__rank">${i + 1}</span>`);

  const groupRows = DASH_GROUPS.filter((g) => g.cls !== "unknown" || groups.unknown.videos > 0)
    .map((g) =>
      dashRow({
        kind: "group", value: g.cls, color: g.cls, label: g.label, note: g.note,
        vph: groups[g.cls].vph, total: groupTotal, barPct: groupTotal ? (groups[g.cls].vph / groupTotal) * 100 : 0,
        count: groups[g.cls].videos, countUnit: "video",
        active: selectedChannelGroups.has(g.cls), filtering: selectedChannelGroups.size > 0,
      })
    )
    .join("");

  const timeRows = DASH_TIME_BUCKETS.map((b) =>
    dashRow({
      kind: "dashtime", value: b.cls, color: b.cls, label: b.label, note: b.note,
      vph: times[b.cls].vph, total: timeTotal, barPct: timeTotal ? (times[b.cls].vph / timeTotal) * 100 : 0,
      count: times[b.cls].videos, countUnit: "video",
      active: selectedDashTimes.has(b.cls), filtering: selectedDashTimes.size > 0,
    })
  ).join("");

  // --- Top 10 kênh VPH ---
  const top = [...channels.values()].filter((c) => c.videos > 0).sort((a, b) => b.vph - a.vph).slice(0, 10);
  const topRows = top.length
    ? top
        .map((c, i) =>
          withRank(
            dashRow({
              kind: "channel", value: c.id, color: `rank${i + 1}`, label: c.title,
              note: classifyChannelGroup(c.sub).label, avatar: c.thumb,
              vph: c.vph, total: rankTotal, barPct: top[0].vph ? (c.vph / top[0].vph) * 100 : 0,
              count: c.videos, countUnit: "video",
              extra: ` · <span class="dash-row__hot" title="Số video của kênh có VPH trên ${DASH_HOT_VPH}">${fmtNumber(c.hot)} video &gt;${DASH_HOT_VPH}</span>`,
              active: singleChannel === c.id, filtering: singleChannel !== null,
            }),
            i
          )
        )
        .join("")
    : `<p class="dash-empty">Chưa có dữ liệu VPH.</p>`;

  // --- Top 10 kênh View 7 ngày ---
  const week = [];
  let weekTotal = 0;
  let weekMissing = 0;
  for (const c of channels.values()) {
    const w = channelWeekViews(c.id);
    if (w.views === null) {
      weekMissing++;
      continue;
    }
    weekTotal += w.views;
    week.push({ ...c, week: w });
  }
  week.sort((a, b) => b.week.views - a.week.views);
  const weekTop = week.slice(0, 10);
  const weekRows = weekTop.length
    ? weekTop
        .map((c, i) =>
          withRank(
            dashRow({
              kind: "channel", value: c.id, color: `rank${i + 1}`, label: c.title,
              note: classifyChannelGroup(c.sub).label, avatar: c.thumb,
              vph: c.week.views, total: weekTotal, barPct: weekTop[0].week.views ? (c.week.views / weekTop[0].week.views) * 100 : 0,
              metaText:
                c.week.source === "manual"
                  ? `<span class="dash-row__manual" title="Số nhập tay ngày ${fmtShortDate(c.week.at)} - sẽ tự thay bằng số tự động khi kênh đủ 7 ngày dữ liệu">✎ nhập tay ${fmtShortDate(c.week.at)}</span>`
                  : "tự động",
              active: singleChannel === c.id, filtering: singleChannel !== null,
            }),
            i
          )
        )
        .join("")
    : `<p class="dash-empty">Chưa kênh nào có đủ 7 ngày dữ liệu. Bấm "Nhập tay" để nhập số view 7 ngày của các kênh.</p>`;

  const prevScroll = [...els.vphDash.querySelectorAll(".dash-card__rows--scroll")].map((el) => el.scrollTop);
  els.vphDash.innerHTML = `
    <article class="dash-card">
      <header class="dash-card__head">
        <h3>VPH theo nhóm kênh</h3>
        <span class="dash-card__sub">Tổng ${fmtNumber(groupTotal)} · ${escapeHtml(chFilter ? scopeLabel : "tất cả kênh")}</span>
      </header>
      <div class="dash-card__rows">${groupRows}</div>
    </article>
    <article class="dash-card">
      <header class="dash-card__head">
        <h3>VPH theo thời gian đăng</h3>
        <span class="dash-card__sub">Tổng ${fmtNumber(timeTotal)} · ${escapeHtml(timeScope)}</span>
      </header>
      <div class="dash-card__rows">${timeRows}</div>
${older ? `      <p class="dash-card__foot">Không rõ ngày đăng: ${fmtNumber(older)} · ${fmtPct(older, timeTotal)}</p>\n` : ""}    </article>
    <article class="dash-card dash-card--top">
      <header class="dash-card__head">
        <h3>Top 10 kênh VPH cao nhất</h3>
        <span class="dash-card__sub">${singleChannel ? "Đang lọc 1 kênh · bấm lại để bỏ" : `${groupScope ? escapeHtml(groupScope) + " · " : ""}cuộn để xem thêm`}</span>
      </header>
      <div class="dash-card__rows dash-card__rows--scroll">${topRows}</div>
    </article>
    <article class="dash-card dash-card--top dash-card--week">
      <header class="dash-card__head">
        <h3>Top 10 kênh · View 7 ngày</h3>
        <button type="button" class="dash-card__action" data-dash-action="manual-views" title="Nhập tay View 7 ngày cho kênh chưa đủ dữ liệu">✎ Nhập tay</button>
      </header>
      <div class="dash-card__rows dash-card__rows--scroll">${weekRows}</div>
      <p class="dash-card__foot">Tổng ${fmtNumber(weekTotal)} view phát sinh 7 ngày${weekMissing ? ` · ${fmtNumber(weekMissing)} kênh chưa đủ dữ liệu` : ""}</p>
    </article>`;
  els.vphDash.querySelectorAll(".dash-card__rows--scroll").forEach((el, i) => {
    if (prevScroll[i]) el.scrollTop = prevScroll[i];
  });
}

// ---------- Nhập tay View 7 ngày ----------
function parseViewsInput(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^([\d.,]+)(k|n|nghìn|nghin|m|tr|triệu|trieu)?$/);
  if (!m) return NaN;
  if (m[2]) {
    const num = parseFloat(m[1].replace(",", "."));
    const mult = /^(k|n|nghìn|nghin)$/.test(m[2]) ? 1e3 : 1e6;
    return Number.isFinite(num) ? Math.round(num * mult) : NaN;
  }
  const digits = m[1].replace(/[.,]/g, "");
  return digits ? parseInt(digits, 10) : NaN;
}

let manualModal = null;

function openManualViewsModal() {
  if (!manualModal) {
    manualModal = document.createElement("div");
    manualModal.className = "modal-overlay";
    manualModal.innerHTML = `
      <div class="modal modal--manual" role="dialog" aria-modal="true" aria-labelledby="manualViewsTitle">
        <button class="modal__close" data-manual-close aria-label="Đóng">✕</button>
        <h2 class="manual-views__title" id="manualViewsTitle">Nhập tay View 7 ngày</h2>
        <p class="manual-views__hint">Tổng view phát sinh thêm của tất cả video trong kênh trong 7 ngày qua. Chỉ cần nhập cho kênh <b>chưa đủ 7 ngày dữ liệu</b> - khi đủ dữ liệu app tự tính và thay số nhập tay. Có thể gõ 1.250.000 hoặc 1,25tr / 850k. Để trống = xoá số nhập tay.</p>
        <div class="manual-views__list"></div>
        <div class="manual-views__actions">
          <span class="manual-views__status" aria-live="polite"></span>
          <button type="button" class="btn-ghost" data-manual-close>Huỷ</button>
          <button type="button" class="btn-primary" data-manual-save>Lưu</button>
        </div>
      </div>`;
    document.body.appendChild(manualModal);
    manualModal.addEventListener("click", (e) => {
      if (e.target === manualModal || e.target.closest("[data-manual-close]")) manualModal.classList.remove("open");
      if (e.target.closest("[data-manual-save]")) saveManualViews();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && manualModal.classList.contains("open")) manualModal.classList.remove("open");
    });
  }

  const channels = new Map();
  for (const v of allVideos) {
    let c = channels.get(v.channelId);
    if (!c) channels.set(v.channelId, (c = { id: v.channelId, title: v.channelTitle, thumb: v.channelThumbnail || "", vph: 0 }));
    c.vph += getVph(v) || 0;
  }
  // CHỈ kênh chưa đủ 7 ngày lịch sử mới được nhập tay. Kênh đủ dữ liệu luôn dùng số tự động.
  const all = [...channels.values()].map((c) => ({ ...c, w: channelWeekViews(c.id) }));
  const rows = all.filter((c) => c.w.source !== "auto").sort((a, b) => b.vph - a.vph);
  const autoCount = all.length - rows.length;
  manualModal.querySelector(".manual-views__list").innerHTML =
    (rows.length
      ? rows
          .map((c) => {
            const manual = manualViews7d[c.id];
            const status = `Mới có ${Math.max(0, Math.floor(c.w.days))}/7 ngày dữ liệu${manual ? ` · đã nhập ${fmtShortDate(manual.at)}` : ""}`;
            return `<label class="manual-views__row">
        <img src="${escapeAttr(c.thumb)}" alt="" loading="lazy" />
        <span class="manual-views__name">${escapeHtml(c.title)}<small>${status}</small></span>
        <input type="text" inputmode="numeric" data-channel-id="${escapeAttr(c.id)}" value="${manual ? fmtNumber(manual.views) : ""}" placeholder="view 7 ngày" />
      </label>`;
          })
          .join("")
      : `<p class="dash-empty">Tất cả kênh đã đủ 7 ngày dữ liệu - không cần nhập tay.</p>`) +
    (autoCount ? `<p class="manual-views__auto-note">${fmtNumber(autoCount)} kênh đã đủ dữ liệu, app tự tính - không nhập tay.</p>` : "");
  manualModal.querySelector(".manual-views__status").textContent = "";
  manualModal.classList.add("open");
  manualModal.querySelector("input")?.focus();
}

async function saveManualViews() {
  const status = manualModal.querySelector(".manual-views__status");
  const values = {};
  for (const input of manualModal.querySelectorAll("input[data-channel-id]")) {
    const id = input.dataset.channelId;
    const n = parseViewsInput(input.value);
    if (Number.isNaN(n)) {
      status.textContent = "Số không hợp lệ - hãy kiểm tra ô đang tô đỏ.";
      input.classList.add("is-invalid");
      input.focus();
      return;
    }
    input.classList.remove("is-invalid");
    const old = manualViews7d[id]?.views ?? null;
    if (n !== old) values[id] = n;
  }
  if (!Object.keys(values).length) {
    manualModal.classList.remove("open");
    return;
  }
  const btn = manualModal.querySelector("[data-manual-save]");
  btn.disabled = true;
  status.textContent = "Đang lưu...";
  try {
    const res = await fetch("/api/manual-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: currentList, values }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    manualViews7d = json.values || {};
    renderVphDashboard();
    manualModal.classList.remove("open");
  } catch (err) {
    status.textContent = `Không lưu được: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

if (els.vphDash) {
  els.vphDash.addEventListener("click", (e) => {
    if (e.target.closest('[data-dash-action="manual-views"]')) {
      openManualViewsModal();
      return;
    }
    const row = e.target.closest(".dash-row");
    if (!row) return;
    const { dashKind: kind, dashValue: value } = row.dataset;
    if (kind === "group" || kind === "dashtime") {
      const set = kind === "group" ? selectedChannelGroups : selectedDashTimes;
      if (set.has(value)) set.delete(value);
      else set.add(value);
    } else if (kind === "channel") {
      const only = selectedChannelIds.size === 1 && selectedChannelIds.has(value);
      selectedChannelIds = only ? new Set() : new Set([value]);
      els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = selectedChannelIds.has(cb.value);
      });
      updateChannelFilterLabel();
    }
    applyFilters();
  });
}

function renderFilterVph(viewBase = filteredVideos) {
  if (!els.filterVph) return;
  const vphSum = sumVph(filteredVideos);
  const total = vphSum.total;
  const channels = new Set();
  for (const v of filteredVideos) channels.add(v.channelId);

  const chips = [];
  const continentTerms = [];
  const countryTerms = [];
  const languageTerms = [];
  const textTerms = [];
  for (const t of getSearchTerms()) {
    if (t.continent) {
      if (!continentTerms.includes(t.continent)) continentTerms.push(t.continent);
    } else if (t.country) {
      const label = TI.countryLabel(t.country);
      if (!countryTerms.includes(label)) countryTerms.push(label);
    } else if (t.language) {
      const label = TI.languageLabel(t.language);
      if (!languageTerms.includes(label)) languageTerms.push(label);
    } else textTerms.push(t.alts.length ? `${t.raw} (${t.alts.join(", ")})` : t.raw);
  }
  if (continentTerms.length) chips.push(`🌍 ${continentTerms.join(" / ")}`);
  if (countryTerms.length) chips.push(`📍 ${countryTerms.join(" / ")}`);
  if (languageTerms.length) chips.push(`🗣 ${languageTerms.join(" / ")}`);
  if (textTerms.length) chips.push(`🔍 ${textTerms.join(" / ")}`);
  if (selectedChannelIds.size > 0 && selectedChannelIds.size < allChannelIds.length) {
    chips.push(selectedChannelIds.size === 1 ? els.channelFilterLabel.textContent : `${selectedChannelIds.size} kênh`);
  }
  const chLabels = { new: "Kênh mới", small: "Kênh nhỏ", large: "Kênh lớn", unknown: "Không rõ" };
  if (selectedChannelGroups.size) chips.push([...selectedChannelGroups].map((c) => chLabels[c]).join(" + "));
  if (selectedTimeGroups.size) {
    chips.push(TIME_GROUPS.filter((g) => selectedTimeGroups.has(g.cls)).map((g) => g.label).join(" + "));
  }
  if (selectedDashTimes.size) {
    chips.push(DASH_TIME_BUCKETS.filter((b) => selectedDashTimes.has(b.cls)).map((b) => b.note).join(" + "));
  }

  const filtering = chips.length > 0;
  const hasSearch =
    getSearchTerms().length > 0 ||
    selectedChannelGroups.size > 0 ||
    (selectedChannelIds.size > 0 && selectedChannelIds.size < allChannelIds.length);
  els.filterVph.title = "";
  els.filterVph.innerHTML = `
    <div class="filter-vph__card filter-vph__card--vph${filtering ? " is-filtering" : ""}"
      title="${escapeAttr(vphExcludedNote(vphSum) || "Tổng view/giờ của các video đang hiện trong bảng")}">
      <span class="filter-vph__label">${filtering ? "Tổng VPH theo bộ lọc" : "Tổng VPH · tất cả video"}</span>
      <span class="filter-vph__value">${fmtNumber(total)}</span>
      <span class="filter-vph__meta">${fmtNumber(filteredVideos.length)} video · ${fmtNumber(channels.size)} kênh</span>
      ${
        filtering
          ? `<div class="filter-vph__chips">${chips
              .map((c) => `<span class="filter-vph__chip">${escapeHtml(c)}</span>`)
              .join("")}</div>`
          : ""
      }
    </div>
    ${VIEW_WINDOWS.map((days) => {
      const s = sumViewsWithinDays(viewBase, days);
      return `<div class="filter-vph__card filter-vph__card--d${days}${hasSearch ? " is-filtering" : ""}"
      title="Tổng lượt xem của ${fmtNumber(s.count)} video đăng trong vòng 0 - ${days} ngày (tính cả ngày thứ ${days}) theo ô tìm kiếm + kênh đang chọn, không tính video dạng Live">
      <span class="filter-vph__label">View ${days} ngày</span>
      <span class="filter-vph__value">${fmtNumber(s.views)}</span>
      <span class="filter-vph__meta">${fmtNumber(s.count)} video${hasSearch ? " · theo bộ lọc" : " · tất cả"}</span>
    </div>`;
    }).join("")}`;
}

function sortVideos() {
  const dir = sortDir === "asc" ? 1 : -1;
  filteredVideos.sort((a, b) => {
    const av = getSortValue(a, sortField);
    const bv = getSortValue(b, sortField);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function renderTableHeader() {
  const columns = getActiveColumns();

  els.videoTableColgroup.innerHTML = columns.map((c) => `<col class="${c.colClass}" />`).join("");

  els.videoTableHeadRow.innerHTML = columns
    .map((c) => {
      const fieldAttr = c.sortField ? ` data-field="${c.sortField}"` : "";
      const titleAttr = c.headTitle ? ` title="${escapeAttr(c.headTitle)}"` : "";
      const isActive = Boolean(c.sortField) && c.sortField === sortField;
      return `<th class="${c.headClass}${isActive ? " active-sort" : ""}"${fieldAttr}${titleAttr}>${escapeHtml(c.label)}</th>`;
    })
    .join("");

  els.videoTableHeadRow.querySelectorAll("th[data-field]").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      els.sortField.value = field;
      sortField = field;
      applyFilters();
    });
  });
}

// ---------- Vẽ bảng theo từng đợt ----------
// Vẽ cả ~3.400 dòng một lúc tạo ra ~85.000 phần tử DOM, mỗi lần lọc/sắp xếp/gõ
// tìm kiếm trình duyệt phải dựng lại toàn bộ (mất vài giây). Thay vào đó chỉ vẽ
// TABLE_PAGE_SIZE dòng đầu; khi cuộn gần cuối bảng thì tự vẽ thêm đợt tiếp theo.
// Dữ liệu lọc/sắp xếp, Tổng VPH, xuất Excel, AI... vẫn dùng ĐỦ filteredVideos -
// chỉ phần hiển thị là vẽ dần.
const TABLE_PAGE_SIZE = 100;
let renderedRowCount = 0;
let tableMoreObserver = null;

function renderRows(from, to) {
  const columns = getActiveColumns();
  return filteredVideos
    .slice(from, to)
    .map((v) => `<tr>${columns.map((c) => c.renderCell(v)).join("")}</tr>`)
    .join("");
}

function moreRowHtml() {
  const columns = getActiveColumns();
  const left = filteredVideos.length - renderedRowCount;
  return `<tr class="table-more-row"><td colspan="${columns.length}">
    <button type="button" class="table-more-btn">Hiện thêm ${fmtNumber(Math.min(left, TABLE_PAGE_SIZE))} video</button>
    <span class="table-more-count">Đang hiện ${fmtNumber(renderedRowCount)} / ${fmtNumber(filteredVideos.length)} video</span>
  </td></tr>`;
}

function renderMoreRows() {
  if (renderedRowCount >= filteredVideos.length) return;
  const oldMore = els.tbody.querySelector(".table-more-row");
  if (oldMore) oldMore.remove();
  const next = Math.min(renderedRowCount + TABLE_PAGE_SIZE, filteredVideos.length);
  const html = renderRows(renderedRowCount, next);
  renderedRowCount = next;
  els.tbody.insertAdjacentHTML("beforeend", html + (renderedRowCount < filteredVideos.length ? moreRowHtml() : ""));
  observeMoreRow();
}

// Tự vẽ thêm khi dòng "Hiện thêm" sắp lọt vào màn hình (còn cách ~600px).
function observeMoreRow() {
  if (tableMoreObserver) tableMoreObserver.disconnect();
  const moreRow = els.tbody.querySelector(".table-more-row");
  if (!moreRow || typeof IntersectionObserver === "undefined") return;
  tableMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) renderMoreRows();
    },
    { rootMargin: "600px 0px" }
  );
  tableMoreObserver.observe(moreRow);
}

function renderTable() {
  hideTitleTip();
  renderTableHeader();
  const columns = getActiveColumns();
  if (tableMoreObserver) tableMoreObserver.disconnect();

  if (!filteredVideos.length) {
    renderedRowCount = 0;
    els.tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">Không có video phù hợp.</td></tr>`;
    return;
  }

  renderedRowCount = Math.min(TABLE_PAGE_SIZE, filteredVideos.length);
  els.tbody.innerHTML =
    renderRows(0, renderedRowCount) + (renderedRowCount < filteredVideos.length ? moreRowHtml() : "");
  observeMoreRow();
}

// Uỷ quyền sự kiện: 1 listener cho cả bảng thay vì gắn riêng cho từng nút/ô
// (trước đây ~6.800 listener được gắn lại sau mỗi lần vẽ bảng).
els.tbody.addEventListener("click", (e) => {
  if (e.target.closest(".table-more-btn")) {
    renderMoreRows();
    return;
  }
  const idBtn = e.target.closest(".video-id-btn");
  if (idBtn) {
    copyToClipboard(idBtn.dataset.copyId).then((ok) => {
      idBtn.classList.toggle("is-copied", ok);
      idBtn.textContent = ok ? "Đã copy ✓" : idBtn.dataset.copyId;
      setTimeout(() => {
        idBtn.textContent = idBtn.dataset.copyId;
        idBtn.classList.remove("is-copied");
      }, 1200);
    });
    return;
  }
  const exportBtn = e.target.closest(".comments-export-btn");
  if (exportBtn) {
    exportVideoComments(exportBtn.dataset.videoId, exportBtn);
    return;
  }
  const commentsBtn = e.target.closest(".comments-btn");
  if (commentsBtn) {
    openModal(commentsBtn.dataset.videoId);
    return;
  }
  const channelCell = e.target.closest(".channel-cell");
  if (channelCell) openChannelModal(channelCell.dataset.channelId);
});

// ---------- Thanh lọc nhanh phía trên bảng: Nhóm kênh + Thời gian đăng ----------
// Bấm 1 badge = bật/tắt lọc nhóm đó (chọn được nhiều nhóm cùng lúc). Hai hàng
// kết hợp với nhau: vd "Kênh mới" + "Dưới 10 ngày" = video dưới 10 ngày của
// các kênh mới.
//   channelList: dùng để đếm số KÊNH theo nhóm kênh.
//   timeList:    dùng để đếm số VIDEO theo nhóm thời gian đăng.

function renderFilterBadge(kind, cls, label, n, selectedSet, colorCls) {
  const filtering = selectedSet.size > 0;
  const active = selectedSet.has(cls);
  const stateCls = filtering ? (active ? " is-active" : " is-dimmed") : "";
  const tip = active ? "Bấm để bỏ lọc nhóm này" : "Bấm để lọc bảng theo nhóm này";
  return `<button type="button" class="channel-group-badge channel-group-badge--${colorCls} channel-group-badge--clickable${stateCls}" data-filter-kind="${kind}" data-group="${cls}" aria-pressed="${active}" title="${tip}">${label} · ${fmtNumber(n)}</button>`;
}

function renderFilterSummary(channelList, timeList) {
  // --- Nhóm kênh (đếm số kênh) ---
  const channelSubs = new Map(); // channelId -> subscriberCount
  for (const v of channelList) {
    if (!channelSubs.has(v.channelId)) channelSubs.set(v.channelId, v.subscriberCount);
  }
  const chCounts = { new: 0, small: 0, large: 0, unknown: 0 };
  const chLabels = { new: "Kênh mới", small: "Kênh nhỏ", large: "Kênh lớn", unknown: "Không rõ" };
  for (const sub of channelSubs.values()) chCounts[classifyChannelGroup(sub).cls]++;
  const channelBadges = Object.entries(chCounts)
    // Nhóm đang được chọn vẫn hiện dù đếm ra 0, để còn bấm bỏ chọn được.
    .filter(([cls, n]) => n > 0 || selectedChannelGroups.has(cls))
    .map(([cls, n]) => renderFilterBadge("channel", cls, chLabels[cls], n, selectedChannelGroups, cls))
    .join("");

  // --- Thời gian đăng (đếm số video) ---
  const tCounts = Object.fromEntries(TIME_GROUPS.map((g) => [g.cls, 0]));
  for (const v of timeList) {
    const d = getDaysAgo(v);
    if (d === null) continue;
    for (const g of TIME_GROUPS) if (g.match(d)) tCounts[g.cls]++;
  }
  const timeBadges = TIME_GROUPS.map((g) =>
    renderFilterBadge("time", g.cls, g.label, tCounts[g.cls], selectedTimeGroups, `time-${g.cls}`)
  ).join("");

  const anyFilter = selectedChannelGroups.size > 0 || selectedTimeGroups.size > 0 || selectedDashTimes.size > 0;

  if (!allVideos.length) {
    els.channelGroupSummary.innerHTML = "";
    els.channelGroupSummary.classList.remove("visible");
    return;
  }

  els.channelGroupSummary.innerHTML =
    `<span class="channel-group-summary__label">Nhóm kênh (${channelSubs.size} kênh):</span>` +
    channelBadges +
    `<span class="channel-group-summary__sep" aria-hidden="true"></span>` +
    `<span class="channel-group-summary__label">Thời gian đăng:</span>` +
    timeBadges +
    (anyFilter ? `<button type="button" class="channel-group-summary__clear" data-group-clear="1">✕ Bỏ lọc</button>` : "");
  els.channelGroupSummary.classList.add("visible");
}

els.channelGroupSummary.addEventListener("click", (e) => {
  if (e.target.closest("[data-group-clear]")) {
    selectedChannelGroups.clear();
    selectedTimeGroups.clear();
    selectedDashTimes.clear();
    applyFilters();
    return;
  }
  const badge = e.target.closest("[data-group]");
  if (!badge) return;
  const set = badge.dataset.filterKind === "time" ? selectedTimeGroups : selectedChannelGroups;
  const cls = badge.dataset.group;
  if (set.has(cls)) set.delete(cls);
  else set.add(cls);
  applyFilters();
});

// ---------- Xuất Excel ----------

// Cột giá trị thường (không phải link) chỉ xuất hiện khi xuất Excel, không
// hiển thị trên bảng dữ liệu trên web - phân loại theo thời lượng (Video ngắn
// < 60 phút / Video dài >= 60 phút). Thời lượng gốc (mm:ss) đã có sẵn ở cột
// "Thời lượng" trên bảng nên không lặp lại ở đây.
const VALUE_EXPORT_COLUMNS = [{ label: "Loại thời lượng", value: (v) => classifyVideoLength(v) }];

// Link (video + ảnh thumbnail) của từng video khi xuất Excel.
//  - Link video: mở thẳng video trên YouTube.
//  - HD: ảnh 1280x720 (maxresdefault). Gần như mọi video HD đều có, nhưng một số
//    video (thường là video cũ/độ phân giải thấp) YouTube không tạo ảnh này -> mở ra báo 404.
//  - Dự phòng: ảnh 320x180 đã lưu sẵn trong dữ liệu (luôn mở được).
const THUMB_EXPORT_COLUMNS = [
  { label: "Link video", getUrl: (v) => `https://www.youtube.com/watch?v=${v.videoId}` },
  { label: "Link thumbnail HD (1280x720)", getUrl: (v) => `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg` },
  {
    label: "Link thumbnail dự phòng (320x180)",
    getUrl: (v) => v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
  },
];

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Không tải được thư viện xuất Excel (kiểm tra kết nối mạng rồi thử lại).");
    return;
  }
  if (!filteredVideos.length) {
    alert("Không có dữ liệu để xuất.");
    return;
  }
  const columns = getActiveColumns();
  // Thêm các cột thời lượng + link vào CUỐI file Excel (chỉ có trong file xuất, không hiện trên bảng web).
  const header = [
    ...columns.map((c) => c.label),
    ...VALUE_EXPORT_COLUMNS.map((c) => c.label),
    ...THUMB_EXPORT_COLUMNS.map((c) => c.label),
  ];
  const rows = filteredVideos.map((v) => [
    ...columns.map((c) => c.excelValue(v)),
    ...VALUE_EXPORT_COLUMNS.map((c) => c.value(v)),
    ...THUMB_EXPORT_COLUMNS.map((c) => c.getUrl(v)),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Biến ô link (video + thumbnail) thành hyperlink bấm được trong Excel.
  const linkColOffset = columns.length + VALUE_EXPORT_COLUMNS.length;
  filteredVideos.forEach((v, i) => {
    THUMB_EXPORT_COLUMNS.forEach((c, j) => {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: linkColOffset + j })];
      if (cell) cell.l = { Target: c.getUrl(v), Tooltip: c.label === "Link video" ? "Mở video trên YouTube" : "Mở ảnh thumbnail" };
    });
  });
  ws["!cols"] = [
    ...columns.map((c) => ({ wch: c.key === "video" ? 50 : c.key === "channel" ? 24 : 14 })),
    ...VALUE_EXPORT_COLUMNS.map(() => ({ wch: 14 })),
    ...THUMB_EXPORT_COLUMNS.map(() => ({ wch: 46 })),
  ];
  const wb = XLSX.utils.book_new();
  const sheetName = String(currentList).slice(0, 31) || "Data";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `yt-tracker-${currentList}-${dateStr}.xlsx`);
}

els.exportExcelBtn.addEventListener("click", exportToExcel);


// ---------- Modal & comments ----------

let currentModalVideoId = null;

async function openModal(videoId) {
  const video = allVideos.find((v) => v.videoId === videoId);
  if (!video) return;
  currentModalVideoId = videoId;

  els.modalOverlay.classList.add("open");
  els.modalThumb.src = video.thumbnail;
  els.modalTitle.textContent = video.title;
  els.modalChannel.textContent = video.channelTitle;
  els.modalStats.innerHTML = `
    <span>${fmtNumber(video.viewCount)} lượt xem</span>
    <span>${fmtNumber(video.likeCount)} thích</span>
    <span>${fmtNumber(video.commentCount)} bình luận</span>
    <span>${fmtDate(video.publishedAt)}</span>
  `;
  loadModalComments(videoId);
}

let modalLoadToken = 0;
let commentsNotice = "";

// Lấy bình luận theo trường đang chọn: "Lượt thích" -> nhiều like nhất, "Mới nhất" -> mới nhất.
// Lỗi thì dùng tạm dữ liệu đã lưu.
async function loadModalComments(videoId) {
  const token = ++modalLoadToken;
  const order = commentSortField === "publishedAt" ? "time" : "likes";
  els.commentsList.innerHTML = `<div class="empty-state"><span class="loading-plane">✈️</span> Đang lấy bình luận ${
    order === "time" ? "mới nhất" : "nhiều like nhất"
  } từ YouTube...</div>`;
  let data;
  let notice = "";
  try {
    data = await loadLiveComments(videoId, order);
  } catch (err) {
    try {
      const res = await fetch(`data/comments/${videoId}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error();
      data = await res.json();
      notice = `Không lấy được trực tiếp từ YouTube (${err.message}) - đang hiện dữ liệu đã lưu.`;
    } catch {
      if (token !== modalLoadToken) return;
      currentComments = [];
      els.commentsList.innerHTML = `<div class="empty-state">Không lấy được bình luận: ${escapeHtml(err.message)}</div>`;
      return;
    }
  }
  if (token !== modalLoadToken) return; // đã đổi video/trường khác trong lúc chờ
  commentsNotice = notice;
  if (data.disabled) {
    currentComments = [];
    els.commentsList.innerHTML = `<div class="empty-state">Video này đã tắt bình luận.</div>`;
    return;
  }
  currentComments = data.comments || [];
  renderComments();
}

function renderComments() {
  if (!currentComments.length) {
    els.commentsList.innerHTML = `<div class="empty-state">Không có bình luận.</div>`;
    return;
  }

  const dir = commentSortDir === "asc" ? 1 : -1;
  const sorted = [...currentComments].sort((a, b) => {
    let av = a[commentSortField];
    let bv = b[commentSortField];
    if (commentSortField === "publishedAt") {
      av = new Date(av).getTime();
      bv = new Date(bv).getTime();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  commentsRendered = sorted;
  els.commentsList.innerHTML =
    (commentsNotice ? `<div class="comments-notice">${escapeHtml(commentsNotice)}</div>` : "") +
    sorted
    .map((c, i) => {
      const { top, rest, replyCount } = splitReplies(c);
      let repliesHtml;
      if (top) {
        repliesHtml = `
        <div class="comment__replies-label">Phản hồi (${fmtNumber(replyCount)})</div>
        <div class="comment__reply-lines">${escapeHtml("- " + oneLine(top.text))}</div>
        ${
          rest.length
            ? `<div class="comment__reply-lines comment__reply-rest" hidden>${escapeHtml(
                rest.map((r) => "- " + oneLine(r.text)).join("\n")
              )}</div>
        <button type="button" class="replies-more-btn" data-count="${rest.length}">Thêm phản hồi (${fmtNumber(rest.length)})</button>`
            : ""
        }
        <div class="comment__reply-tr" hidden>
          <div class="comment__reply-lines comment__reply-tr-top"></div>
          <div class="comment__reply-lines comment__reply-tr-rest" hidden></div>
        </div>
        <button type="button" class="reply-translate-btn" data-idx="${i}">Dịch phản hồi</button>`;
      } else if (replyCount > 0) {
        repliesHtml = `<div class="comment__replies-empty">Có ${fmtNumber(replyCount)} phản hồi nhưng chưa có nội dung.</div>`;
      } else {
        repliesHtml = `<div class="comment__replies-empty">Không có phản hồi</div>`;
      }
      return `
    <div class="comment" data-idx="${i}">
      <div class="comment__main">
        <div class="comment__head">
          <img class="comment__avatar" src="${c.authorImage}" alt="" loading="lazy" />
          <span class="comment__author">${escapeHtml(c.author)}</span>
          <span class="comment__date">${fmtDate(c.publishedAt)}</span>
        </div>
        <div class="comment__text">${escapeHtml(c.text)}</div>
        <div class="comment__footer">
          <span class="comment__likes">♥ ${fmtNumber(c.likeCount)} lượt thích</span>
          <button class="translate-btn" data-idx="${i}" data-kind="comment">Dịch sang Tiếng Việt</button>
          <button type="button" class="copy-comment-btn" data-idx="${i}" title="${
            top ? "Copy bình luận kèm toàn bộ phản hồi" : "Copy bình luận"
          }">⧉ Copy</button>
        </div>
        <div class="comment__translation" id="translation-${i}"></div>
      </div>
      <div class="comment__replies-col">${repliesHtml}</div>
    </div>`;
    })
    .join("");

  els.commentsList.querySelectorAll(".translate-btn[data-kind='comment']").forEach((btn) => {
    btn.addEventListener("click", () => translateComment(sorted, btn.dataset.idx));
  });
}

// ---------- Cột phản hồi + nút copy trong bảng bình luận ----------
let commentsRendered = [];

// Gộp các dòng trong 1 bình luận/phản hồi thành 1 dòng.
function oneLine(text) {
  return String(text || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

// Phản hồi nhiều like nhất + các phản hồi còn lại (xếp theo like giảm dần).
function splitReplies(c) {
  const replies = [...(c.replies || [])].sort(
    (a, b) => (b.likeCount || 0) - (a.likeCount || 0) || new Date(a.publishedAt) - new Date(b.publishedAt)
  );
  return { top: replies[0] || null, rest: replies.slice(1), replyCount: c.replyCount || replies.length };
}

// Bình luận chính 1 dòng, mỗi phản hồi 1 dòng bắt đầu bằng "- ".
function commentCopyText(c) {
  const { top, rest } = splitReplies(c);
  const lines = [oneLine(c.text)];
  for (const r of [top, ...rest]) if (r) lines.push("- " + oneLine(r.text));
  return lines.join("\n");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

els.commentsList.addEventListener("click", async (e) => {
  const moreBtn = e.target.closest(".replies-more-btn");
  if (moreBtn) {
    const col = moreBtn.parentElement;
    const rest = col.querySelector(".comment__reply-rest");
    const open = rest.hidden;
    rest.hidden = !open;
    col.querySelector(".comment__reply-tr-rest").hidden = !open;
    moreBtn.textContent = open ? "Ẩn bớt" : `Thêm phản hồi (${fmtNumber(Number(moreBtn.dataset.count))})`;
    return;
  }
  const trBtn = e.target.closest(".reply-translate-btn");
  if (trBtn) {
    const c = commentsRendered[Number(trBtn.dataset.idx)];
    const col = trBtn.parentElement;
    const box = col.querySelector(".comment__reply-tr");
    if (!c || !box) return;
    if (box.dataset.done) {
      box.hidden = !box.hidden;
      trBtn.textContent = box.hidden ? "Dịch phản hồi" : "Ẩn bản dịch";
      return;
    }
    const { top, rest } = splitReplies(c);
    trBtn.disabled = true;
    trBtn.textContent = "Đang dịch…";
    try {
      const map = await translateReplies([top, ...rest]);
      col.querySelector(".comment__reply-tr-top").textContent = "- " + map.get(top.id);
      const trRest = col.querySelector(".comment__reply-tr-rest");
      trRest.textContent = rest.map((r) => "- " + map.get(r.id)).join("\n");
      const restBox = col.querySelector(".comment__reply-rest");
      trRest.hidden = restBox ? restBox.hidden : true;
      box.hidden = false;
      box.dataset.done = "1";
      trBtn.textContent = "Ẩn bản dịch";
    } catch {
      trBtn.textContent = "Không dịch được - thử lại";
    } finally {
      trBtn.disabled = false;
    }
    return;
  }
  const copyBtn = e.target.closest(".copy-comment-btn");
  if (copyBtn) {
    const c = commentsRendered[Number(copyBtn.dataset.idx)];
    if (!c) return;
    const ok = await copyToClipboard(commentCopyText(c));
    copyBtn.textContent = ok ? "✓ Đã copy" : "Không copy được";
    copyBtn.classList.toggle("is-done", ok);
    setTimeout(() => {
      copyBtn.textContent = "⧉ Copy";
      copyBtn.classList.remove("is-done");
    }, 1500);
  }
});

async function translateComment(sortedList, idx) {
  const comment = sortedList[idx];
  const box = document.getElementById(`translation-${idx}`);
  box.classList.add("visible");
  box.textContent = "Đang dịch...";

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(
      comment.text
    )}`;
    const res = await fetch(url);
    const json = await res.json();
    const translated = json[0].map((chunk) => chunk[0]).join("");
    box.textContent = translated;
  } catch (err) {
    box.innerHTML = `Không dịch được tự động. <a href="https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(
      comment.text
    )}&op=translate" target="_blank" rel="noopener">Mở Google Dịch</a>`;
  }
}


// ---------- Dịch tiêu đề video khi di chuột ----------
// Di chuột vào tiêu đề video trong bảng -> hiện tooltip bản dịch tiếng Việt.
// Dùng cùng endpoint Google Dịch với phần dịch bình luận. Dịch nguyên câu
// (không cắt chữ) để giữ sát nghĩa nhất; kết quả được nhớ lại theo videoId
// nên mỗi tiêu đề chỉ gọi dịch 1 lần trong phiên. Tiêu đề vốn đã là tiếng
// Việt thì không hiện tooltip.

const titleTranslationCache = new Map(); // videoId -> Promise<{ text, sameLang }>
const TITLE_HOVER_DELAY_MS = 250;

const titleTip = document.createElement("div");
titleTip.className = "title-translate-tip";
titleTip.setAttribute("role", "tooltip");
document.body.appendChild(titleTip);

let titleHoverEl = null;
let titleHoverTimer = null;

function translateTitle(videoId, text) {
  if (titleTranslationCache.has(videoId)) return titleTranslationCache.get(videoId);
  const p = (async () => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const translated = (json[0] || []).map((chunk) => chunk[0]).join("").trim();
    const detected = json[2] || "";
    return { text: translated, sameLang: detected === "vi" };
  })();
  titleTranslationCache.set(videoId, p);
  // Lỗi (mạng, bị giới hạn tạm thời...) thì không nhớ, lần di chuột sau thử lại.
  p.catch(() => titleTranslationCache.delete(videoId));
  return p;
}

function positionTitleTip(anchor) {
  const r = anchor.getBoundingClientRect();
  const tipW = titleTip.offsetWidth;
  const tipH = titleTip.offsetHeight;
  const margin = 8;
  let left = Math.min(r.left, window.innerWidth - tipW - margin);
  left = Math.max(margin, left);
  // Ưu tiên hiện bên dưới tiêu đề; không đủ chỗ thì lật lên trên.
  let top = r.bottom + 6;
  if (top + tipH > window.innerHeight - margin) top = r.top - tipH - 6;
  titleTip.style.left = `${left}px`;
  titleTip.style.top = `${Math.max(margin, top)}px`;
}

function showTitleTip(anchor, html, state) {
  titleTip.innerHTML = html;
  titleTip.dataset.state = state || "";
  titleTip.classList.add("visible");
  positionTitleTip(anchor);
}

function hideTitleTip() {
  clearTimeout(titleHoverTimer);
  titleHoverEl = null;
  titleTip.classList.remove("visible");
}

async function handleTitleHover(el) {
  const videoId = el.dataset.videoId;
  const video = allVideos.find((v) => v.videoId === videoId);
  if (!video || !video.title) return;

  const cached = titleTranslationCache.get(videoId);
  if (!cached) {
    showTitleTip(el, `<span class="title-translate-tip__label">Đang dịch…</span>`, "loading");
  }
  try {
    const { text, sameLang } = await translateTitle(videoId, video.title);
    if (titleHoverEl !== el) return; // chuột đã rời đi trong lúc chờ dịch
    if (sameLang || !text) return hideTitleTip();
    showTitleTip(
      el,
      `<span class="title-translate-tip__label">Tiếng Việt</span><span class="title-translate-tip__text"></span>`,
      "done"
    );
    titleTip.querySelector(".title-translate-tip__text").textContent = text;
    positionTitleTip(el);
  } catch {
    if (titleHoverEl !== el) return;
    showTitleTip(el, `<span class="title-translate-tip__label">Không dịch được, thử lại sau.</span>`, "error");
  }
}

els.tbody.addEventListener("mouseover", (e) => {
  const el = e.target.closest(".video-cell__title");
  if (!el || el === titleHoverEl) return;
  hideTitleTip();
  titleHoverEl = el;
  titleHoverTimer = setTimeout(() => handleTitleHover(el), TITLE_HOVER_DELAY_MS);
});

els.tbody.addEventListener("mouseout", (e) => {
  if (!titleHoverEl) return;
  const to = e.relatedTarget;
  if (to && titleHoverEl.contains(to)) return; // vẫn còn trong tiêu đề (vd đi qua badge LIVE)
  hideTitleTip();
});

// Cuộn trang/bảng thì tooltip lệch chỗ - ẩn đi cho gọn.
window.addEventListener("scroll", hideTitleTip, true);

// ---------- Xuất bình luận 1 video ra Excel (lấy trực tiếp từ YouTube) ----------

const COMMENT_EXPORT_LIMIT = 100;
const commentTranslationCache = new Map();

const liveCommentsCache = new Map(); // "videoId|order" -> Promise

// order: "likes" = nhiều like nhất | "time" = mới nhất
function loadLiveComments(videoId, order = "likes") {
  const key = `${videoId}|${order}`;
  if (liveCommentsCache.has(key)) return liveCommentsCache.get(key);
  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(
        `/api/video-comments?videoId=${encodeURIComponent(videoId)}&order=${order}`,
        { signal: ctrl.signal }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error((data && data.error) || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      throw new Error(err.name === "AbortError" ? "YouTube phản hồi quá lâu, thử lại sau." : err.message || String(err));
    } finally {
      clearTimeout(timer);
    }
  })();
  liveCommentsCache.set(key, p);
  p.catch(() => liveCommentsCache.delete(key));
  setTimeout(() => liveCommentsCache.delete(key), 10 * 60 * 1000);
  return p;
}

// Dịch nhiều phản hồi trong 1 lần gọi; trả về Map replyId -> bản dịch.
const replyTranslationCache = new Map();
async function translateReplies(replies) {
  const todo = replies.filter((r) => !replyTranslationCache.has(r.id));
  if (todo.length) {
    const block = todo.map((r) => oneLine(r.text)).join("\n");
    const lines = (await translateToVi(block)).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === todo.length) {
      todo.forEach((r, i) => replyTranslationCache.set(r.id, lines[i]));
    } else {
      // số dòng không khớp -> dịch riêng từng phản hồi
      for (const r of todo) replyTranslationCache.set(r.id, await translateToVi(oneLine(r.text)));
    }
  }
  return new Map(replies.map((r) => [r.id, replyTranslationCache.get(r.id) || ""]));
}

// Dịch 1 đoạn sang tiếng Việt (Google Dịch, cùng endpoint với nút dịch bình luận).
// Đoạn dài được cắt thành nhiều phần ~1.500 ký tự để URL không quá dài.
async function translateToVi(text) {
  const parts = [];
  let rest = String(text || "");
  while (rest.length > 1500) {
    let cut = rest.lastIndexOf(" ", 1500);
    if (cut < 500) cut = 1500;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  const out = [];
  for (const part of parts) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(part)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    out.push((json[0] || []).map((chunk) => chunk[0]).join(""));
  }
  return out.join("").trim();
}

// Chạy fn cho từng phần tử, tối đa `limit` việc cùng lúc (tránh bị Google Dịch chặn).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchThumbnailBytes(video) {
  const urls = [video.thumbnail, `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`].filter(Boolean);
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") || "").toLowerCase();
      const ext = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpeg" : null;
      if (!ext) continue; // webp... Excel không hiển thị được
      return { bytes: new Uint8Array(await res.arrayBuffer()), ext };
    } catch {
      // CORS / mạng lỗi -> thử url khác, cuối cùng thì xuất file không kèm ảnh
    }
  }
  return null;
}

async function exportVideoComments(videoId, btn) {
  const video = allVideos.find((v) => v.videoId === videoId);
  if (!video || (btn && btn.disabled)) return;
  const btnLabel = btn ? btn.textContent : "";
  const setBtn = (text) => {
    if (btn) btn.textContent = text;
  };
  if (btn) btn.disabled = true;

  try {
    setBtn("Đang lấy bình luận…");
    let data;
    try {
      data = await loadLiveComments(videoId);
    } catch (err) {
      alert("Không lấy được bình luận từ YouTube: " + err.message);
      return;
    }
    if (data.disabled) {
      alert("Video này đã tắt bình luận.");
      return;
    }
    const top = [...(data.comments || [])]
      .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
      .slice(0, COMMENT_EXPORT_LIMIT);
    if (!top.length) {
      alert("Video này chưa có bình luận nào.");
      return;
    }

    let done = 0;
    let failed = 0;
    setBtn(`Đang dịch 0/${top.length}…`);
    const replyTranslations = new Map();
    const translations = await mapWithConcurrency(top, 5, async (c) => {
      let vi = commentTranslationCache.get(c.id);
      if (vi === undefined) {
        try {
          vi = await translateToVi(c.text);
          commentTranslationCache.set(c.id, vi);
        } catch {
          vi = "";
          failed++;
        }
      }
      if ((c.replies || []).length) {
        try {
          for (const [id, t] of await translateReplies(c.replies)) replyTranslations.set(id, t);
        } catch {
          failed++;
        }
      }
      done++;
      setBtn(`Đang dịch ${done}/${top.length}…`);
      return vi;
    });

    setBtn("Đang tạo file…");
    const thumb = await fetchThumbnailBytes(video);
    const bytes = buildCommentsXlsx({ video, comments: top, translations, replyTranslations, thumb });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `binh-luan_${video.videoId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);

    if (failed) alert(`Đã xuất file. ${failed}/${top.length} bình luận chưa dịch được, thử xuất lại sau ít phút.`);
  } catch (err) {
    console.error(err);
    alert("Không xuất được file Excel: " + (err.message || err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  }
}

// ---------- Dựng file .xlsx (Office Open XML) ----------

const XLSX_EMU_PER_PX = 9525;

function xmlEsc(str) {
  return String(str ?? "")
    // Ký tự điều khiển / surrogate lẻ không hợp lệ trong XML -> bỏ đi
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Excel giới hạn 32.767 ký tự / ô.
function cellText(str) {
  const s = String(str ?? "");
  return s.length > 32000 ? s.slice(0, 32000) + "…" : s;
}

function colLetter(i) {
  return String.fromCharCode(65 + i); // chỉ dùng A..F
}

function buildCommentsXlsx({ video, comments, translations, replyTranslations = new Map(), thumb }) {
  // Style index (khớp thứ tự <cellXfs> trong styles.xml bên dưới)
  const ST = { title: 1, info: 2, link: 3, head: 4, text: 5, num: 6, rowLink: 7, note: 8 };
  const rows = []; // { r, ht, cells: [xml] }
  const merges = [];
  const links = []; // { ref, url }

  const strCell = (ref, text, style) =>
    `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(cellText(text))}</t></is></c>`;
  const richCell = (ref, label, value, style) =>
    `<c r="${ref}" t="inlineStr" s="${style}"><is><r><rPr><b/><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${xmlEsc(label)}</t></r><r><rPr><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${xmlEsc(cellText(value))}</t></r></is></c>`;
  const numCell = (ref, n, style) =>
    n === null || n === undefined ? `<c r="${ref}" s="${style}"/>` : `<c r="${ref}" s="${style}"><v>${Number(n)}</v></c>`;

  const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  // Hàng 1: thumbnail (A1) | tiêu đề video (B1) | link video (C1:G1)
  const row1 = [];
  if (!thumb) row1.push(strCell("A1", "(Không tải được thumbnail)", ST.note));
  row1.push(strCell("B1", video.title, ST.title));
  row1.push(richCell("C1", "Link video: ", videoUrl, ST.link));
  rows.push({ r: 1, ht: 72, cells: row1 });
  merges.push("C1:G1");
  links.push({ ref: "C1", url: videoUrl });

  // Hàng 2: tiêu đề cột
  const HEAD_ROW = 2;
  const heads = ["Link Bình Luận", "Bình luận", "Dịch Tiếng Việt", "Số Like", "Số Phản hồi", "Nội Dung Phản hồi", "Dịch Phản hồi"];
  rows.push({ r: HEAD_ROW, ht: 24, cells: heads.map((h, i) => strCell(`${colLetter(i)}${HEAD_ROW}`, h, ST.head)) });

  // Hàng 3+: bình luận
  comments.forEach((c, i) => {
    const r = HEAD_ROW + 1 + i;
    const commentUrl = `https://www.youtube.com/watch?v=${video.videoId}&lc=${c.id}`;
    const replies = [...(c.replies || [])].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    const replyCount = c.replyCount || replies.length;
    let replyText = replies
      .map((rp) => `↳ ${rp.author}: ${rp.text}${rp.likeCount ? `  (♥ ${fmtNumber(rp.likeCount)})` : ""}`)
      .join("\n\n");
    const replyTrText = replies
      .map((rp) => `↳ ${rp.author}: ${replyTranslations.get(rp.id) || ""}`)
      .join("\n\n");
    rows.push({
      r,
      cells: [
        strCell(`A${r}`, commentUrl, ST.rowLink),
        strCell(`B${r}`, c.text, ST.text),
        strCell(`C${r}`, translations[i], ST.text),
        numCell(`D${r}`, c.likeCount || 0, ST.num),
        numCell(`E${r}`, replyCount, ST.num),
        strCell(`F${r}`, replyText, ST.text),
        strCell(`G${r}`, replies.length ? replyTrText : "", ST.text),
      ],
    });
    links.push({ ref: `A${r}`, url: commentUrl });
  });
  const lastRow = HEAD_ROW + comments.length;

  // ---- sheet1.xml ----
  const colWidths = [36, 55, 55, 10, 12, 60, 60];
  const sheetRels = [];
  const hyperlinkXml = links
    .map((l) => {
      const id = `rId${sheetRels.length + 1}`;
      sheetRels.push(
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEsc(l.url)}" TargetMode="External"/>`
      );
      return `<hyperlink ref="${l.ref}" r:id="${id}"/>`;
    })
    .join("");
  let drawingXml = "";
  if (thumb) {
    const id = `rId${sheetRels.length + 1}`;
    sheetRels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`
    );
    drawingXml = `<drawing r:id="${id}"/>`;
  }

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0" zoomScale="100"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${rows
      .map((row) => `<row r="${row.r}"${row.ht ? ` ht="${row.ht}" customHeight="1"` : ""}>${row.cells.join("")}</row>`)
      .join("")}</sheetData>` +
    (comments.length ? `<autoFilter ref="A${HEAD_ROW}:G${lastRow}"/>` : "") +
    `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` +
    `<hyperlinks>${hyperlinkXml}</hyperlinks>` +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    // In ngang, vừa 1 trang theo chiều rộng
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    drawingXml +
    `</worksheet>`;

  // ---- styles.xml ----
  const border = `<left style="thin"><color rgb="FFD0D4E4"/></left><right style="thin"><color rgb="FFD0D4E4"/></right><top style="thin"><color rgb="FFD0D4E4"/></top><bottom style="thin"><color rgb="FFD0D4E4"/></bottom><diagonal/>`;
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>` +
    `<fonts count="6">` +
    `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` + // 0 thường
    `<font><b/><sz val="15"/><color rgb="FF1F2440"/><name val="Calibri"/><family val="2"/></font>` + // 1 tiêu đề
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` + // 2 header
    `<font><u/><sz val="11"/><color rgb="FF1155CC"/><name val="Calibri"/><family val="2"/></font>` + // 3 link
    `<font><i/><sz val="10"/><color rgb="FF808080"/><name val="Calibri"/><family val="2"/></font>` + // 4 ghi chú
    `<font><sz val="11"/><color rgb="FF333333"/><name val="Calibri"/><family val="2"/></font>` + // 5 info
    `</fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1F2440"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${border}</border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="9">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0 mặc định
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 1 title
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 2 info
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 3 info có link
    `<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 4 header
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 5 text
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>` + // 6 số
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 7 link bình luận
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 8 ghi chú
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const files = [];
  const add = (name, content) =>
    files.push({ name, data: typeof content === "string" ? new TextEncoder().encode(content) : content });

  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      (thumb ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "") +
      `</Types>`
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="Bình luận" sheetId="1" r:id="rId1"/></sheets>` +
      (comments.length
        ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Bình luận'!$A$${HEAD_ROW}:$G$${lastRow}</definedName></definedNames>`
        : "") +
      `</workbook>`
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );
  add("xl/styles.xml", stylesXml);
  add("xl/worksheets/sheet1.xml", sheetXml);
  add(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels.join("")}</Relationships>`
  );

  if (thumb) {
    // Ảnh 160x90 nằm gọn trong ô A1 (hàng 1 cao 96px).
    const w = 160 * XLSX_EMU_PER_PX;
    const h = 90 * XLSX_EMU_PER_PX;
    add(
      "xl/drawings/drawing1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${4 * XLSX_EMU_PER_PX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${3 * XLSX_EMU_PER_PX}</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${w}" cy="${h}"/>` +
        `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Thumbnail" descr="${xmlEsc(video.title)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
        `<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
    );
    add(
      "xl/drawings/_rels/drawing1.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.${thumb.ext}"/>` +
        `</Relationships>`
    );
    add(`xl/media/image1.${thumb.ext}`, thumb.bytes);
  }

  return buildZip(files);
}

// ---------- ZIP tối giản (không nén - "stored"), đủ cho file .xlsx ----------
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const enc = new TextEncoder();
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 01/01/1980
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 filenames
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, DOS_TIME, true);
    cen.setUint16(14, DOS_DATE, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, size, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// Nút "Xuất Excel" trong bảng bình luận (modal) - xuất video đang mở.
(function addModalExportButton() {
  const controls = document.querySelector(".modal__comments-bar .comments-controls");
  if (!controls) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "comments-btn comments-export-btn comments-export-btn--modal";
  btn.textContent = "⬇ Xuất Excel";
  btn.title = "Xuất tối đa 100 bình luận nhiều like nhất (kèm bản dịch tiếng Việt) ra file Excel";
  btn.addEventListener("click", () => {
    if (currentModalVideoId) exportVideoComments(currentModalVideoId, btn);
  });
  controls.prepend(btn);
})();

// ---------- Channel stats modal ----------

let currentChannelId = null;

function openChannelModal(channelId) {
  currentChannelId = channelId;
  renderChannelModal();
  els.channelModalOverlay.classList.add("open");
}

function closeChannelModal() {
  els.channelModalOverlay.classList.remove("open");
}

function renderChannelModal() {
  const videos = allVideos.filter((v) => v.channelId === currentChannelId);
  if (!videos.length) return;
  const c = videos[0];

  els.channelModalAvatar.src = c.channelThumbnail;
  els.channelModalName.textContent = c.channelTitle;
  els.channelModalName.href = `https://www.youtube.com/channel/${c.channelId}`;
  els.channelModalSub.textContent = `${fmtNumber(c.subscriberCount)} subscribers`;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const totalViews = videos.reduce((s, v) => s + (v.viewCount || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.commentCount || 0), 0);
  const views7d = videos
    .filter((v) => now - new Date(v.publishedAt).getTime() <= 7 * day)
    .reduce((s, v) => s + (v.viewCount || 0), 0);
  const views30d = videos
    .filter((v) => now - new Date(v.publishedAt).getTime() <= 30 * day)
    .reduce((s, v) => s + (v.viewCount || 0), 0);

  const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const spanDays = Math.max(1, (dates[dates.length - 1] - dates[0]) / day);
  const videosPerWeek = (videos.length / spanDays) * 7;
  const latestPublished = new Date(dates[dates.length - 1]);

  const statCards = [
    ["Subscribers", fmtNumber(c.subscriberCount)],
    ["Tổng view kênh (all-time)", c.channelViewCount ? fmtNumber(c.channelViewCount) : "–"],
    ["Tổng số video kênh", c.channelVideoCount ? fmtNumber(c.channelVideoCount) : "–"],
    ["Video đang theo dõi", fmtNumber(videos.length)],
    ["View trung bình / video", fmtNumber(Math.round(totalViews / videos.length))],
    ["Bình luận trung bình / video", fmtNumber(Math.round(totalComments / videos.length))],
    ["Tần suất đăng bài", `~${videosPerWeek.toFixed(1)} video/tuần`],
    ["Video mới nhất", fmtDate(latestPublished.toISOString())],
    ["View 7 ngày qua*", fmtNumber(views7d)],
    ["View 30 ngày qua*", fmtNumber(views30d)],
  ];

  els.channelModalGrid.innerHTML = statCards
    .map(
      ([label, value]) => `
    <div class="channel-stat">
      <div class="channel-stat__label">${label}</div>
      <div class="channel-stat__value">${value}</div>
    </div>`
    )
    .join("");

  renderChannelRevenue(views7d, views30d);
}

function renderChannelRevenue(views7d, views30d) {
  let rpmMin = parseFloat(els.channelRpmMin.value) || 0;
  let rpmMax = parseFloat(els.channelRpmMax.value) || 0;
  if (rpmMin > rpmMax) [rpmMin, rpmMax] = [rpmMax, rpmMin];

  const fmtMoney = (n) => `$${n.toFixed(2)}`;
  const range = (views) => {
    const lo = (views * rpmMin) / 1000;
    const hi = (views * rpmMax) / 1000;
    return rpmMin === rpmMax ? fmtMoney(lo) : `${fmtMoney(lo)} – ${fmtMoney(hi)}`;
  };

  const cards = [
    ["Ước tính 7 ngày qua*", range(views7d)],
    ["Ước tính 30 ngày qua*", range(views30d)],
  ];

  els.channelModalRevenue.innerHTML = cards
    .map(
      ([label, value]) => `
    <div class="channel-stat channel-stat--money">
      <div class="channel-stat__label">${label}</div>
      <div class="channel-stat__value">${value}</div>
    </div>`
    )
    .join("");
}

function closeModal() {
  els.modalOverlay.classList.remove("open");
}

// ---------- Events ----------

// Đợi người dùng ngừng gõ 200ms rồi mới lọc, thay vì lọc + vẽ lại bảng sau MỖI phím.
let searchDebounceTimer = null;
els.search.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyFilters, 200);
});

els.sortField.addEventListener("change", () => {
  sortField = els.sortField.value;
  applyFilters();
});

els.sortDir.addEventListener("click", () => {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  els.sortDir.dataset.dir = sortDir;
  els.sortDir.querySelector(".dir-btn__arrow").textContent = sortDir === "asc" ? "↑" : "↓";
  els.sortDir.lastChild.textContent = sortDir === "asc" ? " Tăng dần" : " Giảm dần";
  applyFilters();
});

els.commentSortField.addEventListener("change", () => {
  commentSortField = els.commentSortField.value;
  if (currentModalVideoId) loadModalComments(currentModalVideoId);
});

els.commentSortDir.addEventListener("click", () => {
  commentSortDir = commentSortDir === "asc" ? "desc" : "asc";
  els.commentSortDir.dataset.dir = commentSortDir;
  els.commentSortDir.querySelector(".dir-btn__arrow").textContent = commentSortDir === "asc" ? "↑" : "↓";
  renderComments();
});

els.modalClose.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) closeModal();
});
els.channelModalClose.addEventListener("click", closeChannelModal);
els.channelModalOverlay.addEventListener("click", (e) => {
  if (e.target === els.channelModalOverlay) closeChannelModal();
});
els.channelRpmMin.addEventListener("input", () => {
  if (currentChannelId) renderChannelModal();
});
els.channelRpmMax.addEventListener("input", () => {
  if (currentChannelId) renderChannelModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeChannelModal();
  }
});

loadTabs().then(loadData);

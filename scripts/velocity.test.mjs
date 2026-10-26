// Chạy: node --test scripts/velocity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeVelocity,
  pickBaseline,
  deriveLiveStatus,
  pickLiveDetails,
  readSnapshots,
  findFakeSnapshotTimes,
  repairVideoVelocity,
  CONFIG,
} from "./velocity.mjs";

const H = 3600000;
const NOW = Date.parse("2026-09-25T00:00:00Z");
const ago = (h) => NOW - h * H;
const video = (viewCount) => ({ viewCount, publishedAt: "2026-09-01T00:00:00Z" });
const run = (o) => computeVelocity({ nowMs: NOW, liveStatus: "none", ...o });

test("cấu hình mặc định: 6h / mục tiêu 24h / tối đa 48h / video mới 48h / 8 snapshot", () => {
  assert.equal(CONFIG.minIntervalHours, 6);
  assert.equal(CONFIG.targetHours, 24);
  assert.equal(CONFIG.fallbackMaxHours, 48);
  assert.equal(CONFIG.youngVideoHours, 48);
  assert.equal(CONFIG.maxSnapshots, 8);
});

test("fetch cách lần trước < 6h: giữ nguyên VPH cũ, không thêm snapshot", () => {
  const prev = { viewCount: 1000, viewsPerHour: 42, viewsPerHourSource: "recent", vphWindowHours: 23.5, snapshots: [[ago(5.9), 1000]] };
  const r = run({ video: video(9999), prev });
  assert.equal(r.viewsPerHour, 42);
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.vphWindowHours, 23.5);
  assert.deepEqual(r.snapshots, [[ago(5.9), 1000]]);
});

test("đúng 6h: tính lại, và mốc 6h nằm trong cửa sổ", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(6), 1000]] };
  const r = run({ video: video(1600), prev });
  assert.equal(r.viewsPerHour, 100); // 600 view / 6h
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.vphWindowHours, 6);
  assert.equal(r.snapshots.length, 2);
});

test("chọn mốc có tuổi GẦN 24h NHẤT", () => {
  const snaps = [[ago(30), 0], [ago(20), 500], [ago(10), 800]];
  assert.deepEqual(pickBaseline(snaps, NOW), [ago(20), 500]);
  // có lần chạy tay giữa ngày (mốc 15h) + mốc cron hôm qua (24.5h) -> dùng mốc hôm qua
  assert.deepEqual(pickBaseline([[ago(24.5), 1], [ago(15), 2]], NOW), [ago(24.5), 1]);
  // lần chạy tay 9h sau cron: mốc 33h gần 24h hơn mốc 9h
  assert.deepEqual(pickBaseline([[ago(33), 1], [ago(9), 2]], NOW), [ago(33), 1]);
});

test("cron 24h lệch vài phút (24.1h): rơi vào fallback thay vì về lifetime", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(24.1), 1000]] };
  const r = run({ video: video(1241), prev });
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.viewsPerHour, 10); // 241 / 24.1
});

test("mốc quá gần (< 6h) hoặc quá cũ (> 48h) không được chọn", () => {
  assert.equal(pickBaseline([[ago(5), 1], [ago(49), 2]], NOW), null);
});

test("video cũ, mốc cũ hơn 48h: KHÔNG dùng trung bình cả đời, để trống chờ lần sau", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(60), 1000]] };
  const r = run({ video: video(2000), prev });
  assert.equal(r.viewsPerHourSource, "pending");
  assert.equal(r.viewsPerHour, null);
  assert.equal(r.snapshots.length, 2);
});

test("video cũ thấy lần đầu: pending + tạo snapshot đầu tiên", () => {
  const r = run({ video: video(24 * 24 * 100), prev: undefined }); // đăng 24 ngày trước
  assert.equal(r.viewsPerHourSource, "pending");
  assert.equal(r.viewsPerHour, null);
  assert.equal(r.snapshots.length, 1);
});

test("video mới đăng (< 48h) thấy lần đầu: trung bình từ lúc đăng", () => {
  const r = run({ video: { viewCount: 12000, publishedAt: new Date(ago(10)).toISOString() }, prev: undefined });
  assert.equal(r.viewsPerHourSource, "lifetime");
  assert.equal(r.viewsPerHour, 1200);
});

test("lần sau (< 6h) của video pending: vẫn pending, không ghi mốc", () => {
  const prev = { viewCount: 1000, viewsPerHour: null, viewsPerHourSource: "pending", snapshots: [[ago(2), 1000]] };
  const r = run({ video: video(1100), prev });
  assert.equal(r.viewsPerHour, null);
  assert.equal(r.viewsPerHourSource, "pending");
  assert.equal(r.snapshots.length, 1);
});

test("giữ tối đa MAX_SNAPSHOTS mốc, bỏ mốc cũ nhất", () => {
  const N = CONFIG.maxSnapshots;
  const snaps = Array.from({ length: N }, (_, i) => [ago(200 - i * 6.5), i * 10]);
  const prev = { viewCount: N * 10, viewsPerHour: 1, snapshots: snaps };
  const r = run({ video: video(5000), prev });
  assert.equal(r.snapshots.length, N);
  assert.equal(r.snapshots.at(-1)[0], NOW);
  assert.notDeepEqual(r.snapshots[0], snaps[0]);
});

test("view giảm (YouTube lọc view ảo): VPH không âm", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(12), 1000]] };
  assert.equal(run({ video: video(900), prev }).viewsPerHour, 0);
});

test("dữ liệu cũ chưa có snapshots: KHÔNG dựng mốc giả từ số view cũ", () => {
  const prev = { viewCount: 1000, viewsPerHour: 5, viewsPerHourSource: "lifetime" };
  assert.deepEqual(readSnapshots(prev), []);
  const r = run({ video: video(500000), prev });
  assert.equal(r.viewsPerHourSource, "pending");
  assert.equal(r.viewsPerHour, null);
});

test("dọn mốc giả: thời điểm trùng ở >= 2 kênh là giả, VPH tính lại từ mốc thật", () => {
  const FAKE = ago(15);
  const vids = [
    // video bị thổi phồng: mốc giả (view từ nhiều tuần trước) + 1 mốc thật
    { videoId: "a", channelId: "c1", publishedAt: "2026-06-01T00:00:00Z", liveStatus: "none",
      viewCount: 1400000, viewsPerHour: 24787, viewsPerHourSource: "recent", vphWindowHours: 15,
      snapshots: [[FAKE, 1038412], [NOW, 1408363]] },
    { videoId: "b", channelId: "c2", publishedAt: "2026-06-01T00:00:00Z", liveStatus: "none",
      viewCount: 900, viewsPerHour: 99, snapshots: [[FAKE, 100], [NOW + 1, 900]] },
    // video bình thường: mốc thật riêng của kênh c3 (2 video cùng kênh trùng mốc là bình thường)
    { videoId: "c", channelId: "c3", publishedAt: "2026-06-01T00:00:00Z", liveStatus: "none",
      viewCount: 2400, viewsPerHour: 100, viewsPerHourSource: "recent", snapshots: [[ago(24) + 7, 0], [NOW + 3, 2400]] },
    { videoId: "d", channelId: "c3", publishedAt: "2026-06-01T00:00:00Z", liveStatus: "none",
      viewCount: 10, viewsPerHour: 0, snapshots: [[ago(24) + 7, 10], [NOW + 3, 10]] },
  ];
  const fake = findFakeSnapshotTimes(vids);
  assert.deepEqual([...fake], [FAKE]);
  const a = repairVideoVelocity(vids[0], fake);
  assert.deepEqual(a.snapshots, [[NOW, 1408363]]);
  assert.equal(a.viewsPerHour, null);
  assert.equal(a.viewsPerHourSource, "pending");
  assert.equal(a.vphWindowHours, undefined);
  assert.equal(repairVideoVelocity(vids[2], fake), null); // không có mốc giả -> giữ nguyên
});

test("dọn mốc giả: còn mốc thật cũ hơn thì tính lại VPH từ mốc đó", () => {
  const FAKE = ago(15);
  const v = { videoId: "a", channelId: "c1", publishedAt: "2026-06-01T00:00:00Z", liveStatus: "none",
    viewCount: 3400, viewsPerHour: 9999, snapshots: [[ago(24), 1000], [FAKE, 5], [NOW, 3400]] };
  const r = repairVideoVelocity(v, new Set([FAKE]));
  assert.equal(r.viewsPerHour, 100); // 2400 view / 24h
  assert.equal(r.viewsPerHourSource, "recent");
});

test("live/upcoming: VPH = null, nguồn 'live', KHÔNG ghi snapshot", () => {
  const prev = { viewCount: 0, viewsPerHour: 3, snapshots: [[ago(12), 0]] };
  for (const liveStatus of ["live", "upcoming"]) {
    const r = run({ video: video(5000), prev, liveStatus });
    assert.equal(r.viewsPerHour, null);
    assert.equal(r.viewsPerHourSource, "live");
    assert.equal(r.snapshots.length, 1);
  }
});

test("live kết thúc (ended) tính VPH như video thường", () => {
  const prev = { viewCount: 0, viewsPerHour: null, viewsPerHourSource: "live", snapshots: [[ago(24), 1000]] };
  const r = run({ video: video(3400), prev, liveStatus: "ended" });
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.viewsPerHour, 100);
});

test("deriveLiveStatus", () => {
  const d = { actualStartTime: "x" };
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "live" }, d), "live");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "live" }, { ...d, actualEndTime: "y" }), "ended");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "upcoming" }, { scheduledStartTime: "z" }), "upcoming");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "none" }, d), "ended"); // VOD của live/công chiếu
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "none" }, undefined), "none");
  assert.equal(deriveLiveStatus({}, undefined), "none");
});

test("pickLiveDetails chỉ giữ trường thời gian", () => {
  assert.deepEqual(
    pickLiveDetails({ actualStartTime: "a", concurrentViewers: "9", actualEndTime: "b" }),
    { actualStartTime: "a", actualEndTime: "b" }
  );
  assert.equal(pickLiveDetails(undefined), undefined);
  assert.equal(pickLiveDetails({ concurrentViewers: "9" }), undefined);
});

test("live + dữ liệu cũ chưa có snapshots: không ghi mốc", () => {
  const prev = { viewCount: 300, viewsPerHour: 3 };
  const r = run({ video: video(5000), prev, liveStatus: "live" });
  assert.deepEqual(r.snapshots, []);
});

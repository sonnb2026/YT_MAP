// api/manual-views.js
//
// Lưu "View 7 ngày" NHẬP TAY cho các kênh chưa có đủ 7 ngày lịch sử (Dashboard).
// Ghi vào public/data/manual-views7d-<tab>.json trên GitHub qua Contents API:
//   { "<channelId>": { "views": 123456, "at": "2026-10-14T16:00:00.000Z" }, ... }
// Khi kênh đã có đủ 7 ngày dữ liệu tự động (channel-stats-<tab>.json), app tự dùng số tự động,
// số nhập tay chỉ còn là dự phòng.
//
// POST { tab: "TBN Life in", values: { "<channelId>": 123456 | null } }
//   null / "" = xoá số nhập tay của kênh đó.
//
// Biến môi trường (giống manage-channels.js): GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_REF (tuỳ chọn).

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const missing = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"].filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Server chưa cấu hình đủ biến môi trường: ${missing.join(", ")}.` });
  }
  const { GITHUB_TOKEN: token, GITHUB_OWNER: owner, GITHUB_REPO: repo } = process.env;
  const ref = process.env.GITHUB_REF || "main";

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const tab = typeof body.tab === "string" ? body.tab.trim() : "";
  if (!tab || /[\\/]/.test(tab)) return res.status(400).json({ error: "Tên tab không hợp lệ." });
  if (!body.values || typeof body.values !== "object") return res.status(400).json({ error: "Thiếu dữ liệu 'values'." });

  const updates = {};
  for (const [id, raw] of Object.entries(body.values)) {
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(id)) continue;
    if (raw === null || raw === "") {
      updates[id] = null;
      continue;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: `Số view không hợp lệ cho kênh ${id}.` });
    updates[id] = n;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/public/data/${encodeURIComponent(`manual-views7d-${tab}.json`)}`;

  try {
    // Thử ghi tối đa 3 lần (phòng khi GitHub Action vừa commit chen vào -> sha cũ bị từ chối).
    for (let attempt = 0; attempt < 3; attempt++) {
      let current = {};
      let sha;
      const getRes = await fetch(`${url}?ref=${ref}`, { headers });
      if (getRes.ok) {
        const file = await getRes.json();
        sha = file.sha;
        try {
          current = JSON.parse(Buffer.from(file.content || "", "base64").toString("utf-8")) || {};
        } catch {
          current = {};
        }
      } else if (getRes.status !== 404) {
        return res.status(502).json({ error: `Không đọc được file nhập tay (HTTP ${getRes.status}).` });
      }

      const at = new Date().toISOString();
      for (const [id, views] of Object.entries(updates)) {
        if (views === null) delete current[id];
        else current[id] = { views, at };
      }

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `chore: cập nhật View 7 ngày nhập tay (${tab}) qua web`,
          content: Buffer.from(JSON.stringify(current, null, 2) + "\n", "utf-8").toString("base64"),
          ...(sha ? { sha } : {}),
          branch: ref,
        }),
      });
      if (putRes.ok) return res.status(200).json({ ok: true, values: current });
      if (putRes.status !== 409 && putRes.status !== 422) {
        const t = await putRes.text();
        return res.status(502).json({ error: `Không lưu được (HTTP ${putRes.status}): ${t.slice(0, 200)}` });
      }
    }
    return res.status(409).json({ error: "Dữ liệu vừa được cập nhật ở nơi khác, hãy thử lưu lại." });
  } catch (err) {
    return res.status(500).json({ error: `Lỗi: ${err.message}` });
  }
};

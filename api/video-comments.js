// api/video-comments.js
// GET /api/video-comments?videoId=XXXXXXXXXXX&order=likes|time
// Lấy trực tiếp từ YouTube tối đa 100 bình luận (kèm phản hồi):
//   order=likes (mặc định): nhiều like nhất | order=time: mới nhất.
// Cần biến môi trường Vercel: YOUTUBE_API_KEYS = "key1,key2" (hoặc YOUTUBE_API_KEY).

const API_BASE = "https://www.googleapis.com/youtube/v3";
const LIMIT = 100;
const MAX_PAGES = 5; // quét tối đa 500 bình luận nổi bật nhất rồi xếp theo like
const MAX_REPLIES = 100;

function getApiKeys() {
  return (process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function makeClient(keys) {
  let keyIndex = 0;
  return async function get(endpoint, params) {
    for (;;) {
      const url = new URL(`${API_BASE}/${endpoint}`);
      url.searchParams.set("key", keys[keyIndex]);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      const reason = json?.error?.errors?.[0]?.reason || String(res.status);
      if ((reason === "quotaExceeded" || reason === "dailyLimitExceeded") && keyIndex < keys.length - 1) {
        keyIndex++;
        continue;
      }
      const err = new Error(json?.error?.message || `${endpoint} failed`);
      err.reason = reason;
      throw err;
    }
  };
}

function mapComment(item) {
  const s = item.snippet;
  return {
    id: item.id,
    author: s.authorDisplayName,
    authorImage: s.authorProfileImageUrl || "",
    text: s.textDisplay,
    likeCount: s.likeCount || 0,
    publishedAt: s.publishedAt,
  };
}

async function eachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const videoId = String(req.query?.videoId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "videoId không hợp lệ." });
  }
  const order = req.query?.order === "time" ? "time" : "likes";
  const keys = getApiKeys();
  if (!keys.length) {
    return res.status(500).json({ error: "Chưa cấu hình YOUTUBE_API_KEYS trên Vercel." });
  }

  const get = makeClient(keys);
  try {
    const threads = [];
    let pageToken = "";
    let pages = 0;
    do {
      const json = await get("commentThreads", {
        part: "snippet,replies",
        videoId,
        maxResults: "100",
        order: order === "time" ? "time" : "relevance",
        textFormat: "plainText",
        ...(pageToken ? { pageToken } : {}),
      });
      threads.push(...(json.items || []));
      pageToken = json.nextPageToken || "";
      pages++;
    } while (pageToken && pages < (order === "time" ? 1 : MAX_PAGES));

    const top = threads
      .map((t) => ({
        ...mapComment(t.snippet.topLevelComment),
        id: t.id,
        replyCount: t.snippet.totalReplyCount || 0,
        replies: (t.replies?.comments || []).map(mapComment),
      }))
      .sort((a, b) =>
        order === "time" ? new Date(b.publishedAt) - new Date(a.publishedAt) : b.likeCount - a.likeCount
      )
      .slice(0, LIMIT);

    await eachLimit(
      top.filter((c) => c.replyCount > c.replies.length),
      8,
      async (c) => {
        try {
          const json = await get("comments", {
            part: "snippet",
            parentId: c.id,
            maxResults: String(MAX_REPLIES),
            textFormat: "plainText",
          });
          c.replies = (json.items || []).map(mapComment);
        } catch {
          // giữ các phản hồi đã có
        }
      }
    );

    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({ videoId, order, disabled: false, comments: top });
  } catch (err) {
    if (err.reason === "commentsDisabled") {
      return res.status(200).json({ videoId, disabled: true, comments: [] });
    }
    return res.status(err.reason === "videoNotFound" ? 404 : 502).json({
      error: `YouTube API lỗi (${err.reason || "không rõ"}): ${err.message}`,
      reason: err.reason || null,
    });
  }
};

import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

let openaiClient = null;
if (AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Helper: shape article object consistently
 */
function normalizeArticle(a) {
  return {
    title: a.title || "",
    source: a.source?.name || "Unknown",
    author: a.author || null,
    description: a.description || "",
    content: a.content || "",
    url: a.url,
    urlToImage: a.urlToImage || null,
    publishedAt: a.publishedAt || "",
  };
}

/**
 * GET /api/news
 * Query: q, country, category, from, to, pageSize (default 10)
 * Uses NewsAPI:
 *  - if country/category present -> top-headlines
 *  - else -> everything (supports date range)
 */
app.get("/api/news", async (req, res) => {
  try {
    const {
      q = "",
      country = "",
      category = "",
      from = "",
      to = "",
      pageSize = "10",
      page = "1",
      sortBy = "publishedAt",
    } = req.query;

    if (!NEWS_API_KEY) {
      return res.status(500).json({
        error:
          "NEWS_API_KEY missing. Add it to backend .env (NEWS_API_KEY=...).",
      });
    }

    let url;
    let params = { apiKey: NEWS_API_KEY, pageSize, page };

    if (country || category) {
      // top-headlines (country/category filters)
      url = "https://newsapi.org/v2/top-headlines";
      if (country) params.country = country; // e.g., us, in, gb
      if (category) params.category = category.toLowerCase(); // business, technology, etc.
      if (q) params.q = q;
    } else {
      // everything (date range + keyword)
      url = "https://newsapi.org/v2/everything";
      if (q) params.q = q;
      if (from) params.from = from; // YYYY-MM-DD
      if (to) params.to = to; // YYYY-MM-DD
      params.sortBy = sortBy;
      // everything requires at least q OR sources/domains — fall back keyword if empty
      if (!params.q) params.q = "news";
    }

    const resp = await axios.get(url, { params });
    const articles = (resp.data.articles || []).map(normalizeArticle);

    res.json({ totalResults: resp.data.totalResults || 0, articles });
  } catch (e) {
    console.error("News API error:", e?.response?.data || e.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

/**
 * POST /api/ai/enrich
 * Body: { title, description, content, url }
 * Returns: { summary100, sentiment, takeaways: string[] }
 */
app.post("/api/ai/enrich", async (req, res) => {
  try {
    const { title = "", description = "", content = "", url = "" } = req.body;

    if (AI_PROVIDER !== "openai" || !openaiClient) {
      return res.status(500).json({
        error:
          "AI provider not configured. Set AI_PROVIDER=openai and OPENAI_API_KEY in .env",
      });
    }

    const text = [title, description, content].filter(Boolean).join("\n\n");

    const prompt = `
You are an assistant that analyzes news articles.
Given the article text below, return a JSON object with:
- "summary100": a concise summary under 100 words.
- "sentiment": one of "Positive", "Negative", or "Neutral".
- "takeaways": exactly 3 short bullet points (strings).

Article:
${text}

Respond ONLY with valid JSON (no backticks, no extra text).
`.trim();

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a helpful news assistant." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: wrap as neutral minimal response
      parsed = {
        summary100:
          "Summary not available due to parsing error. Please try again.",
        sentiment: "Neutral",
        takeaways: [
          "Summary failed to parse.",
          "Try again or open the article.",
          "Check network/API limits.",
        ],
      };
    }

    // ensure shape
    parsed.summary100 = String(parsed.summary100 || "").slice(0, 900);
    const allowed = ["Positive", "Negative", "Neutral"];
    if (!allowed.includes(parsed.sentiment)) parsed.sentiment = "Neutral";
    if (!Array.isArray(parsed.takeaways) || parsed.takeaways.length !== 3) {
      parsed.takeaways = (parsed.takeaways || [])
        .slice(0, 3)
        .concat(Array(3).fill(""))
        .slice(0, 3);
    }

    res.json(parsed);
  } catch (e) {
    console.error("AI enrich error:", e?.response?.data || e.message);
    res.status(500).json({ error: "Failed to enrich article" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend listening on http://localhost:${PORT}`);
});

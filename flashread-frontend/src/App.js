import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

const API_BASE = "http://localhost:5000";

export default function App() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState({}); // map by url: boolean
  const [aiData, setAiData] = useState({}); // map by url: { summary100, sentiment, takeaways }
  const [filters, setFilters] = useState({
    q: "",
    country: "",
    category: "",
    from: "",
    to: "",
    pageSize: "9",
  });

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.q) params.q = filters.q;
      if (filters.country) params.country = filters.country;
      if (filters.category) params.category = filters.category;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.pageSize) params.pageSize = filters.pageSize;

      const { data } = await axios.get(`${API_BASE}/api/news`, { params });
      setNews(data.articles || []);
    } catch (e) {
      console.error(e);
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // load some news on first paint
    fetchNews();
  }, [fetchNews]);

  const handleChange = (e) =>
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleReset = () =>
    setFilters({ q: "", country: "", category: "", from: "", to: "", pageSize: "9" });

  const summarize = async (article) => {
    if (!article?.url) return;
    const key = article.url;

    setEnriching((m) => ({ ...m, [key]: true }));
    try {
      const body = {
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
      };
      const { data } = await axios.post(`${API_BASE}/api/ai/enrich`, body);
      setAiData((m) => ({ ...m, [key]: data }));
    } catch (e) {
      console.error(e);
      setAiData((m) => ({
        ...m,
        [key]: {
          summary100: "Failed to generate summary.",
          sentiment: "Neutral",
          takeaways: ["Try again later.", "", ""],
        },
      }));
    } finally {
      setEnriching((m) => ({ ...m, [key]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-center mb-6">📰 FlashRead</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 justify-center mb-6">
        <select
          name="category"
          value={filters.category}
          onChange={handleChange}
          className="p-2 border rounded"
        >
          <option value="">Category</option>
          <option value="business">Business</option>
          <option value="technology">Technology</option>
          <option value="science">Science</option>
          <option value="health">Health</option>
          <option value="sports">Sports</option>
          <option value="entertainment">Entertainment</option>
          <option value="general">General</option>
        </select>

        <select
          name="country"
          value={filters.country}
          onChange={handleChange}
          className="p-2 border rounded"
          title="2-letter codes: us, in, gb, au, ca, etc."
        >
          <option value="">Country</option>
          <option value="us">USA</option>
          <option value="in">India</option>
          <option value="gb">UK</option>
          <option value="au">Australia</option>
          <option value="ca">Canada</option>
        </select>

        <input
          type="date"
          name="from"
          value={filters.from}
          onChange={handleChange}
          className="p-2 border rounded"
          title="From date (for Everything endpoint)"
        />
        <input
          type="date"
          name="to"
          value={filters.to}
          onChange={handleChange}
          className="p-2 border rounded"
          title="To date (for Everything endpoint)"
        />

        <input
          type="text"
          name="q"
          value={filters.q}
          onChange={handleChange}
          placeholder="Search keyword…"
          className="p-2 border rounded w-48"
        />

        <button
          onClick={fetchNews}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow"
        >
          Apply
        </button>
        <button
          onClick={handleReset}
          className="bg-gray-600 text-white px-4 py-2 rounded shadow"
        >
          Reset
        </button>
      </div>

      {/* News Cards */}
      {loading ? (
        <p className="text-center text-gray-600">Loading news…</p>
      ) : news.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map((a) => {
            const key = a.url;
            const enriched = aiData[key];
            const busy = enriching[key];

            return (
              <div key={key} className="bg-white rounded-xl shadow p-4">
                {a.urlToImage && (
                  <img
                    src={a.urlToImage}
                    alt=""
                    className="w-full h-40 object-cover rounded-lg mb-3"
                  />
                )}
                <h2 className="text-lg font-semibold mb-1">{a.title}</h2>
                <p className="text-sm text-gray-500 mb-2">
                  {a.source} • {new Date(a.publishedAt).toLocaleString()}
                </p>
                {a.description && (
                  <p className="text-gray-700 mb-3">{a.description}</p>
                )}

                {/* AI Section */}
                <div className="border-t pt-3">
                  {!enriched ? (
                    <button
                      onClick={() => summarize(a)}
                      disabled={busy}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded"
                    >
                      {busy ? "Summarizing…" : "AI Summarize"}
                    </button>
                  ) : (
                    <div>
                      <p className="font-semibold mb-1">Summary</p>
                      <p className="text-gray-700 mb-2">
                        {enriched.summary100}
                      </p>

                      <p className="font-semibold mb-1">
                        Sentiment:{" "}
                        <span className="inline-block px-2 py-0.5 rounded bg-gray-100">
                          {enriched.sentiment}
                        </span>
                      </p>

                      <p className="font-semibold mb-1">Key Takeaways</p>
                      <ul className="list-disc ml-5 text-gray-700 space-y-1">
                        {enriched.takeaways?.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline inline-block mt-3"
                >
                  Read more →
                </a>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-600">
          No news found. Try changing filters.
        </p>
      )}
    </div>
  );
}

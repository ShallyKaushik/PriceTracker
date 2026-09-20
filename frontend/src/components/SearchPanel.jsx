import { useState, useRef } from "react";
import { searchProducts, trackProduct, scrapeTrackedProduct } from "../api";

export default function SearchPanel({ onTracked }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [tracking, setTracking] = useState({}); // { [productId]: "loading"|"scraping"|"done"|"error" }

  const abortControllerRef = useRef(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) {
      setSearchError("Enter a product name or ID to search.");
      setResults([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setSearching(true);
    setSearchError("");
    setResults([]);

    try {
      const data = await searchProducts(query.trim(), abortControllerRef.current.signal);
      setResults(data);
      if (data.length === 0) setSearchError("No products found.");
    } catch (err) {
      if (err.name !== "AbortError") {
        setSearchError("Search failed. Please try again.");
      }
    } finally {
      if (!abortControllerRef.current.signal.aborted) {
        setSearching(false);
      }
    }
  }

  async function handleTrack(product) {
    setTracking((t) => ({ ...t, [product.id]: "loading" }));
    try {
      const trackedData = await trackProduct(product.id);
      
      setTracking((t) => ({ ...t, [product.id]: "scraping" }));
      onTracked();
      
      try {
        await scrapeTrackedProduct(trackedData.id);
      } catch (scrapeErr) {
        console.error("Initial scrape failed:", scrapeErr);
      }
      
      setTracking((t) => ({ ...t, [product.id]: "done" }));
      onTracked();
      
    } catch (err) {
      setTracking((t) => ({ ...t, [product.id]: "error" }));
      console.error("Track failed:", err.message);
    }
  }

  return (
    <section className="section search-section">
      <h2>Find a product</h2>
      <form className="search-form" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Enter product name or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searchError && <p className="msg-empty">{searchError}</p>}

      {results.length > 0 && (
        <div className="results-list">
          {results.map((p) => {
            const state = tracking[p.id];
            return (
              <div key={p.id} className="result-card">
                <div className="result-info">
                  <strong>{p.name}</strong>
                  <span className="meta">SKU: {p.sku || "—"}</span>
                </div>
                <button
                  className={`btn-track ${state === "done" ? "tracked" : ""}`}
                  onClick={() => handleTrack(p)}
                  disabled={state === "loading" || state === "scraping" || state === "done" || p.category === "Tracked"}
                >
                  {p.category === "Tracked" || state === "done" ? "Tracked" :
                   state === "loading" || state === "scraping" ? "Tracking..." :
                   state === "error" ? "Retry" :
                   "Track"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

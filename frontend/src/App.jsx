import { useEffect, useState, useCallback } from "react";
import SearchPanel from "./components/SearchPanel";
import TrackedList from "./components/TrackedList";
import ProductDashboard from "./components/ProductDashboard";
import { getTrackedProducts, getHistory } from "./api";
import "./App.css";

export default function App() {
  const [tracked, setTracked] = useState([]);
  const [loadingTracked, setLoadingTracked] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const loadTracked = useCallback(async () => {
    setLoadingTracked(true);
    try {
      const raw = await getTrackedProducts();

      // Attach the latest price_history row to each tracked product
      const withLatest = await Promise.all(
        raw.map(async (t) => {
          try {
            const hist = await getHistory(t.id);
            return { ...t, latest: hist.length > 0 ? hist[hist.length - 1] : null };
          } catch {
            return { ...t, latest: null };
          }
        })
      );

      setTracked(withLatest);
    } catch {
      setTracked([]);
    } finally {
      setLoadingTracked(false);
    }
  }, []);

  useEffect(() => {
    loadTracked();
  }, [loadTracked]);

  const selectedTracked = tracked.find((t) => t.id === selectedId);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-title-group">
            <h1>Price Tracker</h1>
            <span className="header-sub">INE Software Engineer Intern Assignment</span>
          </div>
          <div className="header-schedule">Updates every 2 hours</div>
        </div>
      </header>

      <main className="main">
        <SearchPanel onTracked={loadTracked} />

        {loadingTracked ? (
          <section className="section">
            <p className="msg-loading">Loading tracked products...</p>
          </section>
        ) : (
          <TrackedList
            products={tracked}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          />
        )}

        {selectedTracked && (
          <ProductDashboard key={selectedTracked.id} tracked={selectedTracked} />
        )}
      </main>

      <footer className="footer">
        <p>INE Price Tracker · Prices scraped from demo.inelabteamdev.com</p>
      </footer>
    </div>
  );
}

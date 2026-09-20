import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getHistory, getLogs } from "../api";
import { formatPrice, formatStock, formatDate, formatShortDate, formatDuration } from "../utils";

function StatusBadge({ status }) {
  const cls =
    status === "success" ? "badge-success" :
    status === "failed" ? "badge-failed" :
    "badge-retry";
  return <span className={`badge ${cls}`}>{status.toUpperCase()}</span>;
}

export default function ProductDashboard({ tracked }) {
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [logsError, setLogsError] = useState("");

  useEffect(() => {
    setHistory([]);
    setLogs([]);
    setHistoryError("");
    setLogsError("");
    setLoadingHistory(true);
    setLoadingLogs(true);

    getHistory(tracked.id)
      .then(setHistory)
      .catch(() => setHistoryError("Price history could not be retrieved."))
      .finally(() => setLoadingHistory(false));

    getLogs(tracked.id)
      .then(setLogs)
      .catch(() => setLogsError("Scrape history could not be retrieved."))
      .finally(() => setLoadingLogs(false));
  }, [tracked.id, tracked.latest?.scraped_at]);

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const product = tracked.products;

  // Recharts needs plain numbers
  const chartData = history.map((h) => ({
    time: formatShortDate(h.scraped_at),
    price: Number(h.price),
  }));

  return (
    <section className="section dashboard">
      <h2>{product?.name || "Product"}</h2>
      <p className="meta">SKU: {product?.sku || "—"}</p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Current Price</div>
          <div className="stat-value">
            {latest ? formatPrice(latest.price) : <span className="no-data">No price available</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock</div>
          <div className="stat-value">
            {latest ? formatStock(latest.stock) : <span className="no-data">—</span>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Updated</div>
          <div className="stat-value small">{latest ? formatDate(latest.scraped_at) : "—"}</div>
        </div>
      </div>

      {/* Price History Chart */}
      <h3>Price History</h3>
      {loadingHistory ? (
        <p className="msg-loading">Loading history...</p>
      ) : historyError ? (
        <p className="msg-error">{historyError}</p>
      ) : chartData.length === 0 ? (
        <p className="msg-empty">No price history available yet.</p>
      ) : (
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`}
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip formatter={(v) => formatPrice(v)} />
              <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History Table */}
      {loadingHistory ? (
        <p className="msg-loading">Loading history...</p>
      ) : history.length === 0 ? (
        <p className="msg-empty">No price history available yet.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Price</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.id}>
                  <td className="meta">{formatDate(h.scraped_at)}</td>
                  <td>{formatPrice(h.price)}</td>
                  <td>{formatStock(h.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Scrape Logs */}
      <h3>Scrape History</h3>
      {loadingLogs ? (
        <p className="msg-loading">Loading logs...</p>
      ) : logsError ? (
        <p className="msg-error">{logsError}</p>
      ) : logs.length === 0 ? (
        <p className="msg-empty">No scrape history available yet.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Attempt</th>
                <th>Duration</th>
                <th>Error</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td><StatusBadge status={l.status} /></td>
                  <td>{l.attempt}</td>
                  <td>{formatDuration(l.duration_ms)}</td>
                  <td className="meta error-text">{l.error_message || "—"}</td>
                  <td className="meta">{formatDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

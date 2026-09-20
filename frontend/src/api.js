const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export function searchProducts(q, signal) {
  return request(`/api/products/search?q=${encodeURIComponent(q)}`, { signal });
}

export function getTrackedProducts() {
  return request("/api/tracked-products");
}

export function trackProduct(productId) {
  return request("/api/tracked-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
}

export function getHistory(trackedId) {
  return request(`/api/tracked-products/${trackedId}/history`);
}

export function getLogs(trackedId) {
  return request(`/api/tracked-products/${trackedId}/logs`);
}

export function scrapeTrackedProduct(trackedId) {
  return request(`/api/tracked-products/${trackedId}/scrape`, {
    method: "POST"
  });
}

export function untrackProduct(trackedId) {
  return request(`/api/tracked-products/${trackedId}`, {
    method: "DELETE"
  });
}

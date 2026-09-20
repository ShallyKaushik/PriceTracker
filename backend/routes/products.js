const express = require("express");
const router = express.Router();
const supabase = require("../db");

// GET /api/products/search?q=<name>
router.get("/search", async (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  
  if (!query) {
    return res.status(400).json({ error: "Search query 'q' is required" });
  }

  try {
    let matched = [];
    const seen = new Set();
    const MAX_MATCHES = 20;

    // 1. Search local database for already tracked products
    const { data: localData, error: localErr } = await supabase
      .from("products")
      .select("*")
      .or(`name.ilike.%${query}%,external_id.eq.${isNaN(query) ? 0 : query}`);

    if (!localErr && localData) {
      for (const p of localData) {
        if (!seen.has(p.external_id)) {
          seen.add(p.external_id);
            matched.push({
              id: p.external_id,
              name: p.name,
              sku: p.sku || "",
              brand: p.sku ? p.sku.split("-")[0] : ""
            });
        }
      }
    }

    // 2. Fallback to scraping the remote catalog if we need more matches.
    // The remote API returns random items, so we fetch random pages.
    // We use pageSize=60 to get more items per request.
    if (matched.length < MAX_MATCHES) {
      const TOTAL_PAGES = 45; 
      const BATCH_SIZE = 15;

      for (let batchStart = 1; batchStart <= TOTAL_PAGES; batchStart += BATCH_SIZE) {
        const batchPromises = [];
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_PAGES);
        
        for (let page = batchStart; page <= batchEnd; page++) {
          batchPromises.push(
            (async () => {
              let data = null;
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  const r = await fetch(`https://demo.inelabteamdev.com/api/catalog?page=${page}&pageSize=60`);
                  if (r.ok) {
                    data = await r.json();
                    break;
                  }
                  if (r.status === 503) {
                    await new Promise(resolve => setTimeout(resolve, 150 * attempt));
                  }
                } catch (e) {
                  // Network error, will retry
                }
              }
              return data && data.items ? data.items : [];
            })()
          );
        }
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const items of batchResults) {
          for (const p of items) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              if (p.name.toLowerCase().includes(query) || String(p.id) === query) {
                matched.push(p);
              }
            }
          }
        }
        
        // Stop early if we found enough matches OR if we found at least some matches
        // in this batch to avoid unnecessary slow fetching.
        if (matched.length >= MAX_MATCHES || matched.length > 0) {
          break;
        }
      }
    }
    
    res.json(matched.slice(0, MAX_MATCHES));

  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Failed to search products" });
  }
});

module.exports = router;

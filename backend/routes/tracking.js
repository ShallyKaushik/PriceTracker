const express = require("express");
const router = express.Router();
const supabase = require("../db");

// GET /api/tracked-products
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tracked_products")
      .select(`
        id,
        active,
        created_at,
        products (
          id,
          external_id,
          name,
          sku
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching tracked products:", error);
    res.status(500).json({ error: "Failed to fetch tracked products" });
  }
});

// POST /api/tracked-products
// Body: { "productId": 47 }
router.post("/", async (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    // 1. Fetch product details from the external API
    const response = await fetch(`https://demo.inelabteamdev.com/api/product/${productId}`);
    if (!response.ok) {
      return res.status(404).json({ error: "Product not found in INE store" });
    }
    const extProduct = await response.json();

    // 2. Upsert into our products table
    const { data: product, error: productError } = await supabase
      .from("products")
      .upsert({
        external_id: extProduct.id,
        name: extProduct.name,
        sku: extProduct.sku,
      }, { onConflict: "external_id" })
      .select()
      .single();

    if (productError) throw productError;

    // 3. Upsert into tracked_products
    const { data: tracked, error: trackError } = await supabase
      .from("tracked_products")
      .upsert({
        product_id: product.id,
        active: true,
      }, { onConflict: "product_id" })
      .select()
      .single();

    if (trackError) throw trackError;

    res.json(tracked);
  } catch (error) {
    console.error("Error tracking product:", error);
    res.status(500).json({ error: "Failed to track product" });
  }
});

// GET /api/tracked-products/:id/history
router.get("/:id/history", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("tracked_product_id", req.params.id)
      .order("scraped_at", { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// GET /api/tracked-products/:id/logs
router.get("/:id/logs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("scrape_logs")
      .select("*")
      .eq("tracked_product_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// POST /api/tracked-products/:id/scrape
router.post("/:id/scrape", async (req, res) => {
  const trackedId = req.params.id;
  
  try {
    const { data: tracked, error: fetchError } = await supabase
      .from("tracked_products")
      .select("id, products (external_id)")
      .eq("id", trackedId)
      .single();

    if (fetchError || !tracked) {
      return res.status(404).json({ error: "Tracked product not found" });
    }

    const { scrapeProduct } = require("../scraper");
    const crypto = require("crypto");
    const maxAttempts = Number(process.env.MAX_ATTEMPTS || 4);
    const runId = crypto.randomUUID();
    const externalId = tracked.products.external_id;

    const scrapeResult = await scrapeProduct(externalId, maxAttempts, true);

    if (scrapeResult.success) {
      await supabase.from("price_history").insert({
        tracked_product_id: tracked.id,
        price: scrapeResult.price,
        stock: scrapeResult.stock,
      });

      await supabase.from("scrape_logs").insert({
        tracked_product_id: tracked.id,
        run_id: runId,
        attempt: scrapeResult.attempts,
        status: "success",
        duration_ms: scrapeResult.duration,
      });

      res.json({ success: true, price: scrapeResult.price, stock: scrapeResult.stock });
    } else {
      await supabase.from("scrape_logs").insert({
        tracked_product_id: tracked.id,
        run_id: runId,
        attempt: scrapeResult.attempts,
        status: "failed",
        error_message: scrapeResult.error,
      });

      res.status(500).json({ error: scrapeResult.error });
    }
  } catch (error) {
    console.error("Manual scrape error:", error);
    res.status(500).json({ error: "Failed to execute initial scrape" });
  }
});

// DELETE /api/tracked-products/:id
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("tracked_products")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting tracked product:", error);
    res.status(500).json({ error: "Failed to delete tracked product" });
  }
});

module.exports = router;

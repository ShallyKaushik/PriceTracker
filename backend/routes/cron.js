const express = require("express");
const router = express.Router();
const supabase = require("../db");
const { scrapeProduct } = require("../scraper");
const crypto = require("crypto");

// POST /api/cron/scrape
router.post("/scrape", async (req, res) => {
  const authHeader = req.headers.authorization;
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized: Invalid CRON_SECRET" });
  }

  try {
    const { data: trackedProducts, error: trackError } = await supabase
      .from("tracked_products")
      .select("id, products (external_id)")
      .eq("active", true);

    if (trackError) throw trackError;

    if (!trackedProducts || trackedProducts.length === 0) {
      return res.json({ success: true, processed: 0, succeeded: 0, failed: 0 });
    }

    const runId = crypto.randomUUID();
    const maxAttempts = Number(process.env.MAX_ATTEMPTS || 4);
    const results = [];

    console.log(`\nCron run started: ${runId}`);
    console.log(`Found ${trackedProducts.length} tracked products`);

    // Process products sequentially — Playwright browsers are heavy,
    // running them in parallel will exhaust memory.
    for (const tracked of trackedProducts) {
      const externalId = tracked.products.external_id;
      const trackedProductId = tracked.id;

      console.log(`\nScraping product ${externalId}...`);

      try {
        const scrapeResult = await scrapeProduct(externalId, maxAttempts, true);

        if (scrapeResult.success) {
          // Only insert price_history when we have a validated price AND stock
          const { error: histError } = await supabase
            .from("price_history")
            .insert({
              tracked_product_id: trackedProductId,
              price: scrapeResult.price,
              stock: scrapeResult.stock,
            });

          if (histError) {
            console.error(`price_history insert failed for ${externalId}:`, histError.message);
          }

          await supabase.from("scrape_logs").insert({
            tracked_product_id: trackedProductId,
            run_id: runId,
            attempt: scrapeResult.attempts,
            status: "success",
            duration_ms: scrapeResult.duration,
          });

          console.log(`Success: ₹${scrapeResult.price.toLocaleString("en-IN")}, stock ${scrapeResult.stock}`);
          results.push({ productId: externalId, status: "success", price: scrapeResult.price, stock: scrapeResult.stock });

        } else {
          await supabase.from("scrape_logs").insert({
            tracked_product_id: trackedProductId,
            run_id: runId,
            attempt: scrapeResult.attempts,
            status: "failed",
            error_message: scrapeResult.error,
          });

          console.log(`Failed: ${scrapeResult.error}`);
          results.push({ productId: externalId, status: "failed", error: scrapeResult.error });
        }

      } catch (err) {
        // Unexpected crash from scrapeProduct itself
        console.error(`Unexpected error for product ${externalId}:`, err.message);

        await supabase.from("scrape_logs").insert({
          tracked_product_id: trackedProductId,
          run_id: runId,
          attempt: 1,
          status: "failed",
          error_message: err.message || "Unexpected scraper error",
        });

        console.log(`Failed: ${err.message}`);
        results.push({ productId: externalId, status: "failed", error: err.message });
      }
    }

    const successful = results.filter(r => r.status === "success").length;
    const failed = results.length - successful;

    console.log(`\nCron run finished: ${successful} successful, ${failed} failed\n`);

    res.json({
      success: true,
      processed: results.length,
      succeeded: successful,
      failed: failed,
    });

  } catch (error) {
    console.error("[cron] Route error:", error.message);
    res.status(500).json({ error: "Failed to execute cron scrape" });
  }
});

module.exports = router;

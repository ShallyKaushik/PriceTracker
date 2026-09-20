// test-e2e.js - Full end-to-end test: track product 747, then run cron scrape
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const supabase = require("./db");
const { scrapeProduct } = require("./scraper");
const crypto = require("crypto");

const PRODUCT_ID = 747;
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 4);

async function main() {
  console.log("=".repeat(50));
  console.log("E2E TEST: Track product 747 + Run cron scrape");
  console.log("=".repeat(50));

  // STEP 1: Fetch product info from INE store
  console.log(`\n[1/4] Fetching product ${PRODUCT_ID} from INE catalog...`);
  const extRes = await fetch(`https://demo.inelabteamdev.com/api/product/${PRODUCT_ID}`);
  if (!extRes.ok) {
    throw new Error(`Product ${PRODUCT_ID} not found in INE store (${extRes.status})`);
  }
  const extProduct = await extRes.json();
  console.log(`      Found: "${extProduct.name}" (SKU: ${extProduct.sku})`);

  // STEP 2: Upsert into products table
  console.log(`\n[2/4] Upserting product into Supabase...`);
  const { data: product, error: productError } = await supabase
    .from("products")
    .upsert({ external_id: extProduct.id, name: extProduct.name, sku: extProduct.sku }, { onConflict: "external_id" })
    .select()
    .single();

  if (productError) throw new Error("products upsert failed: " + productError.message);
  console.log(`      products row id=${product.id}`);

  // STEP 3: Upsert into tracked_products
  const { data: tracked, error: trackError } = await supabase
    .from("tracked_products")
    .upsert({ product_id: product.id, active: true }, { onConflict: "product_id" })
    .select()
    .single();

  if (trackError) throw new Error("tracked_products upsert failed: " + trackError.message);
  console.log(`      tracked_products row id=${tracked.id}`);

  // STEP 4: Run the scraper exactly as the cron endpoint would
  console.log(`\n[3/4] Running scraper for product ${PRODUCT_ID}...`);
  console.log(`      (this takes ~15-30s — Playwright is opening a real browser)\n`);

  const runId = crypto.randomUUID();
  const scrapeResult = await scrapeProduct(PRODUCT_ID, MAX_ATTEMPTS, true);

  console.log(`\n[4/4] Saving to Supabase...`);

  if (scrapeResult.success) {
    console.log(`      Scrape SUCCESS:`);
    console.log(`        Price : ₹${scrapeResult.price}`);
    console.log(`        Stock : ${scrapeResult.stock}`);
    console.log(`        Attempts: ${scrapeResult.attempts}`);
    console.log(`        Duration: ${scrapeResult.duration}ms`);

    // Insert price_history (ONLY on validated success)
    const { data: hist, error: histError } = await supabase
      .from("price_history")
      .insert({
        tracked_product_id: tracked.id,
        price: scrapeResult.price,
        stock: scrapeResult.stock,
      })
      .select()
      .single();

    if (histError) {
      console.error("      price_history insert FAILED:", histError.message);
    } else {
      console.log(`      price_history inserted: id=${hist.id}, scraped_at=${hist.scraped_at}`);
    }

    // Insert scrape_log
    const { data: log, error: logError } = await supabase
      .from("scrape_logs")
      .insert({
        tracked_product_id: tracked.id,
        run_id: runId,
        attempt: scrapeResult.attempts,
        status: "success",
        duration_ms: scrapeResult.duration,
      })
      .select()
      .single();

    if (logError) {
      console.error("      scrape_logs insert FAILED:", logError.message);
    } else {
      console.log(`      scrape_logs  inserted: id=${log.id}, run_id=${log.run_id}`);
    }

  } else {
    console.log(`      Scrape FAILED after ${scrapeResult.attempts} attempt(s):`);
    console.log(`        Error: ${scrapeResult.error}`);
    console.log(`      -> price_history was NOT inserted (correct behavior)`);

    // Insert failure log only
    const { data: log, error: logError } = await supabase
      .from("scrape_logs")
      .insert({
        tracked_product_id: tracked.id,
        run_id: runId,
        attempt: scrapeResult.attempts,
        status: "failed",
        error_message: scrapeResult.error,
      })
      .select()
      .single();

    if (logError) {
      console.error("      scrape_logs insert FAILED:", logError.message);
    } else {
      console.log(`      scrape_logs  inserted (failure): id=${log.id}`);
    }
  }

  // VERIFY: Read back from Supabase
  console.log(`\n${"=".repeat(50)}`);
  console.log("VERIFICATION — reading back from Supabase");
  console.log("=".repeat(50));

  const { data: history } = await supabase
    .from("price_history")
    .select("*")
    .eq("tracked_product_id", tracked.id)
    .order("scraped_at", { ascending: false })
    .limit(3);

  console.log(`\nprice_history (latest 3 rows):`);
  console.log(JSON.stringify(history, null, 2));

  const { data: logs } = await supabase
    .from("scrape_logs")
    .select("*")
    .eq("tracked_product_id", tracked.id)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log(`\nscrape_logs (latest 3 rows):`);
  console.log(JSON.stringify(logs, null, 2));
}

main().catch(err => {
  console.error("\nFATAL:", err.message);
  process.exitCode = 1;
});

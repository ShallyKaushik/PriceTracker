# Design Note: Scraping Reliability & Trade-offs

## Making Scraping Reliable

To ensure the scraping mechanism was robust against the INE mock store's deliberate hurdles (such as intermittent 503 errors and artificial JavaScript delays), the following reliability mechanisms were implemented:

1. **Exponential Backoff & Retry Logic:** The core scraping function wraps the extraction logic in a resilient `try/catch` loop. If the store fails to load the price (e.g., throwing a "Couldn't load the price" DOM element), the scraper catches this, records the failure, and retries up to 4 times with an increasing delay between attempts.
2. **Honest Logging:** If a scrape fails completely after all retries, the backend does *not* insert a null or zero price into the `price_history` table (which would corrupt the graph). Instead, it logs the detailed error string to the `scrape_logs` table. This guarantees transparency and data integrity.
3. **Headless Browser Execution:** We utilized Playwright to physically render the DOM, handle cookies, and execute client-side JavaScript, ensuring we could interact with the store identically to a human user.

## Trade-offs Made

1. **Playwright vs. Lightweight Parsers (Cheerio/Axios):** 
   * *Trade-off:* We chose a heavy browser automation framework over lightweight HTML parsers.
   * *Reasoning:* While Playwright consumes more memory and takes longer to deploy, it was strictly necessary because the INE store relies on client-side JS to reveal the price. Simple HTTP clients would only capture the initial, unrendered HTML.
2. **External Cron vs. Internal `setInterval`:** 
   * *Trade-off:* We used `cron-job.org` to hit a webhook rather than writing a native `node-cron` loop inside the server.
   * *Reasoning:* Free-tier hosting (like Render) puts instances to sleep after 15 minutes of inactivity. An internal loop would freeze. The external ping guarantees the server wakes up exactly when needed.
3. **Sequential vs. Parallel Scraping:**
   * *Trade-off:* The background cron job loops through tracked products sequentially rather than using `Promise.all()` to scrape them simultaneously.
   * *Reasoning:* While parallel processing is faster, spawning multiple concurrent Chromium instances would instantly exhaust the tight 512MB memory limits of standard free-tier hosting, crashing the server.

## AI Generation: What Went Wrong & How It Was Corrected

During the AI-assisted development of this project, the tools made several incorrect assumptions on their first attempts, which required manual architectural corrections:

1. **Playwright Execution on Render:**
   * *The Mistake:* The AI initially configured standard Playwright installation commands for the backend. However, Render wipes the default global cache (`~/.cache/ms-playwright`) between the build and runtime phases, resulting in a fatal "browser executable doesn't exist" error when the server started.
   * *The Correction:* I configured the environment variable `PLAYWRIGHT_BROWSERS_PATH=0` in Render. This forces Playwright to download and store the Chromium binaries directly inside the local `node_modules` folder, which successfully persists into the runtime environment.
2. **Cron Job HTTP Timeouts:**
   * *The Mistake:* Initially, the AI wrote the `/api/cron/scrape` route to await the completion of *all* scraping tasks before sending the HTTP response back to `cron-job.org`. Because Playwright takes ~5-10 seconds per product, tracking just 5 items caused the request to exceed the strict 30-second timeout limit of the cron service, resulting in false "Timeout Failed" alerts.
   * *The Correction:* I decoupled the HTTP response from the scraping loop. The endpoint was refactored to instantly return a `200 OK` (acknowledging the trigger), while utilizing an immediately invoked async function (IIFE) to safely execute the heavy Playwright loop in the background.
3. **Ghost State in Search Results:**
   * *The Mistake:* When removing a tracked product, the backend incorrectly assumed that if a product existed in the local cached `products` table, it was currently being tracked. It hardcoded a `category: "Tracked"` tag onto the search results, causing the frontend UI to display a disabled "Tracked" button for items the user had just removed.
   * *The Correction:* I stripped the hardcoded assumption from the backend and made the frontend the sole source of truth. The UI now cross-references the search results strictly against the *active* `tracked_products` connections, cleanly resolving the ghost state.

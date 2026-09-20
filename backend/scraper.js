const { chromium } = require("playwright");

const PAGE_TIMEOUT = 30_000;
const PRICE_TIMEOUT = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt) {
  return Math.min(2000 * 2 ** (attempt - 1), 10000);
}

function parseMoney(text) {
  if (!text) return null;

  const clean = text.replace(/[\s\xA0\u200B-\u200D\uFEFF]/g, "");
  const match = clean.match(/(?:₹|Rs\.?)([\d,]+(?:\.\d{1,2})?)/i);

  if (!match) return null;

  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseStock(text) {
  if (!text) return null;

  const clean = text.replace(/\s+/g, " ").trim();

  let match = clean.match(/ONLY\s+(\d+)\s+LEFT/i);

  if (match) return Number(match[1]);

  match = clean.match(/(\d+)\s+(?:LEFT|IN STOCK)/i);

  if (match) return Number(match[1]);

  if (/OUT OF STOCK/i.test(clean)) return 0;

  return null;
}

async function handleCookies(page) {
  const overlay = page.locator(".cookie-overlay");

  if (!(await overlay.isVisible().catch(() => false))) {
    return;
  }

  const accept = overlay.locator(
    'button[aria-label="Accept cookies"]'
  );

  const decline = overlay.locator(
    'button[aria-label="Decline cookies"]'
  );

  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  } else if (await decline.isVisible().catch(() => false)) {
    await decline.click();
  }

  await overlay
    .waitFor({ state: "hidden", timeout: 3000 })
    .catch(() => {});
}

// Layout is intercepted in scrapeOnce to guarantee we get the exact classes the frontend uses.


async function getPriceBlock(page) {
  const block = page.locator(".price-block");

  await block.waitFor({
    state: "visible",
    timeout: PAGE_TIMEOUT,
  });

  return block;
}

async function revealPrice(page, priceBlock) {
  await handleCookies(page);

  const box = await priceBlock.boundingBox();

  if (!box) {
    throw new Error("Could not find price area.");
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // The store responds to real pointer movement, not just a forced hover.
  // Reproduce natural human pointer movement to enable the button.
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(x - 100 + i * 5, y - 100 + i * 5);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1000);

  await handleCookies(page);

  const button = priceBlock.getByRole("button", {
    name: /reveal price/i,
  });

  await page.waitForFunction(
    (el) => !el.disabled,
    await button.elementHandle(),
    { timeout: 10_000 }
  );

  await button.click();

  return button;
}

async function readPrice(page, layout) {
  const block = page.locator(".price-block");

  const deadline = Date.now() + PRICE_TIMEOUT;

  while (Date.now() < deadline) {
    await handleCookies(page);

    const text = (await block.innerText())
      .replace(/\s+/g, " ")
      .trim();

    const priceSelector = layout?.priceValue
      ? `.${layout.priceValue}`
      : '[class*="price-value"]';

    const stockSelector = layout?.stock
      ? `.${layout.stock}`
      : '[class*="stock"]';

    const priceElements = block.locator(priceSelector);
    const stockElements = block.locator(stockSelector);

    let price = null;
    let stock = null;
    let stockText = "";

    for (let i = 0; i < await priceElements.count(); i++) {
      if (!(await priceElements.nth(i).isVisible().catch(() => false))) {
        continue;
      }

      price = parseMoney(
        await priceElements.nth(i).innerText()
      );

      if (price !== null) break;
    }

    for (let i = 0; i < await stockElements.count(); i++) {
      const value = await stockElements.nth(i).innerText().catch(() => "");

      const parsed = parseStock(value);

      if (parsed !== null) {
        stock = parsed;
        stockText = value;
        break;
      }
    }

    // Fallback if the dynamic classes weren't found.
    if (price === null) {
      price = parseMoney(text);
    }

    if (stock === null) {
      stock = parseStock(text);
      if (stock !== null) stockText = text;
    }

    if (price !== null && stock !== null) {
      if (price <= 0 || stock < 0) {
        throw new Error("Invalid price or stock value.");
      }

      return {
        price,
        stock,
        stockText: stockText.trim(),
      };
    }

    if (
      /couldn't load the price/i.test(text) ||
      /failed to load/i.test(text)
    ) {
      throw new Error(`Store failed to load price: ${text}`);
    }

    await sleep(500);
  }

  throw new Error("Timed out waiting for price and stock.");
}

async function scrapeOnce(browser, attempt, productId, maxAttempts) {
  const startedAt = Date.now();
  const productUrl = `https://demo.inelabteamdev.com/product/${productId}`;

  console.log(`\nAttempt ${attempt}/${maxAttempts}`);

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
  });

  const page = await context.newPage();

  let layoutClasses = null;

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/layout") && response.status() === 200) {
      try {
        const data = await response.json();
        if (data?.classes) layoutClasses = data.classes;
      } catch (e) {}
    }
  });

  try {
    await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT,
    });

    await handleCookies(page);

    const priceBlock = await getPriceBlock(page);

    await revealPrice(page, priceBlock);

    const result = await readPrice(page, layoutClasses);

    return {
      ...result,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await context.close();
  }
}

async function scrapeProduct(productId, maxAttempts = 4, headless = true) {
  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 50,
  });

  let lastError;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await scrapeOnce(browser, attempt, productId, maxAttempts);
        return {
          success: true,
          productId,
          price: result.price,
          stock: result.stock,
          attempts: attempt,
          duration: result.durationMs,
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const delay = backoff(attempt);
          await sleep(delay);
        }
      }
    }

    return {
      success: false,
      productId,
      attempts: maxAttempts,
      error: lastError?.message || "Unknown error",
    };
  } finally {
    await browser.close();
  }
}

// Allow running from CLI for testing
if (require.main === module) {
  const args = process.argv.slice(2);
  const productArg = args.find((arg) => arg.startsWith("--product="));
  const id = Number(productArg ? productArg.split("=")[1] : process.env.PRODUCT_ID || 47);
  const headed = args.includes("--headed");
  const maxAttempts = Number(process.env.MAX_ATTEMPTS || 4);

  scrapeProduct(id, maxAttempts, !headed)
    .then(console.log)
    .catch(console.error);
}

module.exports = { scrapeProduct };
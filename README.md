# INE Price Tracker

A full-stack product price and stock tracker built with Node.js, Express, Playwright, React, and Supabase.

## Cron Job Configuration (cron-job.org)

To ensure tracked products are automatically scraped every 2 hours (especially when hosted on free tiers like Render that can sleep), you must set up an external cron job via [cron-job.org](https://cron-job.org/).

### Steps

1. Create a free account at cron-job.org and create a new cron job.
2. **Title**: `INE Price Tracker - 2 Hour Scrape`
3. **URL**: `https://YOUR-RENDER-BACKEND.onrender.com/api/cron/scrape` (replace with your actual backend domain)
4. **Schedule**: Select "Every 2 hours".
5. **Advanced settings -> HTTP Method**: Change to `POST`.
6. **Advanced settings -> Headers**:
   Add a new header:
   - **Key**: `Authorization`
   - **Value**: `Bearer YOUR_CRON_SECRET`
   
   *(Ensure that `YOUR_CRON_SECRET` exactly matches the `CRON_SECRET` environment variable defined in your backend on Render. Keep this secret strictly private and do NOT expose it to the React frontend).*

7. Save and enable the cron job.

### Manual Testing
You can manually test the cron execution by running the following command in your terminal (make sure your local backend is running):

```bash
curl -X POST http://localhost:3000/api/cron/scrape \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

This will instantly trigger the scraping sequence for all active tracked products and insert the latest values into your `price_history` database table, as well as logging the run in `scrape_logs`.

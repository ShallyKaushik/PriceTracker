# INE Price Tracker

A full-stack application built for the INE Software Engineer Intern Assignment. The platform enables users to search for products on the INE mock store, track them, and automatically scrape their current prices and stock availability on a recurring schedule.

## Architecture

* **Frontend:** React (Vite)
* **Backend:** Node.js (Express), Playwright (for scraping)
* **Database:** Supabase (PostgreSQL)
* **Deployment:** Vercel (Frontend), Render (Backend)

---

## Environment Variables Required

To run this project locally or deploy it, you will need to configure the following environment variables.

### Backend (`backend/.env`)

```env
PORT=3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CRON_SECRET=a_secure_random_string_for_cron_auth
MAX_ATTEMPTS=4
```
*(Note for Render deployment: You must also set `PLAYWRIGHT_BROWSERS_PATH=0` in your Render Environment Variables so that the Playwright binary is cached correctly inside `node_modules`)*

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000  # Change to your Render URL in production
```

---

## Setup Instructions (Local Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ShallyKaushik/PriceTracker.git
   cd PriceTracker
   ```

2. **Set up the Database (Supabase):**
   * Create a new Supabase project.
   * Execute the SQL schema (found in your setup files) in the Supabase SQL Editor to create the `products`, `tracked_products`, `price_history`, and `scrape_logs` tables.
   * Ensure you have foreign keys set up with `ON DELETE CASCADE`.

3. **Start the Backend:**
   ```bash
   cd backend
   npm install
   npx playwright install chromium
   npm start
   ```

4. **Start the Frontend:**
   Open a new terminal window:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

---

## Scraping Schedule

The automated scraping is configured to run **every 2 hours**. 

Because free-tier hosting environments (like Render) spin down servers after 15 minutes of inactivity, we do not rely on an internal Node.js `setInterval` loop. 

Instead, the scraping schedule is driven by an external service (**cron-job.org**). 
1. The cron service makes a POST request to the backend's `/api/cron/scrape` endpoint every 2 hours.
2. The request is secured via a Bearer token that matches the `CRON_SECRET` environment variable.
3. The backend immediately responds with a `200 OK` (to prevent HTTP timeouts) and safely executes the Playwright scraping loop for all active tracked products in the background.

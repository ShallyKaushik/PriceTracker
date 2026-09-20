const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase credentials in .env");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;

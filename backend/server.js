require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json());

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Routes
const productsRoute = require("./routes/products");
const trackingRoute = require("./routes/tracking");
const cronRoute = require("./routes/cron");

app.use("/api/products", productsRoute);
app.use("/api/tracked-products", trackingRoute);
app.use("/api/cron", cronRoute);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

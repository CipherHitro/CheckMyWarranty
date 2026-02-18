const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const pool = require("./connection");
const userRoute = require("./routes/user");
const manageDataRoute = require('./routes/manageData')

const app = express();
const port = 3000;

//Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/user", userRoute);
app.use('/api/data', authenticateUser, manageDataRoute);
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "DB connected" });
  } catch (err) {
    res.status(500).json({ status: "DB not connected", error: err.message });
  }
});

app.listen(port, () => {
  console.log("Server is running at http://localhost:" + port);
});

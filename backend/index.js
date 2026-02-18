const express = require("express");
const { connectPostgreSQL } = require("./connection");
require('dotenv').config();
const app = express();
const port = 3000;

connectPostgreSQL(process.env.PGURL)

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log("Server is running at http://localhost:" + port);
});

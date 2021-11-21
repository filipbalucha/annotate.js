"use strict";
const path = require("path");
const express = require("express");

// Disclosure: This code has been adapted from the code used in Week 8 lectures.
const app = express();
const port = process.env.PORT || 5000;
app.listen(port);

app.use(express.static(path.join(__dirname, "/pub")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/pub/examples.html"));
});

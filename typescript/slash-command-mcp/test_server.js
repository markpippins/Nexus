const express = require("express");
const app = express();
const PORT = 3220;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

const server = app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
});

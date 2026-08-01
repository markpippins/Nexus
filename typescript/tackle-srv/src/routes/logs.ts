import { Router } from "express";
import { insertLog, queryLogs, clearLogs } from "../db";

export const logsRouter = Router();

// GET /logs — query with optional filters
logsRouter.get("/", async (req, res) => {
  try {
    const { level, category, search, since, limit } = req.query;
    const result = await queryLogs({
      level: level ? String(level) : undefined,
      category: category ? String(category) : undefined,
      search: search ? String(search) : undefined,
      since: since ? String(since) : undefined,
      limit: limit ? parseInt(String(limit), 10) : 100,
    });
    const categories = Array.from(
      new Set(result.logs.map((l) => l.category))
    );
    res.json({
      total: result.total,
      filtered_count: result.filtered_count,
      count: result.logs.length,
      categories,
      levels: ["INFO", "WARN", "ERROR", "DEBUG"],
      logs: result.logs,
      last_polled_at: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /logs/emit — insert a single log entry
logsRouter.post("/emit", async (req, res) => {
  try {
    const { level = "INFO", category = "SYSTEM", message, source, details } =
      req.body || {};
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    await insertLog({ level, category, message, source, details });
    res.json({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      source,
      details,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /logs — clear all logs
logsRouter.delete("/", async (_req, res) => {
  try {
    await clearLogs();
    await insertLog({
      level: "INFO",
      category: "SYSTEM",
      message: "System log buffer cleared by operator action",
    });
    res.json({ cleared: true, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

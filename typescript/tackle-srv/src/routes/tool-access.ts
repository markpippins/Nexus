import { Router } from "express";
import { listToolAccess, updateToolAccess } from "../db";

export const toolAccessRouter = Router();

toolAccessRouter.get("/", async (req, res) => {
  try {
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const access = await listToolAccess(role);
    res.json({ count: access.length, access });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

toolAccessRouter.get("/:role", async (req, res) => {
  try {
    const access = await listToolAccess(req.params.role);
    res.json({ count: access.length, access });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

toolAccessRouter.patch("/:id", async (req, res) => {
  try {
    const { allowed } = req.body || {};
    if (typeof allowed !== "boolean") {
      res.status(400).json({ error: "allowed (boolean) is required" });
      return;
    }
    const result = await updateToolAccess(req.params.id, { allowed });
    if (!result) {
      res.status(404).json({ error: "Tool access rule not found" });
      return;
    }
    res.json({ updated: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

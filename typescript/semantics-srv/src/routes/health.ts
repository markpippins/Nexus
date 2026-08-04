import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "semantics-srv",
    port: parseInt(process.env.SEMANTICS_SRV_PORT || "3160", 10),
    pid: process.pid,
    timestamp: new Date().toISOString(),
  });
});

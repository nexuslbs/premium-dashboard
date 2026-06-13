import { Router } from "express";

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

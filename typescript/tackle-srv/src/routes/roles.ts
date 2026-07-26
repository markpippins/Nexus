import { Router } from "express";
import { getRoles, getRole, upsertRole, deleteRole } from "../db";

export const rolesRouter = Router();

rolesRouter.get("/", async (_req, res) => {
  try {
    const roles = await getRoles();
    res.json({ count: roles.length, roles });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

rolesRouter.get("/:id", async (req, res) => {
  try {
    const role = await getRole(req.params.id);
    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }
    res.json(role);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

rolesRouter.post("/", async (req, res) => {
  try {
    const { id, name, description } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const role = await upsertRole({ id, name, description });
    res.json({ saved: true, role });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

rolesRouter.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteRole(req.params.id);
    res.json({ deleted, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

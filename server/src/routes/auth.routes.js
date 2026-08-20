import { Router } from "express";
import {
  googleAuth,
  login,
  register,
  getMe,
  logout,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/google", googleAuth);
router.post("/login", login);
router.post("/register", register);
router.get("/me", requireAuth, getMe);
router.post("/logout", logout);

export const authRoutes = router;

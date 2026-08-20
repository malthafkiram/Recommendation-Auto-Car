import { Router } from "express";
import {
  getSubscriptionStatus,
  createCheckout,
  handleWebhook,
} from "../controllers/subscription.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/status", requireAuth, getSubscriptionStatus);
router.post("/checkout", requireAuth, createCheckout);
router.post("/webhook", handleWebhook);

export const subscriptionRoutes = router;

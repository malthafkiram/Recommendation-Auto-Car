import { Router } from "express";
import {
  recommendCars,
  chatWithAi,
  simulateCredit,
} from "../controllers/ai.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { checkAiAccess } from "../middlewares/aiQuota.middleware.js";

const router = Router();

router.use(requireAuth);
router.use(checkAiAccess);

router.post("/recommend", recommendCars);
router.post("/chat", chatWithAi);
router.post("/credit-simulate", simulateCredit);

export const aiRoutes = router;

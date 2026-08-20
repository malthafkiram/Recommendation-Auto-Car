import { Router } from "express";
import { getNearbyShowrooms } from "../controllers/showroom.controller.js";

const router = Router();

router.get("/nearby", getNearbyShowrooms);

export const showroomRoutes = router;

import { Router } from "express";
import {
  getWishlist,
  addWishlist,
  updateWishlist,
  deleteWishlist,
} from "../controllers/wishlist.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth);

router.get("/", getWishlist);
router.post("/", addWishlist);
router.put("/:id", updateWishlist);
router.delete("/:id", deleteWishlist);

export const wishlistRoutes = router;

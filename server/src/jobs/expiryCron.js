import cron from "node-cron";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

export const startExpiryCron = () => {
  // Run every hour
  cron.schedule("0 * * * *", async () => {
    try {
      const now = new Date();
      const expiredSubs = await Subscription.where("paymentStatus", "success")
        .where("expiresAt", "<=", now)
        .get();

      for (const sub of expiredSubs) {
        // Mark subscription expired
        await Subscription.where("_id", sub._id).update({
          paymentStatus: "expired",
          updatedAt: now,
        });

        // Set user's token to 0 (blocked until re-subscribe)
        await User.where("_id", sub.userId).update({
          aiTokensRemaining: 0,
          updatedAt: now,
        });

        console.log(`[ExpiryCron] Langganan user ${sub.userId} telah berakhir.`);
      }
    } catch (err) {
      console.error("[ExpiryCron] Error checking subscription expiry:", err);
    }
  });

  console.log("[Jobs] Subscription expiry cron job aktif.");
};

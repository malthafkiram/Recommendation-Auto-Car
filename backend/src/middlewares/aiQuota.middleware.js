import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import AiUsageLog from "../models/AiUsageLog.js";

/**
 * Check whether user has access to AI features
 */
export const checkAiAccess = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Silakan masuk untuk menggunakan fitur AI.",
      });
    }

    const userId = req.userId;

    // Check active premium subscription
    const now = new Date();
    const subscription = await Subscription.where("userId", userId)
      .where("paymentStatus", "success")
      .first();

    const isPremiumActive =
      subscription && subscription.expiresAt && new Date(subscription.expiresAt) > now;

    if (isPremiumActive) {
      req.isPremium = true;
      req.subscription = subscription;
      return next();
    }

    // Free tier token check
    const currentTokens = typeof user.aiTokensRemaining === "number" ? user.aiTokensRemaining : 5;

    if (currentTokens <= 0) {
      return res.status(403).json({
        success: false,
        code: "TOKEN_EXHAUSTED",
        message: "Kuota AI gratis Anda telah habis. Silakan upgrade ke Premium Monthly.",
      });
    }

    req.isPremium = false;
    req.remainingTokens = currentTokens;
    next();
  } catch (error) {
    console.error("[AiQuotaMiddleware] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memeriksa kuota AI.",
    });
  }
};

/**
 * Helper to record usage and deduct token for free tier
 */
export const deductAiToken = async (userId, feature, metadata = {}) => {
  try {
    const now = new Date();
    const subscription = await Subscription.where("userId", userId)
      .where("paymentStatus", "success")
      .first();

    const isPremium =
      subscription && subscription.expiresAt && new Date(subscription.expiresAt) > now;

    let remainingTokens = 0;

    if (isPremium) {
      await AiUsageLog.create({
        userId,
        feature,
        tokensUsed: 0,
        metadata: { ...metadata, isPremium: true },
        createdAt: now,
      });
      return { isPremium: true, remainingTokens: 999 };
    }

    const user = await User.find(userId);
    const currentTokens = typeof user.aiTokensRemaining === "number" ? user.aiTokensRemaining : 5;
    remainingTokens = Math.max(0, currentTokens - 1);

    await User.where("_id", user._id).update({
      aiTokensRemaining: remainingTokens,
      updatedAt: now,
    });

    await AiUsageLog.create({
      userId,
      feature,
      tokensUsed: 1,
      metadata: { ...metadata, isPremium: false },
      createdAt: now,
    });

    return { isPremium: false, remainingTokens };
  } catch (error) {
    console.error("[deductAiToken] Error:", error);
    return { isPremium: false, remainingTokens: 0 };
  }
};

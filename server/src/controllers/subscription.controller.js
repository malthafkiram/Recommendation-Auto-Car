import midtransClient from "midtrans-client";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

const PREMIUM_MONTHLY_PRICE = 99000;

function getSnapClient() {
  if (!process.env.MIDTRANS_SERVER_KEY) return null;
  return new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
  });
}

export const getSubscriptionStatus = async (req, res) => {
  try {
    const user = req.user;
    const userId = req.userId;

    const subscription = await Subscription.where("userId", userId)
      .where("paymentStatus", "success")
      .first();

    const now = new Date();
    const isPremiumActive =
      subscription && subscription.expiresAt && new Date(subscription.expiresAt) > now;

    let daysRemaining = 0;
    if (isPremiumActive) {
      const diffMs = new Date(subscription.expiresAt).getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      success: true,
      data: {
        premiumActive: Boolean(isPremiumActive),
        expiresAt: subscription ? subscription.expiresAt : null,
        daysRemaining,
        paymentStatus: subscription ? subscription.paymentStatus : null,
        paymentType: subscription ? subscription.paymentType : "premium_monthly",
        aiTokensRemaining: user ? user.aiTokensRemaining : 5,
      },
    });
  } catch (error) {
    console.error("[SubscriptionController] getSubscriptionStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil status langganan.",
    });
  }
};

export const createCheckout = async (req, res) => {
  try {
    const user = req.user;
    const userId = req.userId;

    const orderId = `RAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const amount = PREMIUM_MONTHLY_PRICE;

    let snapToken = "";
    const snap = getSnapClient();

    if (snap) {
      try {
        const parameter = {
          transaction_details: {
            order_id: orderId,
            gross_amount: amount,
          },
          customer_details: {
            first_name: user.name || "Customer",
            email: user.email,
          },
          item_details: [
            {
              id: "premium_monthly",
              price: amount,
              quantity: 1,
              name: "RAC AI Premium 30 Hari",
            },
          ],
        };
        const transaction = await snap.createTransaction(parameter);
        snapToken = transaction.token;
      } catch (snapErr) {
        console.warn("[Midtrans] Snap creation error:", snapErr.message);
      }
    }

    if (!snapToken) {
      // Fallback sandbox/mock token for seamless developer testing
      snapToken = `snap-token-${orderId}`;
    }

    const now = new Date();
    // Record pending subscription in database
    const existingSub = await Subscription.where("userId", userId).first();
    if (existingSub) {
      await Subscription.where("_id", existingSub._id).update({
        orderId,
        amount,
        paymentStatus: "pending",
        paymentType: "premium_monthly",
        updatedAt: now,
      });
    } else {
      await Subscription.create({
        userId,
        orderId,
        amount,
        paymentStatus: "pending",
        paymentType: "premium_monthly",
        createdAt: now,
        updatedAt: now,
      });
    }

    return res.status(200).json({
      success: true,
      snapToken,
      orderId,
      amount,
      clientKey: process.env.MIDTRANS_CLIENT_KEY || "mock-client-key",
    });
  } catch (error) {
    console.error("[SubscriptionController] createCheckout Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal membuat sesi pembayaran.",
    });
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const notification = req.body;
    const orderId = notification.order_id;
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID tidak ditemukan." });
    }

    const subscription = await Subscription.where("orderId", orderId).first();
    if (!subscription) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan." });
    }

    const now = new Date();
    let isSuccess = false;

    if (transactionStatus === "capture") {
      if (fraudStatus === "accept") isSuccess = true;
    } else if (transactionStatus === "settlement") {
      isSuccess = true;
    }

    if (isSuccess) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await Subscription.where("_id", subscription._id).update({
        paymentStatus: "success",
        startedAt: now,
        expiresAt,
        paidAt: now,
        midtransPayload: notification,
        updatedAt: now,
      });

      console.log(`[Subscription] Premium diaktifkan untuk user ${subscription.userId} hingga ${expiresAt.toISOString()}`);
    } else if (
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire"
    ) {
      await Subscription.where("_id", subscription._id).update({
        paymentStatus: "failed",
        midtransPayload: notification,
        updatedAt: now,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notifikasi webhook berhasil diproses.",
    });
  } catch (error) {
    console.error("[SubscriptionController] handleWebhook Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memproses webhook Midtrans.",
    });
  }
};

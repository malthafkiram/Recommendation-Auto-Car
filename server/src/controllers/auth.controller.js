import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import { signToken } from "../utils/jwt.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "ID token Google diperlukan.",
      });
    }

    let payload;
    try {
      if (process.env.GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } else {
        // Fallback decoder if client ID is not configured in local environment
        const base64Url = idToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          Buffer.from(base64, "base64")
            .toString("utf8")
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        payload = JSON.parse(jsonPayload);
      }
    } catch (tokenErr) {
      console.warn("[GoogleAuth] Token verification failed:", tokenErr.message);
      return res.status(401).json({
        success: false,
        message: "Token Google tidak valid.",
      });
    }

    const { email, sub: googleId, name, picture } = payload;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email tidak ditemukan dari akun Google.",
      });
    }

    let user = await User.where("email", email.toLowerCase()).first();

    const now = new Date();
    if (!user) {
      user = await User.create({
        email: email.toLowerCase(),
        googleId,
        name: name || email.split("@")[0],
        avatarUrl: picture || "",
        role: "buyer",
        aiTokensRemaining: 5,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update Google ID or avatar if missing
      await User.where("_id", user._id).update({
        googleId: user.googleId || googleId,
        avatarUrl: user.avatarUrl || picture || "",
        updatedAt: now,
      });
    }

    const token = signToken({ userId: user._id.toString(), email: user.email, role: "buyer" });

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || picture || "",
        role: user.role || "buyer",
        aiTokensRemaining: user.aiTokensRemaining ?? 5,
      },
    });
  } catch (error) {
    console.error("[GoogleAuth] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada proses login Google.",
    });
  }
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password minimal harus 8 karakter.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.where("email", normalizedEmail).first();
    if (existing) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_TAKEN",
        message: "Email sudah terdaftar. Silakan login.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "buyer",
      aiTokensRemaining: 5,
      createdAt: now,
      updatedAt: now,
    });

    const token = signToken({ userId: user._id.toString(), email: user.email, role: "buyer" });

    return res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || "",
        role: user.role || "buyer",
        aiTokensRemaining: user.aiTokensRemaining ?? 5,
      },
    });
  } catch (error) {
    console.error("[Register] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat pendaftaran akun.",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.where("email", normalizedEmail).first();

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const token = signToken({ userId: user._id.toString(), email: user.email, role: "buyer" });

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || "",
        role: user.role || "buyer",
        aiTokensRemaining: user.aiTokensRemaining ?? 5,
      },
    });
  } catch (error) {
    console.error("[Login] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat login.",
    });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = req.user;
    const userId = req.userId;

    const now = new Date();
    const subscription = await Subscription.where("userId", userId)
      .where("paymentStatus", "success")
      .first();

    const isPremiumActive =
      subscription && subscription.expiresAt && new Date(subscription.expiresAt) > now;

    let daysRemaining = 0;
    if (isPremiumActive) {
      const diffMs = new Date(subscription.expiresAt).getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || "",
        role: user.role || "buyer",
        aiTokensRemaining: user.aiTokensRemaining ?? 5,
      },
      aiTokensRemaining: user.aiTokensRemaining ?? 5,
      subscription: subscription
        ? {
            premiumActive: isPremiumActive,
            expiresAt: subscription.expiresAt,
            daysRemaining,
            paymentStatus: subscription.paymentStatus,
            paymentType: subscription.paymentType || "premium_monthly",
          }
        : null,
    });
  } catch (error) {
    console.error("[GetMe] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengambil profil pengguna.",
    });
  }
};

export const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Berhasil keluar.",
  });
};

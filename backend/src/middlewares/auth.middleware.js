import { verifyToken } from "../utils/jwt.js";
import User from "../models/User.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Akses ditolak. Token otentikasi tidak ditemukan.",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Token otentikasi tidak valid atau telah kedaluwarsa.",
      });
    }

    const user = await User.find(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Pengguna tidak ditemukan.",
      });
    }

    req.user = user;
    req.userId = user._id ? user._id.toString() : decoded.userId;
    next();
  } catch (error) {
    console.error("[AuthMiddleware] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada verifikasi otentikasi.",
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = verifyToken(token);
        const user = await User.find(decoded.userId);
        if (user) {
          req.user = user;
          req.userId = user._id ? user._id.toString() : decoded.userId;
        }
      } catch {
        // Token invalid, proceed as guest
      }
    }
    next();
  } catch {
    next();
  }
};

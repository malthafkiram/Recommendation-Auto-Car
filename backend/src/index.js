import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import "./config/database.js";
import { connectDB } from "./database.js";
import { authRoutes } from "./routes/auth.routes.js";
import { carRoutes } from "./routes/car.routes.js";
import { wishlistRoutes } from "./routes/wishlist.routes.js";
import { showroomRoutes } from "./routes/showroom.routes.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { subscriptionRoutes } from "./routes/subscription.routes.js";
import { startExpiryCron } from "./jobs/expiryCron.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware Global
app.use(express.json());
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "SUCCESS",
    message: "Backend RAC AI aktif dan berjalan normal!",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/showrooms", showroomRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/subscription", subscriptionRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[ServerError]", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Terjadi kesalahan internal pada server.",
  });
});

// Menyalakan Server & Database
const startServer = async () => {
  try {
    await connectDB();
    startExpiryCron();
    app.listen(PORT, () => {
      console.log(`[Server] Berjalan sukses di http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[Server] Gagal memulai server:", error);
    process.exit(1);
  }
};

startServer();


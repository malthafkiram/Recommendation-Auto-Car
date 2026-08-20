import Wishlist from "../models/Wishlist.js";
import { Car } from "../models/car.model.js";

export const getWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const items = await Wishlist.where("userId", userId).get();

    // Populate car details for each wishlist item
    const populatedItems = await Promise.all(
      items.map(async (item) => {
        let car = null;
        if (item.carId) {
          const isHex = /^[0-9a-fA-F]{24}$/.test(item.carId);
          if (isHex) {
            car = await Car.find(item.carId);
          }
          if (!car) {
            car = await Car.where("slug", item.carId).first();
          }
        }
        return {
          ...item,
          car: car || null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: populatedItems.length,
      data: populatedItems,
    });
  } catch (error) {
    console.error("[WishlistController] getWishlist Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar wishlist.",
    });
  }
};

export const addWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { carId, selectedColor, notes, source, matchScore, aiReason } = req.body;

    if (!carId) {
      return res.status(400).json({
        success: false,
        message: "ID mobil wajib disertakan.",
      });
    }

    // Verify car exists
    let car = null;
    const isHex = /^[0-9a-fA-F]{24}$/.test(carId);
    if (isHex) {
      car = await Car.find(carId);
    }
    if (!car) {
      car = await Car.where("slug", carId).first();
    }

    if (!car) {
      return res.status(404).json({
        success: false,
        message: "Mobil tidak ditemukan.",
      });
    }

    const actualCarId = car._id ? car._id.toString() : carId;

    // Check duplicate
    const existing = await Wishlist.where("userId", userId)
      .where("carId", actualCarId)
      .first();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Mobil ini sudah ada di dalam wishlist Anda.",
      });
    }

    const now = new Date();
    const item = await Wishlist.create({
      userId,
      carId: actualCarId,
      selectedColor: selectedColor || "",
      notes: notes || "",
      source: source || "manual",
      matchScore: typeof matchScore === "number" ? matchScore : null,
      aiReason: aiReason || "",
      createdAt: now,
      updatedAt: now,
    });

    return res.status(201).json({
      success: true,
      message: "Mobil berhasil ditambahkan ke wishlist.",
      data: {
        ...item,
        car,
      },
    });
  } catch (error) {
    console.error("[WishlistController] addWishlist Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal menambahkan mobil ke wishlist.",
    });
  }
};

export const updateWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { selectedColor, notes } = req.body;

    const item = await Wishlist.find(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item wishlist tidak ditemukan.",
      });
    }

    if (item.userId && item.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke item wishlist ini.",
      });
    }

    const updates = { updatedAt: new Date() };
    if (typeof selectedColor !== "undefined") updates.selectedColor = selectedColor;
    if (typeof notes !== "undefined") updates.notes = notes;

    await Wishlist.where("_id", item._id).update(updates);

    let car = null;
    if (item.carId) {
      const isHex = /^[0-9a-fA-F]{24}$/.test(item.carId);
      if (isHex) car = await Car.find(item.carId);
      if (!car) car = await Car.where("slug", item.carId).first();
    }

    return res.status(200).json({
      success: true,
      message: "Wishlist berhasil diperbarui.",
      data: {
        ...item,
        ...updates,
        car,
      },
    });
  } catch (error) {
    console.error("[WishlistController] updateWishlist Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui wishlist.",
    });
  }
};

export const deleteWishlist = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const item = await Wishlist.find(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item wishlist tidak ditemukan.",
      });
    }

    if (item.userId && item.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses untuk menghapus item ini.",
      });
    }

    await Wishlist.where("_id", item._id).destroy();

    return res.status(200).json({
      success: true,
      message: "Item berhasil dihapus dari wishlist.",
    });
  } catch (error) {
    console.error("[WishlistController] deleteWishlist Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal menghapus item dari wishlist.",
    });
  }
};

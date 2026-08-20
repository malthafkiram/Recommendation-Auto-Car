import { Car } from "../models/car.model.js";

export const getCars = async (req, res) => {
  try {
    const { brand, type, search } = req.query;

    let cars = await Car.where("status", "active").get();

    if (brand && brand !== "All") {
      const brandLower = brand.toLowerCase();
      cars = cars.filter((c) => (c.brand || "").toLowerCase().includes(brandLower));
    }

    if (type && type !== "All") {
      const typeLower = type.toLowerCase();
      cars = cars.filter((c) => (c.type || "").toLowerCase() === typeLower);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      cars = cars.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(searchLower) ||
          (c.brand || "").toLowerCase().includes(searchLower)
      );
    }

    return res.status(200).json({
      success: true,
      count: cars.length,
      data: cars,
    });
  } catch (error) {
    console.error("[Controller] Gagal mengambil daftar mobil:", error);
    return res
      .status(500)
      .json({ success: false, message: "Kesalahan internal server" });
  }
};

export const getTopCar = async (req, res) => {
  try {
    let topCar = await Car.where("isTopProduct", true)
      .where("status", "active")
      .first();

    if (!topCar) {
      topCar = await Car.where("status", "active").first();
    }

    if (!topCar) {
      return res
        .status(404)
        .json({ success: false, message: "Top product tidak ditemukan" });
    }

    return res.status(200).json({
      success: true,
      data: topCar,
    });
  } catch (error) {
    console.error("[Controller] Gagal mengambil top car:", error);
    return res
      .status(500)
      .json({ success: false, message: "Kesalahan internal server" });
  }
};

export const getCarById = async (req, res) => {
  try {
    const { id } = req.params;
    let car = null;

    const isHexObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isHexObjectId) {
      car = await Car.find(id);
    }

    if (!car) {
      car = await Car.where("slug", id).first();
    }

    if (!car) {
      return res
        .status(404)
        .json({ success: false, message: "Mobil tidak ditemukan" });
    }

    return res.status(200).json({
      success: true,
      data: car,
    });
  } catch (error) {
    console.error("[Controller] Gagal mengambil detail mobil:", error);
    return res
      .status(500)
      .json({ success: false, message: "Kesalahan internal server" });
  }
};


import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { Car } from "../models/car.model.js";
import { deductAiToken } from "../middlewares/aiQuota.middleware.js";

// Helper to instantiate LLM if API keys are available
function getLlmInstance() {
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: model,
      temperature: 0.3,
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
    });
  }
  return null;
}

export const recommendCars = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      budgetMin = 100000000,
      budgetMax = 1000000000,
      needType = "Family",
      fuelType = "All",
      passengers = 5,
      priority = "Comfort",
      selectedColor = "",
    } = req.body;

    const allCars = await Car.where("status", "active").get();

    if (!allCars || allCars.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          recommendations: [],
          accessType: req.isPremium ? "premium" : "free",
          remainingTokens: req.remainingTokens ?? 5,
        },
      });
    }

    // Scored recommendation algorithm
    const scoredCars = allCars.map((car) => {
      let score = 70;
      const reasons = [];

      // Budget check
      const price = Number(car.basePrice) || 0;
      if (price >= budgetMin && price <= budgetMax) {
        score += 15;
        reasons.push(`Budget Sesuai (Rp ${(price / 1e6).toFixed(0)} Juta)`);
      } else if (price < budgetMin) {
        score += 10;
        reasons.push("Lebih hemat dari anggaran minimum");
      } else {
        score -= 20;
      }

      // Need / Body type check
      const typeLower = (car.type || "").toLowerCase();
      const needLower = (needType || "").toLowerCase();
      if (
        (needLower === "family" && (typeLower === "mpv" || typeLower === "suv")) ||
        (needLower === "city car" && (typeLower === "hatchback" || typeLower === "sedan")) ||
        typeLower.includes(needLower) ||
        needLower.includes(typeLower)
      ) {
        score += 10;
        reasons.push(`Tipe bodi ${car.type} cocok untuk kebutuhan ${needType}`);
      }

      // Passenger capacity check
      const seats = car.specs?.seats || 5;
      if (seats >= passengers) {
        score += 5;
      } else {
        score -= 10;
      }

      // Fuel type check
      if (fuelType && fuelType !== "All") {
        const carFuel = (car.specs?.fuelType || "").toLowerCase();
        if (carFuel.includes(fuelType.toLowerCase())) {
          score += 5;
          reasons.push(`Bahan bakar ${car.specs.fuelType}`);
        }
      }

      // Color preference match
      let matchedColorName = "";
      if (selectedColor && Array.isArray(car.colors)) {
        const colorMatch = car.colors.find(
          (c) =>
            c.name?.toLowerCase().includes(selectedColor.toLowerCase()) ||
            c.availability === "available"
        );
        if (colorMatch) {
          matchedColorName = colorMatch.name;
        }
      }
      if (!matchedColorName && car.colors?.[0]) {
        matchedColorName = car.colors[0].name;
      }

      const finalScore = Math.min(99, Math.max(50, score));
      const reasonText =
        reasons.length > 0
          ? `${car.name} sangat cocok untuk kebutuhan Anda: ${reasons.join(", ")}.`
          : `${car.name} menawarkan keandalan dan efisiensi optimal di kelasnya.`;

      return {
        carId: car._id ? car._id.toString() : car.slug,
        car,
        matchScore: finalScore,
        aiReason: reasonText,
        selectedColor: matchedColorName,
      };
    });

    // Sort descending by match score
    scoredCars.sort((a, b) => b.matchScore - a.matchScore);
    const topRecommendations = scoredCars.slice(0, 4);

    // Deduct token
    const tokenResult = await deductAiToken(userId, "recommendation", {
      budgetMin,
      budgetMax,
      needType,
    });

    return res.status(200).json({
      success: true,
      data: {
        recommendations: topRecommendations,
        accessType: tokenResult.isPremium ? "premium" : "free",
        remainingTokens: tokenResult.remainingTokens,
      },
    });
  } catch (error) {
    console.error("[AiController] recommendCars Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memproses rekomendasi AI.",
    });
  }
};

export const chatWithAi = async (req, res) => {
  try {
    const userId = req.userId;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Pesan tidak boleh kosong.",
      });
    }

    // 1. Ambil seluruh database mobil aktif
    const allCars = await Car.where("status", "active").get();

    let reply = "";
    let matchedCars = [];

    // 2. Format konteks database mobil lengkap untuk LangChain LLM
    const carCatalogContext = allCars
      .map(
        (c) =>
          `• [${c.brand}] ${c.name} | Tipe: ${c.type} | Harga OTR: Rp ${Number(c.basePrice).toLocaleString("id-ID")} | Mesin: ${c.specs?.engine || "-"} | Transmisi: ${c.specs?.transmission || "-"} | BBM: ${c.specs?.fuelType || "-"} | Kapasitas: ${c.specs?.seats || 5} Penumpang | Warna: ${c.colors?.map((col) => col.name).join(", ") || "-"} | Slug: ${c.slug}`
      )
      .join("\n");

    const llm = getLlmInstance();
    if (llm) {
      try {
        const systemPrompt = `Anda adalah RAC AI Assistant, asisten konsultan otomotif cerdas dan ramah untuk platform RAC (Recommendation Auto Car) AI.

Anda memiliki akses langsung ke seluruh database katalog mobil resmi kami di bawah ini:
=== DATABASE KATALOG MOBIL RAC ===
${carCatalogContext}
==================================

Format dan Aturan Jawaban:
1. Berikan kalimat pengantar yang ramah dan ringkas (1-2 kalimat).
2. Tampilkan daftar mobil yang sesuai dari database dengan format bernomor yang rapi dan elegan:
   1. **[Nama Mobil]** — Rp [Harga OTR format Rupiah] ([Tipe Bodi], [Kapasitas] Kursi)
      [View product details](/cars/[slug])
3. Jika relevan, sertakan 1 kalimat keunggulan utama mobil tersebut.
4. DILARANG KERAS menggunakan format tabel markdown pipa (| kolom | kolom | atau |---|---|).
5. Selalu gunakan slug resmi yang ada di katalog database (misal: \`/cars/honda-brio-rs\`, \`/cars/toyota-avanza\`, \`/cars/toyota-innova-zenix\`).
6. Rujuk HANYA data resmi dari database katalog RAC di atas.`;

        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ];

        const response = await llm.invoke(messages);
        reply = response.content;
      } catch (llmErr) {
        console.warn("[ChatAI] LLM invocation failed, using smart database matcher:", llmErr.message);
      }
    }

    // 3. Fallback jika LLM tidak aktif / error
    if (!reply) {
      const msgLower = message.toLowerCase();
      matchedCars = allCars.filter((c) => {
        const nameMatch = msgLower.includes(c.name.toLowerCase()) || msgLower.includes(c.brand.toLowerCase());
        const typeMatch = msgLower.includes((c.type || "").toLowerCase());
        return nameMatch || typeMatch;
      });

      if (matchedCars.length > 0) {
        const sampleCar = matchedCars[0];
        reply = `Berdasarkan katalog database kami untuk "${message}", kami merekomendasikan **${sampleCar.name}** (${sampleCar.type}) dengan harga mulai dari **Rp ${Number(sampleCar.basePrice).toLocaleString("id-ID")}**. Mobil ini dibekali mesin ${sampleCar.specs?.engine || "tangguh"} dengan transmisi ${sampleCar.specs?.transmission || "Otomatis"} dan kapasitas ${sampleCar.specs?.seats || 5} penumpang.`;
      } else if (msgLower.includes("keluarga") || msgLower.includes("family") || msgLower.includes("mpv") || msgLower.includes("7")) {
        const mpvs = allCars.filter((c) => (c.specs?.seats || 0) >= 7 || c.type === "MPV").slice(0, 3);
        reply = `Berikut adalah pilihan mobil keluarga (7 penumpang) terbaik dari database RAC:\n` +
          mpvs.map((m) => `- **${m.name}** (${m.type}) — Rp ${Number(m.basePrice).toLocaleString("id-ID")} (${m.specs?.seats || 7} Kursi)`).join("\n");
        matchedCars = mpvs;
      } else if (msgLower.includes("irit") || msgLower.includes("murah") || msgLower.includes("budget") || msgLower.includes("hatchback")) {
        const economical = allCars.filter((c) => c.basePrice < 300000000).slice(0, 3);
        reply = `Berikut pilihan mobil ekonomis & irit BBM dari database RAC:\n` +
          economical.map((c) => `- **${c.name}** (${c.type}) — Mulai Rp ${Number(c.basePrice).toLocaleString("id-ID")}`).join("\n");
        matchedCars = economical;
      } else {
        reply = `Halo! Saya adalah RAC AI Assistant. Saya terhubung langsung dengan database 30 katalog mobil resmi kami (Toyota, Honda, dll). Anda dapat menanyakan rekomendasi mobil, perbandingan spesifikasi mesin/transmisi, harga OTR Jakarta, kapasitas kursi, hingga simulasi kredit!`;
      }
    }

    // 4. Deteksi mobil yang disebut dalam jawaban untuk dilampirkan sebagai kartu interaktif
    if (matchedCars.length === 0 && reply) {
      const replyLower = reply.toLowerCase();
      matchedCars = allCars.filter((c) => {
        const namePart = c.name.toLowerCase();
        const slugPart = c.slug.replace(/-/g, " ").toLowerCase();
        return replyLower.includes(namePart) || replyLower.includes(slugPart);
      }).slice(0, 3);
    }

    const tokenResult = await deductAiToken(userId, "chat", { messageLength: message.length });

    return res.status(200).json({
      success: true,
      data: {
        reply,
        items: matchedCars.slice(0, 3).map((c) => ({
          carId: c._id ? c._id.toString() : c.slug,
          slug: c.slug,
          name: c.name,
          brand: c.brand,
          type: c.type,
          basePrice: c.basePrice,
          thumbnailUrl: c.thumbnailUrl,
        })),
        accessType: tokenResult.isPremium ? "premium" : "free",
        remainingTokens: tokenResult.remainingTokens,
      },
    });
  } catch (error) {
    console.error("[AiController] chatWithAi Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memproses pesan chat AI.",
    });
  }
};

export const simulateCredit = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      carPrice = 250000000,
      downPaymentPercentage = 20,
      downPayment: customDp,
      tenorMonths = 36,
      interestRate = 6.0,
    } = req.body;

    const onTheRoadPrice = Number(carPrice) || 250000000;
    const dpPercent = Number(downPaymentPercentage) || 20;
    const tenor = Number(tenorMonths) || 36;
    const annualInterestRate = Number(interestRate) || 6.0;

    const dpAmount = customDp ? Number(customDp) : Math.round(onTheRoadPrice * (dpPercent / 100));
    const principalLoan = Math.max(0, onTheRoadPrice - dpAmount);
    const totalInterest = Math.round(principalLoan * (annualInterestRate / 100) * (tenor / 12));
    const totalPayment = principalLoan + totalInterest;
    const monthlyInstallment = Math.round(totalPayment / tenor);

    // AI Financial Health evaluation
    let healthStatus = "Safe";
    let insightText = "";

    const dpRatio = (dpAmount / onTheRoadPrice) * 100;
    if (dpRatio >= 30 && tenor <= 48) {
      healthStatus = "Safe";
      insightText = `Struktur kredit sangat sehat dengan Uang Muka ${dpRatio.toFixed(0)}%. Beban bunga tergolong rendah dan risiko depresiasi terkendali dengan baik.`;
    } else if (dpRatio >= 20 && tenor <= 60) {
      healthStatus = "Moderate";
      insightText = `Simulasi kredit berada pada tingkat wajar. Pastikan cicilan bulanan (Rp ${monthlyInstallment.toLocaleString("id-ID")}) tidak melebihi 30% dari total pendapatan bulanan keluarga Anda.`;
    } else {
      healthStatus = "Heavy";
      insightText = `Tenor panjang atau DP rendah menyebabkan total bunga mencapai Rp ${totalInterest.toLocaleString("id-ID")}. Pertimbangkan untuk menaikkan DP atau memperpendek tenor guna menghemat biaya bunga.`;
    }

    const tokenResult = await deductAiToken(userId, "credit_simulation", {
      carPrice: onTheRoadPrice,
      tenorMonths: tenor,
    });

    return res.status(200).json({
      success: true,
      data: {
        calculation: {
          onTheRoadPrice,
          downPayment: dpAmount,
          principalLoan,
          tenorMonths: tenor,
          annualInterestRate,
          monthlyInstallment,
          totalInterest,
          totalPayment,
        },
        aiFinancialInsight: {
          financialHealthStatus: healthStatus,
          insightText,
        },
        accessType: tokenResult.isPremium ? "premium" : "free",
        remainingTokens: tokenResult.remainingTokens,
      },
    });
  } catch (error) {
    console.error("[AiController] simulateCredit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memproses simulasi kredit AI.",
    });
  }
};

import fs from "fs";
import path from "path";
import axios from "axios";

// Default Jakarta Pusat coordinates
const DEFAULT_LAT = -6.2088;
const DEFAULT_LNG = 106.8456;

// Haversine formula to compute distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const getNearbyShowrooms = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || DEFAULT_LAT;
    const lng = parseFloat(req.query.lng) || DEFAULT_LNG;

    // 1. Check if Google Places API Key is available
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      try {
        const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=15000&type=car_dealer&key=${apiKey}`;
        const response = await axios.get(placesUrl, { timeout: 4000 });

        if (response.data && response.data.results && response.data.results.length > 0) {
          const places = response.data.results.slice(0, 10).map((place) => {
            const pLat = place.geometry?.location?.lat;
            const pLng = place.geometry?.location?.lng;
            const distance = pLat && pLng ? calculateDistance(lat, lng, pLat, pLng) : null;
            return {
              id: place.place_id,
              name: place.name,
              address: place.vicinity || place.formatted_address || "Alamat tidak tersedia",
              distanceKm: distance,
              rating: place.rating || 4.5,
              mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`,
              latitude: pLat,
              longitude: pLng,
            };
          });

          places.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));

          return res.status(200).json({
            success: true,
            source: "google_places",
            data: places,
          });
        }
      } catch (placesError) {
        console.warn("[Showrooms] Google Places API failed, falling back to seed:", placesError.message);
      }
    }

    // 2. Fallback to seed JSON
    const seedPath = path.resolve("./config/showrooms.seed.json");
    if (!fs.existsSync(seedPath)) {
      return res.status(200).json({
        success: true,
        source: "seed",
        data: [],
      });
    }

    const rawData = fs.readFileSync(seedPath, "utf-8");
    const seedShowrooms = JSON.parse(rawData);

    const enrichedShowrooms = seedShowrooms.map((sr) => {
      const distance = calculateDistance(lat, lng, sr.latitude, sr.longitude);
      return {
        ...sr,
        distanceKm: distance,
      };
    });

    enrichedShowrooms.sort((a, b) => a.distanceKm - b.distanceKm);

    return res.status(200).json({
      success: true,
      source: "seed",
      data: enrichedShowrooms,
    });
  } catch (error) {
    console.error("[ShowroomController] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memuat data showroom.",
    });
  }
};

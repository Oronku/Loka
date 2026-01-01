import express from "express";
import weather from "../services/weather.js";

const router = express.Router();

// GET /api/weather?city=London&date=2026-01-05
router.get("/", async (req, res) => {
  const { city, date } = req.query;
  if (!city || !date) {
    return res.status(400).json({ error: "Missing city or date" });
  }
  const result = await weather.getForecast(city, date);
  if (!result) {
    // החזר ממוצע עונתי פשוט אם אין תחזית בכלל
    const month = new Date(date).getMonth();
    const seasonalAverages = [
      { temp: 17, description: "קריר", icon: "04d" },
      { temp: 17, description: "קריר", icon: "04d" },
      { temp: 19, description: "נעים", icon: "03d" },
      { temp: 22, description: "נעים", icon: "02d" },
      { temp: 25, description: "חמים", icon: "01d" },
      { temp: 28, description: "חם", icon: "01d" },
      { temp: 30, description: "חם מאוד", icon: "01d" },
      { temp: 30, description: "חם מאוד", icon: "01d" },
      { temp: 28, description: "חמים", icon: "02d" },
      { temp: 26, description: "נעים", icon: "03d" },
      { temp: 22, description: "נעים", icon: "04d" },
      { temp: 18, description: "קריר", icon: "04d" },
    ];
    const avg = seasonalAverages[month] || {
      temp: 22,
      description: "נעים",
      icon: "03d",
    };
    return res.json({
      date,
      temp: avg.temp,
      weather: "Seasonal average",
      description: avg.description + " (ממוצע עונתי)",
      icon: avg.icon,
      wind: null,
      humidity: null,
    });
  }
  res.json(result);
});

export default router;

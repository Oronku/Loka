import axios from "axios";

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = "https://api.openweathermap.org/data/2.5";
  }

  /**
   * Get weather forecast for a city and date
   * @param {string} city - City name (e.g., "London")
   * @param {string} date - ISO date (e.g., "2026-01-05")
   * @returns {Promise<object>} Weather info for the date
   */
  async getForecast(city, date) {
    try {
      // Get 5-day forecast (3-hour intervals)
      const url = `${this.baseUrl}/forecast?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;
      const res = await axios.get(url);
      const forecasts = res.data.list;
      // Find closest forecast to requested date
      const target = new Date(date);
      let best = null;
      let minDiff = Infinity;
      for (const f of forecasts) {
        const fDate = new Date(f.dt_txt);
        const diff = Math.abs(fDate - target);
        if (diff < minDiff) {
          minDiff = diff;
          best = f;
        }
      }
      if (!best) {
        // ממוצע עונתי לפי חודש (פשוט)
        const month = target.getMonth();
        // טבלה לדוגמה, אפשר להרחיב לפי ערים
        const seasonalAverages = [
          { temp: 17, description: "קריר", icon: "04d" }, // ינואר
          { temp: 17, description: "קריר", icon: "04d" }, // פברואר
          { temp: 19, description: "נעים", icon: "03d" }, // מרץ
          { temp: 22, description: "נעים", icon: "02d" }, // אפריל
          { temp: 25, description: "חמים", icon: "01d" }, // מאי
          { temp: 28, description: "חם", icon: "01d" }, // יוני
          { temp: 30, description: "חם מאוד", icon: "01d" }, // יולי
          { temp: 30, description: "חם מאוד", icon: "01d" }, // אוגוסט
          { temp: 28, description: "חמים", icon: "02d" }, // ספטמבר
          { temp: 26, description: "נעים", icon: "03d" }, // אוקטובר
          { temp: 22, description: "נעים", icon: "04d" }, // נובמבר
          { temp: 18, description: "קריר", icon: "04d" }, // דצמבר
        ];
        const avg = seasonalAverages[month] || {
          temp: 22,
          description: "נעים",
          icon: "03d",
        };
        return {
          date: date,
          temp: avg.temp,
          weather: "Seasonal average",
          description: avg.description + " (ממוצע עונתי)",
          icon: avg.icon,
          wind: null,
          humidity: null,
        };
      }
      return {
        date: best.dt_txt,
        temp: best.main.temp,
        weather: best.weather[0].main,
        description: best.weather[0].description,
        icon: best.weather[0].icon,
        wind: best.wind.speed,
        humidity: best.main.humidity,
      };
    } catch (err) {
      console.error("Weather API error:", err.response?.data || err.message);
      return null;
    }
  }
}

export default new WeatherService();

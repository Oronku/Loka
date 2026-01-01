import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
} from "@mui/material";

interface WeatherData {
  date: string;
  temp: number;
  description: string;
  icon: string;
}

interface WeatherForecastProps {
  city: string;
  date: Date;
}

const WeatherForecast: React.FC<WeatherForecastProps> = ({ city, date }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = date.toISOString().split("T")[0];
        const res = await fetch(
          `/api/weather?city=${encodeURIComponent(city)}&date=${dateStr}`
        );
        if (!res.ok) throw new Error("Failed to fetch weather");
        const data = await res.json();
        setWeather({
          date: dateStr,
          temp: data.temp,
          description: data.description,
          icon: data.icon,
        });
      } catch (err: any) {
        setError(err.message || "Error fetching weather");
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [city, date]);

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!weather) return null;

  return (
    <Card sx={{ mb: 1 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <img
            src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
            alt={weather.description}
            width={48}
            height={48}
          />
          <Box>
            <Typography variant="subtitle2">{weather.date}</Typography>
            <Typography variant="body1">
              {weather.temp}°C, {weather.description}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeatherForecast;

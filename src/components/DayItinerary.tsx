import { Box, Card, CardContent, Typography, Divider } from "@mui/material";
import WeatherForecast from "./WeatherForecast";
import { format } from "date-fns";
import type { DaySchedule } from "../types/Trip";

interface DayItineraryProps {
  day: DaySchedule;
  city: string;
}

const DayItinerary: React.FC<DayItineraryProps> = ({ day, city }) => {
  console.log("DayItinerary received day:", day);
  console.log("Activities:", day.items);
  console.log("Activities length:", day.items?.length);

  const getActivityTime = (activity: any) => {
    switch (activity.type) {
      case "flight":
        return format(new Date(activity.departureDateTime), "HH:mm");
      case "hotel":
        return format(new Date(activity.checkIn), "HH:mm");
      case "transportation":
        return activity.pickupDateTime
          ? format(new Date(activity.pickupDateTime), "HH:mm")
          : "00:00";
      case "attraction":
        return format(new Date(activity.startDateTime), "HH:mm");
      default:
        return "";
    }
  };

  const getActivityDetails = (activity: any) => {
    switch (activity.type) {
      case "flight":
        const depCode =
          activity.departureAirportCode ||
          activity.departureAirport?.code ||
          activity.departureAirport;
        const arrCode =
          activity.arrivalAirportCode ||
          activity.arrivalAirport?.code ||
          activity.arrivalAirport;
        const arrivalTime = activity.arrivalTimeLocal
          ? activity.arrivalTimeLocal.split(" ")[1].substring(0, 5) // Extract HH:mm from "2025-11-13 19:15+04:00"
          : format(new Date(activity.arrivalDateTime), "HH:mm");
        return `${activity.airline} ${activity.flightNumber}: ${depCode} → ${arrCode} (arrives ${arrivalTime})`;
      case "hotel":
        return `${activity.name} - Check-in`;
      case "transportation":
        const mode = activity.mode || "ride";
        const from =
          activity.fromLocation ||
          activity.pickupLocation?.name ||
          activity.pickupLocation?.address ||
          "Pickup";
        const to =
          activity.toLocation ||
          activity.dropoffLocation?.name ||
          activity.dropoffLocation?.address ||
          "Dropoff";
        return `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ${from} → ${to}`;
      case "attraction":
        return activity.name;
      default:
        return "";
    }
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {format(day.date, "EEEE, MMMM d, yyyy")}
        </Typography>
        {/* תחזית מזג אוויר ליום זה */}
        <WeatherForecast city={city} date={day.date} />
        {/* תחזית מזג אוויר למחר */}
        <WeatherForecast
          city={city}
          date={new Date(day.date.getTime() + 24 * 60 * 60 * 1000)}
        />
        <Divider sx={{ my: 2 }} />
        <Box>
          {!day.items || day.items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              No activities scheduled for this day
            </Typography>
          ) : (
            day.items
              .sort((a: any, b: any) => {
                const dateA = new Date(getActivityTime(a));
                const dateB = new Date(getActivityTime(b));
                return dateA.getTime() - dateB.getTime();
              })
              .map((activity: any, index: number) => (
                <Box key={activity.id || index} sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" color="primary">
                    {getActivityTime(activity)}
                  </Typography>
                  <Typography>{getActivityDetails(activity)}</Typography>
                  {(activity.price || activity.cost) && (
                    <Typography color="text.secondary">
                      $
                      {activity.price
                        ? activity.price.toFixed(2)
                        : activity.cost?.toFixed(2)}
                    </Typography>
                  )}
                </Box>
              ))
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default DayItinerary;

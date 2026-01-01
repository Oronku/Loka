import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Dialog,
  Paper,
  Container,
  Tab,
  Tabs,
} from "@mui/material";
import Layout from "../components/Layout";
import MapIcon from "@mui/icons-material/Map";
import ListAltIcon from "@mui/icons-material/ListAlt";
import FlightIcon from "@mui/icons-material/Flight";
import HotelIcon from "@mui/icons-material/Hotel";
import AddIcon from "@mui/icons-material/Add";
import AddItemForm from "../components/AddItemForm";
import DayItinerary from "../components/DayItinerary";
import FlightCard from "../components/FlightCard";
import HotelCard from "../components/HotelCard";
import TripMap from "../components/TripMap";

import type { Trip } from "../types/Trip";
import { TripAPI } from "../services/api";

interface MapLocation {
  lat: number;
  lng: number;
  title: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && children}
    </div>
  );
}

const TripDetails = () => {
  const { id } = useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const fetchTrip = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await TripAPI.getTrip(id);
      console.log("Fetched trip data:", data);
      console.log("Flights in trip:", data.flights);
      if (data.flights && data.flights.length > 0) {
        console.log(
          "First flight departure:",
          data.flights[0].departureDateTime
        );
      }

      // Generate schedule from trip items if not present
      if (!data.schedule || data.schedule.length === 0) {
        console.log(
          "⚠️ Generating schedule because trip.schedule is empty or missing"
        );
        data.schedule = generateSchedule(data);
        console.log("✅ Generated schedule:", data.schedule);
      } else {
        console.log("ℹ️ Using existing schedule:", data.schedule);
      }

      setTrip(data);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load trip details. Please try again later.";
      setError(errorMessage);
      console.error("Error loading trip:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to generate schedule from trip data
  const generateSchedule = (tripData: any) => {
    console.log("=== GENERATING SCHEDULE ===");
    console.log("Trip data:", tripData);
    console.log("Start date:", tripData.startDate);
    console.log("End date:", tripData.endDate);
    console.log("Flights:", tripData.flights);

    const schedule: any[] = [];
    const startDate = new Date(tripData.startDate);
    const endDate = new Date(tripData.endDate);

    // Create a day entry for each day in the trip
    let currentDate = new Date(startDate);
    let dayNumber = 1;

    while (currentDate <= endDate) {
      const dayActivities: any[] = [];
      // Get the date in YYYY-MM-DD format without timezone conversion
      const currentDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
      console.log(`Processing day ${dayNumber}: ${currentDateStr}`);

      // Add flights for this day
      if (tripData.flights) {
        console.log(
          `Checking ${tripData.flights.length} flights for day ${dayNumber}`
        );
        tripData.flights.forEach((flight: any) => {
          // Extract date from the flight's local time string if available, otherwise from departureDateTime
          let flightDateStr = "";
          if (flight.departureTimeLocal) {
            // departureTimeLocal format: "2025-11-13 14:00+02:00"
            flightDateStr = flight.departureTimeLocal.split(" ")[0];
          } else {
            const flightDate = new Date(flight.departureDateTime);
            flightDateStr = `${flightDate.getFullYear()}-${String(flightDate.getMonth() + 1).padStart(2, "0")}-${String(flightDate.getDate()).padStart(2, "0")}`;
          }
          console.log(
            `Flight ${flight.id} departure date: ${flightDateStr}, comparing to ${currentDateStr}`
          );
          if (flightDateStr === currentDateStr) {
            console.log(`✓ Adding flight ${flight.id} to day ${dayNumber}`);
            dayActivities.push({ ...flight, type: "flight" });
          }
        });
      }

      // Add hotels for this day
      if (tripData.hotels) {
        tripData.hotels.forEach((hotel: any) => {
          const hotelDate = new Date(hotel.checkIn);
          const checkInDate = `${hotelDate.getFullYear()}-${String(hotelDate.getMonth() + 1).padStart(2, "0")}-${String(hotelDate.getDate()).padStart(2, "0")}`;
          if (checkInDate === currentDateStr) {
            dayActivities.push({ ...hotel, type: "hotel" });
          }
        });
      }

      // Add transportation for this day
      if (tripData.transportation) {
        tripData.transportation.forEach((trans: any) => {
          const transDateTime = new Date(trans.pickupDateTime);
          const transDate = `${transDateTime.getFullYear()}-${String(transDateTime.getMonth() + 1).padStart(2, "0")}-${String(transDateTime.getDate()).padStart(2, "0")}`;
          if (transDate === currentDateStr) {
            dayActivities.push({ ...trans, type: "transportation" });
          }
        });
      }

      // Add attractions for this day
      if (tripData.attractions) {
        tripData.attractions.forEach((attr: any) => {
          const attrDateTime = new Date(attr.startDateTime);
          const attrDate = `${attrDateTime.getFullYear()}-${String(attrDateTime.getMonth() + 1).padStart(2, "0")}-${String(attrDateTime.getDate()).padStart(2, "0")}`;
          if (attrDate === currentDateStr) {
            dayActivities.push({ ...attr, type: "attraction" });
          }
        });
      }

      console.log(
        `Day ${dayNumber} has ${dayActivities.length} activities:`,
        dayActivities
      );

      schedule.push({
        dayNumber,
        date: new Date(currentDate),
        activities: dayActivities,
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }

    console.log("=== FINAL SCHEDULE ===", schedule);
    return schedule;
  };

  useEffect(() => {
    fetchTrip();
  }, [id]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
        }}
      >
        <Typography color="error">{error}</Typography>
        <Button
          variant="contained"
          onClick={() => {
            if (id) {
              setLoading(true);
              setError(null);
              TripAPI.getTrip(id)
                .then((data: any) => setTrip(data))
                .catch((err: any) => {
                  const errorMessage =
                    err instanceof Error
                      ? err.message
                      : "Failed to load trip details. Please try again later.";
                  setError(errorMessage);
                  console.error("Error loading trip:", err);
                })
                .finally(() => setLoading(false));
            }
          }}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  if (!trip) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80vh",
        }}
      >
        <Typography>Trip not found</Typography>
      </Box>
    );
  }

  const handleUpdateLocations = async (locations: MapLocation[]) => {
    try {
      await TripAPI.updateTrip(trip.id, { ...trip, locations });
      setTrip((prev) => (prev ? { ...prev, locations } : null));
    } catch (err) {
      console.error("Failed to update locations:", err);
      // TODO: Add error notification
    }
  };

  return (
    <Layout>
      <Container maxWidth="lg">
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Box>
              <Typography variant="h4" gutterBottom>
                {trip.name}
              </Typography>
              <Typography color="text.secondary">
                Total Cost: $
                {((trip as any).getTotalCost?.() || 0).toLocaleString()}
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setIsAddingItem(true)}
            >
              Add Item
            </Button>
          </Box>

          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab icon={<ListAltIcon />} label="Itinerary" />
            <Tab icon={<MapIcon />} label="Map" />
            <Tab icon={<FlightIcon />} label="Flights" />
            <Tab icon={<HotelIcon />} label="Hotels" />
          </Tabs>
        </Paper>
        <TabPanel value={tabValue} index={0}>
          {!trip?.schedule || trip.schedule.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No items in your itinerary yet
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => setIsAddingItem(true)}
              >
                Add Your First Item
              </Button>
            </Box>
          ) : (
            trip.schedule.map((day, index) => (
              <DayItinerary
                key={index}
                day={day}
                city={trip.destinations?.[0]?.name || "Tel Aviv"}
              />
            ))
          )}
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <Paper sx={{ height: 500, mb: 2 }}>
            <TripMap
              locations={(trip.destinations || []) as any}
              flights={(trip as any).flights || []}
              editable
              onLocationsChange={handleUpdateLocations}
            />
          </Paper>
        </TabPanel>{" "}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => {
                setIsAddingItem(true);
              }}
            >
              Add Flight
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(trip as any).flights?.map((flight: any) => (
              <FlightCard
                key={flight.id}
                flight={flight}
                onEdit={() => {
                  /* TODO */
                }}
                onDelete={async () => {
                  if (!id) return;
                  try {
                    // TODO: Add backend endpoint for deleting flights
                    console.log("Delete flight:", flight.id);
                    await fetchTrip();
                  } catch (err) {
                    console.error("Failed to delete flight:", err);
                  }
                }}
              />
            ))}
            {(!(trip as any).flights || (trip as any).flights.length === 0) && (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                No flights added yet. Click "Add Flight" to start planning your
                transportation.
              </Typography>
            )}
          </Box>
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => {
                setIsAddingItem(true);
              }}
            >
              Add Hotel
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(trip as any).hotels?.map((hotel: any) => (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                onEdit={() => {
                  /* TODO */
                }}
                onDelete={async () => {
                  if (!id) return;
                  try {
                    // TODO: Add backend endpoint for deleting hotels
                    console.log("Delete hotel:", hotel.id);
                    await fetchTrip();
                  } catch (err) {
                    console.error("Failed to delete hotel:", err);
                  }
                }}
              />
            ))}
            {(!(trip as any).hotels || (trip as any).hotels.length === 0) && (
              <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                No hotels added yet. Click "Add Hotel" to start planning your
                accommodations.
              </Typography>
            )}
          </Box>
        </TabPanel>
        <Dialog
          open={isAddingItem}
          onClose={() => setIsAddingItem(false)}
          maxWidth="md"
          fullWidth
          disablePortal={false}
          keepMounted={false}
          aria-modal={true}
          disableAutoFocus={false}
          disableEnforceFocus={false}
          disableEscapeKeyDown={false}
        >
          <AddItemForm
            onSubmit={async (item) => {
              console.log("TripDetails - onSubmit called with item:", item);
              if (!id) return;

              try {
                // Map frontend types to backend structure
                if (item.type === "flight") {
                  console.log("Processing flight item...");
                  const depAirport =
                    typeof item.departureAirport === "string"
                      ? item.departureAirport
                      : item.departureAirport.code;
                  const arrAirport =
                    typeof item.arrivalAirport === "string"
                      ? item.arrivalAirport
                      : item.arrivalAirport.code;
                  const flightData = {
                    airline: item.airline,
                    flightNumber: item.flightNumber,
                    departureAirportCode: depAirport,
                    departureCity:
                      typeof item.departureAirport === "string"
                        ? ""
                        : item.departureAirport.city ||
                          item.departureAirport.name ||
                          "",
                    departureCountry:
                      typeof item.departureAirport === "string"
                        ? ""
                        : item.departureAirport.country || "",
                    departureLat:
                      typeof item.departureAirport === "string"
                        ? 0
                        : item.departureAirport.location?.lat || 0,
                    departureLng:
                      typeof item.departureAirport === "string"
                        ? 0
                        : item.departureAirport.location?.lng || 0,
                    departureDateTime: item.departureDateTime,
                    departureTimeLocal: (item as any).departureTimeLocal,
                    departureTimezone: (item as any).departureTimezone,
                    arrivalAirportCode: arrAirport,
                    arrivalCity:
                      typeof item.arrivalAirport === "string"
                        ? ""
                        : item.arrivalAirport.city ||
                          item.arrivalAirport.name ||
                          "",
                    arrivalCountry:
                      typeof item.arrivalAirport === "string"
                        ? ""
                        : item.arrivalAirport.country || "",
                    arrivalLat:
                      typeof item.arrivalAirport === "string"
                        ? 0
                        : item.arrivalAirport.location?.lat || 0,
                    arrivalLng:
                      typeof item.arrivalAirport === "string"
                        ? 0
                        : item.arrivalAirport.location?.lng || 0,
                    arrivalDateTime: item.arrivalDateTime,
                    arrivalTimeLocal: (item as any).arrivalTimeLocal,
                    arrivalTimezone: (item as any).arrivalTimezone,
                    price: item.price || 0,
                  };
                  console.log(
                    "Calling TripAPI.createManualFlight with:",
                    flightData
                  );
                  await TripAPI.createManualFlight(id, flightData);
                  console.log("Flight created successfully");
                } else if (item.type === "hotel") {
                  console.log("Processing hotel item...");
                  const updatedTrip = {
                    ...trip,
                    hotels: [
                      ...((trip as any).hotels || []),
                      {
                        name: item.name,
                        address: item.location?.address || "",
                        city: item.location?.city || "",
                        country: item.location?.country || "",
                        lat: item.location?.coordinates?.lat || 0,
                        lng: item.location?.coordinates?.lng || 0,
                        checkIn: item.checkIn,
                        checkOut: item.checkOut,
                        pricePerNight: item.pricePerNight,
                        rating: item.rating || 3,
                      },
                    ],
                  };
                  await TripAPI.updateTrip(id, updatedTrip);
                  console.log("Hotel added successfully");
                } else if (item.type === "transportation") {
                  console.log("Processing transportation item...");
                  const updatedTrip = {
                    ...trip,
                    transportation: [
                      ...((trip as any).transportation || []),
                      {
                        id: item.id,
                        mode: item.mode,
                        provider: (item as any).provider || "",
                        fromLocation:
                          item.pickupLocation?.address ||
                          item.pickupLocation?.name ||
                          "",
                        toLocation:
                          item.dropoffLocation?.address ||
                          item.dropoffLocation?.name ||
                          "",
                        pickupDateTime: item.pickupDateTime,
                        dropoffDateTime: item.dropoffDateTime,
                        cost: item.cost || 0,
                        distance: item.distance || "",
                        duration: item.duration || "",
                      },
                    ],
                  };
                  await TripAPI.updateTrip(id, updatedTrip);
                  console.log("Transportation added successfully");
                } else if (item.type === "attraction") {
                  console.log("Processing attraction item...");
                  const updatedTrip = {
                    ...trip,
                    attractions: [
                      ...((trip as any).attractions || []),
                      {
                        id: item.id,
                        name: item.name,
                        location:
                          item.location?.address || item.location?.name || "",
                        category: item.category || "other",
                        startDateTime: item.startDateTime,
                        duration: item.duration,
                        cost: item.cost || 0,
                        description: (item as any).description || "",
                        bookingRequired: (item as any).bookingRequired || false,
                      },
                    ],
                  };
                  await TripAPI.updateTrip(id, updatedTrip);
                  console.log("Attraction added successfully");
                }

                // Refresh trip data
                console.log("Fetching updated trip data...");
                await fetchTrip();
                console.log("Trip data refreshed");
                setIsAddingItem(false);
              } catch (err) {
                console.error("Failed to add item:", err);
                // TODO: Show error notification
              }
            }}
            onCancel={() => setIsAddingItem(false)}
          />
        </Dialog>
      </Container>
    </Layout>
  );
};

export default TripDetails;

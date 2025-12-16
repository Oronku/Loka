import React, { useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Stack,
  LinearProgress,
  Avatar,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Flight,
  Hotel,
  Attractions,
  AttachMoney,
  Public,
  AccessTime,
  Map,
  TrendingUp,
} from '@mui/icons-material';
import { Trip } from '../types/domain';

interface TripStatisticsProps {
  trips: Trip[];
}

export default function TripStatistics({ trips }: TripStatisticsProps) {
  const theme = useTheme();

  const stats = useMemo(() => {
    let totalFlights = 0;
    let totalFlightCost = 0;
    let totalFlightMinutes = 0;
    let totalHotelCost = 0;
    let totalHotels = 0;
    let totalAttractionCost = 0;
    let totalAttractions = 0;
    let totalRideCost = 0;
    let totalDays = 0;
    const destinationCounts: Record<string, number> = {};

    trips.forEach((trip) => {
      // Flights
      if (trip.flights) {
        totalFlights += trip.flights.length;
        trip.flights.forEach((f) => {
          totalFlightCost += f.cost || 0;
          totalFlightMinutes += f.durationMinutes || 0;
        });
      }

      // Hotels
      if (trip.hotels) {
        totalHotels += trip.hotels.length;
        trip.hotels.forEach((h) => {
          totalHotelCost += h.cost || 0;
        });
      }

      // Attractions
      if (trip.attractions) {
        totalAttractions += trip.attractions.length;
        trip.attractions.forEach((a) => {
          totalAttractionCost += a.cost || 0;
        });
      }

      // Rides
      if (trip.rides) {
        trip.rides.forEach((r) => {
          totalRideCost += r.cost || 0;
        });
      }

      // Destinations
      if (trip.destinations) {
        trip.destinations.forEach((dest) => {
          // Handle both string and object types (in case data is inconsistent)
          const destStr =
            typeof dest === 'string' ? dest : (dest as any)?.name || '';
          if (destStr) {
            const city = destStr.split(',')[0].trim();
            destinationCounts[city] = (destinationCounts[city] || 0) + 1;
          }
        });
      }

      // Days
      if (trip.startDate && trip.endDate) {
        const start = new Date(trip.startDate);
        const end = new Date(trip.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
      }
    });

    const totalCost =
      totalFlightCost + totalHotelCost + totalAttractionCost + totalRideCost;

    // Sort destinations
    const popularDestinations = Object.entries(destinationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return {
      totalFlights,
      totalFlightCost,
      totalFlightMinutes,
      totalHotels,
      totalHotelCost,
      totalAttractions,
      totalAttractionCost,
      totalCost,
      totalDays,
      popularDestinations,
    };
  }, [trips]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const StatCard = ({
    icon,
    title,
    value,
    subtitle,
    color,
  }: {
    icon: React.ReactNode;
    title: string;
    value: string | number;
    subtitle?: string;
    color: string;
  }) => (
    <Card
      sx={{
        height: '100%',
        borderRadius: 4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
        transition: 'transform 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        },
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Avatar
            sx={{
              bgcolor: `${color}15`, // 15 is roughly 8% opacity in hex
              color: color,
              width: 48,
              height: 48,
            }}
          >
            {icon}
          </Avatar>
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {title}
            </Typography>
            <Typography variant="h5" fontWeight={800} sx={{ my: 0.5 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="h5" fontWeight={800} gutterBottom sx={{ mb: 3 }}>
        Travel Overview
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Key Metrics */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<AttachMoney />}
            title="Total Spent"
            value={formatCurrency(stats.totalCost)}
            subtitle="Across all trips"
            color={theme.palette.success.main}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<Flight />}
            title="Flights Taken"
            value={stats.totalFlights}
            subtitle={`${formatDuration(stats.totalFlightMinutes)} in air`}
            color={theme.palette.primary.main}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<Hotel />}
            title="Nights Stayed"
            value={stats.totalDays}
            subtitle={`${stats.totalHotels} hotels booked`}
            color={theme.palette.secondary.main}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={<Public />}
            title="Destinations"
            value={stats.popularDestinations.length}
            subtitle="Cities visited"
            color={theme.palette.info.main}
          />
        </Grid>
      </Grid>

      <Grid container spacing={4}>
        {/* Cost Breakdown */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 4,
              height: '100%',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            }}
          >
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Cost Breakdown
            </Typography>
            <Stack spacing={3} sx={{ mt: 2 }}>
              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mb: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Flight fontSize="small" color="primary" />
                    <Typography variant="body2" fontWeight={600}>
                      Flights
                    </Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>
                    {formatCurrency(stats.totalFlightCost)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={
                    stats.totalCost > 0
                      ? (stats.totalFlightCost / stats.totalCost) * 100
                      : 0
                  }
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'grey.100',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'primary.main',
                    },
                  }}
                />
              </Box>

              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mb: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Hotel fontSize="small" color="secondary" />
                    <Typography variant="body2" fontWeight={600}>
                      Hotels
                    </Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>
                    {formatCurrency(stats.totalHotelCost)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={
                    stats.totalCost > 0
                      ? (stats.totalHotelCost / stats.totalCost) * 100
                      : 0
                  }
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'grey.100',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'secondary.main',
                    },
                  }}
                />
              </Box>

              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mb: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Attractions fontSize="small" color="success" />
                    <Typography variant="body2" fontWeight={600}>
                      Activities
                    </Typography>
                  </Stack>
                  <Typography variant="body2" fontWeight={700}>
                    {formatCurrency(stats.totalAttractionCost)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={
                    stats.totalCost > 0
                      ? (stats.totalAttractionCost / stats.totalCost) * 100
                      : 0
                  }
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'grey.100',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: 'success.main',
                    },
                  }}
                />
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* Popular Destinations */}
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 4,
              height: '100%',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            }}
          >
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Top Destinations
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              {stats.popularDestinations.map(([city, count], index) => (
                <Box
                  key={city}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderRadius: 3,
                    bgcolor: index === 0 ? 'primary.50' : 'transparent',
                    border: index === 0 ? 'none' : '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor:
                          index === 0 ? 'primary.main' : 'action.selected',
                        color: index === 0 ? 'white' : 'text.secondary',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </Avatar>
                    <Typography
                      variant="body1"
                      fontWeight={index === 0 ? 700 : 500}
                    >
                      {city}
                    </Typography>
                  </Stack>
                  <Chip
                    label={`${count} trip${count !== 1 ? 's' : ''}`}
                    size="small"
                    color={index === 0 ? 'primary' : 'default'}
                    variant={index === 0 ? 'filled' : 'outlined'}
                  />
                </Box>
              ))}
              {stats.popularDestinations.length === 0 && (
                <Typography
                  color="text.secondary"
                  align="center"
                  sx={{ py: 4 }}
                >
                  No destinations recorded yet.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

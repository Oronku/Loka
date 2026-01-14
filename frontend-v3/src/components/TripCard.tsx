import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import {
  FlightTakeoff,
  LocationOn,
  CalendarToday,
  AccessTime,
  Hotel,
  Attractions,
} from '@mui/icons-material';
import { format } from 'date-fns';

interface TripCardProps {
  name: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  duration: number;
  daysUntil?: number | null;
  status: 'past' | 'current' | 'upcoming';
  flights?: number;
  hotels?: number;
  attractions?: number;
}

export default function TripCard({
  name,
  destinations,
  startDate,
  endDate,
  duration,
  daysUntil,
  status,
  flights = 0,
  hotels = 0,
  attractions = 0,
}: TripCardProps) {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'upcoming':
        return 'primary';
      case 'current':
        return 'success';
      case 'past':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusText = () => {
    if (status === 'upcoming' && daysUntil !== null && daysUntil !== undefined) {
      return `מתחיל בעוד ${daysUntil} ימים`;
    }
    if (status === 'current') {
      return 'נוכחי';
    }
    if (status === 'past') {
      return 'עבר';
    }
    return '';
  };

  return (
    <Card
      sx={{
        mb: 2,
        borderRadius: 3,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        border: '1px solid rgba(14, 165, 233, 0.2)',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        {/* Trip Name */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <FlightTakeoff
            sx={{
              color: 'primary.main',
              mr: 1,
              fontSize: 24,
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              flex: 1,
            }}
          >
            {name}
          </Typography>
        </Box>

        {/* Destinations */}
        {destinations.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
            <LocationOn
              sx={{
                color: 'text.secondary',
                mr: 1,
                mt: 0.5,
                fontSize: 20,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {destinations.join(', ')}
            </Typography>
          </Box>
        )}

        {/* Dates */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <CalendarToday
            sx={{
              color: 'text.secondary',
              mr: 1,
              fontSize: 20,
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {formatDate(startDate)} → {formatDate(endDate)}
          </Typography>
        </Box>

        {/* Duration and Status */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Chip
            icon={<AccessTime sx={{ fontSize: 16 }} />}
            label={`${duration} ${duration === 1 ? 'יום' : 'ימים'}`}
            size="small"
            variant="outlined"
            color="primary"
          />
          {status !== 'past' && (
            <Chip
              label={getStatusText()}
              size="small"
              color={getStatusColor()}
              sx={{ fontWeight: 600 }}
            />
          )}
        </Stack>

        {/* Details */}
        {(flights > 0 || hotels > 0 || attractions > 0) && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {flights > 0 && (
              <Chip
                icon={<FlightTakeoff sx={{ fontSize: 16 }} />}
                label={`${flights} טיס${flights > 1 ? 'ות' : 'ה'}`}
                size="small"
                variant="outlined"
              />
            )}
            {hotels > 0 && (
              <Chip
                icon={<Hotel sx={{ fontSize: 16 }} />}
                label={`${hotels} מלון${hotels > 1 ? 'ים' : ''}`}
                size="small"
                variant="outlined"
              />
            )}
            {attractions > 0 && (
              <Chip
                icon={<Attractions sx={{ fontSize: 16 }} />}
                label={`${attractions} פעילות${attractions > 1 ? 'ים' : ''}`}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

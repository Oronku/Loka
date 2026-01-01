import { useMemo } from 'react';
import {
  Box,
  Badge,
  Chip,
  Stack,
  Typography,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  NotificationsActive,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  Warning,
} from '@mui/icons-material';
import {
  generateTripNotifications,
  getActiveNotifications,
} from '../utils/notifications';
import type { Trip, TripNotification } from '../types/domain';

interface AllTripsNotificationsSummaryProps {
  trips: Trip[];
}

/**
 * Shows a summary of all active notifications across all trips on the home page
 */
export default function AllTripsNotificationsSummary({
  trips,
}: AllTripsNotificationsSummaryProps) {
  const allNotifications = useMemo(() => {
    const all: TripNotification[] = [];
    trips.forEach((trip) => {
      const tripNotifs = generateTripNotifications(trip);
      const active = getActiveNotifications(tripNotifs);
      all.push(...active);
    });
    return all.sort(
      (a, b) =>
        new Date(a.triggerTime).getTime() - new Date(b.triggerTime).getTime()
    );
  }, [trips]);

  const criticalCount = allNotifications.filter(
    (n) => n.priority === 'critical'
  ).length;
  const highCount = allNotifications.filter(
    (n) => n.priority === 'high'
  ).length;

  if (allNotifications.length === 0) {
    return null;
  }

  // Group by trip
  const byTrip = allNotifications.reduce(
    (acc, notif) => {
      if (!acc[notif.tripId]) {
        acc[notif.tripId] = [];
      }
      acc[notif.tripId].push(notif);
      return acc;
    },
    {} as Record<string, TripNotification[]>
  );

  return (
    <Box mb={4}>
      <Alert
        severity={criticalCount > 0 ? 'error' : 'warning'}
        icon={<NotificationsActive />}
        sx={{
          '& .MuiAlert-message': { width: '100%' },
        }}
      >
        <AlertTitle sx={{ fontWeight: 600, mb: 1 }}>
          {criticalCount > 0
            ? `🚨 ${criticalCount} Critical Notification${criticalCount > 1 ? 's' : ''}`
            : `⏰ ${allNotifications.length} Active Notification${allNotifications.length > 1 ? 's' : ''}`}
        </AlertTitle>

        <Stack spacing={2}>
          {Object.entries(byTrip).map(([tripId, notifications]) => {
            const trip = trips.find((t) => t.id === tripId);
            if (!trip) return null;

            const critical = notifications.filter(
              (n) => n.priority === 'critical'
            );
            const high = notifications.filter((n) => n.priority === 'high');

            return (
              <Box key={tripId}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  mb={1}
                  flexWrap="wrap"
                >
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{ color: 'text.primary' }}
                  >
                    {trip.name}
                  </Typography>
                  {critical.length > 0 && (
                    <Chip
                      icon={<Warning />}
                      label={`${critical.length} Critical`}
                      size="small"
                      color="error"
                      sx={{ height: 20 }}
                    />
                  )}
                  {high.length > 0 && (
                    <Chip
                      label={`${high.length} High`}
                      size="small"
                      color="warning"
                      sx={{ height: 20 }}
                    />
                  )}
                </Stack>

                <Stack spacing={0.5}>
                  {notifications.slice(0, 3).map((notif) => (
                    <Stack
                      key={notif.id}
                      direction="row"
                      spacing={1}
                      alignItems="flex-start"
                    >
                      {notif.type.startsWith('flight') && (
                        <FlightIcon
                          sx={{ fontSize: 16, mt: 0.2, opacity: 0.7 }}
                        />
                      )}
                      {notif.type.startsWith('hotel') && (
                        <HotelIcon
                          sx={{ fontSize: 16, mt: 0.2, opacity: 0.7 }}
                        />
                      )}
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary' }}
                      >
                        {notif.title}
                      </Typography>
                    </Stack>
                  ))}
                  {notifications.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        pl: 3,
                      }}
                    >
                      +{notifications.length - 3} more...
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', mt: 2, display: 'block' }}
        >
          💡 Click on a trip to view and manage all notifications
        </Typography>
      </Alert>
    </Box>
  );
}

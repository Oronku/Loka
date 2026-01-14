import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Badge,
  IconButton,
  Typography,
  Box,
  Chip,
  Stack,
  Alert,
  Divider,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsActive,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  Attractions as AttractionsIcon,
  Close as CloseIcon,
  CheckCircle,
  Schedule,
  Warning,
  Info,
} from '@mui/icons-material';
import type { TripNotification } from '../types/domain';
import {
  getActiveNotifications,
  getUpcomingNotifications,
  formatTimeUntil,
} from '../utils/notifications';

interface TripNotificationsProps {
  notifications: TripNotification[];
  onDismiss: (notificationId: string) => void;
}

export default function TripNotifications({
  notifications,
  onDismiss,
}: TripNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'upcoming'>('active');

  const activeNotifications = useMemo(
    () => getActiveNotifications(notifications),
    [notifications]
  );

  const upcomingNotifications = useMemo(
    () => getUpcomingNotifications(notifications),
    [notifications]
  );

  // Auto-open dialog when new critical notifications appear
  useEffect(() => {
    const criticalActive = activeNotifications.filter(
      (n) => n.priority === 'critical'
    );
    if (criticalActive.length > 0) {
      setOpen(true);
    }
  }, [activeNotifications]);

  const handleDismiss = (id: string) => {
    onDismiss(id);
  };

  const getNotificationIcon = (type: TripNotification['type']) => {
    switch (type) {
      case 'flight-checkin':
      case 'flight-departure':
      case 'flight-arrive-early':
      case 'flight-no-baggage':
        return <FlightIcon color="primary" />;
      case 'hotel-checkin':
      case 'hotel-checkout':
      case 'hotel-early-arrival':
        return <HotelIcon color="secondary" />;
      case 'attraction-reminder':
      case 'attraction-tickets':
        return <AttractionsIcon color="success" />;
      default:
        return <Info />;
    }
  };

  const getPriorityColor = (
    priority: TripNotification['priority']
  ): 'error' | 'warning' | 'info' | 'success' => {
    switch (priority) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'info';
    }
  };

  const getPriorityIcon = (priority: TripNotification['priority']) => {
    switch (priority) {
      case 'critical':
        return <Warning color="error" />;
      case 'high':
        return <Warning color="warning" />;
      case 'medium':
        return <Info color="info" />;
      case 'low':
        return <Schedule color="success" />;
      default:
        return <Info />;
    }
  };

  const renderNotificationsList = (notifs: TripNotification[]) => {
    if (notifs.length === 0) {
      return (
        <Box py={4} textAlign="center">
          <Typography variant="body2" color="text.secondary">
            {activeTab === 'active'
              ? 'No active notifications'
              : 'No upcoming notifications'}
          </Typography>
        </Box>
      );
    }

    return (
      <List sx={{ width: '100%', maxHeight: '60vh', overflow: 'auto' }}>
        {notifs.map((notification, index) => (
          <Box key={notification.id}>
            {index > 0 && <Divider />}
            <ListItem
              alignItems="flex-start"
              sx={{
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
              secondaryAction={
                activeTab === 'active' && (
                  <IconButton
                    edge="end"
                    aria-label="dismiss"
                    onClick={() => handleDismiss(notification.id)}
                    size="small"
                  >
                    <CloseIcon />
                  </IconButton>
                )
              }
            >
              <ListItemIcon sx={{ mt: 1 }}>
                {getNotificationIcon(notification.type)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    mb={0.5}
                  >
                    <Typography variant="subtitle2" fontWeight={600}>
                      {notification.title}
                    </Typography>
                    {activeTab === 'upcoming' && (
                      <Chip
                        label={formatTimeUntil(notification.triggerTime)}
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Stack>
                }
                secondary={
                  <Stack spacing={1} mt={0.5}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ whiteSpace: 'pre-line' }}
                    >
                      {notification.message}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        icon={getPriorityIcon(notification.priority)}
                        label={notification.priority.toUpperCase()}
                        size="small"
                        color={getPriorityColor(notification.priority)}
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                      {notification.relatedItemType && (
                        <Chip
                          label={notification.relatedItemType}
                          size="small"
                          variant="filled"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            bgcolor: 'action.selected',
                          }}
                        />
                      )}
                    </Stack>
                    {notification.actionLabel && (
                      <Box mt={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => {
                            if (notification.actionUrl) {
                              window.open(notification.actionUrl, '_blank');
                            }
                          }}
                        >
                          {notification.actionLabel}
                        </Button>
                      </Box>
                    )}
                  </Stack>
                }
              />
            </ListItem>
          </Box>
        ))}
      </List>
    );
  };

  const totalActive = activeNotifications.length;
  const hasCritical = activeNotifications.some(
    (n) => n.priority === 'critical'
  );

  return (
    <>
      {/* Notification Bell Button */}
      <IconButton
        color="inherit"
        onClick={() => setOpen(true)}
        sx={{
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <Badge
          badgeContent={totalActive}
          color={hasCritical ? 'error' : 'primary'}
          max={9}
        >
          {totalActive > 0 ? (
            <NotificationsActive
              sx={{ color: hasCritical ? 'error.main' : 'primary.main' }}
            />
          ) : (
            <NotificationsIcon />
          )}
        </Badge>
      </IconButton>

      {/* Notifications Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={2}>
            <NotificationsIcon color="primary" />
            <Typography variant="h6" fontWeight={600} flex={1}>
              Trip Notifications
            </Typography>
            <IconButton
              onClick={() => setOpen(false)}
              size="small"
              sx={{ ml: 'auto' }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            variant="fullWidth"
          >
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>Active</span>
                  {totalActive > 0 && (
                    <Chip
                      label={totalActive}
                      size="small"
                      color="primary"
                      sx={{ height: 20, minWidth: 20 }}
                    />
                  )}
                </Stack>
              }
              value="active"
            />
            <Tab
              label={
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>Upcoming</span>
                  <Chip
                    label={upcomingNotifications.length}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, minWidth: 20 }}
                  />
                </Stack>
              }
              value="upcoming"
            />
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 0 }}>
          {hasCritical && activeTab === 'active' && (
            <Alert severity="error" icon={<Warning />} sx={{ m: 2, mb: 0 }}>
              <Typography variant="body2" fontWeight={600}>
                Critical notifications require your attention!
              </Typography>
            </Alert>
          )}

          {activeTab === 'active'
            ? renderNotificationsList(activeNotifications)
            : renderNotificationsList(upcomingNotifications)}
        </DialogContent>

        <DialogActions
          sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Button onClick={() => setOpen(false)} variant="contained">
            Close
          </Button>
          {activeTab === 'active' && totalActive > 0 && (
            <Button
              onClick={() => {
                activeNotifications.forEach((n) => handleDismiss(n.id));
              }}
              variant="outlined"
              startIcon={<CheckCircle />}
            >
              Dismiss All
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}

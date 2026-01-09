import { useState, useEffect } from 'react';
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
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  Flight,
  CalendarMonth,
  Business,
  CheckCircle,
} from '@mui/icons-material';
import { api } from '../services/api';

interface PendingTrip {
  tripId: string;
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  agentName: string;
  agencyName?: string;
  participantStatus: string;
  invitedAt: string;
}

interface PendingTripsDialogProps {
  open: boolean;
  onClose: () => void;
  userEmail: string;
}

export default function PendingTripsDialog({
  open,
  onClose,
  userEmail,
}: PendingTripsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [pendingTrips, setPendingTrips] = useState<PendingTrip[]>([]);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open && userEmail) {
      loadPendingTrips();
    }
  }, [open, userEmail]);

  const loadPendingTrips = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/auth/check-pending-trips');
      setPendingTrips(response.data.trips || []);
      // Auto-select all trips
      setSelectedTripIds(response.data.trips.map((t: PendingTrip) => t.tripId));
    } catch (err: any) {
      console.error('Error loading pending trips:', err);
      setError(err.response?.data?.error || 'שגיאה בטעינת הטיולים');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId)
        ? prev.filter((id) => id !== tripId)
        : [...prev, tripId]
    );
  };

  const handleLinkTrips = async () => {
    if (selectedTripIds.length === 0) {
      setError('נא לבחור לפחות טיול אחד');
      return;
    }

    try {
      setLinking(true);
      setError(null);
      await api.post('/auth/link-trips', { tripIds: selectedTripIds });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        // Refresh page to show updated trips
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      console.error('Error linking trips:', err);
      setError(err.response?.data?.error || 'שגיאה בקישור הטיולים');
    } finally {
      setLinking(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (loading) {
    return (
      <Dialog open={open} maxWidth="sm" fullWidth>
        <DialogContent>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 4,
            }}
          >
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  if (pendingTrips.length === 0) {
    return null; // Don't show dialog if no pending trips
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={!success}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Flight color="primary" />
          <Typography variant="h6" component="span">
            🎉 מצאנו טיולים ממתינים לך!
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        {success ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              ✅ הטיולים קושרו בהצלחה!
            </Typography>
            <Typography variant="body2">
              הדף יתרענן תוך רגע כדי להציג את הטיולים שלך...
            </Typography>
          </Alert>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2" gutterBottom>
                <strong>שלום! 👋</strong>
              </Typography>
              <Typography variant="body2">
                נמצאו {pendingTrips.length} טיולים שנוספת אליהם לפני שנרשמת
                במערכת. האם תרצה לקשר אותם לחשבון שלך?
              </Typography>
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <List>
              {pendingTrips.map((trip) => (
                <Box key={trip.tripId}>
                  <ListItem
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 2,
                      mb: 2,
                      bgcolor: selectedTripIds.includes(trip.tripId)
                        ? 'action.selected'
                        : 'background.paper',
                    }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedTripIds.includes(trip.tripId)}
                        onChange={() => handleToggleTrip(trip.tripId)}
                        disabled={linking}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography variant="subtitle1" fontWeight={600}>
                            {trip.tripTitle}
                          </Typography>
                          <Chip
                            label={trip.participantStatus}
                            size="small"
                            color="warning"
                          />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mb: 0.5,
                            }}
                          >
                            <Flight fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {trip.destination}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mb: 0.5,
                            }}
                          >
                            <CalendarMonth fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {new Date(trip.startDate).toLocaleDateString(
                                'he-IL'
                              )}{' '}
                              -{' '}
                              {new Date(trip.endDate).toLocaleDateString(
                                'he-IL'
                              )}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <Business fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {trip.agencyName || trip.agentName}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                  <Divider />
                </Box>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {!success && (
          <>
            <Button onClick={handleSkip} disabled={linking}>
              דלג בינתיים
            </Button>
            <Button
              variant="contained"
              onClick={handleLinkTrips}
              disabled={linking || selectedTripIds.length === 0}
              startIcon={
                linking ? <CircularProgress size={20} /> : <CheckCircle />
              }
            >
              {linking ? 'מקשר...' : `אשר ${selectedTripIds.length} טיולים`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

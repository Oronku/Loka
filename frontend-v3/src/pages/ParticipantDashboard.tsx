import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle,
  AccessTime,
  AttachMoney,
  CalendarToday,
  LocationOn,
  Description,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface ParticipantTrip {
  _id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  pricePerPerson: number;
  myParticipantData: {
    email: string;
    name: string;
    phone: string;
    status: 'invited' | 'confirmed' | 'paid' | 'cancelled';
    paidAmount: number;
    personalDocs?: any[];
  };
  agencyName?: string;
  status: string;
}

export default function ParticipantDashboard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [trips, setTrips] = useState<ParticipantTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!email) {
      setError(t('pleaseEnterEmail'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(
        `/organized-trips/participant/${email}/trips`
      );
      setTrips(response.data.trips || []);
      setSearched(true);
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorLoadingTrips'));
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'confirmed':
        return 'info';
      case 'invited':
        return 'warning';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return t('paid');
      case 'confirmed':
        return t('confirmed');
      case 'invited':
        return t('invited');
      case 'cancelled':
        return t('cancelled');
      default:
        return status;
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography
          variant="h3"
          fontWeight={700}
          gutterBottom
          textAlign="center"
        >
          האזור האישי שלי
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          textAlign="center"
          gutterBottom
        >
          צפה בטיולים שלך וניהל את הפרטים האישיים
        </Typography>

        {/* Email Search */}
        <Paper sx={{ p: 3, my: 4, maxWidth: 600, mx: 'auto' }}>
          <Typography variant="h6" gutterBottom>
            הזן את האימייל שלך
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label={t('emailAddress')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
            <Button
              variant="contained"
              onClick={handleSearch}
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              {loading ? <CircularProgress size={24} /> : t('search')}
            </Button>
          </Box>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Paper>

        {/* Results */}
        {searched && !loading && (
          <Box>
            {trips.length === 0 ? (
              <Alert severity="info">
                {t('noTripsFoundForEmail')}
              </Alert>
            ) : (
              <>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  הטיולים שלי ({trips.length})
                </Typography>
                <Grid container spacing={3}>
                  {trips.map((trip) => (
                    <Grid item xs={12} md={6} key={trip._id}>
                      <Card>
                        <CardContent>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'start',
                              mb: 2,
                            }}
                          >
                            <Typography variant="h6" fontWeight={700}>
                              {trip.title}
                            </Typography>
                            <Chip
                              label={getStatusText(
                                trip.myParticipantData.status
                              )}
                              color={
                                getStatusColor(
                                  trip.myParticipantData.status
                                ) as any
                              }
                              size="small"
                            />
                          </Box>

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 1,
                            }}
                          >
                            <LocationOn fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {trip.destination}
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 2,
                            }}
                          >
                            <CalendarToday fontSize="small" color="action" />
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

                          <Divider sx={{ my: 2 }} />

                          {/* Payment Status */}
                          <Box sx={{ mb: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                mb: 1,
                              }}
                            >
                              <Typography variant="body2" fontWeight={600}>
                                סטטוס תשלום
                              </Typography>
                              <Typography
                                variant="body2"
                                color="primary"
                                fontWeight={700}
                              >
                                ₪
                                {trip.myParticipantData.paidAmount.toLocaleString()}{' '}
                                / ₪{trip.pricePerPerson.toLocaleString()}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={
                                (trip.myParticipantData.paidAmount /
                                  trip.pricePerPerson) *
                                100
                              }
                              sx={{ height: 8, borderRadius: 1 }}
                            />
                          </Box>

                          {/* Actions */}
                          <Box
                            sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Description />}
                              onClick={() =>
                                navigate(`/organized-trips/${trip._id}`)
                              }
                            >
                              פרטי הטיול
                            </Button>
                            {trip.myParticipantData.status !== 'cancelled' && (
                              <Button
                                size="small"
                                variant="contained"
                                disabled={
                                  trip.myParticipantData.paidAmount >=
                                  trip.pricePerPerson
                                }
                              >
                                {trip.myParticipantData.paidAmount >=
                                trip.pricePerPerson
                                  ? t('paidInFull')
                                  : t('makePayment')}
                              </Button>
                            )}
                          </Box>

                          {trip.agencyName && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 2 }}
                            >
                              מאורגן על ידי: {trip.agencyName}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}
          </Box>
        )}
      </Box>
    </Container>
  );
}

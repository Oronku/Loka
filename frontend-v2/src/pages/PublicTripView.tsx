import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Card,
  CardContent,
} from '@mui/material';
import {
  ArrowBack,
  LocationOn,
  CalendarToday,
  People,
  AttachMoney,
  CheckCircle,
  Cancel,
  Share,
  Email,
  Phone,
  WhatsApp,
} from '@mui/icons-material';
import { api } from '../services/api';

interface PublicTrip {
  _id: string;
  title: string;
  destination: string;
  description: string;
  startDate: string;
  endDate: string;
  duration: number;
  pricePerPerson: number;
  currency: string;
  maxParticipants: number;
  participantCount: number;
  availableSpots: number;
  coverImage?: string;
  gallery?: string[];
  agencyName?: string;
  agentName: string;
  includedServices: string[];
  notIncludedServices: string[];
  meetingPoint?: string;
  importantNotes?: string;
  status: string;
  itinerary?: any[];
}

export default function PublicTripView() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [success, setSuccess] = useState(false);

  // Registration form
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  useEffect(() => {
    loadTrip();
  }, [tripId]);

  const loadTrip = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/organized-trips/${tripId}`);
      setTrip(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בטעינת פרטי הטיול');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!formData.name || !formData.email || !formData.phone) {
      setError('נא למלא את כל השדות החובה');
      return;
    }

    try {
      await api.post(`/organized-trips/${tripId}/register`, formData);
      setSuccess(true);
      setRegisterDialogOpen(false);
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בשליחת הבקשה');
    }
  };

  const handleShare = (platform: 'whatsapp' | 'email') => {
    const url = window.location.href;
    const text = `בואו לטיול מדהים! ${trip?.title} ל${trip?.destination}`;

    if (platform === 'whatsapp') {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
        '_blank'
      );
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent(
        trip?.title || ''
      )}&body=${encodeURIComponent(text + '\n\n' + url)}`;
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error && !trip) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">{error}</Alert>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/trips')}
            sx={{ mt: 2 }}
          >
            חזרה לטיולים
          </Button>
        </Box>
      </Container>
    );
  }

  if (!trip) return null;

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Back Button */}
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/trips')}
          sx={{ mb: 3 }}
        >
          חזרה לטיולים
        </Button>

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            הבקשה נשלחה בהצלחה! נציג מהסוכנות יצור איתך קשר בקרוב.
          </Alert>
        )}

        {/* Hero Section */}
        <Paper sx={{ overflow: 'hidden', mb: 3 }}>
          {trip.coverImage ? (
            <Box
              component="img"
              src={trip.coverImage}
              alt={trip.title}
              sx={{ width: '100%', height: 400, objectFit: 'cover' }}
            />
          ) : (
            <Box
              sx={{
                height: 400,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LocationOn sx={{ fontSize: 120, color: 'white' }} />
            </Box>
          )}
        </Paper>

        <Grid container spacing={3}>
          {/* Main Content */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h3" fontWeight={700} gutterBottom>
                {trip.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Chip icon={<LocationOn />} label={trip.destination} />
                <Chip
                  icon={<CalendarToday />}
                  label={`${new Date(trip.startDate).toLocaleDateString(
                    'he-IL'
                  )} - ${trip.duration} ימים`}
                />
                <Chip
                  icon={<People />}
                  label={`${trip.availableSpots} מקומות פנויים`}
                  color={trip.availableSpots > 5 ? 'success' : 'warning'}
                />
                {trip.status === 'full' && <Chip label="מלא" color="error" />}
              </Box>
              {trip.agencyName && (
                <Typography
                  variant="subtitle1"
                  color="text.secondary"
                  gutterBottom
                >
                  מאורגן על ידי: {trip.agencyName}
                </Typography>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="body1" paragraph>
                {trip.description}
              </Typography>
            </Paper>

            {/* Services */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                מה כלול בטיול?
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="h6"
                    color="success.main"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <CheckCircle /> כלול במחיר
                  </Typography>
                  <List dense>
                    {trip.includedServices.map((service, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <CheckCircle color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={service} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography
                    variant="h6"
                    color="error.main"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Cancel /> לא כלול במחיר
                  </Typography>
                  <List dense>
                    {trip.notIncludedServices.map((service, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <Cancel color="error" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={service} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </Paper>

            {/* Important Notes */}
            {trip.importantNotes && (
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  מידע חשוב
                </Typography>
                <Alert severity="info">{trip.importantNotes}</Alert>
              </Paper>
            )}

            {/* Meeting Point */}
            {trip.meetingPoint && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  נקודת מפגש
                </Typography>
                <Typography variant="body1">{trip.meetingPoint}</Typography>
              </Paper>
            )}
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} md={4}>
            {/* Price & Register Card */}
            <Card sx={{ position: 'sticky', top: 20, mb: 3 }}>
              <CardContent>
                <Typography
                  variant="h4"
                  color="primary"
                  fontWeight={700}
                  gutterBottom
                >
                  ₪{trip.pricePerPerson.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  למשתתף
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    תאריכים
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {new Date(trip.startDate).toLocaleDateString('he-IL')} -{' '}
                    {new Date(trip.endDate).toLocaleDateString('he-IL')}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    משך
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {trip.duration} ימים
                  </Typography>
                </Box>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    מקומות פנויים
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {trip.availableSpots} מתוך {trip.maxParticipants}
                  </Typography>
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={() => setRegisterDialogOpen(true)}
                  disabled={trip.status === 'full' || trip.availableSpots === 0}
                >
                  {trip.status === 'full' ? 'הטיול מלא' : 'אני רוצה להירשם!'}
                </Button>
              </CardContent>
            </Card>

            {/* Share Card */}
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  שתפו עם חברים
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                  <Button
                    startIcon={<WhatsApp />}
                    variant="outlined"
                    fullWidth
                    onClick={() => handleShare('whatsapp')}
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    שתף ב-WhatsApp
                  </Button>
                  <Button
                    startIcon={<Email />}
                    variant="outlined"
                    fullWidth
                    onClick={() => handleShare('email')}
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    שלח במייל
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Registration Dialog */}
        <Dialog
          open={registerDialogOpen}
          onClose={() => setRegisterDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>הרשמה לטיול - {trip.title}</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="שם מלא *"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="אימייל *"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="טלפון *"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="הודעה (אופציונלי)"
                multiline
                rows={3}
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                placeholder="יש לכם שאלות או בקשות מיוחדות?"
              />
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRegisterDialogOpen(false)}>ביטול</Button>
            <Button variant="contained" onClick={handleRegister}>
              שלח בקשה
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}

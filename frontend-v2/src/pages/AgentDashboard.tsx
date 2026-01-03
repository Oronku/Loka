import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  Paper,
  Alert,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  CircularProgress,
  CardActions,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AddCircle as AddIcon,
  People as PeopleIcon,
  Flight as FlightIcon,
  CardTravel as TripIcon,
  TrendingUp,
  AttachMoney,
  EventAvailable,
  Edit,
  Visibility,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getAgentStats, getAgentTrips } from '../services/organizedTripsApi';
import { OrganizedTrip } from '../types/organizedTrip';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`agent-tabpanel-${index}`}
      aria-labelledby={`agent-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    activeTrips: 0,
    totalParticipants: 0,
    upcomingDepartures: 0,
    revenue: 0,
  });
  const [trips, setTrips] = useState<OrganizedTrip[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, tripsData] = await Promise.all([
        getAgentStats(),
        getAgentTrips(),
      ]);
      setStats(statsData);
      setTrips(tripsData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateTrip = () => {
    navigate('/agent/trips/new');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'success';
      case 'draft':
        return 'warning';
      case 'cancelled':
        return 'error';
      case 'completed':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'published':
        return 'פורסם';
      case 'draft':
        return 'טיוטה';
      case 'cancelled':
        return 'בוטל';
      case 'completed':
        return 'הסתיים';
      default:
        return status;
    }
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                <DashboardIcon
                  sx={{ fontSize: 40, mr: 2, verticalAlign: 'middle' }}
                />
                Agent Dashboard
              </Typography>
              <Typography variant="body1" color="text.secondary">
                שלום {user?.name} | {user?.agencyName || 'סוכנות נסיעות'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreateTrip}
            >
              יצירת טיול מאורגן
            </Button>
          </Box>
        </Box>

        {/* Welcome Notice */}
        <Alert severity="info" sx={{ mb: 3 }}>
          👋 ברוכים הבאים לפאנל ניהול הטיולים המאורגנים שלך
        </Alert>

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <TripIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.activeTrips}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      טיולים פעילים
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                    <PeopleIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.totalParticipants}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      משתתפים כולל
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                    <EventAvailable />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.upcomingDepartures}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      יציאות קרובות
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                    <AttachMoney />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      ₪{stats.revenue.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      הכנסות חודש זה
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Tab icon={<DashboardIcon />} label="סקירה" iconPosition="start" />
            <Tab icon={<TripIcon />} label="הטיולים שלי" iconPosition="start" />
            <Tab icon={<PeopleIcon />} label="משתתפים" iconPosition="start" />
            <Tab
              icon={<TrendingUp />}
              label="סטטיסטיקות"
              iconPosition="start"
            />
          </Tabs>

          {/* Tab Panels */}
          <TabPanel value={tabValue} index={0}>
            <Box>
              <Typography variant="h6" gutterBottom>
                טיולים קרובים
              </Typography>
              {loading ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    py: 4,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : trips.filter((t) => t.status === 'published').length > 0 ? (
                <Grid container spacing={2}>
                  {trips
                    .filter((t) => t.status === 'published')
                    .slice(0, 4)
                    .map((trip) => (
                      <Grid item xs={12} md={6} key={trip._id}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              {trip.title}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              gutterBottom
                            >
                              📍 {trip.destination}
                            </Typography>
                            <Box
                              sx={{
                                display: 'flex',
                                gap: 1,
                                mt: 2,
                                mb: 1,
                              }}
                            >
                              <Chip
                                label={`${trip.currentParticipants}/${trip.maxParticipants} משתתפים`}
                                size="small"
                              />
                              <Chip
                                label={`₪${trip.pricePerPerson.toLocaleString()}`}
                                color="primary"
                                size="small"
                              />
                            </Box>
                          </CardContent>
                          <CardActions>
                            <Button
                              size="small"
                              startIcon={<Visibility />}
                              onClick={() =>
                                navigate(`/agent/trips/${trip._id}`)
                              }
                            >
                              צפה
                            </Button>
                            <Button
                              size="small"
                              startIcon={<Edit />}
                              onClick={() =>
                                navigate(`/agent/trips/${trip._id}`)
                              }
                            >
                              ערוך
                            </Button>
                          </CardActions>
                        </Card>
                      </Grid>
                    ))}
                </Grid>
              ) : (
                <Alert severity="info">אין טיולים פורסמו עדיין</Alert>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box>
              <Typography variant="h6" gutterBottom>
                כל הטיולים המאורגנים
              </Typography>
              {loading ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    py: 4,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : trips.length > 0 ? (
                <Grid container spacing={2}>
                  {trips.map((trip) => (
                    <Grid item xs={12} md={6} lg={4} key={trip._id}>
                      <Card>
                        <CardContent>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'start',
                              mb: 1,
                            }}
                          >
                            <Typography variant="h6">{trip.title}</Typography>
                            <Chip
                              label={getStatusText(trip.status)}
                              color={getStatusColor(trip.status) as any}
                              size="small"
                            />
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            gutterBottom
                          >
                            📍 {trip.destination}
                          </Typography>
                          <Typography variant="body2" gutterBottom>
                            📅{' '}
                            {new Date(trip.startDate).toLocaleDateString(
                              'he-IL'
                            )}{' '}
                            -{' '}
                            {new Date(trip.endDate).toLocaleDateString('he-IL')}
                          </Typography>
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 1,
                              mt: 2,
                            }}
                          >
                            <Chip
                              label={`${trip.currentParticipants}/${trip.maxParticipants}`}
                              size="small"
                              icon={<PeopleIcon />}
                            />
                            <Chip
                              label={`₪${trip.pricePerPerson.toLocaleString()}`}
                              color="primary"
                              size="small"
                              icon={<AttachMoney />}
                            />
                          </Box>
                        </CardContent>
                        <CardActions>
                          <Button
                            size="small"
                            startIcon={<Visibility />}
                            onClick={() => navigate(`/agent/trips/${trip._id}`)}
                          >
                            צפה
                          </Button>
                          <Button
                            size="small"
                            startIcon={<Edit />}
                            onClick={() => navigate(`/agent/trips/${trip._id}`)}
                          >
                            ערוך
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Alert severity="info">
                  עדיין לא יצרת טיולים. התחל על ידי לחיצה על "צור טיול מאורגן"
                </Alert>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                ניהול משתתפים
              </Typography>
              <Alert severity="info">
                בקרוב: רשימת כל המשתתפים בטיולים שלך
              </Alert>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Box>
              <Typography variant="h6" gutterBottom>
                סטטיסטיקות מתקדמות
              </Typography>
              <Alert severity="info">בקרוב: דוחות ותובנות על הטיולים שלך</Alert>
            </Box>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

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
  AddCircleOutline as AddIcon,
  People as PeopleIcon,
  FlightTakeoff as FlightIcon,
  Luggage as TripIcon,
  TrendingUp,
  AttachMoney,
  EventAvailable,
  Edit,
  Visibility,
  Analytics,
  BusinessCenter,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getAgentStats, getAgentTrips } from '../services/organizedTripsApi';
import { OrganizedTrip } from '../types/organizedTrip';
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();
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
      setError(err.response?.data?.message || t('errorLoadingData'));
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateTrip = () => {
    navigate('/agency/trips/new');
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
        return t('published');
      case 'draft':
        return t('draft');
      case 'cancelled':
        return t('cancelled');
      case 'completed':
        return t('completed');
      default:
        return status;
    }
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        {/* Header */}
        <Box sx={{ mb: { xs: 3, md: 4 } }}>
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
                {t('agentDashboard')}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {t('hello')} {user?.name} | {user?.agencyName || t('travelAgencyName')}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreateTrip}
            >
              {t('createOrganizedTrip')}
            </Button>
          </Box>
        </Box>

        {/* Welcome Notice */}
        <Alert severity="info" sx={{ mb: 3 }}>
          👋 {t('welcomeToAgentPanel')}
        </Alert>

        {/* Statistics Cards */}
        <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mb: { xs: 3, md: 4 } }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 20px 40px rgba(14, 165, 233, 0.15)',
                  borderColor: 'primary.main',
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: 'primary.main', 
                      mr: 2,
                      width: 56,
                      height: 56,
                      background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
                      boxShadow: '0 8px 16px rgba(14, 165, 233, 0.3)',
                    }}
                  >
                    <TripIcon sx={{ fontSize: 28 }} />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
                      {stats.activeTrips}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t('activeTrips')}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 20px 40px rgba(16, 185, 129, 0.15)',
                  borderColor: 'success.main',
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: 'success.main', 
                      mr: 2,
                      width: 56,
                      height: 56,
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      boxShadow: '0 8px 16px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <PeopleIcon sx={{ fontSize: 28 }} />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
                      {stats.totalParticipants}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t('totalParticipants')}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 20px 40px rgba(245, 158, 11, 0.15)',
                  borderColor: 'warning.main',
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: 'warning.main', 
                      mr: 2,
                      width: 56,
                      height: 56,
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                      boxShadow: '0 8px 16px rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <EventAvailable sx={{ fontSize: 28 }} />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
                      {stats.upcomingDepartures}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t('upcomingDepartures')}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ 
                height: '100%',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 20px 40px rgba(59, 130, 246, 0.15)',
                  borderColor: 'info.main',
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: 'info.main', 
                      mr: 2,
                      width: 56,
                      height: 56,
                      background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                      boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    <AttachMoney sx={{ fontSize: 28 }} />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
                      ₪{stats.revenue.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {t('monthlyRevenue')}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper 
          sx={{ 
            borderRadius: 3, 
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          }}
        >
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 600,
                minHeight: 64,
                px: 3,
                transition: 'all 0.3s ease',
                '&.Mui-selected': {
                  color: 'primary.main',
                  fontWeight: 700,
                },
              },
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                background: 'linear-gradient(90deg, #0EA5E9 0%, #3B82F6 100%)',
              },
            }}
          >
            <Tab icon={<TripIcon />} label={t('myTrips')} iconPosition="start" />
            <Tab icon={<PeopleIcon />} label={t('participants')} iconPosition="start" />
            <Tab
              icon={<Analytics />}
              label={t('statistics')}
              iconPosition="start"
            />
          </Tabs>

          {/* Tab Panels */}
          <TabPanel value={tabValue} index={0}>
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
                              label={
                                trip.visibility === 'public'
                                  ? `🌐 ${t('public')}`
                                  : trip.visibility === 'private'
                                    ? `🔗 ${t('private')}`
                                    : `📝 ${t('draft')}`
                              }
                              size="small"
                              variant="outlined"
                              color={
                                trip.visibility === 'public'
                                  ? 'success'
                                  : 'default'
                              }
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
                  {t('noTripsCreated')}
                </Alert>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box>
              <Typography variant="h6" gutterBottom>
                {t('participants')}
              </Typography>
              <Alert severity="info">
                {t('comingSoon')}: {t('allParticipantsInYourTrips')}
              </Alert>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                {t('statistics')}
              </Typography>
              <Alert severity="info">{t('comingSoon')}: {t('reportsAndInsights')}</Alert>
            </Box>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

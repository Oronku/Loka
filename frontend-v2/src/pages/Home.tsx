import { useEffect, useState } from 'react';
import { listTrips } from '../services/api';
import { Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Container,
  Paper,
  Fade,
  Skeleton,
  Dialog,
} from '@mui/material';
import {
  Add,
  CalendarMonth,
  Flight,
  TravelExplore,
  Hotel,
  Attractions,
  Visibility as VisibilityIcon,
  BarChart,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';
import NewTripWizard from './NewTripWizard';
import TripStatistics from '../components/TripStatistics';
import { Tabs, Tab } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';

export default function Home() {
  const { t } = useLanguage();
  const [openNew, setOpenNew] = useState(false);
  const [trips, setTrips] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    listTrips()
      .then((data) => {
        // Ensure data is an array
        if (Array.isArray(data)) {
          setTrips(data);
        } else {
          console.error('listTrips returned non-array:', data);
          setTrips([]);
          setError('Invalid data received from server');
        }
      })
      .catch((e) => {
        console.error('Error loading trips:', e);
        setError(e.message);
        setTrips([]); // Set to empty array on error
      });
  }, []);

  const ownedTrips = trips?.filter((t) => t.isOwner) || [];
  const sharedTrips = trips?.filter((t) => t.isShared) || [];

  return (
    <Box>
      {/* Hero Section */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'transparent',
          color: 'white',
          borderRadius: 4,
          mb: 6,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0, 157, 133, 0.15)',
        }}
      >
        <Box
          sx={{
            background:
              'linear-gradient(135deg, #009D85 0%, #00BFA5 50%, #00E5FF 100%)',
            py: { xs: 6, md: 10 },
            px: { xs: 3, md: 6 },
            position: 'relative',
          }}
        >
          {/* Decorative circles */}
          <Box
            sx={{
              position: 'absolute',
              top: -100,
              right: -100,
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: -50,
              left: -50,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
            }}
          />

          <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
            <Stack spacing={4} alignItems="center" textAlign="center">
              <Box
                sx={{
                  p: 2,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  display: 'inline-flex',
                }}
              >
                <TravelExplore
                  sx={{ fontSize: { xs: 40, md: 56 }, color: 'white' }}
                />
              </Box>

              <Typography
                variant="h1"
                component="h1"
                sx={{
                  fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem' },
                  textShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  lineHeight: 1.1,
                }}
              >
                {t('planYourNextTrip')}
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  opacity: 0.95,
                  maxWidth: 700,
                  fontWeight: 500,
                  lineHeight: 1.6,
                }}
              >
                {t('organizeEverything')}
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<Add />}
                onClick={() => setOpenNew(true)}
                sx={{
                  bgcolor: '#FF7D54', // Coral accent
                  color: 'white',
                  mt: 2,
                  px: { xs: 3, sm: 4 },
                  py: { xs: 1.25, sm: 1.5 },
                  fontSize: { xs: '1rem', sm: '1.1rem' },
                  fontWeight: 800,
                  boxShadow: '0 8px 20px rgba(255, 125, 84, 0.3)',
                  '&:hover': {
                    bgcolor: '#FF6B3D',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 12px 24px rgba(255, 125, 84, 0.4)',
                  },
                  transition: 'all 0.3s ease',
                  width: { xs: '100%', sm: 'auto' },
                  gap: 1,
                  '& .MuiButton-startIcon': {
                    marginRight: 0,
                    marginLeft: 0,
                  },
                }}
              >
                {t('createNewTrip')}
              </Button>
            </Stack>
          </Container>
        </Box>
      </Paper>

      {/* New Trip Dialog (full-screen) to avoid layout reflow when opening wizard */}
      <Dialog fullScreen open={openNew} onClose={() => setOpenNew(false)}>
        <Container maxWidth="md" sx={{ py: 4 }}>
          {/* Lazy-load the wizard inside the dialog to keep route behavior intact */}
          <NewTripWizard />
        </Container>
      </Dialog>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab
            icon={<DashboardIcon />}
            label={t('myTrips')}
            iconPosition="start"
          />
          <Tab
            icon={<BarChart />}
            label={t('statistics')}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {activeTab === 1 && <TripStatistics trips={trips || []} />}

      {activeTab === 0 && (
        <Box>
          {/* Owned Trips Section Header */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
            mb={3}
          >
            <Typography variant="h5" component="h2" fontWeight={700}>
              {t('myTrips')} {trips && `(${ownedTrips.length})`}
            </Typography>
            <Button
              variant="contained"
              size="medium"
              startIcon={<Add />}
              onClick={() => setOpenNew(true)}
              sx={{
                background: 'linear-gradient(45deg, #009D85, #00BFA5)',
                boxShadow: '0 4px 12px rgba(0, 157, 133, 0.3)',
                gap: 1,
                '& .MuiButton-startIcon': {
                  marginRight: 0,
                  marginLeft: 0,
                },
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(0, 157, 133, 0.4)',
                },
              }}
            >
              {t('newTrip')}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {!trips && !error && (
            <Grid container spacing={3}>
              {[1, 2, 3].map((n) => (
                <Grid item xs={12} sm={6} md={4} key={n}>
                  <Card>
                    <CardContent>
                      <Skeleton variant="text" width="60%" height={32} />
                      <Skeleton
                        variant="text"
                        width="80%"
                        height={24}
                        sx={{ mt: 2 }}
                      />
                      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Skeleton variant="rounded" width={80} height={24} />
                        <Skeleton variant="rounded" width={80} height={24} />
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {trips && ownedTrips.length === 0 && sharedTrips.length === 0 && (
            <Fade in timeout={800}>
              <Card
                elevation={0}
                sx={{
                  textAlign: 'center',
                  py: 8,
                  bgcolor: 'grey.50',
                  border: '2px dashed',
                  borderColor: 'grey.300',
                }}
              >
                <CardContent>
                  <Flight
                    sx={{
                      fontSize: 72,
                      color: 'primary.main',
                      mb: 2,
                      opacity: 0.7,
                    }}
                  />
                  <Typography variant="h5" fontWeight={600} gutterBottom>
                    {t('noTripsYet')}
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ mb: 4 }}
                  >
                    {t('startPlanningFirstTrip')}
                  </Typography>
                  <Button
                    component={Link}
                    to="/trip/new"
                    variant="contained"
                    size="large"
                    startIcon={<Add />}
                    sx={{
                      gap: 1,
                      '& .MuiButton-startIcon': {
                        marginRight: 0,
                        marginLeft: 0,
                      },
                    }}
                  >
                    {t('createNewTrip')}
                  </Button>
                </CardContent>
              </Card>
            </Fade>
          )}

          {/* Owned Trips Grid */}
          <Grid container spacing={3}>
            {ownedTrips.map((trip, index) => (
              <Grid item xs={12} sm={6} md={4} key={trip.id || index}>
                <Fade in timeout={500 + index * 100}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        transform: 'translateY(-8px)',
                        boxShadow: '0 12px 30px rgba(0, 157, 133, 0.15)',
                        '& .card-header-bg': {
                          transform: 'scale(1.05)',
                        },
                      },
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <Box
                      className="card-header-bg"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 6,
                        background: 'linear-gradient(90deg, #009D85, #00E5FF)',
                        transition: 'transform 0.3s ease',
                        transformOrigin: 'top',
                      }}
                    />
                    <CardActionArea
                      component={Link}
                      to={`/trips/${trip.id}`}
                      sx={{ height: '100%', pt: 1 }}
                    >
                      <CardContent
                        sx={{
                          p: 3,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <Typography
                          variant="h6"
                          fontWeight={800}
                          gutterBottom
                          sx={{ mb: 1 }}
                        >
                          {trip.name || 'Untitled Trip'}
                        </Typography>

                        {trip.startDate && trip.endDate && (
                          <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{ mb: 3, color: 'text.secondary' }}
                          >
                            <Box
                              sx={{
                                p: 0.5,
                                borderRadius: 1,
                                bgcolor: 'primary.50',
                                color: 'primary.main',
                                display: 'flex',
                              }}
                            >
                              <CalendarMonth fontSize="small" />
                            </Box>
                            <Typography variant="body2" fontWeight={600}>
                              {new Date(trip.startDate).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                }
                              )}
                              {' - '}
                              {new Date(trip.endDate).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                }
                              )}
                            </Typography>
                          </Stack>
                        )}

                        <Box sx={{ mt: 'auto' }}>
                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            gap={1}
                          >
                            {trip.flights?.length > 0 && (
                              <Chip
                                size="small"
                                icon={<Flight sx={{ fontSize: 14 }} />}
                                label={`${trip.flights.length} ${t('flightsCount')}`}
                                sx={{
                                  bgcolor: 'primary.50',
                                  color: 'primary.dark',
                                  borderColor: 'transparent',
                                }}
                              />
                            )}
                            {trip.hotels?.length > 0 && (
                              <Chip
                                size="small"
                                icon={<Hotel sx={{ fontSize: 14 }} />}
                                label={`${trip.hotels.length} ${t('hotelsCount')}`}
                                sx={{
                                  bgcolor: 'secondary.50',
                                  color: 'secondary.dark',
                                  borderColor: 'transparent',
                                }}
                              />
                            )}
                            {trip.attractions?.length > 0 && (
                              <Chip
                                size="small"
                                icon={<Attractions sx={{ fontSize: 14 }} />}
                                label={`${trip.attractions.length} ${t('activitiesCount')}`}
                                sx={{
                                  bgcolor: 'success.50',
                                  color: 'success.dark',
                                  borderColor: 'transparent',
                                }}
                              />
                            )}
                          </Stack>
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Fade>
              </Grid>
            ))}
          </Grid>

          {/* Shared Trips Section */}
          {sharedTrips.length > 0 && (
            <Box sx={{ mt: 6 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={2}
                mb={3}
              >
                <Box
                  display="flex"
                  alignItems="center"
                  gap={2}
                  flexWrap="wrap"
                  width="100%"
                >
                  <Typography variant="h5" component="h2" fontWeight={600}>
                    {t('sharedWithYou')}
                  </Typography>
                  <Chip
                    icon={<VisibilityIcon />}
                    label={t('viewOnly')}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {sharedTrips.length}{' '}
                  {sharedTrips.length === 1 ? t('trip') : t('tripsCount')}
                </Typography>
              </Stack>

              <Grid container spacing={3}>
                {sharedTrips.map((trip, index) => (
                  <Grid item xs={12} sm={6} md={4} key={trip.id || index}>
                    <Fade in timeout={500 + index * 100}>
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                          overflow: 'hidden',
                          '&:hover': {
                            transform: 'translateY(-8px)',
                            boxShadow: '0 12px 30px rgba(2, 136, 209, 0.15)',
                            '& .card-header-bg-shared': {
                              transform: 'scale(1.05)',
                            },
                          },
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <Box
                          className="card-header-bg-shared"
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 6,
                            background:
                              'linear-gradient(90deg, #0288d1, #29b6f6)',
                            transition: 'transform 0.3s ease',
                            transformOrigin: 'top',
                          }}
                        />
                        <CardActionArea
                          component={Link}
                          to={`/trips/${trip.id}`}
                          sx={{ height: '100%', pt: 1 }}
                        >
                          <CardContent
                            sx={{
                              p: 3,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="start"
                              spacing={1}
                              mb={2}
                            >
                              <Typography variant="h6" fontWeight={800}>
                                {trip.name || 'Untitled Trip'}
                              </Typography>
                              <Chip
                                icon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                                label={t('viewOnly')}
                                size="small"
                                color="info"
                                sx={{ height: 24, fontSize: '0.75rem' }}
                              />
                            </Stack>

                            {trip.startDate && trip.endDate && (
                              <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                sx={{ mb: 3, color: 'text.secondary' }}
                              >
                                <Box
                                  sx={{
                                    p: 0.5,
                                    borderRadius: 1,
                                    bgcolor: 'info.50',
                                    color: 'info.main',
                                    display: 'flex',
                                  }}
                                >
                                  <CalendarMonth fontSize="small" />
                                </Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {new Date(trip.startDate).toLocaleDateString(
                                    'en-US',
                                    { month: 'short', day: 'numeric' }
                                  )}
                                  {' - '}
                                  {new Date(trip.endDate).toLocaleDateString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    }
                                  )}
                                </Typography>
                              </Stack>
                            )}

                            <Box sx={{ mt: 'auto' }}>
                              <Stack
                                direction="row"
                                spacing={1}
                                flexWrap="wrap"
                                gap={1}
                              >
                                {trip.flights?.length > 0 && (
                                  <Chip
                                    size="small"
                                    icon={<Flight sx={{ fontSize: 14 }} />}
                                    label={`${trip.flights.length}`}
                                    sx={{
                                      bgcolor: 'primary.50',
                                      color: 'primary.dark',
                                      borderColor: 'transparent',
                                    }}
                                  />
                                )}
                                {trip.hotels?.length > 0 && (
                                  <Chip
                                    size="small"
                                    icon={<Hotel sx={{ fontSize: 14 }} />}
                                    label={`${trip.hotels.length}`}
                                    sx={{
                                      bgcolor: 'secondary.50',
                                      color: 'secondary.dark',
                                      borderColor: 'transparent',
                                    }}
                                  />
                                )}
                                {trip.attractions?.length > 0 && (
                                  <Chip
                                    size="small"
                                    icon={<Attractions sx={{ fontSize: 14 }} />}
                                    label={`${trip.attractions.length}`}
                                    sx={{
                                      bgcolor: 'success.50',
                                      color: 'success.dark',
                                      borderColor: 'transparent',
                                    }}
                                  />
                                )}
                              </Stack>
                            </Box>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    </Fade>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

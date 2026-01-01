import { useEffect, useState, useMemo } from 'react';
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
  Autocomplete,
  TextField,
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
  ViewModule,
  ViewList,
  ViewComfy,
  FilterList,
  LocationCity,
  Search,
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
  const [tripFilter, setTripFilter] = useState<
    'all' | 'upcoming' | 'ongoing' | 'past'
  >('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

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

  // Filter trips by date
  const getTripStatus = (trip: any) => {
    const now = new Date();
    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);

    if (now < startDate) return 'upcoming';
    if (now > endDate) return 'past';
    return 'ongoing';
  };

  const filterTrips = (trips: any[]) => {
    let filtered = trips;

    // Filter by status
    if (tripFilter !== 'all') {
      filtered = filtered.filter((trip) => getTripStatus(trip) === tripFilter);
    }

    // Filter by city
    if (selectedCity) {
      filtered = filtered.filter((trip) => {
        if (!trip.destinations) return false;
        return trip.destinations.some((dest: any) => {
          if (typeof dest === 'string') {
            return dest.toLowerCase().includes(selectedCity.toLowerCase());
          }
          return dest.name?.toLowerCase().includes(selectedCity.toLowerCase());
        });
      });
    }

    return filtered;
  };

  // Sort trips by date
  const sortTrips = (trips: any[]) => {
    return [...trips].sort((a, b) => {
      const now = new Date();
      const aStatus = getTripStatus(a);
      const bStatus = getTripStatus(b);
      const aStart = new Date(a.startDate);
      const bStart = new Date(b.startDate);
      const aEnd = new Date(a.endDate);
      const bEnd = new Date(b.endDate);

      // Priority: ongoing > upcoming > past
      const statusPriority = { ongoing: 0, upcoming: 1, past: 2 };
      const aPriority = statusPriority[aStatus];
      const bPriority = statusPriority[bStatus];

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Within same status, sort by date
      if (aStatus === 'upcoming') {
        // Upcoming: closest first (ascending start date)
        return aStart.getTime() - bStart.getTime();
      } else if (aStatus === 'past') {
        // Past: most recent first (descending end date)
        return bEnd.getTime() - aEnd.getTime();
      } else {
        // Ongoing: earliest start date first
        return aStart.getTime() - bStart.getTime();
      }
    });
  };

  const ownedTrips = trips?.filter((t) => t.isOwner) || [];
  const sharedTrips = trips?.filter((t) => t.isShared) || [];

  const filteredOwnedTrips = sortTrips(filterTrips(ownedTrips));
  const filteredSharedTrips = sortTrips(filterTrips(sharedTrips));

  // Get unique cities from all trips
  const allCities = useMemo(() => {
    const cities = new Set<string>();
    trips?.forEach((trip) => {
      trip.destinations?.forEach((dest: any) => {
        const cityName = typeof dest === 'string' ? dest : dest.name;
        if (cityName) cities.add(cityName);
      });
    });
    return Array.from(cities).sort();
  }, [trips]);

  // Count trips by status
  const upcomingCount = ownedTrips.filter(
    (t) => getTripStatus(t) === 'upcoming'
  ).length;
  const ongoingCount = ownedTrips.filter(
    (t) => getTripStatus(t) === 'ongoing'
  ).length;
  const pastCount = ownedTrips.filter(
    (t) => getTripStatus(t) === 'past'
  ).length;

  return (
    <Box>
      {/* Hero Section - Clean Professional Design */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 3,
          mb: 6,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            background: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
            py: { xs: 8, md: 12 },
            px: { xs: 3, md: 6 },
            position: 'relative',
          }}
        >
          {/* Subtle decorative pattern */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.05,
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />

          <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
            <Stack spacing={3} alignItems="center" textAlign="center">
              <Box
                sx={{
                  display: 'inline-flex',
                  p: 2.5,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <TravelExplore
                  sx={{ fontSize: { xs: 48, md: 64 }, color: 'white' }}
                />
              </Box>

              <Typography
                variant="h1"
                component="h1"
                sx={{
                  fontSize: { xs: '2.25rem', sm: '3rem', md: '3.75rem' },
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('planYourNextTrip')}
              </Typography>

              <Typography
                variant="h6"
                sx={{
                  color: 'rgba(255,255,255,0.95)',
                  maxWidth: 600,
                  fontWeight: 400,
                  lineHeight: 1.7,
                  fontSize: { xs: '1rem', sm: '1.125rem' },
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
                  bgcolor: 'white',
                  color: 'primary.main',
                  mt: 2,
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                  '&:hover': {
                    bgcolor: 'grey.50',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
                  },
                  transition: 'all 0.2s ease',
                  borderRadius: 2,
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
      <Box sx={{ mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: '1rem',
              fontWeight: 600,
              minHeight: 56,
            },
          }}
        >
          <Tab
            icon={<DashboardIcon />}
            label={t('myTrips')}
            iconPosition="start"
            sx={{ gap: 1 }}
          />
          <Tab
            icon={<BarChart />}
            label={t('statistics')}
            iconPosition="start"
            sx={{ gap: 1 }}
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
            mb={4}
          >
            <Box>
              <Typography
                variant="h5"
                component="h2"
                fontWeight={600}
                gutterBottom
              >
                {t('myTrips')}
              </Typography>
              {trips && (
                <Typography variant="body2" color="text.secondary">
                  {filteredOwnedTrips.length}{' '}
                  {filteredOwnedTrips.length === 1 ? 'trip' : 'trips'}
                </Typography>
              )}
            </Box>
            <Button
              variant="contained"
              size="medium"
              startIcon={<Add />}
              onClick={() => setOpenNew(true)}
              sx={{
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                },
              }}
            >
              {t('newTrip')}
            </Button>
          </Stack>

          {/* Filter Buttons and View Mode Toggle */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
            gap={2}
            flexWrap="wrap"
          >
            {/* Filter Chips */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                overflowX: 'auto',
                pb: 1,
                flex: 1,
              }}
            >
              <Chip
                label={`All (${ownedTrips.length})`}
                onClick={() => setTripFilter('all')}
                color={tripFilter === 'all' ? 'primary' : 'default'}
                variant={tripFilter === 'all' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor:
                      tripFilter === 'all' ? 'primary.main' : 'action.hover',
                  },
                }}
              />
              <Chip
                label={`Upcoming (${upcomingCount})`}
                onClick={() => setTripFilter('upcoming')}
                color={tripFilter === 'upcoming' ? 'primary' : 'default'}
                variant={tripFilter === 'upcoming' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor:
                      tripFilter === 'upcoming'
                        ? 'primary.main'
                        : 'action.hover',
                  },
                }}
              />
              <Chip
                label={`Ongoing (${ongoingCount})`}
                onClick={() => setTripFilter('ongoing')}
                color={tripFilter === 'ongoing' ? 'success' : 'default'}
                variant={tripFilter === 'ongoing' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor:
                      tripFilter === 'ongoing'
                        ? 'success.main'
                        : 'action.hover',
                  },
                }}
              />
              <Chip
                label={`Past (${pastCount})`}
                onClick={() => setTripFilter('past')}
                color={tripFilter === 'past' ? 'default' : 'default'}
                variant={tripFilter === 'past' ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: 600,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor:
                      tripFilter === 'past'
                        ? 'action.selected'
                        : 'action.hover',
                  },
                }}
              />
            </Stack>

            {/* City Filter with Search */}
            {allCities.length > 0 && (
              <Autocomplete
                size="small"
                options={allCities}
                value={selectedCity}
                onChange={(_, newValue) => setSelectedCity(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Search by city..."
                    variant="outlined"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <Search sx={{ color: 'text.secondary', mr: 1 }} />
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                sx={{
                  width: { xs: '100%', sm: 300 },
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'background.paper',
                  },
                }}
              />
            )}

            {/* View Mode Toggle */}
            <Paper
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                display: 'flex',
              }}
            >
              <Stack direction="row">
                <Button
                  size="small"
                  onClick={() => setViewMode('grid')}
                  sx={{
                    minWidth: 40,
                    px: 1.5,
                    borderRadius: 0,
                    bgcolor:
                      viewMode === 'grid' ? 'primary.main' : 'transparent',
                    color: viewMode === 'grid' ? 'white' : 'text.secondary',
                    '&:hover': {
                      bgcolor:
                        viewMode === 'grid' ? 'primary.dark' : 'action.hover',
                    },
                  }}
                >
                  <ViewModule />
                </Button>
                <Button
                  size="small"
                  onClick={() => setViewMode('list')}
                  sx={{
                    minWidth: 40,
                    px: 1.5,
                    borderRadius: 0,
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                    bgcolor:
                      viewMode === 'list' ? 'primary.main' : 'transparent',
                    color: viewMode === 'list' ? 'white' : 'text.secondary',
                    '&:hover': {
                      bgcolor:
                        viewMode === 'list' ? 'primary.dark' : 'action.hover',
                    },
                  }}
                >
                  <ViewList />
                </Button>
                <Button
                  size="small"
                  onClick={() => setViewMode('compact')}
                  sx={{
                    minWidth: 40,
                    px: 1.5,
                    borderRadius: 0,
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                    bgcolor:
                      viewMode === 'compact' ? 'primary.main' : 'transparent',
                    color: viewMode === 'compact' ? 'white' : 'text.secondary',
                    '&:hover': {
                      bgcolor:
                        viewMode === 'compact'
                          ? 'primary.dark'
                          : 'action.hover',
                    },
                  }}
                >
                  <ViewComfy />
                </Button>
              </Stack>
            </Paper>
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

          {trips &&
            filteredOwnedTrips.length === 0 &&
            filteredSharedTrips.length === 0 && (
              <Fade in timeout={800}>
                <Paper
                  elevation={0}
                  sx={{
                    textAlign: 'center',
                    py: 10,
                    px: 3,
                    bgcolor: 'grey.50',
                    border: '2px dashed',
                    borderColor: 'grey.300',
                    borderRadius: 2,
                  }}
                >
                  <Flight
                    sx={{
                      fontSize: 64,
                      color: 'primary.main',
                      mb: 3,
                      opacity: 0.6,
                    }}
                  />
                  <Typography variant="h6" gutterBottom fontWeight={600}>
                    {tripFilter === 'all'
                      ? t('noTripsYet')
                      : `No ${tripFilter} trips`}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" mb={3}>
                    {tripFilter === 'all'
                      ? t('startPlanningFirstTrip')
                      : `You don't have any ${tripFilter} trips`}
                  </Typography>
                  {tripFilter === 'all' && (
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={() => setOpenNew(true)}
                      size="large"
                    >
                      {t('createFirstTrip')}
                    </Button>
                  )}
                </Paper>
              </Fade>
            )}

          {/* Owned Trips Grid */}
          <Grid container spacing={viewMode === 'compact' ? 2 : 3}>
            {filteredOwnedTrips.map((trip, index) => (
              <Grid
                item
                xs={12}
                sm={viewMode === 'list' ? 12 : viewMode === 'compact' ? 6 : 6}
                md={viewMode === 'list' ? 12 : viewMode === 'compact' ? 4 : 4}
                lg={viewMode === 'list' ? 12 : viewMode === 'compact' ? 3 : 4}
                key={trip.id || index}
              >
                <Fade in timeout={500 + index * 100}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: viewMode === 'list' ? 'row' : 'column',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': {
                        transform:
                          viewMode !== 'compact'
                            ? 'translateY(-4px)'
                            : 'translateY(-2px)',
                        boxShadow: '0 12px 24px rgba(25, 118, 210, 0.12)',
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      component={Link}
                      to={`/trips/${trip.id}`}
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: viewMode === 'list' ? 'row' : 'column',
                        alignItems: 'stretch',
                      }}
                    >
                      <CardContent
                        sx={{
                          p: viewMode === 'compact' ? 2 : 3,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          flex: 1,
                        }}
                      >
                        {/* Header with Icon */}
                        <Stack
                          direction="row"
                          spacing={viewMode === 'compact' ? 1.5 : 2}
                          alignItems="flex-start"
                          mb={viewMode === 'compact' ? 1.5 : 2}
                        >
                          {viewMode !== 'compact' && (
                            <Box
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                bgcolor: 'primary.main',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <TravelExplore sx={{ fontSize: 24 }} />
                            </Box>
                          )}
                          <Box flex={1}>
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              mb={0.5}
                            >
                              {viewMode === 'compact' && (
                                <TravelExplore
                                  sx={{ fontSize: 20, color: 'primary.main' }}
                                />
                              )}
                              <Typography
                                variant={
                                  viewMode === 'compact' ? 'subtitle1' : 'h6'
                                }
                                fontWeight={600}
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp:
                                    viewMode === 'compact' ? 1 : 2,
                                  WebkitBoxOrient: 'vertical',
                                  flex: 1,
                                }}
                              >
                                {trip.name || 'Untitled Trip'}
                              </Typography>
                              {viewMode !== 'list' && (
                                <Chip
                                  label={
                                    getTripStatus(trip) === 'upcoming'
                                      ? 'Upcoming'
                                      : getTripStatus(trip) === 'ongoing'
                                        ? 'Ongoing'
                                        : 'Past'
                                  }
                                  size="small"
                                  color={
                                    getTripStatus(trip) === 'upcoming'
                                      ? 'primary'
                                      : getTripStatus(trip) === 'ongoing'
                                        ? 'success'
                                        : 'default'
                                  }
                                  sx={{
                                    height: 24,
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                  }}
                                />
                              )}
                            </Stack>
                          </Box>
                        </Stack>

                        {/* Date Range */}
                        {trip.startDate && trip.endDate && (
                          <Box
                            sx={{
                              mb: viewMode === 'compact' ? 1.5 : 3,
                              p: viewMode === 'compact' ? 1 : 1.5,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(25, 118, 210, 0.05)',
                              border: '1px solid',
                              borderColor: 'rgba(25, 118, 210, 0.1)',
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                            >
                              <CalendarMonth
                                sx={{
                                  fontSize: viewMode === 'compact' ? 16 : 18,
                                  color: 'primary.main',
                                }}
                              />
                              <Typography
                                variant={
                                  viewMode === 'compact' ? 'caption' : 'body2'
                                }
                                fontWeight={500}
                                color="text.primary"
                              >
                                {new Date(trip.startDate).toLocaleDateString(
                                  'en-US',
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                  }
                                )}
                                {' → '}
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
                          </Box>
                        )}

                        {/* Stats Chips */}
                        {viewMode !== 'compact' && (
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
                                  icon={<Flight sx={{ fontSize: 16 }} />}
                                  label={trip.flights.length}
                                  sx={{
                                    bgcolor: 'rgba(25, 118, 210, 0.1)',
                                    color: 'primary.main',
                                    fontWeight: 600,
                                    border: '1px solid',
                                    borderColor: 'rgba(25, 118, 210, 0.2)',
                                    '& .MuiChip-icon': {
                                      color: 'primary.main',
                                    },
                                  }}
                                />
                              )}
                              {trip.hotels?.length > 0 && (
                                <Chip
                                  size="small"
                                  icon={<Hotel sx={{ fontSize: 16 }} />}
                                  label={trip.hotels.length}
                                  sx={{
                                    bgcolor: 'rgba(66, 165, 245, 0.1)',
                                    color: 'secondary.main',
                                    fontWeight: 600,
                                    border: '1px solid',
                                    borderColor: 'rgba(66, 165, 245, 0.2)',
                                    '& .MuiChip-icon': {
                                      color: 'secondary.main',
                                    },
                                  }}
                                />
                              )}
                              {trip.attractions?.length > 0 && (
                                <Chip
                                  size="small"
                                  icon={<Attractions sx={{ fontSize: 16 }} />}
                                  label={trip.attractions.length}
                                  sx={{
                                    bgcolor: 'rgba(16, 185, 129, 0.1)',
                                    color: 'success.main',
                                    fontWeight: 600,
                                    border: '1px solid',
                                    borderColor: 'rgba(16, 185, 129, 0.2)',
                                    '& .MuiChip-icon': {
                                      color: 'success.main',
                                    },
                                  }}
                                />
                              )}
                            </Stack>
                          </Box>
                        )}

                        {/* Compact Mode - Simple Stats */}
                        {viewMode === 'compact' && (
                          <Stack
                            direction="row"
                            spacing={1.5}
                            sx={{ mt: 'auto' }}
                          >
                            {trip.flights?.length > 0 && (
                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                              >
                                <Flight
                                  sx={{ fontSize: 14, color: 'primary.main' }}
                                />
                                <Typography
                                  variant="caption"
                                  fontWeight={600}
                                  color="text.secondary"
                                >
                                  {trip.flights.length}
                                </Typography>
                              </Stack>
                            )}
                            {trip.hotels?.length > 0 && (
                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                              >
                                <Hotel
                                  sx={{
                                    fontSize: 14,
                                    color: 'secondary.main',
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  fontWeight={600}
                                  color="text.secondary"
                                >
                                  {trip.hotels.length}
                                </Typography>
                              </Stack>
                            )}
                            {trip.attractions?.length > 0 && (
                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                              >
                                <Attractions
                                  sx={{ fontSize: 14, color: 'success.main' }}
                                />
                                <Typography
                                  variant="caption"
                                  fontWeight={600}
                                  color="text.secondary"
                                >
                                  {trip.attractions.length}
                                </Typography>
                              </Stack>
                            )}
                          </Stack>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Fade>
              </Grid>
            ))}
          </Grid>

          {/* Shared Trips Section */}
          {filteredSharedTrips.length > 0 && (
            <Box sx={{ mt: 6 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={2}
                mb={4}
              >
                <Box>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    mb={0.5}
                  >
                    <Typography variant="h5" component="h2" fontWeight={600}>
                      {t('sharedWithYou')}
                    </Typography>
                    <Chip
                      icon={<VisibilityIcon />}
                      label={t('viewOnly')}
                      size="small"
                      sx={{
                        bgcolor: 'rgba(66, 165, 245, 0.1)',
                        color: 'secondary.main',
                        border: '1px solid',
                        borderColor: 'rgba(66, 165, 245, 0.2)',
                      }}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {filteredSharedTrips.length}{' '}
                    {filteredSharedTrips.length === 1 ? 'trip' : 'trips'}
                  </Typography>
                </Box>
              </Stack>

              <Grid container spacing={viewMode === 'compact' ? 2 : 3}>
                {filteredSharedTrips.map((trip, index) => (
                  <Grid
                    item
                    xs={12}
                    sm={
                      viewMode === 'list' ? 12 : viewMode === 'compact' ? 6 : 6
                    }
                    md={
                      viewMode === 'list' ? 12 : viewMode === 'compact' ? 4 : 4
                    }
                    lg={
                      viewMode === 'list' ? 12 : viewMode === 'compact' ? 3 : 4
                    }
                    key={trip.id || index}
                  >
                    <Fade in timeout={500 + index * 100}>
                      <Card
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: viewMode === 'list' ? 'row' : 'column',
                          position: 'relative',
                          transition: 'all 0.2s ease',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': {
                            transform:
                              viewMode !== 'compact'
                                ? 'translateY(-4px)'
                                : 'translateY(-2px)',
                            boxShadow: '0 12px 24px rgba(66, 165, 245, 0.12)',
                            borderColor: 'secondary.main',
                          },
                        }}
                      >
                        {/* Shared badge */}
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            zIndex: 1,
                          }}
                        >
                          <Chip
                            icon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                            label="Shared"
                            size="small"
                            sx={{
                              bgcolor: 'secondary.main',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              height: 24,
                            }}
                          />
                        </Box>

                        <CardActionArea
                          component={Link}
                          to={`/trips/${trip.id}`}
                          sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection:
                              viewMode === 'list' ? 'row' : 'column',
                            alignItems: 'stretch',
                          }}
                        >
                          <CardContent
                            sx={{
                              p: viewMode === 'compact' ? 2 : 3,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              flex: 1,
                            }}
                          >
                            {/* Header with Icon */}
                            <Stack
                              direction="row"
                              spacing={viewMode === 'compact' ? 1.5 : 2}
                              alignItems="flex-start"
                              mb={viewMode === 'compact' ? 1.5 : 2}
                            >
                              {viewMode !== 'compact' && (
                                <Box
                                  sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: 'secondary.main',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <TravelExplore sx={{ fontSize: 24 }} />
                                </Box>
                              )}
                              <Box flex={1}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  mb={0.5}
                                >
                                  {viewMode === 'compact' && (
                                    <TravelExplore
                                      sx={{
                                        fontSize: 20,
                                        color: 'secondary.main',
                                      }}
                                    />
                                  )}
                                  <Typography
                                    variant={
                                      viewMode === 'compact'
                                        ? 'subtitle1'
                                        : 'h6'
                                    }
                                    fontWeight={600}
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: '-webkit-box',
                                      WebkitLineClamp:
                                        viewMode === 'compact' ? 1 : 2,
                                      WebkitBoxOrient: 'vertical',
                                      flex: 1,
                                    }}
                                  >
                                    {trip.name || 'Untitled Trip'}
                                  </Typography>
                                  {viewMode !== 'list' && (
                                    <Chip
                                      label={
                                        getTripStatus(trip) === 'upcoming'
                                          ? 'Upcoming'
                                          : getTripStatus(trip) === 'ongoing'
                                            ? 'Ongoing'
                                            : 'Past'
                                      }
                                      size="small"
                                      color={
                                        getTripStatus(trip) === 'upcoming'
                                          ? 'primary'
                                          : getTripStatus(trip) === 'ongoing'
                                            ? 'success'
                                            : 'default'
                                      }
                                      sx={{
                                        height: 24,
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                      }}
                                    />
                                  )}
                                </Stack>
                              </Box>
                            </Stack>

                            {/* Date Range */}
                            {trip.startDate && trip.endDate && (
                              <Box
                                sx={{
                                  mb: viewMode === 'compact' ? 1.5 : 3,
                                  p: viewMode === 'compact' ? 1 : 1.5,
                                  borderRadius: 1.5,
                                  bgcolor: 'rgba(66, 165, 245, 0.05)',
                                  border: '1px solid',
                                  borderColor: 'rgba(66, 165, 245, 0.1)',
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <CalendarMonth
                                    sx={{
                                      fontSize:
                                        viewMode === 'compact' ? 16 : 18,
                                      color: 'secondary.main',
                                    }}
                                  />
                                  <Typography
                                    variant={
                                      viewMode === 'compact'
                                        ? 'caption'
                                        : 'body2'
                                    }
                                    fontWeight={500}
                                    color="text.primary"
                                  >
                                    {new Date(
                                      trip.startDate
                                    ).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                    {' → '}
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
                              </Box>
                            )}

                            {/* Stats Chips - Full Mode */}
                            {viewMode !== 'compact' && (
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
                                      icon={<Flight sx={{ fontSize: 16 }} />}
                                      label={trip.flights.length}
                                      sx={{
                                        bgcolor: 'rgba(25, 118, 210, 0.1)',
                                        color: 'primary.main',
                                        fontWeight: 600,
                                        border: '1px solid',
                                        borderColor: 'rgba(25, 118, 210, 0.2)',
                                        '& .MuiChip-icon': {
                                          color: 'primary.main',
                                        },
                                      }}
                                    />
                                  )}
                                  {trip.hotels?.length > 0 && (
                                    <Chip
                                      size="small"
                                      icon={<Hotel sx={{ fontSize: 16 }} />}
                                      label={trip.hotels.length}
                                      sx={{
                                        bgcolor: 'rgba(66, 165, 245, 0.1)',
                                        color: 'secondary.main',
                                        fontWeight: 600,
                                        border: '1px solid',
                                        borderColor: 'rgba(66, 165, 245, 0.2)',
                                        '& .MuiChip-icon': {
                                          color: 'secondary.main',
                                        },
                                      }}
                                    />
                                  )}
                                  {trip.attractions?.length > 0 && (
                                    <Chip
                                      size="small"
                                      icon={
                                        <Attractions sx={{ fontSize: 16 }} />
                                      }
                                      label={trip.attractions.length}
                                      sx={{
                                        bgcolor: 'rgba(16, 185, 129, 0.1)',
                                        color: 'success.main',
                                        fontWeight: 600,
                                        border: '1px solid',
                                        borderColor: 'rgba(16, 185, 129, 0.2)',
                                        '& .MuiChip-icon': {
                                          color: 'success.main',
                                        },
                                      }}
                                    />
                                  )}
                                </Stack>
                              </Box>
                            )}

                            {/* Stats Compact Mode */}
                            {viewMode === 'compact' && (
                              <Stack
                                direction="row"
                                spacing={1.5}
                                sx={{ mt: 'auto' }}
                              >
                                {trip.flights?.length > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                  >
                                    <Flight
                                      sx={{
                                        fontSize: 14,
                                        color: 'primary.main',
                                      }}
                                    />
                                    <Typography
                                      variant="caption"
                                      fontWeight={600}
                                      color="text.secondary"
                                    >
                                      {trip.flights.length}
                                    </Typography>
                                  </Stack>
                                )}
                                {trip.hotels?.length > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                  >
                                    <Hotel
                                      sx={{
                                        fontSize: 14,
                                        color: 'secondary.main',
                                      }}
                                    />
                                    <Typography
                                      variant="caption"
                                      fontWeight={600}
                                      color="text.secondary"
                                    >
                                      {trip.hotels.length}
                                    </Typography>
                                  </Stack>
                                )}
                                {trip.attractions?.length > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                  >
                                    <Attractions
                                      sx={{
                                        fontSize: 14,
                                        color: 'success.main',
                                      }}
                                    />
                                    <Typography
                                      variant="caption"
                                      fontWeight={600}
                                      color="text.secondary"
                                    >
                                      {trip.attractions.length}
                                    </Typography>
                                  </Stack>
                                )}
                              </Stack>
                            )}
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

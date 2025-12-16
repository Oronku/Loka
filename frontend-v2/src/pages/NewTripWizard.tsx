import { useState, useEffect } from 'react';
import { createTrip } from '../services/api';
import type { Trip } from '../types/domain';
import { useNavigate, Link } from 'react-router-dom';
import {
  AddFlightForm,
  AddHotelForm,
  AddRideForm,
  AddAttractionForm,
} from '../components/AddItemForms';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  Typography,
  Paper,
  Stack,
  Grid,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Chip,
  Alert,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowBack,
  ArrowForward,
  Check,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  DirectionsCar,
  AttractionsOutlined,
  Info,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

interface BasicInfo {
  name: string;
  destinations: string;
  startDate: string;
  endDate: string;
}

export default function NewTripWizard() {
  const { t } = useLanguage();
  const { showSuccess, showError } = useNotification();
  const [step, setStep] = useState<number>(0);
  const [basic, setBasic] = useState<BasicInfo>({
    name: '',
    destinations: '',
    startDate: '',
    endDate: '',
  });
  const [creating, setCreating] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  const steps = [
    t('stepBasicInfo'),
    t('flights'),
    t('hotels'),
    t('rides'),
    t('attractions'),
    t('stepReview'),
  ];

  // Reset wizard when component mounts (new trip creation)
  useEffect(() => {
    setStep(0);
    setBasic({ name: '', destinations: '', startDate: '', endDate: '' });
    setTrip(null);
    setCreating(false);
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  async function createBasicTrip() {
    if (!basic.name || !basic.startDate || !basic.endDate) return;
    setCreating(true);
    try {
      const newTrip = await createTrip({
        name: basic.name,
        destinations: basic.destinations
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        startDate: basic.startDate,
        endDate: basic.endDate,
        flights: [],
        hotels: [],
        rides: [],
        attractions: [],
      } as any);
      setTrip(newTrip);
      showSuccess(t('tripCreationSuccess'));
      next();
    } catch (e: any) {
      showError(e?.response?.data?.message || e.message || t('errorOccurred'));
    } finally {
      setCreating(false);
    }
  }

  const canFinish = !!trip;

  return (
    <Box
      sx={{
        maxWidth: 1000,
        mx: 'auto',
        width: '100%',
        px: { xs: 1, sm: 2, md: 0 },
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mb: 4,
          bgcolor: 'primary.main',
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={2}
          mb={2}
        >
          <Button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            startIcon={<ArrowBack />}
            sx={{
              color: 'white',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            {t('cancel')}
          </Button>
        </Stack>
        <Typography
          variant="h4"
          fontWeight={700}
          sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}
        >
          {t('createNewTripTitle')}
        </Typography>
        <Typography
          fontWeight={900}
          variant="body1"
          sx={{
            mt: 1,
            opacity: 0.9,
            fontSize: { xs: '0.95rem', sm: '1rem' },
          }}
        >
          {t('organizeEverything')}
        </Typography>
      </Paper>

      {/* Stepper */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          mb: 4,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {isSmall ? (
          <Stack direction="row" gap={1} flexWrap="wrap">
            {steps.map((label, idx) => (
              <Chip
                key={label}
                label={label}
                color={idx === step ? 'primary' : 'default'}
                variant={idx === step ? 'filled' : 'outlined'}
                size="small"
                sx={{ flexGrow: 1, minWidth: '45%' }}
              />
            ))}
          </Stack>
        ) : (
          <Stepper activeStep={step} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
      </Paper>

      {/* Step 0: Basic Info */}
      {step === 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 4 },
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" fontWeight={600} gutterBottom>
                {t('tripBasicInfo')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('tripNameHelper')}
              </Typography>
            </Box>

            <TextField
              label={t('tripName')}
              placeholder={t('tripNamePlaceholder')}
              value={basic.name}
              onChange={(e) => setBasic({ ...basic, name: e.target.value })}
              fullWidth
              required
              helperText={t('tripNameHelper')}
            />

            <TextField
              label={t('destinations')}
              placeholder="Paris, Rome, Barcelona"
              value={basic.destinations}
              onChange={(e) =>
                setBasic({ ...basic, destinations: e.target.value })
              }
              fullWidth
              helperText={t('multiCity')}
            />

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('startDate')}
                  type="date"
                  value={basic.startDate}
                  onChange={(e) =>
                    setBasic({ ...basic, startDate: e.target.value })
                  }
                  fullWidth
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('endDate')}
                  type="date"
                  value={basic.endDate}
                  onChange={(e) =>
                    setBasic({ ...basic, endDate: e.target.value })
                  }
                  fullWidth
                  required
                  InputLabelProps={{ shrink: true }}
                  error={
                    !!(
                      basic.startDate &&
                      basic.endDate &&
                      basic.endDate < basic.startDate
                    )
                  }
                  helperText={
                    basic.startDate &&
                    basic.endDate &&
                    basic.endDate < basic.startDate
                      ? t('invalidDateRange')
                      : undefined
                  }
                />
              </Grid>
            </Grid>

            <Divider />

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="flex-end"
            >
              <Button
                variant="contained"
                size="large"
                onClick={createBasicTrip}
                disabled={
                  !basic.name ||
                  !basic.startDate ||
                  !basic.endDate ||
                  creating ||
                  basic.endDate < basic.startDate
                }
                startIcon={
                  creating ? <CircularProgress size={20} /> : <Check />
                }
                fullWidth={isSmall}
              >
                {creating
                  ? t('creatingTrip')
                  : trip
                    ? `${t('update')} & ${t('continue')}`
                    : `${t('create')} & ${t('continue')}`}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {/* Flights step */}
      {step === 1 && (
        <StepCard
          title={t('addFlight')}
          subtitle={
            trip ? `${t('trip')}: ${trip.name}` : t('tripCreationSuccess')
          }
        >
          {trip ? (
            <div className="space-y-4">
              <AddFlightForm
                key={`flight-${trip.id}`}
                tripId={trip.id}
                onUpdated={setTrip}
              />
              {trip.flights.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">{t('flights')}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {trip.flights.map((f, i) => (
                      <li key={i}>
                        {f.flightNumber} {f.departureAirportCode}→
                        {f.arrivalAirportCode} (
                        {(f.departureDateTime || '').slice(0, 10)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <WizardNav onBack={prev} onNext={next} />
            </div>
          ) : (
            <WizardNav onBack={prev} onNext={next} nextDisabled />
          )}
        </StepCard>
      )}

      {/* Hotels step */}
      {step === 2 && (
        <StepCard
          title={t('addHotel')}
          subtitle={
            trip ? `${t('trip')}: ${trip.name}` : t('tripCreationSuccess')
          }
        >
          {trip ? (
            <div className="space-y-4">
              <AddHotelForm
                key={`hotel-${trip.id}`}
                tripId={trip.id}
                onUpdated={setTrip}
              />
              {trip.hotels.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">{t('hotels')}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {trip.hotels.map((h, i) => (
                      <li key={i}>
                        {h.name} ({h.checkIn} → {h.checkOut})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <WizardNav onBack={prev} onNext={next} />
            </div>
          ) : (
            <WizardNav onBack={prev} onNext={next} nextDisabled />
          )}
        </StepCard>
      )}

      {/* Rides step */}
      {step === 3 && (
        <StepCard
          title={t('addRide')}
          subtitle={
            trip ? `${t('trip')}: ${trip.name}` : t('tripCreationSuccess')
          }
        >
          {trip ? (
            <div className="space-y-4">
              <AddRideForm
                key={`ride-${trip.id}`}
                tripId={trip.id}
                onUpdated={setTrip}
              />
              {trip.rides.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">{t('rides')}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {trip.rides.map((r, i) => (
                      <li key={i}>
                        {r.pickup} → {r.dropoff}{' '}
                        {r.distance ? `(${r.distance})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <WizardNav onBack={prev} onNext={next} />
            </div>
          ) : (
            <WizardNav onBack={prev} onNext={next} nextDisabled />
          )}
        </StepCard>
      )}

      {/* Attractions step */}
      {step === 4 && (
        <StepCard
          title={t('addAttraction')}
          subtitle={
            trip ? `${t('trip')}: ${trip.name}` : t('tripCreationSuccess')
          }
        >
          {trip ? (
            <div className="space-y-4">
              <AddAttractionForm
                key={`attraction-${trip.id}`}
                tripId={trip.id}
                onUpdated={setTrip}
              />
              {trip.attractions.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">
                    Attractions added
                  </div>
                  <ul className="list-disc pl-5 text-sm text-gray-700">
                    {trip.attractions.map((a, i) => (
                      <li key={i}>
                        {a.name}{' '}
                        {a.scheduledDate
                          ? `(${a.scheduledDate}${
                              a.scheduledTime ? ' ' + a.scheduledTime : ''
                            })`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <WizardNav onBack={prev} onNext={next} />
            </div>
          ) : (
            <WizardNav onBack={prev} onNext={next} nextDisabled />
          )}
        </StepCard>
      )}

      {/* Review step */}
      {step === 5 && (
        <StepCard
          title={t('reviewAndCreate')}
          subtitle={trip ? t('tripCreationSuccess') : t('tripBasicInfo')}
        >
          {trip ? (
            <Stack spacing={3}>
              <Card
                elevation={0}
                sx={{
                  bgcolor: 'success.lighter',
                  border: '2px solid',
                  borderColor: 'success.main',
                }}
              >
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                    <Check sx={{ color: 'success.main', fontSize: 32 }} />
                    <Typography variant="h6" fontWeight={600}>
                      {t('tripCreationSuccess')}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t('reviewDetails')} "{trip.name}"
                  </Typography>
                </CardContent>
              </Card>

              <Paper
                elevation={0}
                sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {t('tripSummary')}
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">
                      {t('travelDates')}
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {new Date(trip.startDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                      })}{' '}
                      →{' '}
                      {new Date(trip.endDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Typography>
                  </Grid>
                  {trip.destinations?.length > 0 && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        {t('destinations')}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        gap={1}
                        mt={0.5}
                      >
                        {trip.destinations.map((dest, i) => (
                          <Chip key={i} label={dest} size="small" />
                        ))}
                      </Stack>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FlightIcon color="primary" />
                      <Box>
                        <Typography variant="h5" fontWeight={600}>
                          {trip.flights.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('flights')}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <HotelIcon color="secondary" />
                      <Box>
                        <Typography variant="h5" fontWeight={600}>
                          {trip.hotels.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('hotels')}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DirectionsCar color="info" />
                      <Box>
                        <Typography variant="h5" fontWeight={600}>
                          {trip.rides.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('rides')}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <AttractionsOutlined color="success" />
                      <Box>
                        <Typography variant="h5" fontWeight={600}>
                          {trip.attractions.length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('attractions')}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>

              <Stack direction="row" spacing={2} justifyContent="space-between">
                <Button
                  onClick={prev}
                  variant="outlined"
                  startIcon={<ArrowBack />}
                >
                  {t('back')}
                </Button>
                <Button
                  disabled={!canFinish}
                  onClick={() => navigate(`/trips/${trip!.id}`)}
                  variant="contained"
                  size="large"
                  endIcon={<Check />}
                >
                  {t('finish')} & {t('viewTrip')}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Alert severity="warning" icon={<Info />}>
                {t('tripBasicInfo')}
              </Alert>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button
                  onClick={prev}
                  variant="outlined"
                  startIcon={<ArrowBack />}
                >
                  {t('back')}
                </Button>
                <Button disabled variant="contained">
                  {t('finish')}
                </Button>
              </Stack>
            </Stack>
          )}
        </StepCard>
      )}
    </Box>
  );
}

function StepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 4 },
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box mb={3}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box>{children}</Box>
    </Paper>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Stack
      direction={{ xs: 'column-reverse', sm: 'row' }}
      spacing={2}
      justifyContent="flex-end"
      mt={3}
      alignItems={{ xs: 'stretch', sm: 'center' }}
    >
      <Button
        onClick={onBack}
        variant="outlined"
        startIcon={<ArrowBack />}
        fullWidth
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        {t('back')}
      </Button>
      <Button
        onClick={onNext}
        disabled={!!nextDisabled}
        variant="contained"
        endIcon={<ArrowForward />}
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        {t('next')}
      </Button>
    </Stack>
  );
}

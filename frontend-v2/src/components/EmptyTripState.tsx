import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Paper,
} from '@mui/material';
import {
  FlightTakeoff,
  Hotel,
  Attractions,
  DirectionsCar,
  Add,
  TipsAndUpdates,
} from '@mui/icons-material';
import { useLanguage } from '../context/LanguageContext';

interface EmptyTripStateProps {
  onAddFlight: () => void;
  onAddHotel: () => void;
  onAddAttraction: () => void;
  destination?: string;
  hasFlights?: boolean;
  hasHotels?: boolean;
  hasAttractions?: boolean;
  hasRides?: boolean;
}

export default function EmptyTripState({
  onAddFlight,
  onAddHotel,
  onAddAttraction,
  destination,
  hasFlights = false,
  hasHotels = false,
  hasAttractions = false,
  hasRides = false,
}: EmptyTripStateProps) {
  const { t } = useLanguage();

  // Calculate what's missing
  const missingCount = [!hasFlights, !hasHotels, !hasAttractions].filter(
    Boolean
  ).length;
  const isEmpty = missingCount === 3 && !hasRides;

  return (
    <Box sx={{ py: 4 }}>
      {/* Welcome Message - only if completely empty */}
      {isEmpty && (
        <Paper
          elevation={0}
          sx={{
            bgcolor: 'primary.lighter',
            p: 3,
            mb: 4,
            borderRadius: 2,
            border: '2px dashed',
            borderColor: 'primary.main',
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <TipsAndUpdates sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h6" fontWeight={600} color="primary.main">
                {t('tripCreatedSuccess')}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                {t('nowStartPlanning')}
                {destination && ` ${destination}`}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* Action Cards - only show if there are missing items */}
      {missingCount > 0 && (
        <>
          <Typography variant="h6" fontWeight={600} mb={3} textAlign="center">
            {isEmpty ? t('whatToStartWith') : t('whatElseToAdd')}
          </Typography>

          <Stack spacing={2}>
            {/* Add Flight Card - only if no flights */}
            {!hasFlights && (
              <Card
                elevation={2}
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    bgcolor: 'primary.lighter',
                  },
                }}
                onClick={onAddFlight}
              >
                <CardContent>
                  <Stack direction="row" spacing={3} alignItems="center">
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FlightTakeoff sx={{ fontSize: 40 }} />
                    </Box>
                    <Box flex={1}>
                      <Typography variant="h6" fontWeight={600}>
                        {t('addFlightsTitle')}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        mt={0.5}
                      >
                        {t('addFlightsDesc')}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      sx={{
                        minWidth: 120,
                        bgcolor: 'primary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                      }}
                    >
                      {t('start')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Add Hotel Card - only if no hotels */}
            {!hasHotels && (
              <Card
                elevation={2}
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    bgcolor: 'secondary.lighter',
                  },
                }}
                onClick={onAddHotel}
              >
                <CardContent>
                  <Stack direction="row" spacing={3} alignItems="center">
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'secondary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Hotel sx={{ fontSize: 40 }} />
                    </Box>
                    <Box flex={1}>
                      <Typography variant="h6" fontWeight={600}>
                        {t('addHotelsTitle')}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        mt={0.5}
                      >
                        {t('addHotelsDesc')}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      sx={{
                        minWidth: 120,
                        bgcolor: 'secondary.main',
                        '&:hover': { bgcolor: 'secondary.dark' },
                      }}
                    >
                      {t('start')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {/* Add Attraction Card - only if no attractions */}
            {!hasAttractions && (
              <Card
                elevation={2}
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    bgcolor: 'warning.lighter',
                  },
                }}
                onClick={onAddAttraction}
              >
                <CardContent>
                  <Stack direction="row" spacing={3} alignItems="center">
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'warning.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Attractions sx={{ fontSize: 40 }} />
                    </Box>
                    <Box flex={1}>
                      <Typography variant="h6" fontWeight={600}>
                        {t('addAttractionsTitle')}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        mt={0.5}
                      >
                        {t('addAttractionsDesc')}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      sx={{
                        minWidth: 120,
                        bgcolor: 'warning.main',
                        '&:hover': { bgcolor: 'warning.dark' },
                      }}
                    >
                      {t('start')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </>
      )}

      {/* Tips Section - only show if completely empty */}
      {isEmpty && (
        <Paper
          elevation={0}
          sx={{
            mt: 4,
            p: 3,
            bgcolor: 'grey.50',
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} mb={2}>
            {t('tipsForSuccess')}
          </Typography>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              • {t('tipStartWithFlights')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • {t('tipCentralHotel')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • {t('tipPlanAhead')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • {t('tipUseMap')}
            </Typography>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Paper,
  Fade,
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
import { motion } from 'framer-motion';

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
        <Fade in timeout={600}>
          <Paper
            elevation={0}
            sx={{
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
              p: 4,
              mb: 4,
              borderRadius: 3,
              border: '2px dashed',
              borderColor: 'primary.main',
              boxShadow: '0 4px 20px rgba(102, 126, 234, 0.15)',
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
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
                <TipsAndUpdates sx={{ fontSize: 32 }} />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={700} color="primary.main">
                  {t('tripCreatedSuccess')}
                </Typography>
                <Typography variant="body1" color="text.secondary" mt={0.5}>
                  {t('nowStartPlanning')}
                  {destination && ` ${destination}`}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Fade>
      )}

      {/* Action Cards - only show if there are missing items */}
      {missingCount > 0 && (
        <>
          <Typography
            variant="h5"
            fontWeight={700}
            mb={4}
            textAlign="center"
            sx={{ color: 'text.primary' }}
          >
            {isEmpty ? t('whatToStartWith') : t('whatElseToAdd')}
          </Typography>

          <Stack spacing={3}>
            {/* Add Flight Card - only if no flights */}
            {!hasFlights && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Card
                  elevation={4}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'primary.light',
                    '&:hover': {
                      transform: 'translateY(-6px)',
                      boxShadow: '0 12px 40px rgba(25, 118, 210, 0.25)',
                      bgcolor: 'primary.lighter',
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={onAddFlight}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={3}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                        }}
                      >
                        <FlightTakeoff sx={{ fontSize: 48 }} />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6" fontWeight={700} mb={0.5}>
                          {t('addFlightsTitle')}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ lineHeight: 1.6 }}
                        >
                          {t('addFlightsDesc')}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        startIcon={<Add />}
                        size="large"
                        sx={{
                          minWidth: { xs: '100%', sm: 140 },
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          bgcolor: 'primary.main',
                          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                          '&:hover': {
                            bgcolor: 'primary.dark',
                            transform: 'scale(1.05)',
                            boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        {t('start')}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Add Hotel Card - only if no hotels */}
            {!hasHotels && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <Card
                  elevation={4}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'secondary.light',
                    '&:hover': {
                      transform: 'translateY(-6px)',
                      boxShadow: '0 12px 40px rgba(156, 39, 176, 0.25)',
                      bgcolor: 'secondary.lighter',
                      borderColor: 'secondary.main',
                    },
                  }}
                  onClick={onAddHotel}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={3}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          bgcolor: 'secondary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
                        }}
                      >
                        <Hotel sx={{ fontSize: 48 }} />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6" fontWeight={700} mb={0.5}>
                          {t('addHotelsTitle')}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ lineHeight: 1.6 }}
                        >
                          {t('addHotelsDesc')}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        startIcon={<Add />}
                        size="large"
                        sx={{
                          minWidth: { xs: '100%', sm: 140 },
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          bgcolor: 'secondary.main',
                          boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
                          '&:hover': {
                            bgcolor: 'secondary.dark',
                            transform: 'scale(1.05)',
                            boxShadow: '0 6px 16px rgba(156, 39, 176, 0.4)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        {t('start')}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Add Attraction Card - only if no attractions */}
            {!hasAttractions && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <Card
                  elevation={4}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    borderRadius: 3,
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'warning.light',
                    '&:hover': {
                      transform: 'translateY(-6px)',
                      boxShadow: '0 12px 40px rgba(237, 108, 2, 0.25)',
                      bgcolor: 'warning.lighter',
                      borderColor: 'warning.main',
                    },
                  }}
                  onClick={onAddAttraction}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={3}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          bgcolor: 'warning.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(237, 108, 2, 0.3)',
                        }}
                      >
                        <Attractions sx={{ fontSize: 48 }} />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6" fontWeight={700} mb={0.5}>
                          {t('addAttractionsTitle')}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ lineHeight: 1.6 }}
                        >
                          {t('addAttractionsDesc')}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        startIcon={<Add />}
                        size="large"
                        sx={{
                          minWidth: { xs: '100%', sm: 140 },
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 600,
                          bgcolor: 'warning.main',
                          boxShadow: '0 4px 12px rgba(237, 108, 2, 0.3)',
                          '&:hover': {
                            bgcolor: 'warning.dark',
                            transform: 'scale(1.05)',
                            boxShadow: '0 6px 16px rgba(237, 108, 2, 0.4)',
                          },
                          transition: 'all 0.2s',
                        }}
                      >
                        {t('start')}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </motion.div>
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

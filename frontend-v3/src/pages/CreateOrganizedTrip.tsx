import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  TextField,
  Grid,
  Alert,
  InputAdornment,
  Chip,
  FormControlLabel,
  Checkbox,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack,
  ArrowForward,
  Save,
  Publish,
  CalendarToday,
  LocationOn,
  Description,
  AttachMoney,
  People,
  CheckCircle,
  Cancel,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { createOrganizedTrip } from '../services/organizedTripsApi';
import { CreateOrganizedTripData } from '../types/organizedTrip';
import { useLanguage } from '../context/LanguageContext';
import { motion } from 'framer-motion';
import AnimatedLogo from '../components/AnimatedLogo';

const stepsHe = ['פרטים בסיסיים', 'תמחור ומשתתפים', 'שירותים כלולים', 'סיכום'];
const stepsEn = [
  'Basic Info',
  'Pricing & Participants',
  'Included Services',
  'Summary',
];

export default function CreateOrganizedTrip() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = language === 'he' ? stepsHe : stepsEn;
  const translations = {
    title:
      language === 'he' ? 'יצירת טיול מאורגן חדש' : 'Create New Organized Trip',
    back: language === 'he' ? 'חזרה' : 'Back',
    previous: language === 'he' ? 'הקודם' : 'Previous',
    next: language === 'he' ? 'הבא' : 'Next',
    saveAsDraft: language === 'he' ? 'שמור כטיוטה' : 'Save as Draft',
    publishTrip: language === 'he' ? 'פרסם טיול' : 'Publish Trip',
    errorMessage:
      language === 'he'
        ? 'נא למלא את כל השדות החובה'
        : 'Please fill all required fields',

    // Step 1
    basicInfo:
      language === 'he' ? 'פרטים בסיסיים של הטיול' : 'Trip Basic Information',
    tripName: language === 'he' ? 'שם הטיול' : 'Trip Name',
    tripNamePlaceholder:
      language === 'he'
        ? 'למשל: טיול מאורגן לרומא - 7 ימים'
        : 'e.g., Organized Trip to Rome - 7 Days',
    destination: language === 'he' ? 'יעד' : 'Destination',
    destinationPlaceholder:
      language === 'he' ? 'למשל: רומא, איטליה' : 'e.g., Rome, Italy',
    meetingPoint: language === 'he' ? 'נקודת מפגש' : 'Meeting Point',
    meetingPointPlaceholder:
      language === 'he'
        ? 'למשל: שדה התעופה בן גוריון, טרמינל 3'
        : 'e.g., Ben Gurion Airport, Terminal 3',
    description: language === 'he' ? 'תיאור הטיול' : 'Trip Description',
    descriptionPlaceholder:
      language === 'he'
        ? 'תאר את הטיול, האטרקציות, הנקודות המרכזיות...'
        : 'Describe the trip, attractions, highlights...',
    importantNotes: language === 'he' ? 'הערות חשובות' : 'Important Notes',
    importantNotesPlaceholder:
      language === 'he'
        ? 'מידע חשוב למשתתפים, דרישות מיוחדות...'
        : 'Important information for participants, special requirements...',

    // Step 2
    datesAndPricing:
      language === 'he'
        ? 'תאריכים, תמחור ומשתתפים'
        : 'Dates, Pricing & Participants',
    startDate: language === 'he' ? 'תאריך התחלה' : 'Start Date',
    endDate: language === 'he' ? 'תאריך סיום' : 'End Date',
    pricePerPerson: language === 'he' ? 'מחיר למשתתף' : 'Price per Person',
    maxParticipants:
      language === 'he' ? 'מספר משתתפים מקסימלי' : 'Maximum Participants',

    // Step 3
    includedServices:
      language === 'he'
        ? 'שירותים כלולים ולא כלולים'
        : 'Included and Excluded Services',
    includedInPrice: language === 'he' ? '✓ כלול במחיר' : '✓ Included in Price',
    notIncludedInPrice:
      language === 'he' ? '✗ לא כלול במחיר' : '✗ Not Included in Price',
    addIncludedService:
      language === 'he'
        ? 'הוסף שירות כלול (למשל: טיסות הלוך ושוב)'
        : 'Add included service (e.g., Round-trip flights)',
    addExcludedService:
      language === 'he'
        ? 'הוסף שירות לא כלול (למשל: ביטוח נסיעות)'
        : 'Add excluded service (e.g., Travel insurance)',
    add: language === 'he' ? 'הוסף' : 'Add',

    // Step 4
    summary: language === 'he' ? 'סיכום וסקירה' : 'Summary & Review',
    errorNoTripId: language === 'he' ? 'שגיאה: לא התקבל מזהה טיול מהשרת' : 'Error: Trip ID not received from server',
    errorSavingTrip: language === 'he' ? 'שגיאה בשמירת הטיול' : 'Error saving trip',
    errorPublishingTrip: language === 'he' ? 'שגיאה בפרסום הטיול' : 'Error publishing trip',
  };
  
  const t = translations;

  // Form data
  const [formData, setFormData] = useState<CreateOrganizedTripData>({
    title: '',
    destination: '',
    description: '',
    startDate: '',
    endDate: '',
    maxParticipants: 20,
    pricePerPerson: 0,
    currency: 'ILS',
    includedServices: [],
    notIncludedServices: [],
    visibility: 'draft', // Default to draft
    meetingPoint: '',
    importantNotes: '',
    tags: [],
  });

  const [newService, setNewService] = useState('');
  const [newExcluded, setNewExcluded] = useState('');
  const [newTag, setNewTag] = useState('');

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleChange =
    (field: keyof CreateOrganizedTripData) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData({ ...formData, [field]: event.target.value });
    };

  const handleDateChange =
    (field: 'startDate' | 'endDate') => (date: Date | null) => {
      if (date) {
        setFormData({ ...formData, [field]: date.toISOString() });
      }
    };

  const addService = () => {
    if (newService.trim()) {
      setFormData({
        ...formData,
        includedServices: [...formData.includedServices, newService.trim()],
      });
      setNewService('');
    }
  };

  const removeService = (index: number) => {
    setFormData({
      ...formData,
      includedServices: formData.includedServices.filter((_, i) => i !== index),
    });
  };

  const addExcluded = () => {
    if (newExcluded.trim()) {
      setFormData({
        ...formData,
        notIncludedServices: [
          ...formData.notIncludedServices,
          newExcluded.trim(),
        ],
      });
      setNewExcluded('');
    }
  };

  const removeExcluded = (index: number) => {
    setFormData({
      ...formData,
      notIncludedServices: formData.notIncludedServices.filter(
        (_, i) => i !== index
      ),
    });
  };

  const handleSaveDraft = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await createOrganizedTrip(formData);
      console.log('Server response:', result);
      const tripId = result._id || result.tripId;
      console.log('Trip ID:', tripId);
      if (!tripId) {
        setError(t.errorNoTripId);
        return;
      }
      navigate(`/agent/trips/${tripId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || t.errorSavingTrip);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    // Validate required fields
    if (
      !formData.title ||
      !formData.destination ||
      !formData.startDate ||
      !formData.endDate
    ) {
      setError(t.errorMessage);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await createOrganizedTrip({ ...formData });
      console.log('Server response:', result);
      const tripId = result._id || result.tripId;
      console.log('Trip ID:', tripId);
      if (!tripId) {
        setError(t.errorNoTripId);
        return;
      }
      // TODO: Publish the trip
      navigate(`/agent/trips/${tripId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || t.errorPublishingTrip);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography
              variant="h5"
              fontWeight={700}
              gutterBottom
              sx={{ mb: 4, color: 'text.primary' }}
            >
              {t.basicInfo}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t.tripName}
                  value={formData.title}
                  onChange={handleChange('title')}
                  required
                  placeholder={t.tripNamePlaceholder}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Description color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t.destination}
                  value={formData.destination}
                  onChange={handleChange('destination')}
                  required
                  placeholder={t.destinationPlaceholder}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOn color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t.meetingPoint}
                  value={formData.meetingPoint}
                  onChange={handleChange('meetingPoint')}
                  placeholder={t.meetingPointPlaceholder}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label={t.description}
                  value={formData.description}
                  onChange={handleChange('description')}
                  required
                  placeholder={t.descriptionPlaceholder}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={t.importantNotes}
                  value={formData.importantNotes}
                  onChange={handleChange('importantNotes')}
                  placeholder={t.importantNotesPlaceholder}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  תגיות (#)
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  הוסף תגיות לסינון הטיול (למשל: צילום, צלילה, משפחות)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="medium"
                    placeholder="הוסף תגית..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (
                          newTag.trim() &&
                          !formData.tags?.includes(newTag.trim())
                        ) {
                          setFormData({
                            ...formData,
                            tags: [...(formData.tags || []), newTag.trim()],
                          });
                          setNewTag('');
                        }
                      }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.9)',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          bgcolor: 'white',
                        },
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (
                        newTag.trim() &&
                        !formData.tags?.includes(newTag.trim())
                      ) {
                        setFormData({
                          ...formData,
                          tags: [...(formData.tags || []), newTag.trim()],
                        });
                        setNewTag('');
                      }
                    }}
                    sx={{
                      borderRadius: 2,
                      minWidth: 100,
                    }}
                    component={motion.button}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t.add}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {formData.tags?.map((tag, index) => (
                    <motion.div
                      key={index}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      <Chip
                        label={`#${tag}`}
                        onDelete={() => {
                          setFormData({
                            ...formData,
                            tags: formData.tags?.filter((_, i) => i !== index),
                          });
                        }}
                        color="primary"
                        sx={{
                          borderRadius: 2,
                          fontWeight: 500,
                          '&:hover': {
                            boxShadow: '0 2px 8px rgba(25, 118, 210, 0.3)',
                          },
                        }}
                      />
                    </motion.div>
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              תאריכים, תמחור ומשתתפים
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label={t.startDate}
                    value={
                      formData.startDate ? new Date(formData.startDate) : null
                    }
                    onChange={handleDateChange('startDate')}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'rgba(255,255,255,0.9)',
                            transition: 'all 0.3s',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            },
                            '&.Mui-focused': {
                              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                              bgcolor: 'white',
                            },
                          },
                        },
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday color="action" />
                            </InputAdornment>
                          ),
                        },
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label={t.endDate}
                    value={formData.endDate ? new Date(formData.endDate) : null}
                    onChange={handleDateChange('endDate')}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'rgba(255,255,255,0.9)',
                            transition: 'all 0.3s',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            },
                            '&.Mui-focused': {
                              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                              bgcolor: 'white',
                            },
                          },
                        },
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday color="action" />
                            </InputAdornment>
                          ),
                        },
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label={t.pricePerPerson}
                  value={formData.pricePerPerson}
                  onChange={handleChange('pricePerPerson')}
                  required
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoney color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label={t.maxParticipants}
                  value={formData.maxParticipants}
                  onChange={handleChange('maxParticipants')}
                  required
                  inputProps={{ min: 1 }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <People color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="נראות הטיול"
                  value={formData.visibility}
                  onChange={handleChange('visibility')}
                  required
                  helperText="בחר מי יוכל לראות את הטיול"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.9)',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      },
                      '&.Mui-focused': {
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        bgcolor: 'white',
                      },
                    },
                  }}
                >
                  <MenuItem value="draft">טיוטה - רק אני רואה</MenuItem>
                  <MenuItem value="private">פרטי - נגיש רק דרך לינק</MenuItem>
                  <MenuItem value="public">ציבורי - מופיע באתר</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography
              variant="h5"
              fontWeight={700}
              gutterBottom
              sx={{ mb: 4, color: 'text.primary' }}
            >
              {t.includedServices}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  color="success.main"
                  fontWeight={600}
                  sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <CheckCircle /> {t.includedInPrice}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="medium"
                    placeholder={t.addIncludedService}
                    value={newService}
                    onChange={(e) => setNewService(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addService()}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.9)',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          bgcolor: 'white',
                        },
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={addService}
                    sx={{
                      borderRadius: 2,
                      minWidth: 100,
                      bgcolor: 'success.main',
                      '&:hover': { bgcolor: 'success.dark' },
                    }}
                    component={motion.button}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t.add}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                  {formData.includedServices.map((service, index) => (
                    <motion.div
                      key={index}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      <Chip
                        label={service}
                        onDelete={() => removeService(index)}
                        color="success"
                        sx={{
                          borderRadius: 2,
                          fontWeight: 500,
                          '&:hover': {
                            boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
                          },
                        }}
                      />
                    </motion.div>
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  color="error.main"
                  fontWeight={600}
                  sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Cancel /> {t.notIncludedInPrice}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="medium"
                    placeholder={t.addExcludedService}
                    value={newExcluded}
                    onChange={(e) => setNewExcluded(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addExcluded()}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.9)',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                          bgcolor: 'white',
                        },
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={addExcluded}
                    sx={{
                      borderRadius: 2,
                      minWidth: 100,
                      bgcolor: 'error.main',
                      '&:hover': { bgcolor: 'error.dark' },
                    }}
                    component={motion.button}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t.add}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {formData.notIncludedServices.map((service, index) => (
                    <motion.div
                      key={index}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      <Chip
                        label={service}
                        onDelete={() => removeExcluded(index)}
                        color="error"
                        sx={{
                          borderRadius: 2,
                          fontWeight: 500,
                          '&:hover': {
                            boxShadow: '0 2px 8px rgba(244, 67, 54, 0.3)',
                          },
                        }}
                      />
                    </motion.div>
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography
              variant="h5"
              fontWeight={700}
              gutterBottom
              sx={{ mb: 4, color: 'text.primary' }}
            >
              {t.summary}
            </Typography>
            <Paper
              sx={{
                p: 4,
                mb: 2,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.95)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              }}
            >
              <Typography variant="h5" gutterBottom>
                {formData.title}
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                📍 {formData.destination}
              </Typography>
              <Typography variant="body2" paragraph>
                {formData.description}
              </Typography>

              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">
                    תאריך התחלה
                  </Typography>
                  <Typography variant="body1">
                    {formData.startDate
                      ? new Date(formData.startDate).toLocaleDateString('he-IL')
                      : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">
                    תאריך סיום
                  </Typography>
                  <Typography variant="body1">
                    {formData.endDate
                      ? new Date(formData.endDate).toLocaleDateString('he-IL')
                      : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">
                    מחיר
                  </Typography>
                  <Typography variant="body1" fontWeight={700} color="primary">
                    ₪{formData.pricePerPerson.toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">
                    מקסימום משתתפים
                  </Typography>
                  <Typography variant="body1">
                    {formData.maxParticipants}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">
                    נראות
                  </Typography>
                  <Typography variant="body1">
                    {formData.visibility === 'public' && '🌐 ציבורי'}
                    {formData.visibility === 'private' && '🔗 פרטי (לינק)'}
                    {formData.visibility === 'draft' && '📝 טיוטה'}
                  </Typography>
                </Grid>
              </Grid>

              {formData.includedServices.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography
                    variant="subtitle2"
                    color="success.main"
                    gutterBottom
                  >
                    ✓ כלול במחיר:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {formData.includedServices.map((service, index) => (
                      <Chip
                        key={index}
                        label={service}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {formData.notIncludedServices.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="subtitle2"
                    color="error.main"
                    gutterBottom
                  >
                    ✗ לא כלול במחיר:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {formData.notIncludedServices.map((service, index) => (
                      <Chip
                        key={index}
                        label={service}
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        paddingTop: '2rem',
        paddingBottom: '2rem',
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          {/* Header */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 100, damping: 10 }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 4,
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  startIcon={<ArrowBack />}
                  onClick={() => navigate('/agency')}
                  sx={{
                    color: 'primary.main',
                    borderColor: 'primary.main',
                    '&:hover': {
                      borderColor: 'primary.dark',
                      bgcolor: 'primary.lighter',
                    },
                  }}
                  variant="outlined"
                >
                  {t.back}
                </Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AnimatedLogo width="clamp(60px, 8vw, 100px)" />
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    sx={{
                      color: 'text.primary',
                    }}
                  >
                    {t.title}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </motion.div>

          {error && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <Alert
                severity="error"
                sx={{ mb: 3, borderRadius: 2 }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            </motion.div>
          )}

          <Paper
            elevation={3}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              bgcolor: 'white',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            }}
          >
            {/* Stepper */}
            <Stepper
              activeStep={activeStep}
              sx={{
                mb: 5,
                '& .MuiStepLabel-root .Mui-completed': {
                  color: 'success.main',
                },
                '& .MuiStepLabel-root .Mui-active': {
                  color: 'primary.main',
                },
                '& .MuiStepLabel-label': {
                  fontWeight: 600,
                  fontSize: '1rem',
                },
              }}
            >
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Step Content */}
            <motion.div
              key={activeStep}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {renderStepContent(activeStep)}
            </motion.div>

            {/* Navigation Buttons */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mt: 5,
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Button
                disabled={activeStep === 0 || loading}
                onClick={handleBack}
                startIcon={<ArrowBack />}
                sx={{
                  color: 'text.primary',
                  borderColor: 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'primary.lighter',
                  },
                  '&:disabled': {
                    color: 'text.disabled',
                    borderColor: 'divider',
                  },
                }}
                variant="outlined"
                component={motion.button}
                whileHover={{ scale: activeStep === 0 ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {t.previous}
              </Button>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={loading ? <CircularProgress size={16} /> : <Save />}
                  onClick={handleSaveDraft}
                  disabled={loading}
                  sx={{
                    color: 'text.primary',
                    borderColor: 'divider',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'primary.lighter',
                    },
                    borderRadius: 2,
                  }}
                  component={motion.button}
                  whileHover={{ scale: loading ? 1 : 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {t.saveAsDraft}
                </Button>
                {activeStep === steps.length - 1 ? (
                  <Button
                    variant="contained"
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Publish />}
                    onClick={handlePublish}
                    disabled={loading}
                    sx={{
                      background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
                      boxShadow: '0 3px 5px 2px rgba(255, 105, 135, .3)',
                      color: 'white',
                      borderRadius: 2,
                      fontWeight: 600,
                      '&:hover': {
                        background: 'linear-gradient(45deg, #FF8E53 30%, #FE6B8B 90%)',
                        boxShadow: '0 5px 10px 3px rgba(255, 105, 135, .5)',
                      },
                    }}
                    component={motion.button}
                    whileHover={{ scale: loading ? 1 : 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t.publishTrip}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    endIcon={<ArrowForward />}
                    sx={{
                      background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                      boxShadow: '0 3px 5px 2px rgba(33, 150, 243, .3)',
                      color: 'white',
                      borderRadius: 2,
                      fontWeight: 600,
                      '&:hover': {
                        background: 'linear-gradient(45deg, #21CBF3 30%, #2196F3 90%)',
                        boxShadow: '0 5px 10px 3px rgba(33, 150, 243, .5)',
                      },
                    }}
                    component={motion.button}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t.next}
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>
      </Container>
    </motion.div>
  );
}

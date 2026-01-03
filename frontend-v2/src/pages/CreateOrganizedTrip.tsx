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
} from '@mui/material';
import { ArrowBack, ArrowForward, Save, Publish } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { createOrganizedTrip } from '../services/organizedTripsApi';
import { CreateOrganizedTripData } from '../types/organizedTrip';

const steps = ['פרטים בסיסיים', 'תמחור ומשתתפים', 'שירותים כלולים', 'סיכום'];

export default function CreateOrganizedTrip() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    meetingPoint: '',
    importantNotes: '',
  });

  const [newService, setNewService] = useState('');
  const [newExcluded, setNewExcluded] = useState('');

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
      navigate(`/agent/trips/${result._id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בשמירת הטיול');
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
      setError('נא למלא את כל השדות החובה');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await createOrganizedTrip({ ...formData });
      // TODO: Publish the trip
      navigate(`/agent/trips/${result._id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בפרסום הטיול');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              פרטים בסיסיים של הטיול
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="שם הטיול"
                  value={formData.title}
                  onChange={handleChange('title')}
                  required
                  placeholder="למשל: טיול מאורגן לרומא - 7 ימים"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="יעד"
                  value={formData.destination}
                  onChange={handleChange('destination')}
                  required
                  placeholder="למשל: רומא, איטליה"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="נקודת מפגש"
                  value={formData.meetingPoint}
                  onChange={handleChange('meetingPoint')}
                  placeholder="למשל: שדה התעופה בן גוריון, טרמינל 3"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="תיאור הטיול"
                  value={formData.description}
                  onChange={handleChange('description')}
                  required
                  placeholder="תאר את הטיול, האטרקציות, הנקודות המרכזיות..."
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="הערות חשובות"
                  value={formData.importantNotes}
                  onChange={handleChange('importantNotes')}
                  placeholder="מידע חשוב למשתתפים, דרישות מיוחדות..."
                />
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
                    label="תאריך התחלה"
                    value={
                      formData.startDate ? new Date(formData.startDate) : null
                    }
                    onChange={handleDateChange('startDate')}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="תאריך סיום"
                    value={formData.endDate ? new Date(formData.endDate) : null}
                    onChange={handleDateChange('endDate')}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true,
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="מחיר למשתתף"
                  value={formData.pricePerPerson}
                  onChange={handleChange('pricePerPerson')}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">₪</InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="מספר משתתפים מקסימלי"
                  value={formData.maxParticipants}
                  onChange={handleChange('maxParticipants')}
                  required
                  inputProps={{ min: 1 }}
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              שירותים כלולים ולא כלולים
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  color="success.main"
                >
                  ✓ כלול במחיר
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="הוסף שירות כלול (למשל: טיסות הלוך ושוב)"
                    value={newService}
                    onChange={(e) => setNewService(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addService()}
                  />
                  <Button variant="contained" onClick={addService}>
                    הוסף
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                  {formData.includedServices.map((service, index) => (
                    <Chip
                      key={index}
                      label={service}
                      onDelete={() => removeService(index)}
                      color="success"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom color="error.main">
                  ✗ לא כלול במחיר
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="הוסף שירות לא כלול (למשל: ביטוח נסיעות)"
                    value={newExcluded}
                    onChange={(e) => setNewExcluded(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addExcluded()}
                  />
                  <Button variant="contained" onClick={addExcluded}>
                    הוסף
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {formData.notIncludedServices.map((service, index) => (
                    <Chip
                      key={index}
                      label={service}
                      onDelete={() => removeExcluded(index)}
                      color="error"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              סיכום וסקירה
            </Typography>
            <Paper sx={{ p: 3, mb: 2 }}>
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
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/agent')}
            sx={{ mr: 2 }}
          >
            חזרה
          </Button>
          <Typography variant="h4" fontWeight={700}>
            יצירת טיול מאורגן חדש
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {renderStepContent(activeStep)}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<ArrowBack />}
            >
              הקודם
            </Button>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<Save />}
                onClick={handleSaveDraft}
                disabled={loading}
              >
                שמור כטיוטה
              </Button>
              {activeStep === steps.length - 1 ? (
                <Button
                  variant="contained"
                  startIcon={<Publish />}
                  onClick={handlePublish}
                  disabled={loading}
                >
                  פרסם טיול
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleNext}
                  endIcon={<ArrowForward />}
                >
                  הבא
                </Button>
              )}
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

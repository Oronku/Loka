import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  Grid,
  Card,
  CardContent,
  Collapse,
  Divider,
  Chip,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  ExpandMore,
  ExpandLess,
  Hotel,
  Restaurant,
  Attractions,
  DirectionsBus,
  AccessTime,
} from '@mui/icons-material';
import { DayItinerary, Activity } from '../types/organizedTrip';

interface ItineraryBuilderProps {
  itinerary: DayItinerary[];
  onChange: (itinerary: DayItinerary[]) => void;
}

export default function ItineraryBuilder({
  itinerary,
  onChange,
}: ItineraryBuilderProps) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [activityDialog, setActivityDialog] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{
    dayIndex: number;
    activityIndex?: number;
    activity: Partial<Activity>;
  } | null>(null);

  const handleAddDay = () => {
    const newDay: DayItinerary = {
      day: itinerary.length + 1,
      date: '',
      title: `יום ${itinerary.length + 1}`,
      description: '',
      activities: [],
    };
    onChange([...itinerary, newDay]);
    setExpandedDay(itinerary.length);
  };

  const handleRemoveDay = (dayIndex: number) => {
    const updated = itinerary.filter((_, i) => i !== dayIndex);
    // Update day numbers
    const renumbered = updated.map((day, i) => ({ ...day, day: i + 1 }));
    onChange(renumbered);
    if (expandedDay === dayIndex) {
      setExpandedDay(null);
    }
  };

  const handleUpdateDay = (dayIndex: number, field: string, value: any) => {
    const updated = [...itinerary];
    updated[dayIndex] = { ...updated[dayIndex], [field]: value };
    onChange(updated);
  };

  const handleAddActivity = (dayIndex: number) => {
    setEditingActivity({
      dayIndex,
      activity: {
        type: 'attraction',
        time: '',
        title: '',
        description: '',
        location: '',
        included: true,
        bookingRequired: false,
      },
    });
    setActivityDialog(true);
  };

  const handleEditActivity = (dayIndex: number, activityIndex: number) => {
    setEditingActivity({
      dayIndex,
      activityIndex,
      activity: { ...itinerary[dayIndex].activities[activityIndex] },
    });
    setActivityDialog(true);
  };

  const handleSaveActivity = () => {
    if (!editingActivity) return;

    const { dayIndex, activityIndex, activity } = editingActivity;
    const updated = [...itinerary];

    if (activityIndex !== undefined) {
      // Edit existing
      updated[dayIndex].activities[activityIndex] = activity as Activity;
    } else {
      // Add new
      updated[dayIndex].activities.push(activity as Activity);
    }

    onChange(updated);
    setActivityDialog(false);
    setEditingActivity(null);
  };

  const handleRemoveActivity = (dayIndex: number, activityIndex: number) => {
    const updated = [...itinerary];
    updated[dayIndex].activities = updated[dayIndex].activities.filter(
      (_, i) => i !== activityIndex
    );
    onChange(updated);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'accommodation':
        return <Hotel />;
      case 'meal':
        return <Restaurant />;
      case 'attraction':
        return <Attractions />;
      case 'transport':
        return <DirectionsBus />;
      default:
        return <AccessTime />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'accommodation':
        return 'primary';
      case 'meal':
        return 'success';
      case 'attraction':
        return 'warning';
      case 'transport':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={700}>
          לוח זמנים יומי
        </Typography>
        <Button startIcon={<Add />} variant="contained" onClick={handleAddDay}>
          הוסף יום
        </Button>
      </Box>

      {itinerary.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            עדיין לא נוסף לוח זמנים לטיול
          </Typography>
          <Button
            startIcon={<Add />}
            variant="outlined"
            onClick={handleAddDay}
            sx={{ mt: 2 }}
          >
            התחל לבנות לוח זמנים
          </Button>
        </Paper>
      ) : (
        itinerary.map((day, dayIndex) => (
          <Card key={dayIndex} sx={{ mb: 2 }}>
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6" fontWeight={700}>
                    יום {day.day}
                  </Typography>
                  <Chip label={day.date || 'ללא תאריך'} size="small" />
                </Box>
                <Box>
                  <IconButton
                    onClick={() =>
                      setExpandedDay(expandedDay === dayIndex ? null : dayIndex)
                    }
                  >
                    {expandedDay === dayIndex ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() => handleRemoveDay(dayIndex)}
                  >
                    <Delete />
                  </IconButton>
                </Box>
              </Box>

              <Collapse in={expandedDay === dayIndex}>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="כותרת"
                      value={day.title}
                      onChange={(e) =>
                        handleUpdateDay(dayIndex, 'title', e.target.value)
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      type="date"
                      label="תאריך"
                      value={day.date}
                      onChange={(e) =>
                        handleUpdateDay(dayIndex, 'date', e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={2}
                      label="תיאור"
                      value={day.description}
                      onChange={(e) =>
                        handleUpdateDay(dayIndex, 'description', e.target.value)
                      }
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    פעילויות
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<Add />}
                    onClick={() => handleAddActivity(dayIndex)}
                  >
                    הוסף פעילות
                  </Button>
                </Box>

                {day.activities.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      עדיין לא נוספו פעילויות ליום זה
                    </Typography>
                  </Box>
                ) : (
                  day.activities.map((activity, activityIndex) => (
                    <Paper
                      key={activityIndex}
                      sx={{
                        p: 2,
                        mb: 1,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 2,
                      }}
                      elevation={0}
                      variant="outlined"
                    >
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: `${getActivityColor(activity.type || 'other')}.light`,
                          color: `${getActivityColor(activity.type || 'other')}.main`,
                        }}
                      >
                        {getActivityIcon(activity.type || 'other')}
                      </Box>
                      <Box sx={{ flexGrow: 1 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 0.5,
                          }}
                        >
                          {activity.time && (
                            <Chip
                              icon={<AccessTime />}
                              label={activity.time}
                              size="small"
                              variant="outlined"
                            />
                          )}
                          <Typography variant="subtitle2" fontWeight={600}>
                            {activity.title}
                          </Typography>
                        </Box>
                        {activity.description && (
                          <Typography variant="body2" color="text.secondary">
                            {activity.description}
                          </Typography>
                        )}
                        {activity.location && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 0.5 }}
                          >
                            📍 {activity.location}
                          </Typography>
                        )}
                      </Box>
                      <Box>
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleEditActivity(dayIndex, activityIndex)
                          }
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            handleRemoveActivity(dayIndex, activityIndex)
                          }
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </Paper>
                  ))
                )}
              </Collapse>
            </CardContent>
          </Card>
        ))
      )}

      {/* Activity Dialog */}
      <Dialog
        open={activityDialog}
        onClose={() => {
          setActivityDialog(false);
          setEditingActivity(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingActivity?.activityIndex !== undefined
            ? 'ערוך פעילות'
            : 'הוסף פעילות'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="סוג"
                  value={editingActivity?.activity.type || 'attraction'}
                  onChange={(e) =>
                    setEditingActivity(
                      editingActivity
                        ? {
                            ...editingActivity,
                            activity: {
                              ...editingActivity.activity,
                              type: e.target.value as any,
                            },
                          }
                        : null
                    )
                  }
                >
                  <MenuItem value="accommodation">לינה</MenuItem>
                  <MenuItem value="meal">ארוחה</MenuItem>
                  <MenuItem value="attraction">אטרקציה</MenuItem>
                  <MenuItem value="transport">תחבורה</MenuItem>
                  <MenuItem value="other">אחר</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="time"
                  label="שעה"
                  value={editingActivity?.activity.time || ''}
                  onChange={(e) =>
                    setEditingActivity(
                      editingActivity
                        ? {
                            ...editingActivity,
                            activity: {
                              ...editingActivity.activity,
                              time: e.target.value,
                            },
                          }
                        : null
                    )
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="כותרת"
                  value={editingActivity?.activity.title || ''}
                  onChange={(e) =>
                    setEditingActivity(
                      editingActivity
                        ? {
                            ...editingActivity,
                            activity: {
                              ...editingActivity.activity,
                              title: e.target.value,
                            },
                          }
                        : null
                    )
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="מיקום"
                  value={editingActivity?.activity.location || ''}
                  onChange={(e) =>
                    setEditingActivity(
                      editingActivity
                        ? {
                            ...editingActivity,
                            activity: {
                              ...editingActivity.activity,
                              location: e.target.value,
                            },
                          }
                        : null
                    )
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="תיאור"
                  value={editingActivity?.activity.description || ''}
                  onChange={(e) =>
                    setEditingActivity(
                      editingActivity
                        ? {
                            ...editingActivity,
                            activity: {
                              ...editingActivity.activity,
                              description: e.target.value,
                            },
                          }
                        : null
                    )
                  }
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setActivityDialog(false);
              setEditingActivity(null);
            }}
          >
            ביטול
          </Button>
          <Button variant="contained" onClick={handleSaveActivity}>
            שמור
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

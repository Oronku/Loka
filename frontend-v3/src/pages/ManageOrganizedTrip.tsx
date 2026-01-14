import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Badge,
} from '@mui/material';
import {
  ArrowBack,
  Edit,
  Send,
  Upload,
  PersonAdd,
  Delete,
  CheckCircle,
  Cancel,
  Pending,
  CloudUpload,
  Description,
  AttachMoney,
  Settings,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getOrganizedTrip,
  inviteParticipant,
  sendTripUpdate,
  uploadTripDocument,
  publishTrip,
  cancelTrip,
  updateTripVisibility,
  updateOrganizedTrip,
} from '../services/organizedTripsApi';
import { OrganizedTrip, Participant } from '../types/organizedTrip';
import ItineraryBuilder from '../components/ItineraryBuilder';
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
      id={`trip-tabpanel-${index}`}
      aria-labelledby={`trip-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function ManageOrganizedTrip() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tabValue, setTabValue] = useState(0);
  const [trip, setTrip] = useState<OrganizedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [itineraryDialogOpen, setItineraryDialogOpen] = useState(false);

  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [editedItinerary, setEditedItinerary] = useState<any[]>([]);

  useEffect(() => {
    loadTrip();
  }, [tripId]);

  const loadTrip = async () => {
    if (!tripId) return;
    try {
      setLoading(true);
      const data = await getOrganizedTrip(tripId);
      setTrip(data);
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorLoadingTrip'));
    } finally {
      setLoading(false);
    }
  };

  const handleInviteParticipant = async () => {
    if (!tripId || !inviteEmail || !inviteName) return;
    try {
      await inviteParticipant(tripId, {
        email: inviteEmail,
        name: inviteName,
        phone: invitePhone || undefined,
      });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInvitePhone('');
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorSendingInvitation'));
    }
  };

  const handleSendUpdate = async () => {
    if (!tripId || !updateTitle || !updateMessage) return;
    try {
      await sendTripUpdate(tripId, {
        type: 'announcement',
        title: updateTitle,
        message: updateMessage,
      });
      setUpdateDialogOpen(false);
      setUpdateTitle('');
      setUpdateMessage('');
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorSendingUpdate'));
    }
  };

  const handleUploadDocument = async () => {
    if (!tripId || !documentTitle || !documentFile) return;
    try {
      // TODO: Implement file upload to cloud storage
      // For now, we'll just create a document reference
      await uploadTripDocument(tripId, {
        type: 'general',
        title: documentTitle,
        fileName: documentFile.name,
        url: '', // TODO: Upload file and get URL
      });
      setUploadDialogOpen(false);
      setDocumentTitle('');
      setDocumentFile(null);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorUploadingDocument'));
    }
  };

  const handlePublishTrip = async () => {
    if (!tripId) return;
    try {
      await publishTrip(tripId);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorPublishingTrip'));
    }
  };

  const handleCancelTrip = async () => {
    if (!tripId || !confirm(t('confirmCancelTrip'))) return;
    try {
      await cancelTrip(tripId);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorCancellingTrip'));
    }
  };

  const handleUpdateVisibility = async (
    visibility: 'public' | 'private' | 'draft'
  ) => {
    if (!tripId) return;
    try {
      await updateTripVisibility(tripId, visibility);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorUpdatingVisibility'));
    }
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

  const handleEditItinerary = () => {
    if (trip?.itinerary) {
      setEditedItinerary(trip.itinerary);
    } else {
      setEditedItinerary([]);
    }
    setItineraryDialogOpen(true);
  };

  const handleSaveItinerary = async () => {
    if (!tripId) return;
    try {
      await updateOrganizedTrip(tripId, { itinerary: editedItinerary });
      setItineraryDialogOpen(false);
      await loadTrip();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || t('errorUpdatingItinerary'));
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

  const getParticipantStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle color="success" />;
      case 'pending':
        return <Pending color="warning" />;
      case 'cancelled':
        return <Cancel color="error" />;
      case 'paid':
        return <AttachMoney color="success" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '60vh',
          }}
        >
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!trip) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">טיול לא נמצא</Alert>
          <Button onClick={() => navigate('/agent')} sx={{ mt: 2 }}>
            חזרה לדשבורד
          </Button>
        </Box>
      </Container>
    );
  }

  const confirmedParticipants = trip.participants.filter(
    (p) => p.status === 'confirmed' || p.status === 'paid'
  );
  const pendingParticipants = trip.participants.filter(
    (p) => p.status === 'invited'
  );

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              startIcon={<ArrowBack />}
              onClick={() => navigate('/agent')}
            >
              חזרה
            </Button>
            <Box>
              <Typography variant="h4" fontWeight={700}>
                {trip.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                📍 {trip.destination}
              </Typography>
              {trip.tags && trip.tags.length > 0 && (
                <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
                  {trip.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={`#${tag}`}
                      size="small"
                      color="secondary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={getStatusText(trip.status)}
              color={getStatusColor(trip.status)}
            />
            <Chip
              label={
                trip.visibility === 'public'
                  ? '🌐 ציבורי'
                  : trip.visibility === 'private'
                    ? '🔗 פרטי'
                    : '📝 טיוטה'
              }
              variant="outlined"
              color={trip.visibility === 'public' ? 'success' : 'default'}
            />
            {trip.status === 'draft' && (
              <Button variant="contained" onClick={handlePublishTrip}>
                פרסם טיול
              </Button>
            )}
            {trip.status === 'published' && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleCancelTrip}
              >
                בטל טיול
              </Button>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Stats Overview */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  משתתפים מאושרים
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {confirmedParticipants.length}/{trip.maxParticipants}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  ממתינים לאישור
                </Typography>
                <Typography variant="h4" fontWeight={700}>
                  {pendingParticipants.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  תאריכים
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {new Date(trip.startDate).toLocaleDateString('he-IL')} -{' '}
                  {new Date(trip.endDate).toLocaleDateString('he-IL')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="caption" color="text.secondary">
                  מחיר למשתתף
                </Typography>
                <Typography variant="h5" fontWeight={700} color="primary">
                  ₪{trip.pricePerPerson.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label={t('tripDetails')} />
            <Tab label={`${t('participants')} (${trip.participants.length})`} />
            <Tab label={t('itinerary')} />
            <Tab icon={<Settings />} label={t('management')} iconPosition="start" />
          </Tabs>

          {/* Tab 0: Trip Details */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                פרטי הטיול
              </Typography>

              {/* Visibility Setting */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" gutterBottom>
                  נראות הטיול
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Chip
                    label="🌐 ציבורי - מופיע באתר"
                    onClick={() => handleUpdateVisibility('public')}
                    color={trip.visibility === 'public' ? 'success' : 'default'}
                    variant={
                      trip.visibility === 'public' ? 'filled' : 'outlined'
                    }
                  />
                  <Chip
                    label="🔗 פרטי - נגיש בלינק"
                    onClick={() => handleUpdateVisibility('private')}
                    color={
                      trip.visibility === 'private' ? 'primary' : 'default'
                    }
                    variant={
                      trip.visibility === 'private' ? 'filled' : 'outlined'
                    }
                  />
                  <Chip
                    label="📝 טיוטה - רק אני"
                    onClick={() => handleUpdateVisibility('draft')}
                    color={trip.visibility === 'draft' ? 'warning' : 'default'}
                    variant={
                      trip.visibility === 'draft' ? 'filled' : 'outlined'
                    }
                  />
                </Box>
                {trip.visibility === 'private' && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    לינק לטיול: {window.location.origin}/organized-trips/
                    {trip._id}
                  </Alert>
                )}
              </Paper>

              <Typography variant="h6" gutterBottom>
                תיאור
              </Typography>
              <Typography variant="body1" paragraph>
                {trip.description}
              </Typography>

              <Divider sx={{ my: 3 }} />

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom color="success.main">
                    ✓ כלול במחיר
                  </Typography>
                  <List dense>
                    {trip.includedServices.map((service, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={service} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom color="error.main">
                    ✗ לא כלול במחיר
                  </Typography>
                  <List dense>
                    {trip.notIncludedServices.map((service, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={service} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>

              {trip.importantNotes && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="h6" gutterBottom>
                    הערות חשובות
                  </Typography>
                  <Alert severity="info">{trip.importantNotes}</Alert>
                </>
              )}
            </Box>
          </TabPanel>

          {/* Tab 1: Participants */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 2 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}
              >
                <Typography variant="h6">רשימת משתתפים</Typography>
                <Button
                  startIcon={<PersonAdd />}
                  variant="contained"
                  onClick={() => setInviteDialogOpen(true)}
                >
                  הזמן משתתף
                </Button>
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>שם</TableCell>
                      <TableCell>אימייל</TableCell>
                      <TableCell>טלפון</TableCell>
                      <TableCell>סטטוס</TableCell>
                      <TableCell>רישום</TableCell>
                      <TableCell>תאריך הצטרפות</TableCell>
                      <TableCell>פעולות</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trip.participants.map((participant) => (
                      <TableRow key={participant._id}>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Avatar>{participant.name[0]}</Avatar>
                            {participant.name}
                          </Box>
                        </TableCell>
                        <TableCell>{participant.email}</TableCell>
                        <TableCell>
                          {participant.phone || (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              לא צוין
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            {getParticipantStatusIcon(participant.status)}
                            <Chip
                              label={participant.status}
                              size="small"
                              color={
                                participant.status === 'confirmed' ||
                                participant.status === 'paid'
                                  ? 'success'
                                  : participant.status === 'invited'
                                    ? 'warning'
                                    : 'default'
                              }
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              participant.isRegistered
                                ? '🟢 רשום'
                                : '🔴 לא רשום'
                            }
                            size="small"
                            color={
                              participant.isRegistered ? 'success' : 'default'
                            }
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {participant.joinedAt
                            ? new Date(participant.joinedAt).toLocaleDateString(
                                'he-IL'
                              )
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" color="error">
                            <Delete />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </TabPanel>

          {/* Tab 2: Itinerary */}
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ p: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
                <Box>
                  <Typography variant="h6" gutterBottom>
                    מסלול הטיול - יום אחר יום
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    כך נראה המסלול למשתתפים בדף הציבורי
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Edit />}
                  onClick={handleEditItinerary}
                >
                  ערוך מסלול
                </Button>
              </Box>

              {trip.itinerary && trip.itinerary.length > 0 ? (
                <Box sx={{ mt: 3 }}>
                  {trip.itinerary.map((day, index) => (
                    <Paper
                      key={index}
                      variant="outlined"
                      sx={{
                        p: 3,
                        mb: 2,
                        bgcolor: 'background.default',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          mb: 2,
                        }}
                      >
                        <Chip
                          label={`יום ${day.day}`}
                          color="primary"
                          sx={{ fontWeight: 700 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {new Date(day.date).toLocaleDateString('he-IL', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Typography>
                      </Box>
                      <Typography
                        variant="h6"
                        fontWeight={600}
                        gutterBottom
                        sx={{ mt: 1 }}
                      >
                        {day.title}
                      </Typography>
                      {day.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          paragraph
                        >
                          {day.description}
                        </Typography>
                      )}
                      {day.activities && day.activities.length > 0 && (
                        <List dense>
                          {day.activities.map((activity, actIdx) => (
                            <ListItem key={actIdx} sx={{ pl: 0 }}>
                              <ListItemAvatar>
                                <Avatar
                                  sx={{
                                    bgcolor:
                                      activity.type === 'accommodation'
                                        ? 'primary.main'
                                        : activity.type === 'meal'
                                          ? 'success.main'
                                          : activity.type === 'attraction'
                                            ? 'secondary.main'
                                            : activity.type === 'transport'
                                              ? 'info.main'
                                              : 'action.active',
                                    width: 32,
                                    height: 32,
                                  }}
                                >
                                  {activity.type === 'accommodation'
                                    ? '🏨'
                                    : activity.type === 'meal'
                                      ? '🍽️'
                                      : activity.type === 'attraction'
                                        ? '🎯'
                                        : activity.type === 'transport'
                                          ? '✈️'
                                          : '📝'}
                                </Avatar>
                              </ListItemAvatar>
                              <ListItemText
                                primary={
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {activity.time && (
                                      <Typography
                                        variant="body2"
                                        color="primary"
                                        fontWeight={600}
                                        sx={{ minWidth: 50 }}
                                      >
                                        {activity.time}
                                      </Typography>
                                    )}
                                    <Typography
                                      variant="body1"
                                      fontWeight={500}
                                    >
                                      {activity.title}
                                    </Typography>
                                  </Box>
                                }
                                secondary={
                                  <>
                                    {activity.description && (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        component="span"
                                        display="block"
                                      >
                                        {activity.description}
                                      </Typography>
                                    )}
                                    {activity.location && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        component="span"
                                        display="block"
                                        sx={{ mt: 0.5 }}
                                      >
                                        📍 {activity.location}
                                      </Typography>
                                    )}
                                  </>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      )}
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Alert severity="info" sx={{ mt: 2 }}>
                  טרם הוגדר מסלול לטיול זה. ניתן להוסיף מסלול בעת יצירת הטיול.
                </Alert>
              )}
            </Box>
          </TabPanel>

          {/* Tab 3: Management (Documents + Updates) */}
          <TabPanel value={tabValue} index={3}>
            <Box sx={{ p: 2 }}>
              {/* Documents Section */}
              <Box sx={{ mb: 4 }}>
                <Box
                  sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}
                >
                  <Typography variant="h6" fontWeight={700}>
                    {t('documents')}
                  </Typography>
                  <Button
                    startIcon={<CloudUpload />}
                    variant="contained"
                    size="small"
                    onClick={() => setUploadDialogOpen(true)}
                  >
                    {t('uploadDocument')}
                  </Button>
                </Box>

                <Grid container spacing={2}>
                  {trip?.documents?.map((doc) => (
                    <Grid item xs={12} sm={6} md={4} key={doc._id}>
                      <Card
                        sx={{
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                          },
                        }}
                      >
                        <CardContent>
                          <Box
                            sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                          >
                            <Description color="primary" fontSize="large" />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="subtitle1" fontWeight={600}>
                                {doc.title}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {new Date(doc.uploadedAt).toLocaleDateString(
                                  'he-IL'
                                )}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                  {(!trip?.documents || trip.documents.length === 0) && (
                    <Grid item xs={12}>
                      <Alert severity="info">{t('noDocumentsYet')}</Alert>
                    </Grid>
                  )}
                </Grid>
              </Box>

              <Divider sx={{ my: 4 }} />

              {/* Updates Section */}
              <Box>
                <Box
                  sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}
                >
                  <Typography variant="h6" fontWeight={700}>
                    {t('updates')}
                  </Typography>
                  <Button
                    startIcon={<Send />}
                    variant="contained"
                    size="small"
                    onClick={() => setUpdateDialogOpen(true)}
                  >
                    {t('sendUpdate')}
                  </Button>
                </Box>

                <List>
                  {trip?.updates?.map((update: any) => (
                    <Paper
                      key={update._id}
                      sx={{
                        mb: 2,
                        p: 2,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        },
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600}>
                        {update.title}
                      </Typography>
                      <Typography variant="body2" paragraph>
                        {update.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(update.createdAt).toLocaleString('he-IL')}
                      </Typography>
                    </Paper>
                  ))}
                  {(!trip?.updates || trip.updates.length === 0) && (
                    <Alert severity="info">{t('noUpdatesYet')}</Alert>
                  )}
                </List>
              </Box>
            </Box>
          </TabPanel>
        </Paper>

        {/* Invite Dialog */}
        <Dialog
          open={inviteDialogOpen}
          onClose={() => setInviteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>הזמן משתתף לטיול</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
              ניתן להוסיף משתתף גם אם הוא עדיין לא רשום במערכת. אם יירשם מאוחר
              יותר עם אותו מייל, הטיול יתקשר אליו אוטומטית.
            </Alert>
            <TextField
              fullWidth
              label={t('fullName') + ' *'}
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label={t('emailAddress') + ' *'}
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label={t('phoneOptional')}
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              placeholder="050-1234567"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInviteDialogOpen(false)}>ביטול</Button>
            <Button
              variant="contained"
              onClick={handleInviteParticipant}
              disabled={!inviteEmail || !inviteName}
            >
              שלח הזמנה
            </Button>
          </DialogActions>
        </Dialog>

        {/* Update Dialog */}
        <Dialog
          open={updateDialogOpen}
          onClose={() => setUpdateDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>שלח עדכון למשתתפים</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label={t('title')}
              value={updateTitle}
              onChange={(e) => setUpdateTitle(e.target.value)}
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              rows={4}
              label={t('message')}
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUpdateDialogOpen(false)}>ביטול</Button>
            <Button
              variant="contained"
              onClick={handleSendUpdate}
              disabled={!updateTitle || !updateMessage}
            >
              שלח עדכון
            </Button>
          </DialogActions>
        </Dialog>

        {/* Upload Dialog */}
        <Dialog
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>העלה מסמך</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label={t('documentTitle')}
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              sx={{ mt: 2, mb: 2 }}
            />
            <Button variant="outlined" component="label" fullWidth>
              <Upload sx={{ mr: 1 }} />
              בחר קובץ
              <input
                type="file"
                hidden
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
              />
            </Button>
            {documentFile && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                קובץ נבחר: {documentFile.name}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUploadDialogOpen(false)}>ביטול</Button>
            <Button
              variant="contained"
              onClick={handleUploadDocument}
              disabled={!documentTitle || !documentFile}
            >
              העלה
            </Button>
          </DialogActions>
        </Dialog>

        {/* Itinerary Edit Dialog */}
        <Dialog
          open={itineraryDialogOpen}
          onClose={() => setItineraryDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>ערוך מסלול טיול</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 2 }}>
              <ItineraryBuilder
                itinerary={editedItinerary}
                onChange={setEditedItinerary}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setItineraryDialogOpen(false)}>ביטול</Button>
            <Button variant="contained" onClick={handleSaveItinerary}>
              שמור מסלול
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}

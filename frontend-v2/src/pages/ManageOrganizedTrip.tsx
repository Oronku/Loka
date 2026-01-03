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
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getOrganizedTrip,
  inviteParticipant,
  sendTripUpdate,
  uploadTripDocument,
  publishTrip,
  cancelTrip,
} from '../services/organizedTripsApi';
import { OrganizedTrip, Participant } from '../types/organizedTrip';

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
  const [tabValue, setTabValue] = useState(0);
  const [trip, setTrip] = useState<OrganizedTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

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
      setError(err.response?.data?.message || 'שגיאה בטעינת הטיול');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteParticipant = async () => {
    if (!tripId || !inviteEmail || !inviteName) return;
    try {
      await inviteParticipant(tripId, { email: inviteEmail, name: inviteName });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteName('');
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בשליחת הזמנה');
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
      setError(err.response?.data?.message || 'שגיאה בשליחת עדכון');
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
      setError(err.response?.data?.message || 'שגיאה בהעלאת מסמך');
    }
  };

  const handlePublishTrip = async () => {
    if (!tripId) return;
    try {
      await publishTrip(tripId);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בפרסום טיול');
    }
  };

  const handleCancelTrip = async () => {
    if (!tripId || !confirm('האם אתה בטוח שברצונך לבטל טיול זה?')) return;
    try {
      await cancelTrip(tripId);
      loadTrip();
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בביטול טיול');
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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'published':
        return 'פורסם';
      case 'draft':
        return 'טיוטה';
      case 'cancelled':
        return 'בוטל';
      case 'completed':
        return 'הסתיים';
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
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={getStatusText(trip.status)}
              color={getStatusColor(trip.status)}
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
            <Tab label="פרטי טיול" />
            <Tab label={`משתתפים (${trip.participants.length})`} />
            <Tab label="מסמכים" />
            <Tab label="עדכונים" />
          </Tabs>

          {/* Tab 0: Trip Details */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 2 }}>
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
                      <TableCell>סטטוס</TableCell>
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

          {/* Tab 2: Documents */}
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ p: 2 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}
              >
                <Typography variant="h6">מסמכי הטיול</Typography>
                <Button
                  startIcon={<CloudUpload />}
                  variant="contained"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  העלה מסמך
                </Button>
              </Box>

              <Grid container spacing={2}>
                {trip.documents.map((doc) => (
                  <Grid item xs={12} sm={6} md={4} key={doc._id}>
                    <Card>
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
                {trip.documents.length === 0 && (
                  <Grid item xs={12}>
                    <Alert severity="info">אין מסמכים עדיין</Alert>
                  </Grid>
                )}
              </Grid>
            </Box>
          </TabPanel>

          {/* Tab 3: Updates */}
          <TabPanel value={tabValue} index={3}>
            <Box sx={{ p: 2 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}
              >
                <Typography variant="h6">עדכונים והודעות</Typography>
                <Button
                  startIcon={<Send />}
                  variant="contained"
                  onClick={() => setUpdateDialogOpen(true)}
                >
                  שלח עדכון
                </Button>
              </Box>

              <List>
                {trip.updates.map((update) => (
                  <Paper key={update._id} sx={{ mb: 2, p: 2 }}>
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
                {trip.updates.length === 0 && (
                  <Alert severity="info">אין עדכונים עדיין</Alert>
                )}
              </List>
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
            <TextField
              fullWidth
              label="שם מלא"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              fullWidth
              label="כתובת אימייל"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
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
              label="כותרת"
              value={updateTitle}
              onChange={(e) => setUpdateTitle(e.target.value)}
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              fullWidth
              multiline
              rows={4}
              label="הודעה"
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
              label="כותרת המסמך"
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
      </Box>
    </Container>
  );
}

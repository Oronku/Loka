import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Business,
  People,
  TrendingUp,
  AttachMoney,
  FlightTakeoff,
  Person,
  Edit,
  Delete,
  Add,
  AddCircleOutline,
} from '@mui/icons-material';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';

interface AgencyStat {
  agencyName: string;
  totalAgents: number;
  totalTrips: number;
  publishedTrips: number;
  activeTrips: number;
  totalParticipants: number;
  totalRevenue: number;
  upcomingDepartures: number;
  recentTrips: any[];
  agents: any[];
}

interface Agent {
  _id: string;
  name: string;
  email: string;
  agentPhone?: string;
  agencyLicense?: string;
  isAdmin: boolean;
  isAgencyAdmin: boolean;
  tripCount: number;
  activeTrips: number;
}

export default function AgencyDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AgencyStat | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState(0);

  // Dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Form states
  const [editForm, setEditForm] = useState({
    agentPhone: '',
    agencyLicense: '',
    isAgencyAdmin: false,
  });

  const [inviteForm, setInviteForm] = useState({
    email: '',
    name: '',
  });

  useEffect(() => {
    loadAgencyData();
  }, []);

  const loadAgencyData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsRes, agentsRes, invitationsRes] = await Promise.all([
        api.get('/agency/stats'),
        api.get('/agency/agents'),
        api.get('/agency/invitations'),
      ]);

      setStats(statsRes.data);
      setAgents(agentsRes.data);
      setInvitations(invitationsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorLoadingAgencyData'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setEditForm({
      agentPhone: agent.agentPhone || '',
      agencyLicense: agent.agencyLicense || '',
      isAgencyAdmin: agent.isAgencyAdmin,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAgent) return;

    try {
      await api.put(`/agency/agents/${selectedAgent._id}`, editForm);
      setEditDialogOpen(false);
      loadAgencyData();
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorUpdatingAgent'));
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (!confirm(t('confirmRemoveAgent'))) {
      return;
    }

    try {
      await api.delete(`/agency/agents/${agentId}`);
      loadAgencyData();
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorRemovingAgent'));
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteForm.email) {
      setError(t('pleaseEnterEmail'));
      return;
    }

    try {
      await api.post('/agency/invitations/send', inviteForm);
      setInviteDialogOpen(false);
      setInviteForm({ email: '', name: '' });
      loadAgencyData();
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorSendingInvitation'));
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await api.delete(`/agency/invitations/${invitationId}`);
      loadAgencyData();
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorCancellingInvitation'));
    }
  };

  const openInviteDialog = () => {
    setInviteDialogOpen(true);
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

  if (!stats) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="error">לא נמצאו נתוני סוכנות</Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              mb: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Business fontSize="large" color="primary" />
              <Box>
                <Typography variant="h4" fontWeight={700}>
                  ניהול סוכנות
                </Typography>
                <Typography variant="h5" color="primary" fontWeight={600}>
                  {stats.agencyName}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddCircleOutline />}
              onClick={() => navigate('/agency/trips/new')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                boxShadow: '0 4px 15px rgba(25, 118, 210, 0.3)',
                '&:hover': {
                  boxShadow: '0 6px 20px rgba(25, 118, 210, 0.4)',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.3s',
              }}
            >
              {t('createTrip')}
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <People color="primary" />
                  <Typography color="text.secondary">סוכנים</Typography>
                </Box>
                <Typography variant="h3" fontWeight={700}>
                  {stats.totalAgents}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FlightTakeoff color="success" />
                  <Typography color="text.secondary">טיולים פעילים</Typography>
                </Box>
                <Typography variant="h3" fontWeight={700}>
                  {stats.activeTrips}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  מתוך {stats.totalTrips} סה״כ
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp color="info" />
                  <Typography color="text.secondary">משתתפים</Typography>
                </Box>
                <Typography variant="h3" fontWeight={700}>
                  {stats.totalParticipants}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AttachMoney color="warning" />
                  <Typography color="text.secondary">הכנסות</Typography>
                </Box>
                <Typography variant="h3" fontWeight={700}>
                  ₪{stats.totalRevenue.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs value={selectedTab} onChange={(e, v) => setSelectedTab(v)}>
            <Tab label={t('agents')} />
            <Tab label={t('pendingInvitations')} />
            <Tab label={t('recentTrips')} />
          </Tabs>
        </Paper>

        {/* Agents Tab */}
        {selectedTab === 0 && (
          <Paper sx={{ p: 3 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 3,
              }}
            >
              <Typography variant="h6" fontWeight={600}>
                סוכני הסוכנות ({agents.length})
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={openInviteDialog}
              >
                הזמן סוכן
              </Button>
            </Box>

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>שם</TableCell>
                    <TableCell>אימייל</TableCell>
                    <TableCell>טלפון</TableCell>
                    <TableCell>רישיון</TableCell>
                    <TableCell>טיולים</TableCell>
                    <TableCell>סטטוס</TableCell>
                    <TableCell>פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent._id}>
                      <TableCell>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Person />
                          {agent.name}
                        </Box>
                      </TableCell>
                      <TableCell>{agent.email}</TableCell>
                      <TableCell>{agent.agentPhone || '-'}</TableCell>
                      <TableCell>{agent.agencyLicense || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={`${agent.activeTrips} פעילים / ${agent.tripCount} סה״כ`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {agent.isAdmin && (
                          <Chip label={t('globalAdmin')} size="small" color="error" />
                        )}
                        {agent.isAgencyAdmin && (
                          <Chip
                            label={t('agencyAdmin')}
                            size="small"
                            color="secondary"
                            sx={{ ml: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          startIcon={<Edit />}
                          onClick={() => handleEditAgent(agent)}
                        >
                          ערוך
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<Delete />}
                          onClick={() => handleRemoveAgent(agent._id)}
                        >
                          הסר
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Invitations Tab */}
        {selectedTab === 1 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
              הזמנות ממתינות (
              {invitations.filter((i) => i.status === 'pending').length})
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>מייל</TableCell>
                    <TableCell>שם</TableCell>
                    <TableCell>הוזמן על ידי</TableCell>
                    <TableCell>תאריך</TableCell>
                    <TableCell>סטטוס</TableCell>
                    <TableCell>פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation._id}>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>{invitation.name || '-'}</TableCell>
                      <TableCell>{invitation.invitedByName}</TableCell>
                      <TableCell>
                        {new Date(invitation.createdAt).toLocaleDateString(
                          'he-IL'
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            invitation.status === 'pending'
                              ? t('pending')
                              : invitation.status === 'accepted'
                                ? t('accepted')
                                : invitation.status === 'rejected'
                                  ? t('rejected')
                                  : t('expired')
                          }
                          size="small"
                          color={
                            invitation.status === 'pending'
                              ? 'warning'
                              : invitation.status === 'accepted'
                                ? 'success'
                                : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {invitation.status === 'pending' && (
                          <Button
                            size="small"
                            color="error"
                            startIcon={<Delete />}
                            onClick={() =>
                              handleCancelInvitation(invitation._id)
                            }
                          >
                            בטל
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Recent Trips Tab */}
        {selectedTab === 2 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
              טיולים אחרונים
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>כותרת</TableCell>
                    <TableCell>יעד</TableCell>
                    <TableCell>תאריך יציאה</TableCell>
                    <TableCell>סוכן</TableCell>
                    <TableCell>משתתפים</TableCell>
                    <TableCell>סטטוס</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.recentTrips.map((trip) => (
                    <TableRow key={trip._id}>
                      <TableCell>{trip.title}</TableCell>
                      <TableCell>{trip.destination}</TableCell>
                      <TableCell>
                        {new Date(trip.startDate).toLocaleDateString('he-IL')}
                      </TableCell>
                      <TableCell>{trip.agentName}</TableCell>
                      <TableCell>
                        {trip.participants}/{trip.maxParticipants}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={
                            trip.status === 'published' ? t('published') : t('draft')
                          }
                          size="small"
                          color={
                            trip.status === 'published' ? 'success' : 'default'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Edit Agent Dialog */}
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
          <DialogTitle>עריכת סוכן</DialogTitle>
          <DialogContent>
            <Box
              sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                fullWidth
                label={t('phone')}
                value={editForm.agentPhone}
                onChange={(e) =>
                  setEditForm({ ...editForm, agentPhone: e.target.value })
                }
              />
              <TextField
                fullWidth
                label={t('licenseNumber')}
                value={editForm.agencyLicense}
                onChange={(e) =>
                  setEditForm({ ...editForm, agencyLicense: e.target.value })
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editForm.isAgencyAdmin}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        isAgencyAdmin: e.target.checked,
                      })
                    }
                  />
                }
                label={t('agencyAdmin')}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)}>ביטול</Button>
            <Button variant="contained" onClick={handleSaveEdit}>
              שמור
            </Button>
          </DialogActions>
        </Dialog>

        {/* Add Agent Dialog */}
        <Dialog
          open={inviteDialogOpen}
          onClose={() => setInviteDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>הזמן סוכן לסוכנות</DialogTitle>
          <DialogContent>
            <Box
              sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Alert severity="info">
                שלח הזמנה למייל של המשתמש. המשתמש יקבל הודעה ויוכל לאשר את
                ההצטרפות לסוכנות שלך.
              </Alert>
              <TextField
                fullWidth
                label={t('emailAddress')}
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
                placeholder="example@email.com"
              />
              <TextField
                fullWidth
                label={t('nameOptional')}
                value={inviteForm.name}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, name: e.target.value })
                }
                placeholder={t('userName')}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInviteDialogOpen(false)}>ביטול</Button>
            <Button variant="contained" onClick={handleSendInvitation}>
              שלח הזמנה
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Avatar,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Business,
  Edit,
  Delete,
  PersonAdd,
  AdminPanelSettings,
  VerifiedUser,
} from '@mui/icons-material';
import { api } from '../../services/api';

interface Agent {
  _id: string;
  name: string;
  email: string;
  isAgent: boolean;
  isAdmin: boolean;
  agencyName?: string;
  agencyLicense?: string;
  agentPhone?: string;
  createdAt: string;
  tripsCount?: number;
}

export default function AgentsManagement() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [allUsers, setAllUsers] = useState<Agent[]>([]);

  // Form states
  const [agencyName, setAgencyName] = useState('');
  const [agencyLicense, setAgencyLicense] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/agents');
      setAgents(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בטעינת סוכנים');
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const response = await api.get('/admin/users/all');
      // Filter out users who are already agents
      const nonAgentUsers = response.data.filter(
        (user: Agent) => !user.isAgent
      );
      setAllUsers(nonAgentUsers);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בטעינת משתמשים');
    }
  };

  const handleOpenAddAgent = () => {
    loadAllUsers();
    setAddAgentDialogOpen(true);
  };

  const handleMakeUserAgent = async (userId: string) => {
    try {
      await api.patch(`/admin/agents/${userId}/toggle-agent`, {
        isAgent: true,
      });
      setAddAgentDialogOpen(false);
      await loadAgents();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בהפיכת משתמש לסוכן');
    }
  };

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setAgencyName(agent.agencyName || '');
    setAgencyLicense(agent.agencyLicense || '');
    setAgentPhone(agent.agentPhone || '');
    setIsAdmin(agent.isAdmin || false);
    setEditDialogOpen(true);
  };

  const handleSaveAgent = async () => {
    if (!selectedAgent) return;

    try {
      await api.put(`/admin/agents/${selectedAgent._id}`, {
        agencyName,
        agencyLicense,
        agentPhone,
        isAdmin,
      });

      setEditDialogOpen(false);
      setSelectedAgent(null);
      await loadAgents();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בעדכון הסוכן');
    }
  };

  const handleToggleAgentStatus = async (
    agentId: string,
    currentStatus: boolean
  ) => {
    try {
      await api.patch(`/admin/agents/${agentId}/toggle-agent`, {
        isAgent: !currentStatus,
      });
      await loadAgents();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בעדכון סטטוס סוכן');
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('האם אתה בטוח שברצונך להסיר הרשאות סוכן ממשתמש זה?')) {
      return;
    }

    try {
      await api.delete(`/admin/agents/${agentId}`);
      await loadAgents();
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה במחיקת הסוכן');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            <Business sx={{ verticalAlign: 'middle', mr: 1 }} />
            ניהול סוכנים וסוכנויות
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ניהול משתמשים עם הרשאות סוכן וסוכנות
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={handleOpenAddAgent}
        >
          הוסף סוכן
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>שם</TableCell>
                <TableCell>אימייל</TableCell>
                <TableCell>סוכנות</TableCell>
                <TableCell>רישיון</TableCell>
                <TableCell>טלפון</TableCell>
                <TableCell>טיולים</TableCell>
                <TableCell>סטטוס</TableCell>
                <TableCell align="center">פעולות</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 3 }}
                    >
                      לא נמצאו סוכנים במערכת
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                agents.map((agent) => (
                  <TableRow key={agent._id} hover>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: 'primary.main',
                          }}
                        >
                          {agent.name[0]}
                        </Avatar>
                        {agent.name}
                      </Box>
                    </TableCell>
                    <TableCell>{agent.email}</TableCell>
                    <TableCell>{agent.agencyName || '-'}</TableCell>
                    <TableCell>{agent.agencyLicense || '-'}</TableCell>
                    <TableCell>{agent.agentPhone || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        label={agent.tripsCount || 0}
                        size="small"
                        color={agent.tripsCount ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {agent.isAdmin && (
                          <Chip
                            icon={<AdminPanelSettings />}
                            label="Admin"
                            size="small"
                            color="error"
                          />
                        )}
                        {agent.isAgent && (
                          <Chip
                            icon={<VerifiedUser />}
                            label="Agent"
                            size="small"
                            color="success"
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1,
                          justifyContent: 'center',
                        }}
                      >
                        <Tooltip title="ערוך פרטים">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleEditAgent(agent)}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={
                            agent.isAgent ? 'הסר הרשאות סוכן' : 'הפוך לסוכן'
                          }
                        >
                          <IconButton
                            size="small"
                            color={agent.isAgent ? 'warning' : 'success'}
                            onClick={() =>
                              handleToggleAgentStatus(agent._id, agent.isAgent)
                            }
                          >
                            <VerifiedUser fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="הסר מסוכנים">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteAgent(agent._id)}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Edit Agent Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>ערוך פרטי סוכן - {selectedAgent?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="שם סוכנות"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="לדוגמה: Oron Travel Agency"
            />
            <TextField
              fullWidth
              label="מספר רישיון"
              value={agencyLicense}
              onChange={(e) => setAgencyLicense(e.target.value)}
              placeholder="לדוגמה: IL-2026-001"
            />
            <TextField
              fullWidth
              label="טלפון"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              placeholder="לדוגמה: 050-1234567"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  color="error"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AdminPanelSettings />
                  <Typography>הרשאות Admin</Typography>
                </Box>
              }
            />
            <Alert severity="info">
              <Typography variant="body2">
                <strong>הרשאות Admin:</strong> גישה מלאה למערכת כולל ניהול
                משתמשים וסוכנים
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSaveAgent}>
            שמור
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Agent Dialog */}
      <Dialog
        open={addAgentDialogOpen}
        onClose={() => setAddAgentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>הוסף סוכן חדש</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              בחר משתמש מהרשימה להפוך לסוכן:
            </Typography>
            {allUsers.length === 0 ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                כל המשתמשים במערכת כבר הם סוכנים
              </Alert>
            ) : (
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ mt: 2 }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>שם</TableCell>
                      <TableCell>אימייל</TableCell>
                      <TableCell align="center">פעולה</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allUsers.map((user) => (
                      <TableRow key={user._id} hover>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Avatar sx={{ width: 28, height: 28 }}>
                              {user.name[0]}
                            </Avatar>
                            {user.name}
                          </Box>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<VerifiedUser />}
                            onClick={() => handleMakeUserAgent(user._id)}
                          >
                            הפוך לסוכן
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddAgentDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

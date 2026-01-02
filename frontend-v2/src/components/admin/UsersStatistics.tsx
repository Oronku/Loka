import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip as MUITooltip,
} from '@mui/material';
import {
  People as PeopleIcon,
  TrendingUp,
  PersonAdd,
  DateRange,
  AdminPanelSettings,
  Person,
  ManageAccounts,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../services/api';

interface UsersStatisticsProps {
  compact?: boolean;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userGrowth: Array<{ month: string; users: number }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    tripsCount: number;
  }>;
}

interface User {
  _id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
  createdAt: string;
  tripsCount: number;
  picture?: string;
}

export default function UsersStatistics({
  compact = false,
}: UsersStatisticsProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: User | null;
  }>({ open: false, user: null });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/users/statistics');
      setStats(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load user statistics');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await api.get('/admin/users/all');
      setAllUsers(response.data);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenManageDialog = () => {
    setManageDialogOpen(true);
    fetchAllUsers();
  };

  const handleCloseManageDialog = () => {
    setManageDialogOpen(false);
  };

  const handleToggleAdmin = async (user: User) => {
    try {
      await api.post(`/admin/users/${user._id}/toggle-admin`);
      // Refresh the user list
      await fetchAllUsers();
      setConfirmDialog({ open: false, user: null });
    } catch (err: any) {
      console.error('Failed to toggle admin:', err);
      alert(err.response?.data?.message || 'Failed to update user');
    }
  };

  const openConfirmDialog = (user: User) => {
    setConfirmDialog({ open: true, user });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({ open: false, user: null });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!stats) {
    return <Alert severity="info">No statistics available</Alert>;
  }

  const StatCard = ({ title, value, icon, color, subtitle }: any) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
        >
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ my: 1 }}>
              {value.toLocaleString()}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: color, width: 56, height: 56 }}>{icon}</Avatar>
        </Stack>
      </CardContent>
    </Card>
  );

  if (compact) {
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          👥 Users
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={<PeopleIcon />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Users"
              value={stats.activeUsers}
              icon={<TrendingUp />}
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="New This Month"
              value={stats.newUsersThisMonth}
              icon={<PersonAdd />}
              color="info.main"
            />
          </Grid>
        </Grid>
      </Box>
    );
  }

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
          Users Statistics
        </Typography>
        <Button
          variant="contained"
          startIcon={<ManageAccounts />}
          onClick={handleOpenManageDialog}
        >
          Manage Users
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={stats.totalUsers}
            icon={<PeopleIcon />}
            color="primary.main"
            subtitle="All registered users"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Users"
            value={stats.activeUsers}
            icon={<TrendingUp />}
            color="success.main"
            subtitle="Active in last 30 days"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="New This Month"
            value={stats.newUsersThisMonth}
            icon={<PersonAdd />}
            color="info.main"
            subtitle="New registrations"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Growth Rate"
            value={`${((stats.newUsersThisMonth / stats.totalUsers) * 100).toFixed(1)}%`}
            icon={<DateRange />}
            color="warning.main"
            subtitle="Monthly growth"
          />
        </Grid>
      </Grid>

      {/* User Growth Chart */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            User Growth Over Time
          </Typography>
          <Box sx={{ height: 300, mt: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#1976d2"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Recent Users */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Users
          </Typography>
          <List>
            {stats.recentUsers.map((user) => (
              <ListItem
                key={user.id}
                secondaryAction={
                  <Chip
                    label={`${user.tripsCount} trips`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                }
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    {user.name.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={user.name}
                  secondary={
                    <>
                      {user.email}
                      {' • '}
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      {/* Manage Users Dialog */}
      <Dialog
        open={manageDialogOpen}
        onClose={handleCloseManageDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ManageAccounts />
            <Typography variant="h6">Manage Users</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingUsers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="center">Trips</TableCell>
                  <TableCell align="center">Admin</TableCell>
                  <TableCell align="center">Joined</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allUsers.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Avatar
                          src={user.picture}
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: 'primary.main',
                          }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography>{user.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={user.tripsCount}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {user.isAdmin ? (
                        <Chip
                          icon={<AdminPanelSettings />}
                          label="Admin"
                          size="small"
                          color="success"
                        />
                      ) : (
                        <Chip
                          icon={<Person />}
                          label="User"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <MUITooltip
                        title={
                          user.isAdmin
                            ? 'Remove admin privileges'
                            : 'Grant admin privileges'
                        }
                      >
                        <IconButton
                          size="small"
                          color={user.isAdmin ? 'error' : 'primary'}
                          onClick={() => openConfirmDialog(user)}
                        >
                          {user.isAdmin ? <Person /> : <AdminPanelSettings />}
                        </IconButton>
                      </MUITooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseManageDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        maxWidth="xs"
      >
        <DialogTitle>Confirm Admin Status Change</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to{' '}
            {confirmDialog.user?.isAdmin
              ? 'remove admin privileges from'
              : 'grant admin privileges to'}{' '}
            <strong>{confirmDialog.user?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirmDialog}>Cancel</Button>
          <Button
            onClick={() =>
              confirmDialog.user && handleToggleAdmin(confirmDialog.user)
            }
            variant="contained"
            color={confirmDialog.user?.isAdmin ? 'error' : 'primary'}
          >
            {confirmDialog.user?.isAdmin ? 'Remove Admin' : 'Grant Admin'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

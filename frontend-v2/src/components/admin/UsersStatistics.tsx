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
} from '@mui/material';
import {
  People as PeopleIcon,
  TrendingUp,
  PersonAdd,
  DateRange,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

export default function UsersStatistics({
  compact = false,
}: UsersStatisticsProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Users Statistics
      </Typography>

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
                <Tooltip />
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
    </Box>
  );
}

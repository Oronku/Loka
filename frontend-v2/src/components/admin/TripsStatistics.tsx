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
  Avatar,
  Chip,
} from '@mui/material';
import {
  CardTravel as TripIcon,
  AccessTime,
  CheckCircle,
  Schedule,
  Cancel,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { api } from '../../services/api';

interface TripsStatisticsProps {
  compact?: boolean;
}

interface TripStats {
  totalTrips: number;
  upcomingTrips: number;
  ongoingTrips: number;
  completedTrips: number;
  averageDuration: number;
  tripsByMonth: Array<{
    month: string;
    count: number;
  }>;
  tripsByStatus: Array<{
    status: string;
    count: number;
  }>;
}

const COLORS = {
  upcoming: '#2196f3',
  ongoing: '#4caf50',
  completed: '#9e9e9e',
  cancelled: '#f44336',
};

export default function TripsStatistics({
  compact = false,
}: TripsStatisticsProps) {
  const [stats, setStats] = useState<TripStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/trips/statistics');
      setStats(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load trip statistics');
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
          🧳 Trips
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Trips"
              value={stats.totalTrips}
              icon={<TripIcon />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Ongoing"
              value={stats.ongoingTrips}
              icon={<AccessTime />}
              color="success.main"
            />
          </Grid>
        </Grid>
      </Box>
    );
  }

  const statusColors: Record<string, string> = {
    upcoming: COLORS.upcoming,
    ongoing: COLORS.ongoing,
    completed: COLORS.completed,
    cancelled: COLORS.cancelled,
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Trips Statistics
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Trips"
            value={stats.totalTrips}
            icon={<TripIcon />}
            color="primary.main"
            subtitle="All trips created"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Upcoming"
            value={stats.upcomingTrips}
            icon={<Schedule />}
            color="info.main"
            subtitle={`${((stats.upcomingTrips / stats.totalTrips) * 100).toFixed(0)}% of total`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Ongoing"
            value={stats.ongoingTrips}
            icon={<AccessTime />}
            color="success.main"
            subtitle="Active trips now"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={stats.completedTrips}
            icon={<CheckCircle />}
            color="grey.500"
            subtitle={`${((stats.completedTrips / stats.totalTrips) * 100).toFixed(0)}% of total`}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Trips Timeline */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trips Over Time
              </Typography>
              <Box sx={{ height: 350, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.tripsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#1976d2"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Trips by Status */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trips by Status
              </Typography>
              <Box sx={{ height: 350, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.tripsByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {stats.tripsByStatus.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={
                            statusColors[entry.status.toLowerCase()] || '#999'
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Additional Stats */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trip Insights
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography
                      variant="h3"
                      color="primary.main"
                      fontWeight={700}
                    >
                      {stats.averageDuration}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Average Days per Trip
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography
                      variant="h3"
                      color="success.main"
                      fontWeight={700}
                    >
                      {(
                        (stats.completedTrips / stats.totalTrips) *
                        100
                      ).toFixed(0)}
                      %
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completion Rate
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant="h3" color="info.main" fontWeight={700}>
                      {((stats.upcomingTrips / stats.totalTrips) * 100).toFixed(
                        0
                      )}
                      %
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Upcoming Trips
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography
                      variant="h3"
                      color="warning.main"
                      fontWeight={700}
                    >
                      {stats.ongoingTrips}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Right Now
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

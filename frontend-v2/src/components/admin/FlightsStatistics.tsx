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
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import {
  Flight as FlightIcon,
  FlightTakeoff,
  AirplanemodeActive,
  BusinessCenter,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
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

interface FlightsStatisticsProps {
  compact?: boolean;
}

interface FlightStats {
  totalFlights: number;
  domesticFlights: number;
  internationalFlights: number;
  popularRoutes: Array<{
    route: string;
    count: number;
  }>;
  popularAirlines: Array<{
    airline: string;
    count: number;
  }>;
  flightsByMonth: Array<{
    month: string;
    count: number;
  }>;
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
];

export default function FlightsStatistics({
  compact = false,
}: FlightsStatisticsProps) {
  const [stats, setStats] = useState<FlightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/flights/statistics');
      setStats(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Failed to load flight statistics'
      );
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
          ✈️ Flights
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Flights"
              value={stats.totalFlights}
              icon={<FlightIcon />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="International"
              value={stats.internationalFlights}
              icon={<FlightTakeoff />}
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
        Flights Statistics
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Flights"
            value={stats.totalFlights}
            icon={<FlightIcon />}
            color="primary.main"
            subtitle="All booked flights"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Domestic"
            value={stats.domesticFlights}
            icon={<AirplanemodeActive />}
            color="success.main"
            subtitle={`${((stats.domesticFlights / stats.totalFlights) * 100).toFixed(0)}% of total`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="International"
            value={stats.internationalFlights}
            icon={<FlightTakeoff />}
            color="info.main"
            subtitle={`${((stats.internationalFlights / stats.totalFlights) * 100).toFixed(0)}% of total`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Popular Routes"
            value={stats.popularRoutes.length}
            icon={<BusinessCenter />}
            color="warning.main"
            subtitle="Unique routes"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Flight Bookings Timeline */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Flight Bookings Over Time
              </Typography>
              <Box sx={{ height: 300, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.flightsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Popular Routes */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Most Popular Routes
              </Typography>
              <List>
                {stats.popularRoutes.slice(0, 10).map((route, index) => (
                  <ListItem
                    key={route.route}
                    secondaryAction={
                      <Chip
                        label={`${route.count} flights`}
                        color="primary"
                        variant="outlined"
                      />
                    }
                  >
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ mr: 2 }}
                    >
                      <Typography variant="h6" color="text.secondary">
                        #{index + 1}
                      </Typography>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <FlightIcon />
                      </Avatar>
                    </Stack>
                    <ListItemText primary={route.route} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Popular Airlines */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Popular Airlines
              </Typography>
              <Box sx={{ height: 400, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.popularAirlines}
                      dataKey="count"
                      nameKey="airline"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      label
                    >
                      {stats.popularAirlines.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
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
      </Grid>
    </Box>
  );
}

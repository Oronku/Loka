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
import { Place as PlaceIcon, TravelExplore, Public } from '@mui/icons-material';
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

interface DestinationsStatisticsProps {
  compact?: boolean;
}

interface DestinationStats {
  totalDestinations: number;
  totalTrips: number;
  topDestinations: Array<{
    name: string;
    count: number;
    country?: string;
  }>;
  destinationsByContinent: Array<{
    continent: string;
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

export default function DestinationsStatistics({
  compact = false,
}: DestinationsStatisticsProps) {
  const [stats, setStats] = useState<DestinationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/destinations/statistics');
      setStats(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Failed to load destination statistics'
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

  const StatCard = ({ title, value, icon, color }: any) => (
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
          🌍 Destinations
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Destinations"
              value={stats.totalDestinations}
              icon={<PlaceIcon />}
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Trips"
              value={stats.totalTrips}
              icon={<TravelExplore />}
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
        Destinations Statistics
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Unique Destinations"
            value={stats.totalDestinations}
            icon={<PlaceIcon />}
            color="success.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total Trips"
            value={stats.totalTrips}
            icon={<TravelExplore />}
            color="info.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Avg Trips per Destination"
            value={(stats.totalTrips / stats.totalDestinations).toFixed(1)}
            icon={<Public />}
            color="primary.main"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Top Destinations */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Destinations
              </Typography>
              <Box sx={{ height: 400, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topDestinations}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Destinations by Continent */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Distribution by Region
              </Typography>
              <Box sx={{ height: 400, mt: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.destinationsByContinent}
                      dataKey="count"
                      nameKey="continent"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      label
                    >
                      {stats.destinationsByContinent.map((_entry, index) => (
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

        {/* Popular Destinations List */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Most Popular Destinations
              </Typography>
              <List>
                {stats.topDestinations.slice(0, 10).map((dest, index) => (
                  <ListItem
                    key={dest.name}
                    secondaryAction={
                      <Chip
                        label={`${dest.count} trips`}
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
                        <PlaceIcon />
                      </Avatar>
                    </Stack>
                    <ListItemText
                      primary={dest.name}
                      secondary={dest.country || 'Unknown country'}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

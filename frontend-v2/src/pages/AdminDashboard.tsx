import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Paper,
  Alert,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Flight as FlightIcon,
  Place as PlaceIcon,
  CardTravel as TripIcon,
} from '@mui/icons-material';

// Statistics Components (to be created)
import UsersStatistics from '../components/admin/UsersStatistics';
import DestinationsStatistics from '../components/admin/DestinationsStatistics';
import FlightsStatistics from '../components/admin/FlightsStatistics';
import TripsStatistics from '../components/admin/TripsStatistics';

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
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AdminDashboard() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            <DashboardIcon
              sx={{ fontSize: 40, mr: 2, verticalAlign: 'middle' }}
            />
            Admin Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            מערכת ניהול ובקרה - סטטיסטיקות ונתונים
          </Typography>
        </Box>

        {/* Admin Notice */}
        <Alert severity="info" sx={{ mb: 3 }}>
          🔒 You are viewing the admin dashboard with full system access
        </Alert>

        {/* Tabs */}
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Tab
              icon={<DashboardIcon />}
              label="Overview"
              iconPosition="start"
            />
            <Tab icon={<PeopleIcon />} label="Users" iconPosition="start" />
            <Tab
              icon={<PlaceIcon />}
              label="Destinations"
              iconPosition="start"
            />
            <Tab icon={<FlightIcon />} label="Flights" iconPosition="start" />
            <Tab icon={<TripIcon />} label="Trips" iconPosition="start" />
          </Tabs>

          {/* Tab Panels */}
          <TabPanel value={tabValue} index={0}>
            <Box>
              <Typography variant="h6" gutterBottom>
                System Overview
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Quick overview of all system statistics
              </Typography>
              {/* Overview will show summary cards from all sections */}
              <UsersStatistics compact />
              <DestinationsStatistics compact />
              <FlightsStatistics compact />
              <TripsStatistics compact />
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <UsersStatistics />
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <DestinationsStatistics />
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <FlightsStatistics />
          </TabPanel>

          <TabPanel value={tabValue} index={4}>
            <TripsStatistics />
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

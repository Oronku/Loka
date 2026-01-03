import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  Paper,
  Alert,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AddCircle as AddIcon,
  People as PeopleIcon,
  Flight as FlightIcon,
  CardTravel as TripIcon,
  TrendingUp,
  AttachMoney,
  EventAvailable,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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
      id={`agent-tabpanel-${index}`}
      aria-labelledby={`agent-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateTrip = () => {
    navigate('/agent/trips/new');
  };

  // Mock data - נחליף בנתונים אמיתיים מה-API
  const stats = {
    activeTrips: 5,
    totalParticipants: 87,
    upcomingDepartures: 3,
    revenue: 45000,
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                <DashboardIcon
                  sx={{ fontSize: 40, mr: 2, verticalAlign: 'middle' }}
                />
                Agent Dashboard
              </Typography>
              <Typography variant="body1" color="text.secondary">
                שלום {user?.name} | {user?.agencyName || 'סוכנות נסיעות'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreateTrip}
            >
              יצירת טיול מאורגן
            </Button>
          </Box>
        </Box>

        {/* Welcome Notice */}
        <Alert severity="info" sx={{ mb: 3 }}>
          👋 ברוכים הבאים לפאנל ניהול הטיולים המאורגנים שלך
        </Alert>

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <TripIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.activeTrips}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      טיולים פעילים
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                    <PeopleIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.totalParticipants}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      משתתפים כולל
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                    <EventAvailable />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {stats.upcomingDepartures}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      יציאות קרובות
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                    <AttachMoney />
                  </Avatar>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      ₪{stats.revenue.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      הכנסות חודש זה
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

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
            <Tab icon={<DashboardIcon />} label="סקירה" iconPosition="start" />
            <Tab icon={<TripIcon />} label="הטיולים שלי" iconPosition="start" />
            <Tab icon={<PeopleIcon />} label="משתתפים" iconPosition="start" />
            <Tab
              icon={<TrendingUp />}
              label="סטטיסטיקות"
              iconPosition="start"
            />
          </Tabs>

          {/* Tab Panels */}
          <TabPanel value={tabValue} index={0}>
            <Box>
              <Typography variant="h6" gutterBottom>
                טיולים קרובים
              </Typography>
              <Alert severity="info">בקרוב: רשימת הטיולים הקרובים שלך</Alert>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box>
              <Typography variant="h6" gutterBottom>
                כל הטיולים המאורגנים
              </Typography>
              <Alert severity="info">בקרוב: רשימת כל הטיולים שיצרת</Alert>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                ניהול משתתפים
              </Typography>
              <Alert severity="info">
                בקרוב: רשימת כל המשתתפים בטיולים שלך
              </Alert>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Box>
              <Typography variant="h6" gutterBottom>
                סטטיסטיקות מתקדמות
              </Typography>
              <Alert severity="info">בקרוב: דוחות ותובנות על הטיולים שלך</Alert>
            </Box>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

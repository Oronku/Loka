import { useState } from 'react';
import { Box, Container, Tabs, Tab, Typography, Paper } from '@mui/material';
import {
  Storefront,
  Inventory,
  Favorite,
  Chat,
  Notifications,
} from '@mui/icons-material';
import QuicketBrowse from '../components/QuicketBrowse';
import MyQuicketItems from '../components/MyQuicketItems';
import QuicketSaved from '../components/QuicketSaved';
import QuicketChats from '../components/QuicketChats';

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
      id={`quicket-tabpanel-${index}`}
      aria-labelledby={`quicket-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Quicket() {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Quicket Marketplace
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Buy and sell non-refundable travel items - flights, hotels,
          attractions, and events
        </Typography>

        <Paper sx={{ mt: 3 }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              px: 2,
            }}
          >
            <Tab
              icon={<Storefront />}
              iconPosition="start"
              label="Browse"
              id="quicket-tab-0"
              aria-controls="quicket-tabpanel-0"
            />
            <Tab
              icon={<Inventory />}
              iconPosition="start"
              label="My Items"
              id="quicket-tab-1"
              aria-controls="quicket-tabpanel-1"
            />
            <Tab
              icon={<Favorite />}
              iconPosition="start"
              label="Saved"
              id="quicket-tab-2"
              aria-controls="quicket-tabpanel-2"
            />
            <Tab
              icon={<Chat />}
              iconPosition="start"
              label="Chats"
              id="quicket-tab-3"
              aria-controls="quicket-tabpanel-3"
            />
            <Tab
              icon={<Notifications />}
              iconPosition="start"
              label="Alerts"
              id="quicket-tab-4"
              aria-controls="quicket-tabpanel-4"
            />
          </Tabs>

          <TabPanel value={currentTab} index={0}>
            <QuicketBrowse />
          </TabPanel>

          <TabPanel value={currentTab} index={1}>
            <MyQuicketItems />
          </TabPanel>

          <TabPanel value={currentTab} index={2}>
            <QuicketSaved />
          </TabPanel>

          <TabPanel value={currentTab} index={3}>
            <QuicketChats />
          </TabPanel>

          <TabPanel value={currentTab} index={4}>
            <Typography variant="h6">Alerts & Notifications</Typography>
            <Typography variant="body2" color="text.secondary">
              Alerts tab content coming soon...
            </Typography>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

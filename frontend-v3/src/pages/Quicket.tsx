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
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          {t('quicketMarketplace')}
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          {t('quicketDescription')}
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
              label={t('browse')}
              id="quicket-tab-0"
              aria-controls="quicket-tabpanel-0"
            />
            <Tab
              icon={<Inventory />}
              iconPosition="start"
              label={t('myItems')}
              id="quicket-tab-1"
              aria-controls="quicket-tabpanel-1"
            />
            <Tab
              icon={<Favorite />}
              iconPosition="start"
              label={t('saved')}
              id="quicket-tab-2"
              aria-controls="quicket-tabpanel-2"
            />
            <Tab
              icon={<Chat />}
              iconPosition="start"
              label={t('chats')}
              id="quicket-tab-3"
              aria-controls="quicket-tabpanel-3"
            />
            <Tab
              icon={<Notifications />}
              iconPosition="start"
              label={t('alerts')}
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
            <Typography variant="h6">{t('alerts')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('alerts')} {t('loading')}
            </Typography>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
}

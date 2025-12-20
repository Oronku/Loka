import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Fab,
  ButtonGroup,
  Zoom,
} from '@mui/material';
import {
  Add,
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Edit,
  Delete,
  Flight,
  Hotel,
  Restaurant,
  DirectionsCar,
  LocalActivity,
  ShoppingCart,
  MoreHoriz,
  AccountBalance,
  BarChart as BarChartIcon,
  List as ListIcon,
  People,
} from '@mui/icons-material';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import type { Expense, Budget, ExpenseCategory } from '../types/Budget';
import * as budgetApi from '../services/budgetApi';
import BudgetCharts from './BudgetCharts';
import {
  syncTripExpensesToBudget,
  calculateExpenseStats,
  isFromTripExpense,
} from '../utils/expenseSync';

interface TripItem {
  id: string;
  type: 'flight' | 'hotel' | 'transportation' | 'attraction';
  price?: number;
  pricePerNight?: number;
  cost?: number;
  checkIn?: string;
  checkOut?: string;
}

interface BudgetTrackerProps {
  tripId: string;
  startDate: string;
  endDate: string;
  tripItems?: TripItem[];
  tripExpenses?: any[]; // Will be typed as domain.Expense[]
  tripFlights?: any[];
  tripHotels?: any[];
  tripRides?: any[];
  userId?: string;
}

const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  flights: <Flight />,
  hotels: <Hotel />,
  food: <Restaurant />,
  transportation: <DirectionsCar />,
  activities: <LocalActivity />,
  shopping: <ShoppingCart />,
  other: <MoreHoriz />,
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  flights: '#2196F3',
  hotels: '#4CAF50',
  food: '#FF9800',
  transportation: '#9C27B0',
  activities: '#F44336',
  shopping: '#00BCD4',
  other: '#757575',
};

// Currency formatter helper
const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function BudgetTracker({
  tripId,
  startDate,
  endDate,
  tripItems = [],
  tripExpenses = [],
  tripFlights = [],
  tripHotels = [],
  tripRides = [],
  userId,
}: BudgetTrackerProps) {
  const { t } = useLanguage();
  const { showSuccess, showError } = useNotification();
  const hasSyncedTripData = useRef(false);

  // State
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'charts'>('list');
  const [includeShared, setIncludeShared] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Load budget and expenses from API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        hasSyncedTripData.current = false; // Reset sync flag for new trip
        const [budgetData, expensesData] = await Promise.all([
          budgetApi.getBudget(tripId),
          budgetApi.getExpenses(tripId),
        ]);
        setBudget(budgetData);
        setExpenses(expensesData);
      } catch (error) {
        console.error('Failed to load budget data:', error);
        // Initialize empty state if not found
        setBudget(null);
        setExpenses([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tripId]);

  // Auto-sync flights, hotels, and rides when expenses are loaded
  useEffect(() => {
    const autoSyncTripData = async () => {
      // Skip if already synced, still loading, or no trip data
      if (
        hasSyncedTripData.current ||
        loading ||
        (!tripFlights?.length && !tripHotels?.length && !tripRides?.length)
      ) {
        return;
      }

      try {
        const existingIds = new Set(expenses.map((e) => e._id).filter(Boolean));
        const newExpenses: any[] = [];

        // Convert flights
        if (tripFlights && tripFlights.length > 0) {
          for (const flight of tripFlights) {
            // Try multiple price fields
            const price =
              flight.cost ||
              flight.totalCost ||
              flight.totalPrice ||
              (typeof flight.price === 'object'
                ? flight.price.amount
                : flight.price);
            const currency = flight.currency || 'USD';
            if (!price) {
              continue;
            }

            const departureDate =
              flight.departureDateTime || flight.departureTime;
            // Parse date - handle both 'YYYY-MM-DD HH:MM+TZ' and 'YYYY-MM-DDTHH:MM' formats
            const parsedDate = departureDate
              ? departureDate.split('T')[0].split(' ')[0]
              : new Date().toISOString().split('T')[0];

            // Create stable ID from flight details (not random!)
            const flightKey =
              flight.flightNumber?.replace(/\s+/g, '') || // Remove all spaces from flight number
              `${flight.departureAirportCode}-${flight.arrivalAirportCode}-${parsedDate}`;
            const id = `trip-flight-${flightKey}`;
            if (existingIds.has(id)) continue;

            newExpenses.push({
              _id: id,
              tripId,
              category: 'flights' as const,
              amount: price,
              currency: currency,
              description: `${flight.departureAirportCode || flight.origin} → ${flight.arrivalAirportCode || flight.destination}`,
              date: parsedDate,
              notes: `Flight ${flight.flightNumber || ''}`.trim(),
              createdAt: new Date().toISOString(),
            });
          }
        }

        // Convert hotels
        if (tripHotels && tripHotels.length > 0) {
          for (const hotel of tripHotels) {
            const price =
              hotel.cost ||
              hotel.pricePerNight ||
              hotel.totalPrice ||
              hotel.price;
            if (!price) {
              continue;
            }

            // Create stable ID from hotel details (not random!)
            const hotelKey = hotel.placeId || `${hotel.name}-${hotel.checkIn}`;
            const id = `trip-hotel-${hotelKey}`;
            if (existingIds.has(id)) continue;

            newExpenses.push({
              _id: id,
              tripId,
              category: 'hotels' as const,
              amount: price,
              currency: 'USD',
              description: hotel.name || 'Hotel',
              date:
                hotel.checkIn?.split('T')[0] ||
                new Date().toISOString().split('T')[0],
              notes: `${hotel.nights || 1} nights`,
              createdAt: new Date().toISOString(),
            });
          }
        }

        // Convert rides
        if (tripRides && tripRides.length > 0) {
          for (let index = 0; index < tripRides.length; index++) {
            const ride = tripRides[index];
            const price = ride.cost || ride.estimatedPrice || ride.price;
            if (!price) {
              continue;
            }

            // Create stable ID from ride details (not random!)
            const rideDate =
              ride.pickupDate ||
              ride.date ||
              new Date().toISOString().split('T')[0];
            const rideKey =
              ride.id ||
              `${ride.pickup || ride.pickupLocation}-${ride.dropoff || ride.dropoffLocation}-${rideDate}`;
            const id = `trip-ride-${rideKey}`;
            if (existingIds.has(id)) continue;

            newExpenses.push({
              _id: id,
              tripId,
              category: 'transportation' as const,
              amount: price,
              currency: 'USD',
              description: `${ride.pickupLocation || 'Pickup'} → ${ride.dropoffLocation || 'Dropoff'}`,
              date:
                ride.pickupDate?.split('T')[0] ||
                new Date().toISOString().split('T')[0],
              notes: ride.type || 'Transportation',
              createdAt: new Date().toISOString(),
            });
          }
        }

        if (newExpenses.length > 0) {
          const addedExpenses = await Promise.all(
            newExpenses.map((expense) => budgetApi.addExpense(tripId, expense))
          );
          setExpenses((prev) => [...prev, ...addedExpenses]);
          hasSyncedTripData.current = true;
        } else {
          hasSyncedTripData.current = true;
        }
      } catch (error) {
        console.error('❌ Failed to auto-sync trip data:', error);
      }
    };

    // Only run after initial expenses load is complete
    if (!loading && expenses !== undefined) {
      autoSyncTripData();
    }
  }, [tripId, loading, tripFlights, tripHotels, tripRides, expenses.length]);

  // DISABLED: Auto-sync was causing infinite loops and duplicates
  // Users should use the manual sync button instead

  // Form state
  const [budgetAmount, setBudgetAmount] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    category: 'food' as ExpenseCategory,
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Filter expenses based on includeShared
  const filteredExpenses = useMemo(() => {
    if (includeShared) {
      return expenses;
    }
    return expenses.filter((e) => !isFromTripExpense(e));
  }, [expenses, includeShared]);

  // Calculate expense stats
  const expenseStats = useMemo(
    () => calculateExpenseStats(filteredExpenses),
    [filteredExpenses]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const totalSpent = filteredExpenses.reduce(
      (sum, exp) => sum + exp.amount,
      0
    );
    const totalBudget = budget?.totalBudget || 0;
    const remaining = totalBudget - totalSpent;
    const percentageSpent =
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    const spentByCategory = filteredExpenses.reduce(
      (acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
      },
      {} as Record<ExpenseCategory, number>
    );

    // Calculate days - only based on trip dates, not current date
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    // Total trip duration
    const totalDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day

    // Check if trip has started
    const tripStarted = now >= start;
    const tripEnded = now > end;

    // Days passed (from start to now, or total if trip ended)
    const daysPassed = tripEnded
      ? totalDays
      : tripStarted
        ? Math.max(
            0,
            Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          )
        : 0; // Trip hasn't started yet

    // Days remaining in trip
    const daysRemaining = tripEnded
      ? 0
      : tripStarted
        ? Math.max(
            0,
            Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          )
        : totalDays; // Trip hasn't started yet, show total days

    // Average daily spending based on trip days, not current days
    const averageDaily = totalDays > 0 ? totalSpent / totalDays : 0;

    // Projected total is just the total spent (we already have all expenses)
    const projectedTotal = totalSpent;

    // Calculate budget per day - ALWAYS divide by total trip days, not days remaining
    // This shows the daily budget allocation for the entire trip
    const budgetPerDayRemaining = totalDays > 0 ? remaining / totalDays : 0;

    return {
      totalBudget,
      totalSpent,
      remaining,
      percentageSpent,
      isOverBudget: remaining < 0,
      spentByCategory,
      averageDaily,
      projectedTotal,
      daysRemaining,
      daysPassed,
      totalDays,
      budgetPerDayRemaining,
    };
  }, [budget, filteredExpenses, startDate, endDate]);

  const handleSetBudget = async () => {
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) {
      showError(t('error'));
      return;
    }

    try {
      const newBudget = {
        tripId,
        totalBudget: amount,
        currency: 'USD',
      };

      const savedBudget = await budgetApi.saveBudget(tripId, newBudget);
      setBudget(savedBudget);
      showSuccess(t('budgetSet'));
      setBudgetDialogOpen(false);
      setBudgetAmount('');
    } catch (error) {
      console.error('Failed to save budget:', error);
      showError(t('failedToSaveBudget'));
    }
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(expenseForm.amount);
    if (isNaN(amount) || amount <= 0 || !expenseForm.description) {
      showError(t('error'));
      return;
    }

    try {
      if (editingExpense) {
        // Update existing expense
        const updatedExpense = await budgetApi.updateExpense(
          tripId,
          editingExpense._id!,
          {
            category: expenseForm.category,
            amount,
            description: expenseForm.description,
            date: expenseForm.date,
            notes: expenseForm.notes,
          }
        );
        setExpenses(
          expenses.map((exp) =>
            exp._id === editingExpense._id ? updatedExpense : exp
          )
        );
        showSuccess(t('expenseUpdated'));
      } else {
        // Add new expense
        const newExpense: Expense = {
          tripId,
          category: expenseForm.category,
          amount,
          currency: 'USD',
          description: expenseForm.description,
          date: expenseForm.date,
          notes: expenseForm.notes,
        };
        const savedExpense = await budgetApi.addExpense(tripId, newExpense);
        setExpenses([...expenses, savedExpense]);
        showSuccess(t('expenseAdded'));
      }

      setExpenseDialogOpen(false);
      setEditingExpense(null);
      setExpenseForm({
        category: 'food',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (error) {
      console.error('Failed to save expense:', error);
      showError(t('failedToSaveExpense'));
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      category: expense.category,
      amount: expense.amount.toString(),
      description: expense.description,
      date: expense.date,
      notes: expense.notes || '',
    });
    setExpenseDialogOpen(true);
  };

  const handleDeleteExpense = async (expense: Expense) => {
    try {
      await budgetApi.deleteExpense(tripId, expense._id!);
      setExpenses(expenses.filter((exp) => exp._id !== expense._id));
      showSuccess(t('expenseDeleted'));
    } catch (error) {
      console.error('Failed to delete expense:', error);
      showError(t('failedToDeleteExpense'));
    }
  };

  const handleSyncFromTripExpenses = async () => {
    if (!userId || tripExpenses.length === 0) {
      showError(t('noNewExpensesToSync'));
      return;
    }

    try {
      setSyncing(true);

      // Sync ONLY trip expenses (flights/hotels/rides are auto-synced)
      const newExpenses = syncTripExpensesToBudget(
        tripExpenses,
        expenses,
        userId,
        tripId
      );

      if (newExpenses.length === 0) {
        showError(t('noNewExpensesToSync'));
        setSyncing(false);
        return;
      }

      // Add all new expenses via API
      const addedExpenses = await Promise.all(
        newExpenses.map((expense) => budgetApi.addExpense(tripId, expense))
      );

      setExpenses([...expenses, ...addedExpenses]);
      showSuccess(`${t('expensesSynced')} (${addedExpenses.length})`);
    } catch (error) {
      console.error('Failed to sync expenses:', error);
      showError(t('failedToSaveExpense'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Box>
      {/* Budget Overview */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 3,
          borderRadius: 4,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -50,
            right: -50,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
          position="relative"
          zIndex={1}
        >
          <Stack direction="row" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <AccountBalance sx={{ fontSize: 32 }} />
            </Box>
            <Box>
              <Typography variant="h4" fontWeight={800}>
                {t('budgetOverview')}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {new Date(startDate).toLocaleDateString()} -{' '}
                {new Date(endDate).toLocaleDateString()}
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="contained"
            startIcon={<AccountBalance />}
            onClick={() => setBudgetDialogOpen(true)}
            sx={{
              borderRadius: 3,
              bgcolor: 'rgba(255, 255, 255, 0.25)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              fontWeight: 700,
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.35)',
              },
            }}
          >
            {budget ? t('edit') : t('setBudget')}
          </Button>
        </Stack>

        {budget ? (
          <>
            <Grid container spacing={2} mb={3} position="relative" zIndex={1}>
              <Grid item xs={12} sm={4}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0 }}
                >
                  <Tooltip
                    title={t('totalBudgetTooltip')}
                    arrow
                    placement="top"
                  >
                    <Card
                      sx={{
                        bgcolor: 'rgba(255, 255, 255, 0.15)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: 3,
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        cursor: 'help',
                      }}
                    >
                      <CardContent>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <Typography
                            variant="body2"
                            sx={{ opacity: 0.9, fontWeight: 600 }}
                          >
                            {t('totalBudget')}
                          </Typography>
                          <AccountBalance sx={{ opacity: 0.7 }} />
                        </Stack>
                        <Typography variant="h3" fontWeight={800}>
                          {formatCurrency(stats.totalBudget)}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          {budget?.currency || 'USD'}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>
              </Grid>
              <Grid item xs={12} sm={4}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <Tooltip title={t('spentTooltip')} arrow placement="top">
                    <Card
                      sx={{
                        bgcolor: stats.isOverBudget
                          ? 'rgba(244, 67, 54, 0.2)'
                          : 'rgba(76, 175, 80, 0.2)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: 3,
                        border: `1px solid ${stats.isOverBudget ? 'rgba(244, 67, 54, 0.3)' : 'rgba(76, 175, 80, 0.3)'}`,
                        color: 'white',
                        cursor: 'help',
                      }}
                    >
                      <CardContent>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <Typography
                            variant="body2"
                            sx={{ opacity: 0.9, fontWeight: 600 }}
                          >
                            {t('spent')}
                          </Typography>
                          <TrendingDown sx={{ opacity: 0.7 }} />
                        </Stack>
                        <Typography variant="h3" fontWeight={800}>
                          {formatCurrency(stats.totalSpent)}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(stats.percentageSpent, 100)}
                          sx={{
                            mt: 1,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: 'rgba(255, 255, 255, 0.2)',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: stats.isOverBudget
                                ? '#f44336'
                                : '#4caf50',
                            },
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{ mt: 0.5, display: 'block', opacity: 0.8 }}
                        >
                          {stats.percentageSpent.toFixed(1)}% {t('spent')}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>
              </Grid>
              <Grid item xs={12} sm={4}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <Tooltip
                    title={
                      stats.isOverBudget
                        ? t('overBudgetTooltip')
                        : t('remainingTooltip')
                    }
                    arrow
                    placement="top"
                  >
                    <Card
                      sx={{
                        bgcolor: stats.isOverBudget
                          ? 'rgba(244, 67, 54, 0.2)'
                          : 'rgba(33, 150, 243, 0.2)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: 3,
                        border: `1px solid ${stats.isOverBudget ? 'rgba(244, 67, 54, 0.3)' : 'rgba(33, 150, 243, 0.3)'}`,
                        color: 'white',
                        cursor: 'help',
                      }}
                    >
                      <CardContent>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <Typography
                            variant="body2"
                            sx={{ opacity: 0.9, fontWeight: 600 }}
                          >
                            {stats.isOverBudget
                              ? t('overBudget')
                              : t('remaining')}
                          </Typography>
                          {stats.isOverBudget ? (
                            <TrendingDown sx={{ opacity: 0.7 }} />
                          ) : (
                            <TrendingUp sx={{ opacity: 0.7 }} />
                          )}
                        </Stack>
                        <Typography variant="h3" fontWeight={800}>
                          {formatCurrency(Math.abs(stats.remaining))}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          {stats.daysRemaining > 0
                            ? `${stats.daysRemaining} ${t('daysRemaining')}`
                            : t('tripEnded')}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Tooltip>
                </motion.div>
              </Grid>
            </Grid>

            {/* Additional Stats */}
            <Grid container spacing={2} position="relative" zIndex={1}>
              <Grid item xs={12} sm={6} md={4}>
                <Tooltip title={t('averageDailyTooltip')} arrow placement="top">
                  <Card
                    sx={{
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 3,
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      cursor: 'help',
                    }}
                  >
                    <CardContent>
                      <Typography
                        variant="body2"
                        sx={{ opacity: 0.9, mb: 0.5, fontWeight: 600 }}
                      >
                        {t('averageDaily')}
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        ${stats.averageDaily.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {t('per')} {t('day')} ({stats.totalDays} {t('days')}{' '}
                        {t('total')})
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Tooltip title={t('budgetPerDayTooltip')} arrow placement="top">
                  <Card
                    sx={{
                      bgcolor:
                        stats.budgetPerDayRemaining < 0
                          ? 'rgba(244, 67, 54, 0.15)'
                          : 'rgba(76, 175, 80, 0.15)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 3,
                      border: `1px solid ${
                        stats.budgetPerDayRemaining < 0
                          ? 'rgba(244, 67, 54, 0.3)'
                          : 'rgba(76, 175, 80, 0.3)'
                      }`,
                      color: 'white',
                      cursor: 'help',
                    }}
                  >
                    <CardContent>
                      <Typography
                        variant="body2"
                        sx={{ opacity: 0.9, mb: 0.5, fontWeight: 600 }}
                      >
                        {t('remainingPerDay')}
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        ${Math.abs(stats.budgetPerDayRemaining).toFixed(2)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {stats.daysRemaining > 0
                          ? `${t('for')} ${stats.daysRemaining} ${t('daysRemaining')}`
                          : `${t('per')} ${t('day')} (${stats.totalDays} ${t('days')} ${t('total')})`}
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Tooltip
                  title={t('projectedTotalTooltip')}
                  arrow
                  placement="top"
                >
                  <Card
                    sx={{
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 3,
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      cursor: 'help',
                    }}
                  >
                    <CardContent>
                      <Typography
                        variant="body2"
                        sx={{ opacity: 0.9, mb: 0.5, fontWeight: 600 }}
                      >
                        {t('projectedTotal')}
                      </Typography>
                      <Typography variant="h5" fontWeight={800}>
                        ${stats.projectedTotal.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {t('allTripExpenses')}
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
            </Grid>
          </>
        ) : (
          <Box textAlign="center" py={6} position="relative" zIndex={1}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                margin: '0 auto',
                mb: 2,
              }}
            >
              <AccountBalance sx={{ fontSize: 48 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {t('noBudgetSet')}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              הגדר תקציב כדי לעקוב אחר ההוצאות שלך
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Expenses Section */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
        >
          <Stack direction="row" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'primary.main',
                color: 'white',
              }}
            >
              <AttachMoney sx={{ fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                {t('expenses')}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {filteredExpenses.length}{' '}
                  {filteredExpenses.length === 1 ? t('expense') : t('expenses')}
                </Typography>
                {expenseStats.sharedCount > 0 && (
                  <Chip
                    label={
                      includeShared
                        ? t('includeSharedExpenses')
                        : t('onlyPersonalExpenses')
                    }
                    size="small"
                    onClick={() => setIncludeShared(!includeShared)}
                    color={includeShared ? 'primary' : 'default'}
                    sx={{ cursor: 'pointer' }}
                  />
                )}
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {/* Sync Button - Only for shared expenses */}
            {tripExpenses.length > 0 && userId && (
              <Button
                variant="outlined"
                onClick={handleSyncFromTripExpenses}
                disabled={syncing}
                sx={{
                  borderRadius: 3,
                  px: 2,
                }}
              >
                {syncing ? t('syncingExpenses') : t('syncFromTripExpenses')}
              </Button>
            )}

            {/* View Toggle */}
            {expenses.length > 0 && (
              <Stack direction="row" spacing={0}>
                <Button
                  variant={viewMode === 'list' ? 'contained' : 'outlined'}
                  onClick={() => setViewMode('list')}
                  startIcon={<ListIcon />}
                  sx={{
                    borderRadius: '8px 0 0 8px',
                    px: 2,
                  }}
                >
                  {t('showList')}
                </Button>
                <Button
                  variant={viewMode === 'charts' ? 'contained' : 'outlined'}
                  onClick={() => setViewMode('charts')}
                  startIcon={<BarChartIcon />}
                  sx={{
                    borderRadius: '0 8px 8px 0',
                    px: 2,
                  }}
                >
                  {t('showCharts')}
                </Button>
              </Stack>
            )}

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setExpenseDialogOpen(true)}
              sx={{
                borderRadius: 3,
                px: 3,
                py: 1.5,
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              {t('addExpense')}
            </Button>
          </Stack>
        </Stack>

        {filteredExpenses.length > 0 ? (
          <>
            {/* Charts View */}
            {viewMode === 'charts' ? (
              <BudgetCharts
                expenses={filteredExpenses}
                totalBudget={budget?.totalBudget || 0}
                totalSpent={stats.totalSpent}
                spentByCategory={stats.spentByCategory}
              />
            ) : (
              <>
                {/* List View */}
                {/* Category Summary */}
                {budget && (
                  <Box mb={3}>
                    <Tooltip
                      title={t('spentByCategoryTooltip')}
                      arrow
                      placement="top"
                    >
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        mb={2}
                        fontWeight={600}
                        sx={{
                          display: 'inline-block',
                          cursor: 'help',
                          borderBottom: '1px dotted',
                          borderColor: 'text.secondary',
                        }}
                      >
                        {t('spentByCategory')}
                      </Typography>
                    </Tooltip>
                    <Grid container spacing={2}>
                      {Object.entries(stats.spentByCategory).map(
                        ([category, amount]) => (
                          <Grid item xs={6} sm={4} md={3} key={category}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor:
                                  CATEGORY_COLORS[category as ExpenseCategory] +
                                  '10',
                                border: '1px solid',
                                borderColor:
                                  CATEGORY_COLORS[category as ExpenseCategory] +
                                  '30',
                              }}
                            >
                              <Stack
                                direction="row"
                                alignItems="center"
                                gap={1}
                                mb={1}
                              >
                                <Box
                                  sx={{
                                    color:
                                      CATEGORY_COLORS[
                                        category as ExpenseCategory
                                      ],
                                  }}
                                >
                                  {CATEGORY_ICONS[category as ExpenseCategory]}
                                </Box>
                                <Typography variant="caption" fontWeight={600}>
                                  {t(category)}
                                </Typography>
                              </Stack>
                              <Typography
                                variant="h6"
                                fontWeight={800}
                                color={
                                  CATEGORY_COLORS[category as ExpenseCategory]
                                }
                              >
                                ${amount.toFixed(0)}
                              </Typography>
                            </Card>
                          </Grid>
                        )
                      )}
                    </Grid>
                  </Box>
                )}

                <Divider sx={{ my: 3 }} />

                {/* Expenses List */}
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  mb={2}
                  fontWeight={600}
                >
                  {t('recentExpenses')}
                </Typography>
                <Stack spacing={1.5}>
                  <AnimatePresence>
                    {filteredExpenses.map((expense, index) => (
                      <motion.div
                        key={expense._id || index}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -100, scale: 0.95 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.05,
                          ease: 'easeOut',
                        }}
                      >
                        <Card
                          elevation={0}
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2.5,
                            transition: 'all 0.2s',
                            '&:hover': {
                              borderColor: CATEGORY_COLORS[expense.category],
                              boxShadow: `0 4px 12px ${CATEGORY_COLORS[expense.category]}20`,
                              transform: 'translateY(-2px)',
                            },
                          }}
                        >
                          <CardContent
                            sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={2}
                            >
                              <Box
                                sx={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor:
                                    CATEGORY_COLORS[expense.category] + '20',
                                  color: CATEGORY_COLORS[expense.category],
                                  flexShrink: 0,
                                }}
                              >
                                {CATEGORY_ICONS[expense.category]}
                              </Box>

                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                  mb={0.5}
                                >
                                  <Typography fontWeight={700} noWrap>
                                    {expense.description}
                                  </Typography>
                                  <Chip
                                    label={t(expense.category)}
                                    size="small"
                                    sx={{
                                      bgcolor:
                                        CATEGORY_COLORS[expense.category] +
                                        '20',
                                      color: CATEGORY_COLORS[expense.category],
                                      fontWeight: 600,
                                      fontSize: '0.7rem',
                                    }}
                                  />
                                  {isFromTripExpense(expense) && (
                                    <Tooltip title={t('sharedExpenses')}>
                                      <Chip
                                        icon={<People />}
                                        label={t('yourShare')}
                                        size="small"
                                        sx={{
                                          bgcolor: 'info.light',
                                          color: 'info.dark',
                                          fontWeight: 600,
                                          fontSize: '0.7rem',
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                </Stack>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    {new Date(
                                      expense.date
                                    ).toLocaleDateString()}
                                  </Typography>
                                  {expense.notes && (
                                    <>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        •
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        noWrap
                                      >
                                        {expense.notes}
                                      </Typography>
                                    </>
                                  )}
                                </Stack>
                              </Box>

                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                              >
                                <Typography
                                  variant="h6"
                                  fontWeight={800}
                                  color={CATEGORY_COLORS[expense.category]}
                                  sx={{ minWidth: 80, textAlign: 'right' }}
                                >
                                  ${expense.amount.toFixed(2)}
                                </Typography>

                                <Stack direction="row" spacing={0.5}>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleEditExpense(expense)}
                                    sx={{
                                      '&:hover': {
                                        bgcolor: 'primary.light',
                                        color: 'primary.main',
                                      },
                                    }}
                                  >
                                    <Edit fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteExpense(expense)}
                                    sx={{
                                      '&:hover': {
                                        bgcolor: 'error.light',
                                        color: 'error.main',
                                      },
                                    }}
                                  >
                                    <Delete fontSize="small" />
                                  </IconButton>
                                </Stack>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </Stack>
              </>
            )}
          </>
        ) : (
          <Box textAlign="center" py={8}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
                margin: '0 auto',
                mb: 2,
              }}
            >
              <AttachMoney sx={{ fontSize: 48, color: 'text.secondary' }} />
            </Box>
            <Typography
              variant="h6"
              color="text.secondary"
              gutterBottom
              fontWeight={700}
            >
              {t('noExpenses')}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              התחל להוסיף הוצאות כדי לעקוב אחר התקציב
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => setExpenseDialogOpen(true)}
              sx={{ borderRadius: 3 }}
            >
              {t('addExpense')}
            </Button>
          </Box>
        )}
      </Paper>

      {/* Set Budget Dialog */}
      <Dialog
        open={budgetDialogOpen}
        onClose={() => setBudgetDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {budget ? t('edit') + ' ' + t('budget') : t('setBudget')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('totalBudget')}
            type="number"
            fullWidth
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setBudgetDialogOpen(false)}
            sx={{ borderRadius: 3 }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSetBudget}
            sx={{ borderRadius: 3 }}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Expense Dialog */}
      <Dialog
        open={expenseDialogOpen}
        onClose={() => setExpenseDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingExpense ? t('editExpense') : t('addExpense')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>{t('category')}</InputLabel>
              <Select
                value={expenseForm.category}
                label={t('category')}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    category: e.target.value as ExpenseCategory,
                  })
                }
              >
                <MenuItem value="flights">{t('flights')}</MenuItem>
                <MenuItem value="hotels">{t('hotels')}</MenuItem>
                <MenuItem value="food">{t('food')}</MenuItem>
                <MenuItem value="transportation">
                  {t('transportation')}
                </MenuItem>
                <MenuItem value="activities">{t('activities')}</MenuItem>
                <MenuItem value="shopping">{t('shopping')}</MenuItem>
                <MenuItem value="other">{t('other')}</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label={t('description')}
              fullWidth
              value={expenseForm.description}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, description: e.target.value })
              }
            />

            <TextField
              label={t('amount')}
              type="number"
              fullWidth
              value={expenseForm.amount}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, amount: e.target.value })
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">$</InputAdornment>
                ),
              }}
            />

            {/* Quick Amount Buttons */}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
              {[50, 100, 500, 1000].map((amount) => (
                <Button
                  key={amount}
                  variant="outlined"
                  size="small"
                  onClick={() =>
                    setExpenseForm({
                      ...expenseForm,
                      amount: amount.toString(),
                    })
                  }
                  sx={{
                    borderRadius: 2,
                    minWidth: 60,
                    fontWeight: 600,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    color: 'white',
                    '&:hover': {
                      borderColor: 'white',
                      bgcolor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  ${amount}
                </Button>
              ))}
            </Box>

            <TextField
              label={t('date')}
              type="date"
              fullWidth
              value={expenseForm.date}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, date: e.target.value })
              }
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label={t('notes')}
              fullWidth
              multiline
              rows={2}
              value={expenseForm.notes}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, notes: e.target.value })
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setExpenseDialogOpen(false)}
            sx={{ borderRadius: 3 }}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleAddExpense}
            sx={{ borderRadius: 3 }}
          >
            {editingExpense ? t('update') : t('add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      <Zoom in={!expenseDialogOpen && !budgetDialogOpen}>
        <Fab
          color="primary"
          aria-label="add expense"
          onClick={() => {
            setEditingExpense(null);
            setExpenseForm({
              category: 'food' as const,
              amount: '',
              description: '',
              date: new Date().toISOString().split('T')[0],
              notes: '',
            });
            setExpenseDialogOpen(true);
          }}
          sx={{
            position: 'fixed',
            bottom: 32,
            left: 32,
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
            '&:hover': {
              background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
              transform: 'scale(1.1)',
              boxShadow: '0 12px 40px rgba(102, 126, 234, 0.6)',
            },
            transition: 'all 0.3s ease',
            zIndex: 1000,
          }}
        >
          <Add sx={{ fontSize: 32 }} />
        </Fab>
      </Zoom>
    </Box>
  );
}

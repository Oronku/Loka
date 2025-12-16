import { useState, useMemo, useEffect } from 'react';
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
} from '@mui/icons-material';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import type { Expense, Budget, ExpenseCategory } from '../types/Budget';

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

export default function BudgetTracker({
  tripId,
  startDate,
  endDate,
  tripItems = [],
}: BudgetTrackerProps) {
  const { t } = useLanguage();
  const { showSuccess, showError } = useNotification();

  // Load from localStorage on mount
  const [budget, setBudget] = useState<Budget | null>(() => {
    const stored = localStorage.getItem(`budget_${tripId}`);
    return stored ? JSON.parse(stored) : null;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const stored = localStorage.getItem(`expenses_${tripId}`);
    return stored ? JSON.parse(stored) : [];
  });

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Sync trip items to expenses when tripItems change
  useEffect(() => {
    const calculateTripExpenses = (): Expense[] => {
      const tripExpenses: Expense[] = [];

      tripItems.forEach((item) => {
        let amount = 0;
        let category: ExpenseCategory = 'other';
        let description = '';

        switch (item.type) {
          case 'flight':
            amount = item.price || 0;
            category = 'flights';
            description = t('flight');
            break;
          case 'hotel':
            if (item.pricePerNight && item.checkIn && item.checkOut) {
              const nights = Math.ceil(
                (new Date(item.checkOut).getTime() -
                  new Date(item.checkIn).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              amount = item.pricePerNight * nights;
            }
            category = 'hotels';
            description = t('hotel');
            break;
          case 'transportation':
            amount = item.cost || 0;
            category = 'transportation';
            description = t('transportation');
            break;
          case 'attraction':
            amount = item.cost || 0;
            category = 'activities';
            description = t('activity');
            break;
        }

        if (amount > 0) {
          tripExpenses.push({
            _id: `trip-${item.id}`,
            tripId,
            category,
            amount,
            currency: 'USD',
            description,
            date: startDate,
            notes: t('autoAddedFromTrip'),
          });
        }
      });

      return tripExpenses;
    };

    const tripExpenses = calculateTripExpenses();
    const existingIds = new Set(expenses.map((e) => e._id));
    const newTripExpenses = tripExpenses.filter((e) => !existingIds.has(e._id));

    if (newTripExpenses.length > 0) {
      const updatedExpenses = [...expenses, ...newTripExpenses];
      setExpenses(updatedExpenses);
      localStorage.setItem(
        `expenses_${tripId}`,
        JSON.stringify(updatedExpenses)
      );
    }
  }, [tripItems, tripId, startDate, t]);

  // Form state
  const [budgetAmount, setBudgetAmount] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    category: 'food' as ExpenseCategory,
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalBudget = budget?.totalBudget || 0;
    const remaining = totalBudget - totalSpent;
    const percentageSpent =
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    const spentByCategory = expenses.reduce(
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

    // Days passed (from start to now, or total if trip ended)
    const daysPassed =
      now > end
        ? totalDays
        : Math.max(
            0,
            Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          );

    // Days remaining in trip
    const daysRemaining =
      now >= end
        ? 0
        : Math.max(
            0,
            Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          );

    // Average daily spending based on trip days, not current days
    const averageDaily = totalDays > 0 ? totalSpent / totalDays : 0;

    // Projected total is just the total spent (we already have all expenses)
    const projectedTotal = totalSpent;

    // Calculate remaining budget per day
    // If trip is ongoing: remaining / days left
    // If trip ended: remaining / total days (to show what was left per day)
    const budgetPerDayRemaining =
      daysRemaining > 0
        ? remaining / daysRemaining
        : totalDays > 0
          ? remaining / totalDays
          : 0;

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
  }, [budget, expenses, startDate, endDate]);

  const handleSetBudget = () => {
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) {
      showError(t('error'));
      return;
    }

    const newBudget = {
      tripId,
      totalBudget: amount,
      currency: 'USD',
    };
    setBudget(newBudget);
    localStorage.setItem(`budget_${tripId}`, JSON.stringify(newBudget));
    showSuccess(t('budgetSet'));
    setBudgetDialogOpen(false);
    setBudgetAmount('');
  };

  const handleAddExpense = () => {
    const amount = parseFloat(expenseForm.amount);
    if (isNaN(amount) || amount <= 0 || !expenseForm.description) {
      showError(t('error'));
      return;
    }

    const newExpense: Expense = {
      _id: editingExpense?._id || `manual-${Date.now()}`,
      tripId,
      category: expenseForm.category,
      amount,
      currency: 'USD',
      description: expenseForm.description,
      date: expenseForm.date,
      notes: expenseForm.notes,
    };

    let updatedExpenses;
    if (editingExpense) {
      updatedExpenses = expenses.map((exp) =>
        exp._id === editingExpense._id ? newExpense : exp
      );
      showSuccess(t('expenseUpdated'));
    } else {
      updatedExpenses = [...expenses, newExpense];
      showSuccess(t('expenseAdded'));
    }

    setExpenses(updatedExpenses);
    localStorage.setItem(`expenses_${tripId}`, JSON.stringify(updatedExpenses));

    setExpenseDialogOpen(false);
    setEditingExpense(null);
    setExpenseForm({
      category: 'food',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    });
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

  const handleDeleteExpense = (expense: Expense) => {
    const updatedExpenses = expenses.filter((exp) => exp._id !== expense._id);
    setExpenses(updatedExpenses);
    localStorage.setItem(`expenses_${tripId}`, JSON.stringify(updatedExpenses));
    showSuccess(t('expenseDeleted'));
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
                <Tooltip title={t('totalBudgetTooltip')} arrow placement="top">
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
                        ${stats.totalBudget.toFixed(0)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        USD
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
              <Grid item xs={12} sm={4}>
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
                        ${stats.totalSpent.toFixed(0)}
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
                            bgcolor: stats.isOverBudget ? '#f44336' : '#4caf50',
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
              </Grid>
              <Grid item xs={12} sm={4}>
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
                        ${Math.abs(stats.remaining).toFixed(0)}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {stats.daysRemaining > 0
                          ? `${stats.daysRemaining} ${t('daysRemaining')}`
                          : t('tripEnded')}
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
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
              <Typography variant="body2" color="text.secondary">
                {expenses.length}{' '}
                {expenses.length === 1 ? t('expense') : t('expenses')}
              </Typography>
            </Box>
          </Stack>
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

        {expenses.length > 0 ? (
          <>
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
                                  CATEGORY_COLORS[category as ExpenseCategory],
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
                            color={CATEGORY_COLORS[category as ExpenseCategory]}
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
              {expenses.map((expense, index) => (
                <Card
                  key={index}
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
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: CATEGORY_COLORS[expense.category] + '20',
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
                              bgcolor: CATEGORY_COLORS[expense.category] + '20',
                              color: CATEGORY_COLORS[expense.category],
                              fontWeight: 600,
                              fontSize: '0.7rem',
                            }}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" color="text.secondary">
                            {new Date(expense.date).toLocaleDateString()}
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

                      <Stack direction="row" spacing={1} alignItems="center">
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
              ))}
            </Stack>
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
        <DialogTitle>
          <Typography variant="h5" fontWeight={800}>
            {budget ? t('edit') + ' ' + t('budget') : t('setBudget')}
          </Typography>
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
        <DialogTitle>
          <Typography variant="h5" fontWeight={800}>
            {editingExpense ? t('editExpense') : t('addExpense')}
          </Typography>
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
    </Box>
  );
}

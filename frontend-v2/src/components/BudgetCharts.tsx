import { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  useTheme,
  Stack,
  Chip,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import type { Expense, ExpenseCategory } from '../types/Budget';
import { useLanguage } from '../context/LanguageContext';
import {
  Flight,
  Hotel,
  Restaurant,
  DirectionsCar,
  LocalActivity,
  ShoppingCart,
  MoreHoriz,
} from '@mui/icons-material';

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  flights: '#2196F3',
  hotels: '#4CAF50',
  food: '#FF9800',
  transportation: '#9C27B0',
  activities: '#F44336',
  shopping: '#00BCD4',
  other: '#757575',
};

const CATEGORY_ICONS: Record<ExpenseCategory, React.ReactNode> = {
  flights: <Flight fontSize="small" />,
  hotels: <Hotel fontSize="small" />,
  food: <Restaurant fontSize="small" />,
  transportation: <DirectionsCar fontSize="small" />,
  activities: <LocalActivity fontSize="small" />,
  shopping: <ShoppingCart fontSize="small" />,
  other: <MoreHoriz fontSize="small" />,
};

interface BudgetChartsProps {
  expenses: Expense[];
  totalBudget: number;
  totalSpent: number;
  spentByCategory: Record<ExpenseCategory, number>;
}

export default function BudgetCharts({
  expenses,
  totalBudget,
  totalSpent,
  spentByCategory,
}: BudgetChartsProps) {
  const theme = useTheme();
  const { t, language } = useLanguage();

  // Data for Pie Chart - Category Distribution
  const categoryData = useMemo(() => {
    return Object.entries(spentByCategory)
      .filter(([_, amount]) => amount > 0)
      .map(([category, amount]) => ({
        name: t(category),
        value: amount,
        color: CATEGORY_COLORS[category as ExpenseCategory],
        category: category as ExpenseCategory,
      }))
      .sort((a, b) => b.value - a.value);
  }, [spentByCategory, t]);

  // Data for Bar Chart - Budget vs Actual by Category
  const budgetVsActualData = useMemo(() => {
    const categories = Object.keys(spentByCategory) as ExpenseCategory[];
    return categories
      .filter((cat) => spentByCategory[cat] > 0)
      .map((category) => ({
        category: t(category),
        spent: spentByCategory[category],
        // Calculate average budget per category
        budgeted:
          totalBudget / categories.filter((c) => spentByCategory[c] > 0).length,
        color: CATEGORY_COLORS[category],
      }));
  }, [spentByCategory, totalBudget, t]);

  // Data for Timeline - Cumulative spending over time
  const timelineData = useMemo(() => {
    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulative = 0;
    return sortedExpenses.map((expense) => {
      cumulative += expense.amount;
      return {
        date: new Date(expense.date).toLocaleDateString(
          language === 'he' ? 'he-IL' : 'en-US',
          {
            month: 'short',
            day: 'numeric',
          }
        ),
        amount: cumulative,
        budget: totalBudget,
      };
    });
  }, [expenses, totalBudget, language]);

  // Data for Progress Ring
  const progressData = useMemo(() => {
    const percentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const remaining = Math.max(0, totalBudget - totalSpent);

    return [
      {
        name: 'Spent',
        value: percentage,
        fill:
          percentage > 100
            ? '#F44336'
            : percentage > 80
              ? '#FF9800'
              : '#4CAF50',
      },
    ];
  }, [totalSpent, totalBudget]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <Paper
          sx={{
            p: 1.5,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 3,
          }}
        >
          <Typography variant="body2" fontWeight={600}>
            {payload[0].name}
          </Typography>
          <Typography variant="body2" color="primary">
            ${payload[0].value.toFixed(2)}
          </Typography>
        </Paper>
      );
    }
    return null;
  };

  if (expenses.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {t('noExpenses')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('addExpensesToSeeCharts')}
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
      {/* Budget Progress Ring */}
      <Grid item xs={12} md={6}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            height: '100%',
          }}
        >
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('budgetProgress')}
          </Typography>
          <Box sx={{ height: 300, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                data={progressData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background dataKey="value" cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <Typography variant="h3" fontWeight={800} color="primary">
                {((totalSpent / totalBudget) * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('of')} ${totalBudget.toFixed(0)}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={2} justifyContent="center" mt={2}>
            <Chip
              label={`${t('spent')}: $${totalSpent.toFixed(2)}`}
              color="primary"
              size="small"
            />
            <Chip
              label={`${t('remaining')}: $${Math.max(0, totalBudget - totalSpent).toFixed(2)}`}
              color={totalSpent > totalBudget ? 'error' : 'success'}
              size="small"
            />
          </Stack>
        </Paper>
      </Grid>

      {/* Category Distribution Pie Chart */}
      <Grid item xs={12} md={6}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            height: '100%',
          }}
        >
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('expensesByCategory')}
          </Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  animationDuration={800}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            mt={2}
            justifyContent="center"
          >
            {categoryData.map((item) => (
              <Chip
                key={item.category}
                label={`${item.name}: $${item.value.toFixed(0)}`}
                size="small"
                sx={{
                  bgcolor: item.color + '20',
                  color: item.color,
                  border: '1px solid',
                  borderColor: item.color + '40',
                }}
              />
            ))}
          </Stack>
        </Paper>
      </Grid>

      {/* Budget vs Actual Bar Chart */}
      <Grid item xs={12} md={6}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('budgetVsActual')}
          </Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActualData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={theme.palette.divider}
                />
                <XAxis
                  dataKey="category"
                  stroke={theme.palette.text.secondary}
                />
                <YAxis stroke={theme.palette.text.secondary} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar
                  dataKey="budgeted"
                  name={t('budgeted')}
                  fill={theme.palette.primary.light}
                  radius={[8, 8, 0, 0]}
                  animationDuration={800}
                />
                <Bar
                  dataKey="spent"
                  name={t('spent')}
                  fill={theme.palette.primary.main}
                  radius={[8, 8, 0, 0]}
                  animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>

      {/* Spending Timeline */}
      <Grid item xs={12} md={6}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {t('spendingTimeline')}
          </Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={theme.palette.divider}
                />
                <XAxis dataKey="date" stroke={theme.palette.text.secondary} />
                <YAxis stroke={theme.palette.text.secondary} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="budget"
                  name={t('budget')}
                  stroke={theme.palette.grey[400]}
                  strokeDasharray="5 5"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name={t('cumulative')}
                  stroke={theme.palette.primary.main}
                  strokeWidth={3}
                  dot={{ fill: theme.palette.primary.main, r: 4 }}
                  animationDuration={1200}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}

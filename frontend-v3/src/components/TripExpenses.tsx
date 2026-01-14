import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  Grid,
  Alert,
  CircularProgress,
  FormLabel,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AttachMoney as MoneyIcon,
  Restaurant as FoodIcon,
  Hotel as HotelIcon,
  DirectionsCar as RideIcon,
  AttractionsOutlined as ActivityIcon,
  ShoppingCart as ShoppingIcon,
  MoreHoriz as OtherIcon,
  AccountBalance as BalanceIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  Expense,
  ExpenseCategory,
  SplitMethod,
  Trip,
  ParticipantBalance,
} from '../types/domain';
import { useAuth } from '../context/AuthContext';
import {
  convertCurrency,
  getCurrencyList,
  formatCurrency,
} from '../services/currency';

interface TripExpensesProps {
  trip: Trip;
  onAddExpense: (
    expense: Omit<Expense, 'id' | 'createdBy' | 'createdAt'>
  ) => Promise<void>;
  onUpdateExpense: (
    expenseId: string,
    expense: Partial<Expense>
  ) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  balances: ParticipantBalance[];
  totalExpenses: number;
  permission: 'view' | 'edit';
}

const CATEGORY_ICONS: Record<ExpenseCategory, any> = {
  food: FoodIcon,
  hotel: HotelIcon,
  ride: RideIcon,
  activity: ActivityIcon,
  shopping: ShoppingIcon,
  other: OtherIcon,
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food & Dining',
  hotel: 'Hotel',
  ride: 'Transportation',
  activity: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
};

export default function TripExpenses({
  trip,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  balances,
  totalExpenses,
  permission,
}: TripExpensesProps) {
  const { user } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>(
    'all'
  );
  const [filterParticipant, setFilterParticipant] = useState<string>('all');
  const DEFAULT_CURRENCIES = ['ILS', 'EUR', 'USD', 'GBP'];
  const [selectedCurrencies, setSelectedCurrencies] =
    useState<string[]>(DEFAULT_CURRENCIES);
  const [allCurrencies, setAllCurrencies] =
    useState<string[]>(DEFAULT_CURRENCIES);
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [convertedAmounts, setConvertedAmounts] = useState<Map<string, number>>(
    new Map()
  );
  const TARGET_CURRENCY = 'EUR'; // Display all amounts in EUR
  const [displayCurrency, setDisplayCurrency] = useState<string>('EUR'); // Currency for Total Expenses card
  const [convertedTotal, setConvertedTotal] = useState<number>(0);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    currency: 'EUR',
    paidBy: user?.id || '',
    multiplePayers: false, // Toggle for multiple payers
    payerAmounts: {} as Record<string, number>, // For multiple payers
    splitMethod: 'equal' as SplitMethod,
    selectedParticipants: [] as string[],
    customAmounts: {} as Record<string, number>,
    customPercentages: {} as Record<string, number>,
    date: new Date().toISOString().split('T')[0],
    category: 'other' as ExpenseCategory,
    notes: '',
    linkedItemType: '' as '' | 'hotel' | 'flight' | 'ride' | 'attraction',
    linkedItemId: '',
  });

  const expenses = trip.expenses || [];

  // Load available currencies from API
  useEffect(() => {
    getCurrencyList().then(setAllCurrencies);
  }, []);

  const handleAddCurrency = (currency: string) => {
    if (!selectedCurrencies.includes(currency)) {
      setSelectedCurrencies([...selectedCurrencies, currency]);
    }
    setShowAddCurrency(false);
  };

  // Convert all expenses to EUR for display
  useEffect(() => {
    const convertExpenses = async () => {
      const conversions = new Map<string, number>();

      for (const expense of expenses) {
        const converted = await convertCurrency(
          expense.amount,
          expense.currency,
          TARGET_CURRENCY
        );
        conversions.set(expense.id, converted);
      }

      setConvertedAmounts(conversions);
    };

    if (expenses.length > 0) {
      convertExpenses();
    }
  }, [expenses]);

  // Recalculate balances in EUR using converted amounts
  const eurBalances = useMemo(() => {
    if (convertedAmounts.size === 0) return balances;

    const participantBalances: Record<string, ParticipantBalance> = {};

    // Initialize all participants from balances
    balances.forEach((balance) => {
      participantBalances[balance.userId] = {
        ...balance,
        totalPaid: 0,
        totalOwed: 0,
        balance: 0,
      };
    });

    // Recalculate using converted EUR amounts
    expenses.forEach((expense) => {
      const convertedAmount =
        convertedAmounts.get(expense.id) || expense.amount;

      // Add to payer's total (handle single or multiple payers)
      if (typeof expense.paidBy === 'string') {
        if (participantBalances[expense.paidBy]) {
          participantBalances[expense.paidBy].totalPaid += convertedAmount;
        }
      } else if (Array.isArray(expense.paidBy)) {
        expense.paidBy.forEach((payer) => {
          if (participantBalances[payer.userId]) {
            const convertedPayerAmount =
              (payer.amount / expense.amount) * convertedAmount;
            participantBalances[payer.userId].totalPaid += convertedPayerAmount;
          }
        });
      }

      // Calculate splits in EUR
      expense.splits.forEach((split) => {
        if (!participantBalances[split.userId]) return;

        let owedAmount = 0;
        if (expense.splitMethod === 'equal') {
          owedAmount = convertedAmount / expense.splits.length;
        } else if (expense.splitMethod === 'custom-amount' && split.amount) {
          // Convert the split amount too
          owedAmount = (split.amount / expense.amount) * convertedAmount;
        } else if (
          expense.splitMethod === 'custom-percentage' &&
          split.percentage
        ) {
          owedAmount = (convertedAmount * split.percentage) / 100;
        }

        participantBalances[split.userId].totalOwed += owedAmount;
      });
    });

    // Calculate net balances
    Object.values(participantBalances).forEach((p) => {
      p.balance = p.totalPaid - p.totalOwed;
    });

    return Object.values(participantBalances);
  }, [balances, expenses, convertedAmounts]);

  // Calculate total in EUR
  const eurTotalExpenses = useMemo(() => {
    return Array.from(convertedAmounts.values()).reduce(
      (sum, amt) => sum + amt,
      0
    );
  }, [convertedAmounts]);

  // Calculate category totals in EUR
  const categoryTotals = useMemo(() => {
    const totals: Record<ExpenseCategory, number> = {
      food: 0,
      hotel: 0,
      ride: 0,
      activity: 0,
      shopping: 0,
      other: 0,
    };

    expenses.forEach((expense) => {
      const convertedAmount =
        convertedAmounts.get(expense.id) || expense.amount;
      totals[expense.category] += convertedAmount;
    });

    // Filter out categories with zero spending and sort by amount
    return Object.entries(totals)
      .filter(([_, amount]) => amount > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => ({
        category: category as ExpenseCategory,
        amount,
      }));
  }, [expenses, convertedAmounts]);

  // Convert total to selected display currency
  useEffect(() => {
    const convertTotal = async () => {
      if (eurTotalExpenses > 0) {
        const converted = await convertCurrency(
          eurTotalExpenses,
          TARGET_CURRENCY,
          displayCurrency
        );
        setConvertedTotal(converted);
      } else {
        setConvertedTotal(0);
      }
    };
    convertTotal();
  }, [eurTotalExpenses, displayCurrency]);

  // Get all participants (owner + all shared users)
  const allParticipants = [
    {
      userId: trip.userId!,
      name: trip.userName || 'Owner',
      email: trip.userEmail || '',
    },
    ...(trip.sharedWith || []).map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
    })),
  ];

  // Initialize form when opening dialog
  useEffect(() => {
    if (addDialogOpen && !editingExpense) {
      setFormData({
        title: '',
        amount: '',
        currency: 'EUR',
        paidBy: user?.id || '',
        multiplePayers: false,
        payerAmounts: {},
        splitMethod: 'equal',
        selectedParticipants: allParticipants.map((p) => p.userId),
        customAmounts: {},
        customPercentages: {},
        date: new Date().toISOString().split('T')[0],
        category: 'other',
        notes: '',
        linkedItemType: '',
        linkedItemId: '',
      });
    }
  }, [addDialogOpen, editingExpense]);

  // Load expense data when editing
  useEffect(() => {
    if (editingExpense) {
      const customAmounts: Record<string, number> = {};
      const customPercentages: Record<string, number> = {};

      editingExpense.splits.forEach((split) => {
        if (split.amount !== undefined) {
          customAmounts[split.userId] = split.amount;
        }
        if (split.percentage !== undefined) {
          customPercentages[split.userId] = split.percentage;
        }
      });

      // Handle multiple payers
      const isMultiplePayers = Array.isArray(editingExpense.paidBy);
      const paidBy = isMultiplePayers ? '' : (editingExpense.paidBy as string);
      const payerAmounts: Record<string, number> = {};
      if (isMultiplePayers) {
        (
          editingExpense.paidBy as Array<{ userId: string; amount: number }>
        ).forEach((payer) => {
          payerAmounts[payer.userId] = payer.amount;
        });
      }

      setFormData({
        title: editingExpense.title,
        amount: editingExpense.amount.toString(),
        currency: editingExpense.currency,
        paidBy,
        multiplePayers: isMultiplePayers,
        payerAmounts,
        splitMethod: editingExpense.splitMethod,
        selectedParticipants: editingExpense.splits.map((s) => s.userId),
        customAmounts,
        customPercentages,
        date: editingExpense.date,
        category: editingExpense.category,
        notes: editingExpense.notes || '',
        linkedItemType: editingExpense.linkedItemType || '',
        linkedItemId: editingExpense.linkedItemId || '',
      });
      setAddDialogOpen(true);
    }
  }, [editingExpense]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.amount) {
      alert('Please fill in all required fields');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Validate paidBy
    let paidBy: string | Array<{ userId: string; amount: number }>;
    if (formData.multiplePayers) {
      const payerEntries = Object.entries(formData.payerAmounts).filter(
        ([_, amt]) => amt > 0
      );
      if (payerEntries.length === 0) {
        alert('Please specify who paid');
        return;
      }
      const totalPaid = payerEntries.reduce((sum, [_, amt]) => sum + amt, 0);
      if (Math.abs(totalPaid - amount) > 0.01) {
        alert(
          `Total paid (${totalPaid.toFixed(2)}) must equal expense amount (${amount.toFixed(2)})`
        );
        return;
      }
      paidBy = payerEntries.map(([userId, amt]) => ({ userId, amount: amt }));
    } else {
      if (!formData.paidBy) {
        alert('Please select who paid');
        return;
      }
      paidBy = formData.paidBy;
    }

    // Build splits array
    const splits = formData.selectedParticipants.map((userId) => {
      const split: any = { userId };
      if (formData.splitMethod === 'custom-amount') {
        split.amount = formData.customAmounts[userId] || 0;
      } else if (formData.splitMethod === 'custom-percentage') {
        split.percentage = formData.customPercentages[userId] || 0;
      }
      return split;
    });

    // Validate splits
    if (formData.splitMethod === 'custom-amount') {
      const total = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
      if (Math.abs(total - amount) > 0.01) {
        alert(`Custom amounts must sum to ${amount} ${formData.currency}`);
        return;
      }
    } else if (formData.splitMethod === 'custom-percentage') {
      const total = splits.reduce((sum, s) => sum + (s.percentage || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        alert('Custom percentages must sum to 100%');
        return;
      }
    }

    const expense = {
      title: formData.title,
      amount,
      currency: formData.currency,
      paidBy,
      splitMethod: formData.splitMethod,
      splits,
      date: formData.date,
      category: formData.category,
      notes: formData.notes,
      linkedItemType: formData.linkedItemType || undefined,
      linkedItemId: formData.linkedItemId || undefined,
    };

    if (editingExpense) {
      await onUpdateExpense(editingExpense.id, expense);
    } else {
      await onAddExpense(expense);
    }

    handleCloseDialog();
  };

  const handleCloseDialog = () => {
    setAddDialogOpen(false);
    setEditingExpense(null);
    setFormData({
      title: '',
      amount: '',
      currency: 'EUR',
      paidBy: user?.id || '',
      multiplePayers: false,
      payerAmounts: {},
      splitMethod: 'equal',
      selectedParticipants: [],
      customAmounts: {},
      customPercentages: {},
      date: new Date().toISOString().split('T')[0],
      category: 'other',
      notes: '',
      linkedItemType: '',
      linkedItemId: '',
    });
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await onDeleteExpense(expenseId);
    }
  };

  // Filter expenses
  const filteredExpenses = expenses.filter((expense) => {
    if (filterCategory !== 'all' && expense.category !== filterCategory)
      return false;
    if (filterParticipant !== 'all') {
      if (
        expense.paidBy !== filterParticipant &&
        !expense.splits.some((s) => s.userId === filterParticipant)
      ) {
        return false;
      }
    }
    return true;
  });

  const getParticipantName = (userId: string) => {
    const participant = allParticipants.find((p) => p.userId === userId);
    return participant?.name || 'Unknown';
  };

  const getPayersDisplay = (expense: Expense) => {
    if (typeof expense.paidBy === 'string') {
      return `Paid by ${getParticipantName(expense.paidBy)}`;
    } else {
      const payers = expense.paidBy
        .map(
          (p) =>
            `${getParticipantName(p.userId)} (${formatCurrency(p.amount, expense.currency)})`
        )
        .join(', ');
      return `Paid by ${payers}`;
    }
  };

  const getLinkedItemDisplay = (expense: Expense) => {
    if (!expense.linkedItemType || !expense.linkedItemId) return null;

    const [type, idx] = expense.linkedItemId.split('-');
    const index = parseInt(idx);

    switch (expense.linkedItemType) {
      case 'hotel':
        const hotel = trip.hotels[index];
        return hotel ? `🏨 ${hotel.name}` : null;
      case 'flight':
        const flight = trip.flights[index];
        return flight
          ? `✈️ ${flight.airline} ${flight.flightNumber} (${flight.departureAirportCode} → ${flight.arrivalAirportCode})`
          : null;
      case 'ride':
        const ride = trip.rides[index];
        return ride
          ? `🚗 ${ride.type === 'taxi' ? 'Taxi' : 'Rental Car'} (${ride.pickup} → ${ride.dropoff})`
          : null;
      case 'attraction':
        const attraction = trip.attractions[index];
        return attraction ? `🎭 ${attraction.name}` : null;
      default:
        return null;
    }
  };

  const calculateSplitAmount = (expense: Expense, userId: string) => {
    const split = expense.splits.find((s) => s.userId === userId);
    if (!split) return 0;

    if (expense.splitMethod === 'equal') {
      return expense.amount / expense.splits.length;
    } else if (expense.splitMethod === 'custom-amount') {
      return split.amount || 0;
    } else if (expense.splitMethod === 'custom-percentage') {
      return (expense.amount * (split.percentage || 0)) / 100;
    }
    return 0;
  };

  // Export to Excel
  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Trip Expense Report'],
      ['Trip:', trip.name],
      ['Generated:', new Date().toLocaleDateString()],
      ['Currency:', TARGET_CURRENCY],
      [],
      ['Participant', 'Total Paid', 'Total Owed', 'Balance'],
    ];

    eurBalances.forEach((balance) => {
      summaryData.push([
        balance.name,
        balance.totalPaid.toFixed(2),
        balance.totalOwed.toFixed(2),
        balance.balance.toFixed(2),
      ]);
    });

    summaryData.push(
      [],
      ['Total Expenses:', eurTotalExpenses.toFixed(2), TARGET_CURRENCY]
    );

    // Add category breakdown
    if (categoryTotals.length > 0) {
      summaryData.push(
        [],
        ['Spending by Category'],
        ['Category', 'Amount', '% of Total']
      );

      categoryTotals.forEach(({ category, amount }) => {
        const percentage = ((amount / eurTotalExpenses) * 100).toFixed(1);
        summaryData.push([
          CATEGORY_LABELS[category],
          amount.toFixed(2),
          `${percentage}%`,
        ]);
      });
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Expenses sheet
    const expensesData = [
      [
        'Date',
        'Title',
        'Category',
        'Amount',
        'Currency',
        `Amount (${TARGET_CURRENCY})`,
        'Paid By',
        'Split Method',
        'Participants',
        'Linked Item',
        'Notes',
      ],
    ];

    expenses.forEach((expense) => {
      const convertedAmount =
        convertedAmounts.get(expense.id) || expense.amount;
      const linkedItem = getLinkedItemDisplay(expense) || 'None';
      const participants = expense.splits
        .map((s) => getParticipantName(s.userId))
        .join(', ');

      expensesData.push([
        expense.date,
        expense.title,
        CATEGORY_LABELS[expense.category],
        expense.amount.toFixed(2),
        expense.currency,
        convertedAmount.toFixed(2),
        getPayersDisplay(expense),
        expense.splitMethod === 'equal'
          ? 'Split Equally'
          : expense.splitMethod === 'custom-amount'
            ? 'Custom Amounts'
            : 'Custom Percentages',
        participants,
        linkedItem,
        expense.notes || '',
      ]);
    });

    const expensesSheet = XLSX.utils.aoa_to_sheet(expensesData);
    XLSX.utils.book_append_sheet(workbook, expensesSheet, 'Expenses');

    // Download
    XLSX.writeFile(workbook, `${trip.name}-expenses.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Trip Expense Report', 14, 20);

    doc.setFontSize(11);
    doc.text(`Trip: ${trip.name}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);
    doc.text(`Currency: ${TARGET_CURRENCY}`, 14, 42);

    // Balance Summary Table
    doc.setFontSize(14);
    doc.text('Balance Summary', 14, 55);

    autoTable(doc, {
      startY: 60,
      head: [['Participant', 'Total Paid', 'Total Owed', 'Balance']],
      body: eurBalances.map((balance) => [
        balance.name,
        `${formatCurrency(balance.totalPaid, TARGET_CURRENCY)}`,
        `${formatCurrency(balance.totalOwed, TARGET_CURRENCY)}`,
        `${formatCurrency(balance.balance, TARGET_CURRENCY)}`,
      ]),
      foot: [
        [
          'Total',
          `${formatCurrency(eurTotalExpenses, TARGET_CURRENCY)}`,
          '',
          '',
        ],
      ],
    });

    // Category Breakdown Table
    let currentY = (doc as any).lastAutoTable.finalY || 100;
    if (categoryTotals.length > 0) {
      doc.setFontSize(14);
      doc.text('Spending by Category', 14, currentY + 15);

      autoTable(doc, {
        startY: currentY + 20,
        head: [['Category', `Amount (${TARGET_CURRENCY})`, '% of Total']],
        body: categoryTotals.map(({ category, amount }) => {
          const percentage = ((amount / eurTotalExpenses) * 100).toFixed(1);
          return [
            CATEGORY_LABELS[category],
            formatCurrency(amount, TARGET_CURRENCY),
            `${percentage}%`,
          ];
        }),
        headStyles: { fillColor: [63, 81, 181] },
      });

      currentY = (doc as any).lastAutoTable.finalY || currentY + 80;
    }

    // Expenses Table
    doc.setFontSize(14);
    doc.text('Expenses', 14, currentY + 15);

    autoTable(doc, {
      startY: currentY + 20,
      head: [
        [
          'Date',
          'Title',
          'Category',
          `Amount (${TARGET_CURRENCY})`,
          'Paid By',
          'Participants',
        ],
      ],
      body: expenses.map((expense) => {
        const convertedAmount =
          convertedAmounts.get(expense.id) || expense.amount;
        const participants = expense.splits
          .map((s) => getParticipantName(s.userId))
          .join(', ');

        return [
          new Date(expense.date).toLocaleDateString(),
          expense.title,
          CATEGORY_LABELS[expense.category],
          formatCurrency(convertedAmount, TARGET_CURRENCY),
          getPayersDisplay(expense),
          participants,
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [63, 81, 181] },
    });

    // Download
    doc.save(`${trip.name}-expenses.pdf`);
  };

  return (
    <Box>
      {/* Header with Add and Export Buttons */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        flexWrap="wrap"
        gap={2}
      >
        <Typography variant="h5">Expenses</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={exportToExcel}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={exportToPDF}
          >
            PDF
          </Button>
          {permission === 'edit' && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddDialogOpen(true)}
            >
              Add Expense
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Balance Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {eurBalances.map((balance) => (
          <Grid item xs={12} sm={6} md={4} key={balance.userId}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {balance.name}
                  </Typography>
                  <Typography variant="h6">
                    {balance.balance >= 0 ? '+' : ''}
                    {formatCurrency(balance.balance, TARGET_CURRENCY)}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ fontSize: '0.875rem' }}
                  >
                    <Typography color="success.main">
                      Paid: {formatCurrency(balance.totalPaid, TARGET_CURRENCY)}
                    </Typography>
                    <Typography color="error.main">
                      Owed: {formatCurrency(balance.totalOwed, TARGET_CURRENCY)}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="caption"
                    color={balance.balance >= 0 ? 'success.main' : 'error.main'}
                  >
                    {balance.balance >= 0
                      ? `Gets back ${formatCurrency(Math.abs(balance.balance), TARGET_CURRENCY)}`
                      : `Owes ${formatCurrency(Math.abs(balance.balance), TARGET_CURRENCY)}`}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* Total Summary */}
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Stack spacing={1}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="subtitle2">Total Expenses</Typography>
                  <Select
                    value={displayCurrency}
                    onChange={(e) => setDisplayCurrency(e.target.value)}
                    size="small"
                    sx={{
                      color: 'white',
                      '.MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255,255,255,0.3)',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255,255,255,0.5)',
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'white',
                      },
                      '.MuiSvgIcon-root': { color: 'white' },
                      minWidth: 80,
                      height: 32,
                    }}
                  >
                    {selectedCurrencies.map((curr) => (
                      <MenuItem key={curr} value={curr}>
                        {curr}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
                <Typography variant="h5">
                  {formatCurrency(convertedTotal, displayCurrency)}
                </Typography>
                <Typography variant="caption">
                  {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Category Breakdown */}
      {categoryTotals.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" mb={2}>
              Spending by Category
            </Typography>
            <Grid container spacing={2}>
              {categoryTotals.map(({ category, amount }) => {
                const CategoryIcon = CATEGORY_ICONS[category];
                const percentage = (amount / eurTotalExpenses) * 100;

                return (
                  <Grid item xs={12} sm={6} md={4} key={category}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          bgcolor: 'primary.light',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CategoryIcon sx={{ color: 'primary.main' }} />
                      </Box>
                      <Stack flex={1}>
                        <Typography variant="subtitle2">
                          {CATEGORY_LABELS[category]}
                        </Typography>
                        <Typography variant="h6" color="primary">
                          {formatCurrency(amount, TARGET_CURRENCY)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {percentage.toFixed(1)}% of total
                        </Typography>
                      </Stack>
                    </Stack>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Stack direction="row" spacing={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filterCategory}
            label="Category"
            onChange={(e) => setFilterCategory(e.target.value as any)}
          >
            <MenuItem value="all">All Categories</MenuItem>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Participant</InputLabel>
          <Select
            value={filterParticipant}
            label="Participant"
            onChange={(e) => setFilterParticipant(e.target.value)}
          >
            <MenuItem value="all">All Participants</MenuItem>
            {allParticipants.map((p) => (
              <MenuItem key={p.userId} value={p.userId}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* Expenses List */}
      <Stack spacing={2}>
        {filteredExpenses.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No expenses yet.{' '}
              {permission === 'edit' && 'Click "Add Expense" to get started!'}
            </Typography>
          </Paper>
        ) : (
          filteredExpenses.map((expense) => {
            const CategoryIcon = CATEGORY_ICONS[expense.category];
            const canEdit = user?.id === expense.createdBy || trip.isOwner;

            return (
              <Card key={expense.id}>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                  >
                    <Stack direction="row" spacing={2} flex={1}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: 'primary.light',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CategoryIcon sx={{ color: 'primary.main' }} />
                      </Box>

                      <Stack flex={1}>
                        <Typography variant="h6">{expense.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(expense.date).toLocaleDateString()} •{' '}
                          {CATEGORY_LABELS[expense.category]}
                        </Typography>
                        {getLinkedItemDisplay(expense) && (
                          <Typography
                            variant="body2"
                            color="primary"
                            sx={{ fontWeight: 500, mt: 0.5 }}
                          >
                            {getLinkedItemDisplay(expense)}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          mt={0.5}
                        >
                          {getPayersDisplay(expense)}
                        </Typography>
                        {expense.notes && (
                          <Typography variant="body2" mt={1}>
                            {expense.notes}
                          </Typography>
                        )}

                        {/* Split details */}
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          mt={1}
                        >
                          {expense.splits.map((split) => {
                            const splitAmount = calculateSplitAmount(
                              expense,
                              split.userId
                            );
                            const convertedSplit = convertedAmounts.get(
                              expense.id
                            )
                              ? (splitAmount / expense.amount) *
                                convertedAmounts.get(expense.id)!
                              : splitAmount;
                            return (
                              <Chip
                                key={split.userId}
                                label={`${getParticipantName(split.userId)}: ${formatCurrency(convertedSplit, TARGET_CURRENCY)}`}
                                size="small"
                                variant="outlined"
                              />
                            );
                          })}
                        </Stack>
                      </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Stack alignItems="flex-end">
                        <Typography variant="h6" color="primary">
                          {convertedAmounts.has(expense.id)
                            ? formatCurrency(
                                convertedAmounts.get(expense.id)!,
                                TARGET_CURRENCY
                              )
                            : `${expense.amount.toFixed(2)} ${expense.currency}`}
                        </Typography>
                        {expense.currency !== TARGET_CURRENCY &&
                          convertedAmounts.has(expense.id) && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              (was {expense.amount.toFixed(2)}{' '}
                              {expense.currency})
                            </Typography>
                          )}
                        <Chip
                          label={
                            expense.splitMethod === 'equal'
                              ? 'Split Equally'
                              : expense.splitMethod === 'custom-amount'
                                ? 'Custom Amounts'
                                : 'Custom %'
                          }
                          size="small"
                          sx={{ mt: 0.5 }}
                        />
                      </Stack>

                      {permission === 'edit' && canEdit && (
                        <Stack>
                          <IconButton
                            size="small"
                            onClick={() => handleEditExpense(expense)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteExpense(expense.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })
        )}
      </Stack>

      {/* Add/Edit Expense Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingExpense ? 'Edit Expense' : 'Add New Expense'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} mt={1}>
            {/* Title */}
            <TextField
              label="Title *"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              fullWidth
              placeholder="e.g., Dinner at restaurant"
            />

            {/* Amount and Currency */}
            <Stack direction="row" spacing={2}>
              <TextField
                label="Amount *"
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
              />
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel>Currency</InputLabel>
                <Select
                  value={formData.currency}
                  label="Currency"
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'ADD_NEW') {
                      setShowAddCurrency(true);
                    } else {
                      setFormData({ ...formData, currency: value });
                    }
                  }}
                >
                  {selectedCurrencies.map((curr) => (
                    <MenuItem key={curr} value={curr}>
                      {curr}
                    </MenuItem>
                  ))}
                  <MenuItem
                    value="ADD_NEW"
                    sx={{ color: 'primary.main', fontWeight: 'bold' }}
                  >
                    + Add Currency
                  </MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Paid By Section */}
            <Box>
              <Stack direction="row" spacing={2} alignItems="center" mb={1}>
                <Typography variant="subtitle2">Who Paid?</Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.multiplePayers}
                      onChange={(e) => {
                        const multiplePayers = e.target.checked;
                        setFormData({
                          ...formData,
                          multiplePayers,
                          payerAmounts: multiplePayers
                            ? {
                                [formData.paidBy]: Number(formData.amount) || 0,
                              }
                            : {},
                        });
                      }}
                    />
                  }
                  label="Multiple payers"
                />
              </Stack>

              {!formData.multiplePayers ? (
                <FormControl fullWidth>
                  <InputLabel>Paid By *</InputLabel>
                  <Select
                    value={formData.paidBy}
                    label="Paid By *"
                    onChange={(e) =>
                      setFormData({ ...formData, paidBy: e.target.value })
                    }
                  >
                    {allParticipants.map((p) => (
                      <MenuItem key={p.userId} value={p.userId}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" mb={1}>
                    Enter how much each person paid (must total{' '}
                    {formData.amount || '0'} {formData.currency})
                  </Typography>
                  <Stack spacing={1.5} mt={1}>
                    {allParticipants.map((participant) => (
                      <Stack
                        key={participant.userId}
                        direction="row"
                        spacing={2}
                        alignItems="center"
                      >
                        <Typography sx={{ minWidth: 120 }}>
                          {participant.name}
                        </Typography>
                        <TextField
                          type="number"
                          value={
                            formData.payerAmounts[participant.userId] || ''
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              payerAmounts: {
                                ...formData.payerAmounts,
                                [participant.userId]: value ? Number(value) : 0,
                              },
                            });
                          }}
                          size="small"
                          sx={{ width: 150 }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                {formData.currency}
                              </InputAdornment>
                            ),
                          }}
                        />
                      </Stack>
                    ))}
                  </Stack>
                  <Typography
                    variant="caption"
                    color={
                      Object.values(formData.payerAmounts).reduce(
                        (sum, amt) => sum + amt,
                        0
                      ) === Number(formData.amount)
                        ? 'success.main'
                        : 'error.main'
                    }
                    mt={1}
                    display="block"
                  >
                    Total paid:{' '}
                    {Object.values(formData.payerAmounts)
                      .reduce((sum, amt) => sum + amt, 0)
                      .toFixed(2)}{' '}
                    {formData.currency} / {formData.amount || '0'}{' '}
                    {formData.currency}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Date and Category */}
            <Stack direction="row" spacing={2}>
              <TextField
                label="Date *"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  label="Category"
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: e.target.value as ExpenseCategory,
                    })
                  }
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Link to Trip Item (Optional) */}
            <Box>
              <Typography variant="subtitle2" mb={1}>
                Link to Trip Item (Optional)
              </Typography>
              <Stack direction="row" spacing={2}>
                <FormControl sx={{ minWidth: 150 }}>
                  <InputLabel>Item Type</InputLabel>
                  <Select
                    value={formData.linkedItemType}
                    label="Item Type"
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        linkedItemType: e.target.value as any,
                        linkedItemId: '', // Reset item selection when type changes
                      });
                    }}
                  >
                    <MenuItem value="">None</MenuItem>
                    <MenuItem value="hotel">Hotel</MenuItem>
                    <MenuItem value="flight">Flight</MenuItem>
                    <MenuItem value="ride">Ride</MenuItem>
                    <MenuItem value="attraction">Attraction</MenuItem>
                  </Select>
                </FormControl>

                {formData.linkedItemType && (
                  <FormControl fullWidth>
                    <InputLabel>Select Item</InputLabel>
                    <Select
                      value={formData.linkedItemId}
                      label="Select Item"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          linkedItemId: e.target.value,
                        })
                      }
                    >
                      {formData.linkedItemType === 'hotel' &&
                        trip.hotels.map((hotel, idx) => (
                          <MenuItem key={idx} value={`hotel-${idx}`}>
                            {hotel.name} ({hotel.checkIn} - {hotel.checkOut})
                          </MenuItem>
                        ))}
                      {formData.linkedItemType === 'flight' &&
                        trip.flights.map((flight, idx) => (
                          <MenuItem key={idx} value={`flight-${idx}`}>
                            {flight.airline} {flight.flightNumber} (
                            {flight.departureAirportCode} →{' '}
                            {flight.arrivalAirportCode})
                          </MenuItem>
                        ))}
                      {formData.linkedItemType === 'ride' &&
                        trip.rides.map((ride, idx) => (
                          <MenuItem key={idx} value={`ride-${idx}`}>
                            {ride.type === 'taxi' ? 'Taxi' : 'Rental Car'} (
                            {ride.pickup} → {ride.dropoff})
                          </MenuItem>
                        ))}
                      {formData.linkedItemType === 'attraction' &&
                        trip.attractions.map((attraction, idx) => (
                          <MenuItem key={idx} value={`attraction-${idx}`}>
                            {attraction.name} ({attraction.scheduledDate})
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                )}
              </Stack>
            </Box>

            {/* Split Method */}
            <FormControl component="fieldset">
              <FormLabel component="legend">Split Method</FormLabel>
              <RadioGroup
                value={formData.splitMethod}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    splitMethod: e.target.value as SplitMethod,
                  })
                }
              >
                <FormControlLabel
                  value="equal"
                  control={<Radio />}
                  label="Split Equally"
                />
                <FormControlLabel
                  value="custom-amount"
                  control={<Radio />}
                  label="Custom Amounts"
                />
                <FormControlLabel
                  value="custom-percentage"
                  control={<Radio />}
                  label="Custom Percentages"
                />
              </RadioGroup>
            </FormControl>

            {/* Participants */}
            <Box>
              <Typography variant="subtitle2" mb={1}>
                Who participates in this expense?
              </Typography>
              <Stack spacing={1}>
                {allParticipants.map((p) => (
                  <Box key={p.userId}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={formData.selectedParticipants.includes(
                              p.userId
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  selectedParticipants: [
                                    ...formData.selectedParticipants,
                                    p.userId,
                                  ],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  selectedParticipants:
                                    formData.selectedParticipants.filter(
                                      (id) => id !== p.userId
                                    ),
                                });
                              }
                            }}
                          />
                        }
                        label={p.name}
                      />

                      {formData.selectedParticipants.includes(p.userId) &&
                        formData.splitMethod === 'custom-amount' && (
                          <TextField
                            type="number"
                            size="small"
                            label="Amount"
                            value={formData.customAmounts[p.userId] || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customAmounts: {
                                  ...formData.customAmounts,
                                  [p.userId]: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            sx={{ width: 120 }}
                          />
                        )}

                      {formData.selectedParticipants.includes(p.userId) &&
                        formData.splitMethod === 'custom-percentage' && (
                          <TextField
                            type="number"
                            size="small"
                            label="Percentage"
                            value={formData.customPercentages[p.userId] || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customPercentages: {
                                  ...formData.customPercentages,
                                  [p.userId]: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  %
                                </InputAdornment>
                              ),
                            }}
                            sx={{ width: 120 }}
                          />
                        )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>

            {/* Notes */}
            <TextField
              label="Notes (optional)"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              fullWidth
              multiline
              rows={2}
              placeholder="Any additional details..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingExpense ? 'Update' : 'Add'} Expense
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Currency Dialog */}
      <Dialog
        open={showAddCurrency}
        onClose={() => setShowAddCurrency(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Add Currency</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            {allCurrencies
              .filter((curr) => !selectedCurrencies.includes(curr))
              .sort()
              .map((curr) => (
                <Button
                  key={curr}
                  variant="outlined"
                  onClick={() => {
                    handleAddCurrency(curr);
                    setFormData({ ...formData, currency: curr });
                  }}
                  fullWidth
                  sx={{ justifyContent: 'flex-start' }}
                >
                  {curr}
                </Button>
              ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddCurrency(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

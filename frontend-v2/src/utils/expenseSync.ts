// Utility functions for syncing between TripExpenses and BudgetTracker

import type { Expense as TripExpense } from '../types/domain';
import type {
  Expense as BudgetExpense,
  ExpenseCategory,
} from '../types/Budget';

/**
 * Maps TripExpense category to BudgetTracker category
 */
function mapCategoryToBudget(
  tripCategory: TripExpense['category']
): ExpenseCategory {
  const categoryMap: Record<TripExpense['category'], ExpenseCategory> = {
    food: 'food',
    hotel: 'hotels',
    ride: 'transportation',
    activity: 'activities',
    shopping: 'shopping',
    other: 'other',
  };

  return categoryMap[tripCategory] || 'other';
}

/**
 * Calculates the user's share from a trip expense
 */
export function calculateUserShare(
  tripExpense: TripExpense,
  userId: string
): number {
  // If user didn't participate in this expense, return 0
  const userSplit = tripExpense.splits.find((s) => s.userId === userId);
  if (!userSplit) {
    return 0;
  }

  // Calculate based on split method
  switch (tripExpense.splitMethod) {
    case 'equal':
      return tripExpense.amount / tripExpense.splits.length;

    case 'custom-amount':
      return userSplit.amount || 0;

    case 'custom-percentage':
      return tripExpense.amount * ((userSplit.percentage || 0) / 100);

    default:
      return 0;
  }
}

/**
 * Converts a TripExpense to a BudgetExpense
 * Only includes the user's share of the expense
 */
export function convertTripExpenseToBudget(
  tripExpense: TripExpense,
  userId: string,
  tripId: string
): BudgetExpense | null {
  const userShare = calculateUserShare(tripExpense, userId);

  // Don't create a budget expense if user has no share
  if (userShare === 0) {
    return null;
  }

  return {
    _id: `trip-expense-${tripExpense.id}`,
    tripId,
    category: mapCategoryToBudget(tripExpense.category),
    amount: userShare,
    currency: tripExpense.currency,
    description: tripExpense.title,
    date: tripExpense.date,
    notes: `הוצאה משותפת - ${tripExpense.title}`,
    createdAt: tripExpense.createdAt,
  };
}

/**
 * Checks if a budget expense was synced from trip expenses
 */
export function isFromTripExpense(budgetExpense: BudgetExpense): boolean {
  return budgetExpense._id?.startsWith('trip-expense-') || false;
}

/**
 * Syncs trip expenses to budget expenses
 * Returns only new expenses that should be added
 */
export function syncTripExpensesToBudget(
  tripExpenses: TripExpense[],
  existingBudgetExpenses: BudgetExpense[],
  userId: string,
  tripId: string
): BudgetExpense[] {
  const existingIds = new Set(
    existingBudgetExpenses.map((e) => e._id).filter(Boolean)
  );

  const newBudgetExpenses: BudgetExpense[] = [];

  for (const tripExpense of tripExpenses) {
    const budgetExpenseId = `trip-expense-${tripExpense.id}`;

    // Skip if already synced
    if (existingIds.has(budgetExpenseId)) {
      continue;
    }

    const budgetExpense = convertTripExpenseToBudget(
      tripExpense,
      userId,
      tripId
    );

    if (budgetExpense) {
      newBudgetExpenses.push(budgetExpense);
    }
  }

  return newBudgetExpenses;
}

/**
 * Converts trip flights to budget expenses
 */
export function convertFlightsToBudgetExpenses(
  flights: any[],
  tripId: string
): BudgetExpense[] {
  if (!flights || flights.length === 0) return [];

  const expenses: BudgetExpense[] = [];

  for (const flight of flights) {
    const price =
      typeof flight.price === 'object' ? flight.price.amount : flight.price;
    const currency =
      typeof flight.price === 'object' ? flight.price.currency : 'USD';

    if (!price) continue;

    expenses.push({
      _id: `trip-flight-${flight.flightNumber || flight.id || Math.random()}-${flight.departureTime}`,
      tripId,
      category: 'flights' as ExpenseCategory,
      amount: price,
      currency: currency,
      description: `${flight.origin?.city || flight.origin} → ${flight.destination?.city || flight.destination}`,
      date:
        flight.departureTime?.split('T')[0] ||
        new Date().toISOString().split('T')[0],
      notes: `Flight ${flight.flightNumber || ''}`.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  return expenses;
}

/**
 * Converts trip hotels to budget expenses
 */
export function convertHotelsToBudgetExpenses(
  hotels: any[],
  tripId: string
): BudgetExpense[] {
  if (!hotels || hotels.length === 0) return [];

  const expenses: BudgetExpense[] = [];

  for (const hotel of hotels) {
    const price = hotel.pricePerNight || hotel.totalPrice || hotel.price;
    if (!price) continue;

    expenses.push({
      _id: `trip-hotel-${hotel.placeId || hotel.id || Math.random()}-${hotel.checkIn}`,
      tripId,
      category: 'hotels' as ExpenseCategory,
      amount: price,
      currency: 'USD',
      description: hotel.name || 'Hotel',
      date:
        hotel.checkIn?.split('T')[0] || new Date().toISOString().split('T')[0],
      notes: `${hotel.nights || 1} nights`,
      createdAt: new Date().toISOString(),
    });
  }

  return expenses;
}

/**
 * Converts trip rides to budget expenses
 */
export function convertRidesToBudgetExpenses(
  rides: any[],
  tripId: string
): BudgetExpense[] {
  if (!rides || rides.length === 0) return [];

  const expenses: BudgetExpense[] = [];

  for (let index = 0; index < rides.length; index++) {
    const ride = rides[index];
    const price = ride.estimatedPrice || ride.price;
    if (!price) continue;

    expenses.push({
      _id: `trip-ride-${ride.id || index}-${ride.pickupDate || new Date().toISOString()}`,
      tripId,
      category: 'transportation' as ExpenseCategory,
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

  return expenses;
}

/**
 * Syncs all trip data (flights, hotels, rides, expenses) to budget
 */
export function syncAllTripDataToBudget(
  trip: {
    flights?: any[];
    hotels?: any[];
    rides?: any[];
    expenses?: TripExpense[];
  },
  existingBudgetExpenses: BudgetExpense[],
  userId: string,
  tripId: string
): BudgetExpense[] {
  const existingIds = new Set(
    existingBudgetExpenses.map((e) => e._id).filter(Boolean)
  );

  const allNewExpenses: BudgetExpense[] = [];

  // Convert flights
  const flightExpenses = convertFlightsToBudgetExpenses(
    trip.flights || [],
    tripId
  );
  allNewExpenses.push(...flightExpenses.filter((e) => !existingIds.has(e._id)));

  // Convert hotels
  const hotelExpenses = convertHotelsToBudgetExpenses(
    trip.hotels || [],
    tripId
  );
  allNewExpenses.push(...hotelExpenses.filter((e) => !existingIds.has(e._id)));

  // Convert rides
  const rideExpenses = convertRidesToBudgetExpenses(trip.rides || [], tripId);
  allNewExpenses.push(...rideExpenses.filter((e) => !existingIds.has(e._id)));

  // Convert shared expenses
  const sharedExpenses = syncTripExpensesToBudget(
    trip.expenses || [],
    existingBudgetExpenses,
    userId,
    tripId
  );
  allNewExpenses.push(...sharedExpenses);

  return allNewExpenses;
}

/**
 * Calculates statistics separating personal and shared expenses
 */
export function calculateExpenseStats(expenses: BudgetExpense[]) {
  const personalExpenses = expenses.filter((e) => !isFromTripExpense(e));
  const sharedExpenses = expenses.filter((e) => isFromTripExpense(e));

  const personalTotal = personalExpenses.reduce((sum, e) => sum + e.amount, 0);
  const sharedTotal = sharedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const total = personalTotal + sharedTotal;

  return {
    total,
    personalTotal,
    sharedTotal,
    personalCount: personalExpenses.length,
    sharedCount: sharedExpenses.length,
    totalCount: expenses.length,
  };
}

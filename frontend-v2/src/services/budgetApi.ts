// Budget API functions
import type { Budget, ExpenseCategory, Expense } from '../types/Budget';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  icon?: string | null;
  color?: string | null;
}

interface ApiBudget {
  totalBudget: number;
  currency: string;
  categories: BudgetCategory[];
  updatedAt?: string;
}

// Helper to get auth token
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// GET /api/budgets/:tripId - Get budget for a trip
export async function getBudget(tripId: string): Promise<Budget> {
  const response = await fetch(`${API_BASE_URL}/api/budgets/${tripId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get budget');
  }

  const apiBudget: ApiBudget = await response.json();

  // Convert API format to Budget format
  return {
    tripId,
    totalBudget: apiBudget.totalBudget,
    currency: apiBudget.currency,
    updatedAt: apiBudget.updatedAt,
  };
}

// POST /api/budgets/:tripId - Create or update budget
export async function saveBudget(
  tripId: string,
  budget: Budget
): Promise<Budget> {
  // Convert Budget format to API format
  const apiBudget: ApiBudget = {
    totalBudget: budget.totalBudget,
    currency: budget.currency,
    categories: [], // We can add category support later
  };

  const response = await fetch(`${API_BASE_URL}/api/budgets/${tripId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(apiBudget),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save budget');
  }

  const result = await response.json();
  const savedBudget: ApiBudget = result.budget;

  // Convert back to Budget format
  return {
    tripId,
    totalBudget: savedBudget.totalBudget,
    currency: savedBudget.currency,
    updatedAt: savedBudget.updatedAt,
  };
}

// PUT /api/budgets/:tripId - Update budget
export async function updateBudget(
  tripId: string,
  updates: Partial<Budget>
): Promise<Budget> {
  const response = await fetch(`${API_BASE_URL}/api/budgets/${tripId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update budget');
  }

  const result = await response.json();
  return result.budget;
}

// DELETE /api/budgets/:tripId - Delete budget
export async function deleteBudget(tripId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/budgets/${tripId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete budget');
  }
}

// POST /api/budgets/:tripId/categories - Add category
export async function addBudgetCategory(
  tripId: string,
  category: Omit<BudgetCategory, 'id'>
): Promise<BudgetCategory> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/categories`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(category),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add category');
  }

  const result = await response.json();
  return result.category;
}

// PUT /api/budgets/:tripId/categories/:categoryId - Update category
export async function updateBudgetCategory(
  tripId: string,
  categoryId: string,
  updates: Partial<BudgetCategory>
): Promise<BudgetCategory> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/categories/${categoryId}`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update category');
  }

  const result = await response.json();
  return result.category;
}

// DELETE /api/budgets/:tripId/categories/:categoryId - Delete category
export async function deleteBudgetCategory(
  tripId: string,
  categoryId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/categories/${categoryId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete category');
  }
}

// ============= EXPENSE MANAGEMENT =============

// GET /api/budgets/:tripId/expenses - Get all expenses
export async function getExpenses(tripId: string): Promise<Expense[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/expenses`,
    {
      method: 'GET',
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get expenses');
  }

  return await response.json();
}

// POST /api/budgets/:tripId/expenses - Add expense
export async function addExpense(
  tripId: string,
  expense: Expense
): Promise<Expense> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/expenses`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(expense),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add expense');
  }

  return await response.json();
}

// PUT /api/budgets/:tripId/expenses/:expenseId - Update expense
export async function updateExpense(
  tripId: string,
  expenseId: string,
  updates: Partial<Expense>
): Promise<Expense> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/expenses/${expenseId}`,
    {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update expense');
  }

  return await response.json();
}

// DELETE /api/budgets/:tripId/expenses/:expenseId - Delete expense
export async function deleteExpense(
  tripId: string,
  expenseId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/budgets/${tripId}/expenses/${expenseId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete expense');
  }
}

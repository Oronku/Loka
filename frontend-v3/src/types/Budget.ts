export interface Expense {
  _id?: string;
  tripId: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  description: string;
  date: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ExpenseCategory =
  | 'flights'
  | 'hotels'
  | 'food'
  | 'transportation'
  | 'activities'
  | 'shopping'
  | 'other';

export interface Budget {
  _id?: string;
  tripId: string;
  totalBudget: number;
  currency: string;
  categoryBudgets?: {
    [key in ExpenseCategory]?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetStats {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentageSpent: number;
  isOverBudget: boolean;
  spentByCategory: {
    [key in ExpenseCategory]: number;
  };
  averageDaily: number;
  projectedTotal: number;
}

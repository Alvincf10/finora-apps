export type Currency = "IDR" | "EUR";

export type AccountType =
  | "CASH"
  | "BANK"
  | "E_WALLET"
  | "CREDIT_CARD"
  | "OTHER";

export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

export type CategoryType = "INCOME" | "EXPENSE";

export type DebtStatus = "ACTIVE" | "PAID" | "CANCELLED";

export type GoalStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export type RecommendationSeverity = "INFO" | "WARNING" | "CRITICAL";

export type RecommendationType =
  | "CATEGORY_SPENDING_INCREASE"
  | "BUDGET_WARNING"
  | "OVER_BUDGET"
  | "SAVING_TARGET_RISK"
  | "DEBT_PAYMENT_OVERDUE";

export interface Money {
  amount: number;
  currency: Currency;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

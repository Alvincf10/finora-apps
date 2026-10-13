import { z } from "zod";

export const currencySchema = z.enum(["IDR", "EUR"]);

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(8).max(128),
  baseCurrency: currencySchema.default("IDR"),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["CASH", "BANK", "E_WALLET", "CREDIT_CARD", "OTHER"]),
  currency: currencySchema,
  initialBalance: z.number().int(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z
    .enum(["CASH", "BANK", "E_WALLET", "CREDIT_CARD", "OTHER"])
    .optional(),
  /** Opening balance; currentBalance is recalculated from ledger. */
  initialBalance: z.number().int().optional(),
  /**
   * Desired current balance. Adjusts initialBalance so that
   * initialBalance + transaction effects = this value.
   */
  currentBalance: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
});

export const createTransactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    amount: z.number().int().positive(),
    currency: currencySchema,
    accountId: z.string().min(1),
    toAccountId: z.string().optional(),
    categoryId: z.string().optional(),
    description: z.string().max(500).optional(),
    date: z.string().or(z.date()),
    notes: z.string().max(2000).optional(),
    merchant: z.string().max(200).optional(),
    tags: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "TRANSFER" && !data.toAccountId) {
      ctx.addIssue({
        code: "custom",
        message: "toAccountId is required for transfers",
        path: ["toAccountId"],
      });
    }
    if (data.type !== "TRANSFER" && !data.categoryId) {
      ctx.addIssue({
        code: "custom",
        message: "categoryId is required for income/expense",
        path: ["categoryId"],
      });
    }
  });

export const updateTransactionSchema = z.object({
  amount: z.number().int().positive().optional(),
  categoryId: z.string().optional(),
  description: z.string().max(500).optional(),
  date: z.string().or(z.date()).optional(),
  notes: z.string().max(2000).optional(),
  merchant: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
});

export const createBudgetSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  categoryId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: currencySchema,
});

export const createDebtSchema = z.object({
  name: z.string().min(1).max(100),
  originalAmount: z.number().int().positive(),
  currency: currencySchema,
  interestRate: z.number().min(0).optional(),
  minimumPayment: z.number().int().positive().optional(),
  plannedPayment: z.number().int().positive().optional(),
  dueDate: z.string().or(z.date()).optional(),
  startDate: z.string().or(z.date()).optional(),
  targetPayoffDate: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
});

export const updateDebtSchema = createDebtSchema.partial().extend({
  status: z.enum(["ACTIVE", "PAID", "CANCELLED"]).optional(),
});

export const createDebtPaymentSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().or(z.date()),
  notes: z.string().optional(),
});

export const createGoalSchema = z.object({
  name: z.string().min(1).max(100),
  targetAmount: z.number().int().positive(),
  currency: currencySchema,
  currentAmount: z.number().int().min(0).optional(),
  targetDate: z.string().or(z.date()).optional(),
  priority: z.number().int().optional(),
  notes: z.string().optional(),
});

export const contributeGoalSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
});

export const aiChatSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
});

export const updateSettingsSchema = z.object({
  paydayDay: z.number().int().min(1).max(28).optional(),
  monthlySalary: z.number().int().min(0).optional(),
});

export const createFixedCostSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: currencySchema,
  dueDay: z.number().int().min(1).max(31),
  notes: z.string().optional(),
});

export const updateFixedCostSchema = createFixedCostSchema.partial().extend({
  isActive: z.boolean().optional(),
});

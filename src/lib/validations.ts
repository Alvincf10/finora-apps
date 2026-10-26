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
  creditLimit: z.number().int().min(0).optional(),
  statementDueAmount: z.number().int().min(0).optional(),
  statementDueDay: z.number().int().min(1).max(31).optional(),
  debitMode: z.boolean().optional(),
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
   * For CREDIT_CARD this is outstanding owed.
   */
  currentBalance: z.number().int().optional(),
  isActive: z.boolean().optional(),
  creditLimit: z.number().int().min(0).nullable().optional(),
  statementDueAmount: z.number().int().min(0).nullable().optional(),
  statementDueDay: z.number().int().min(1).max(31).nullable().optional(),
  debitMode: z.boolean().optional(),
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
  accountId: z.string().min(1).optional(),
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

export const debtKindSchema = z.enum(["CONSUMER", "MORTGAGE", "OTHER"]);

export const debtObligationTypeSchema = z.enum([
  "INSTALLMENT",
  "CREDIT_STATEMENT",
  "PAYOFF",
  "TRANSFER",
  "OTHER",
]);

export const createDebtSchema = z.object({
  name: z.string().min(1).max(100),
  kind: debtKindSchema.optional(),
  originalAmount: z.number().int().positive(),
  currency: currencySchema,
  interestRate: z.number().min(0).optional(),
  minimumPayment: z.number().int().positive().optional(),
  plannedPayment: z.number().int().positive().optional(),
  installmentMonths: z.number().int().min(1).max(600).optional(),
  dueDate: z.string().or(z.date()).optional(),
  startDate: z.string().or(z.date()).optional(),
  targetPayoffDate: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
  obligationType: debtObligationTypeSchema.optional(),
  linkedAccountId: z.string().min(1).optional(),
});

export const updateDebtSchema = createDebtSchema.partial().extend({
  status: z.enum(["ACTIVE", "PAID", "CANCELLED"]).optional(),
  linkedAccountId: z.string().min(1).nullable().optional(),
});

export const paydayEnvelopeSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  amount: z.number().int().min(0),
  source: z.enum(["AUTO", "MANUAL"]).optional(),
  kind: z
    .enum([
      "CC_STATEMENT",
      "DEBT",
      "FIXED",
      "CASH_BUFFER",
      "CC_SPEND_CAP",
      "LIVING",
      "GOALS",
      "OTHER",
    ])
    .optional(),
  linkedDebtId: z.string().optional(),
  linkedAccountId: z.string().optional(),
  linkedFixedCostId: z.string().optional(),
  paid: z.boolean().optional(),
});

export const savePaydayAllocationSchema = z
  .object({
    salary: z.number().int().min(0).optional(),
    startingCash: z.number().int().min(0).optional(),
    envelopes: z.array(paydayEnvelopeSchema).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
    notes: z.string().max(2000).optional(),
    resetToSuggestion: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resetToSuggestion) return;
    if (!data.envelopes || data.envelopes.length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "envelopes required",
        path: ["envelopes"],
      });
    }
  });

export const payFixedCostSchema = z.object({
  accountId: z.string().min(1).optional(),
  amount: z.number().int().positive().optional(),
  date: z.string().or(z.date()).optional(),
  notes: z.string().max(2000).optional(),
});

export const settlePaydayEnvelopeSchema = z.object({
  envelopeKey: z.string().min(1),
  amount: z.number().int().positive(),
  kind: z.enum([
    "CC_STATEMENT",
    "DEBT",
    "FIXED",
    "CASH_BUFFER",
    "CC_SPEND_CAP",
    "LIVING",
    "GOALS",
    "OTHER",
  ]),
  label: z.string().min(1).max(120),
  linkedDebtId: z.string().min(1).optional(),
  linkedAccountId: z.string().min(1).optional(),
  linkedFixedCostId: z.string().min(1).optional(),
  /** Funding account (BCA etc). Defaults to preferred bank/cash. */
  accountId: z.string().min(1).optional(),
  salary: z.number().int().min(0).optional(),
  startingCash: z.number().int().min(0).optional(),
  /** Full envelopes snapshot so we can upsert allocation if needed. */
  envelopes: z.array(paydayEnvelopeSchema).optional(),
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
  educationGoalApplicability: z
    .enum(["APPLICABLE", "NOT_APPLICABLE", "UNSET"])
    .optional(),
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

export const whatsappActionSchema = z.object({
  action: z.enum(["start", "stop", "logout"]),
});

export const updateWhatsappSchema = z.object({
  defaultAccountId: z.string().min(1).nullable().optional(),
  /** Required digits-only allowlist; clearing is not allowed. */
  allowedFrom: z
    .string()
    .regex(/^\d{8,20}$/, "allowedFrom must be digits only (e.g. 62812...)")
    .optional(),
  weeklyReportEnabled: z.boolean().optional(),
  fixedCostReminderEnabled: z.boolean().optional(),
});

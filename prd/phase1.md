# PRD — Personal Finance Management System

## Phase 1 — Financial Management Core

**Version:** 1.0
**Status:** Ready for Development
**Phase:** 1 — MVP Financial Core
**Primary Goal:** Build a reliable personal finance management web application for tracking income, expenses, accounts, debts, savings goals, and monthly financial health.

---

# 1. Product Overview

Personal Finance Management System adalah aplikasi web pribadi untuk membantu user:

* mencatat pemasukan;
* mencatat pengeluaran;
* mengelompokkan transaksi berdasarkan kategori;
* mengelola beberapa rekening/account;
* memonitor saldo;
* mengelola hutang;
* mengelola target tabungan;
* membuat dan memonitor monthly budget;
* melihat cash flow;
* melihat net worth;
* mendapatkan basic financial insights berdasarkan data aktual.

Phase 1 **belum berfokus pada AI financial advisor penuh**.

Namun, seluruh architecture harus disiapkan agar Phase 2 dapat menambahkan AI Advisor menggunakan **OpenRouter** tanpa perubahan besar pada core system.

---

# 2. Product Principles

Aplikasi harus mengikuti prinsip:

1. **Data-first**

   * Semua recommendation harus berasal dari data finansial user.
   * AI tidak boleh menjadi sumber kebenaran untuk angka finansial.

2. **Financial calculations must be deterministic**

   * Saldo, cash flow, debt balance, budget utilization, dan net worth dihitung oleh backend.
   * Jangan meminta LLM menghitung angka penting.

3. **AI-ready architecture**

   * Financial data harus dapat diubah menjadi structured financial context.
   * AI provider harus abstraction layer sehingga OpenRouter dapat diganti tanpa mengubah business logic.

4. **Multi-currency ready**

   * Minimal mendukung IDR dan EUR.
   * Transaction harus menyimpan currency masing-masing.

5. **Personal-first**

   * Phase 1 hanya membutuhkan single-user experience, tetapi database tetap menggunakan `userId` agar siap multi-user.

---

# 3. Target Tech Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Recharts

## Backend

* Next.js App Router
* Route Handlers
* Server Actions jika sesuai
* TypeScript
* Zod

## Database

* MongoDB
* MongoDB Atlas
* Mongoose

## Authentication

* Auth.js

## AI Provider

* OpenRouter

AI integration harus dibuat melalui abstraction:

```text
AI Provider
    ↓
OpenRouter Adapter
    ↓
Selected LLM
```

Jangan hardcode application logic terhadap model tertentu.

## Deployment

Recommended:

* Vercel
* MongoDB Atlas

---

# 4. Phase 1 Scope

Phase 1 wajib mencakup:

### Core

* Authentication
* Dashboard
* Accounts
* Transactions
* Categories
* Income
* Expenses
* Monthly budget
* Debt
* Debt payments
* Savings goals
* Financial summary
* Basic financial insights
* Multi-currency foundation
* Audit-friendly transaction model

---

# 5. Out of Scope for Phase 1

Jangan implementasi fitur berikut kecuali diperlukan untuk architecture:

* Full AI financial advisor
* AI autonomous financial decisions
* Bank API integration
* Open Banking
* Automatic transaction synchronization
* OCR receipt scanning
* Investment portfolio management
* Stock/crypto tracking
* Tax calculation
* Shared household finance
* Multi-user collaboration
* WhatsApp/Telegram integration
* Advanced forecasting ML
* Automatic bank categorization
* Complex recurring transaction automation

Feature tersebut dapat masuk Phase 2+.

---

# 6. User Roles

Phase 1:

```text
USER
```

Sistem harus tetap menyimpan:

```text
userId
```

pada seluruh user-owned entities.

---

# 7. Core Data Model

## 7.1 User

```typescript
User {
  _id
  name
  email
  image?
  baseCurrency
  timezone
  createdAt
  updatedAt
}
```

Default:

```text
baseCurrency = IDR
```

Timezone dapat mengikuti user configuration.

---

# 8. Account

Account digunakan untuk merepresentasikan tempat uang berada.

Contoh:

```text
BCA
Bank Austria
Cash
GoPay
Credit Card
```

Schema:

```typescript
Account {
  _id
  userId
  name
  type
  currency
  initialBalance
  currentBalance
  isActive
  createdAt
  updatedAt
}
```

Account types:

```text
CASH
BANK
E_WALLET
CREDIT_CARD
OTHER
```

### Important

`currentBalance` tidak boleh menjadi satu-satunya source of truth.

Balance harus dapat direkonstruksi dari:

```text
initialBalance
+
income
-
expense
-
transfers
```

Jika menggunakan cached balance, harus dianggap sebagai derived/cache value.

---

# 9. Transaction

Transaction adalah core entity aplikasi.

Schema:

```typescript
Transaction {
  _id
  userId

  accountId

  type
  amount
  currency

  categoryId?

  description?

  date

  notes?

  merchant?

  tags?

  recurring?

  createdAt
  updatedAt
}
```

Transaction types:

```text
INCOME
EXPENSE
TRANSFER
```

Amount harus selalu bernilai positif.

Direction ditentukan oleh `type`.

Contoh:

```text
EXPENSE
amount = 100000
```

bukan:

```text
amount = -100000
```

---

# 10. Transfer

Transfer antar account tidak boleh dianggap sebagai expense.

Example:

```text
BCA → Cash
Rp1.000.000
```

Harus menghasilkan:

```text
Transfer OUT from BCA
Transfer IN to Cash
```

tetapi tidak boleh meningkatkan monthly expense.

Schema dapat menggunakan:

```typescript
Transfer {
  _id
  userId
  fromAccountId
  toAccountId
  amount
  currency
  date
  notes?
  createdAt
}
```

Atau menggunakan paired transactions dengan `transferId`.

Recommended:

```text
Transaction + transferId
```

agar ledger tetap konsisten.

---

# 11. Category

Category memiliki hierarchy.

Example:

```text
Food
├── Groceries
├── Restaurant
├── Coffee
└── Delivery

Transport
├── Public Transport
├── Fuel
├── Taxi
└── Parking

Housing
├── Rent
├── Electricity
├── Internet
└── Maintenance

Lifestyle
├── Shopping
├── Entertainment
├── Travel
└── Subscription
```

Schema:

```typescript
Category {
  _id
  userId?
  name
  parentId?
  type
  icon?
  color?
  isSystem
  isActive
  createdAt
  updatedAt
}
```

Category type:

```text
INCOME
EXPENSE
```

System categories dapat digunakan oleh seluruh user.

User dapat membuat custom categories.

---

# 12. Budget

Budget dibuat berdasarkan periode bulanan.

Schema:

```typescript
Budget {
  _id
  userId

  month
  year

  categoryId

  amount
  currency

  createdAt
  updatedAt
}
```

Example:

```text
October 2026

Food          Rp1.000.000
Transport       Rp500.000
Shopping        Rp500.000
Entertainment   Rp300.000
```

System harus dapat menghitung:

```text
budgetAmount
actualAmount
remainingAmount
utilizationPercentage
```

Example:

```text
Food

Budget:     Rp1.000.000
Spent:        Rp750.000
Remaining:    Rp250.000
Used:              75%
```

---

# 13. Debt

Debt harus menjadi entity terpisah dari normal expenses.

Schema:

```typescript
Debt {
  _id
  userId

  name

  originalAmount
  remainingAmount

  currency

  interestRate?

  minimumPayment?

  plannedPayment?

  dueDate?

  startDate?

  targetPayoffDate?

  status

  notes?

  createdAt
  updatedAt
}
```

Status:

```text
ACTIVE
PAID
CANCELLED
```

---

# 14. Debt Payment

Payment terhadap debt harus dicatat.

```typescript
DebtPayment {
  _id

  userId
  debtId

  accountId

  amount
  currency

  date

  notes?

  transactionId?

  createdAt
}
```

Ketika payment dibuat:

```text
Debt remainingAmount
↓
decreases
```

Dan account balance:

```text
Account balance
↓
decreases
```

Debt payment harus dapat dilacak kembali ke transaction.

---

# 15. Savings Goals

User dapat membuat financial goal.

Example:

```text
Emergency Fund
Target: Rp120.000.000

Car
Target: Rp250.000.000

Savings
Target: Rp100.000.000
```

Schema:

```typescript
SavingsGoal {
  _id
  userId

  name

  targetAmount
  currentAmount

  currency

  targetDate?

  priority?

  status

  notes?

  createdAt
  updatedAt
}
```

Status:

```text
ACTIVE
COMPLETED
CANCELLED
```

---

# 16. Dashboard

Dashboard harus menjadi halaman utama.

## KPI cards

Minimal:

```text
Total Balance
Monthly Income
Monthly Expenses
Monthly Savings
Total Debt
Net Worth
```

Example:

```text
┌─────────────────────────────────────────────┐
│ Total Balance     Rp12.500.000              │
│ Monthly Income    Rp8.200.000               │
│ Monthly Expense   Rp5.100.000               │
│ Monthly Savings   Rp1.600.000               │
│ Total Debt        Rp13.000.000              │
│ Net Worth         RpXX.XXX.XXX              │
└─────────────────────────────────────────────┘
```

---

# 17. Cash Flow Chart

Dashboard harus memiliki chart:

```text
Income vs Expense
```

Monthly:

```text
Jan
Feb
Mar
Apr
May
Jun
Jul
Aug
Sep
Oct
```

Data:

```text
Income
Expense
Net Cash Flow
```

User dapat memilih:

```text
3 Months
6 Months
12 Months
```

---

# 18. Expense Breakdown

Pie/donut chart:

```text
Food              25%
Transport         12%
Housing           20%
Shopping          10%
Entertainment      8%
Other             25%
```

User dapat drill-down:

```text
Food
↓
Restaurant
↓
Merchant
```

---

# 19. Recent Transactions

Dashboard menampilkan transaction terbaru:

```text
Today

Lunch             -Rp75.000
Salary          +Rp8.200.000
Transport         -Rp30.000
Coffee            -Rp25.000
```

---

# 20. Budget Overview

Dashboard menampilkan budget utilization:

```text
Food
████████░░ 80%

Transport
██████░░░░ 60%

Shopping
█████████░ 90%
```

Jika utilization > 80%:

```text
WARNING
```

Jika > 100%:

```text
OVER BUDGET
```

---

# 21. Debt Overview

Dashboard:

```text
Total Debt
Rp13.000.000

Monthly Payment
Rp1.500.000

Next Due
10 Oct 2026

Progress
████░░░░░░
```

---

# 22. Savings Goal Overview

Example:

```text
Emergency Fund

Rp20.000.000 / Rp120.000.000

████░░░░░░░░░░░░░░

16.7%
```

---

# 23. Transactions Page

Route:

```text
/transactions
```

Features:

* list transactions
* search
* filter
* sort
* pagination
* create
* edit
* delete
* category filter
* account filter
* date range
* transaction type filter

Filters:

```text
Account
Category
Type
Date
Amount
```

---

# 24. Add Transaction

Form:

```text
Transaction Type
[ Expense ]

Amount
[ Rp 75.000 ]

Account
[ BCA ]

Category
[ Food > Restaurant ]

Date
[ 01 Oct 2026 ]

Merchant
[ Restaurant ABC ]

Notes
[ Lunch ]
```

Validation:

* amount > 0
* account required
* category required for expense
* date required
* currency valid

---

# 25. Accounts Page

Route:

```text
/accounts
```

Features:

* create account
* edit account
* archive account
* view balance
* view transactions
* account details

Example:

```text
BCA
Rp5.200.000

Bank Austria
€1.200

Cash
Rp500.000
```

---

# 26. Budget Page

Route:

```text
/budget
```

User dapat memilih:

```text
October 2026
```

Then:

```text
Category       Budget      Actual      Remaining

Food           1.000.000   750.000      250.000
Transport        500.000   350.000      150.000
Shopping         500.000   620.000     -120.000
```

Budget utilization harus divisualisasikan.

---

# 27. Debt Page

Route:

```text
/debts
```

Features:

* create debt
* edit debt
* payment
* payment history
* remaining balance
* payoff estimate

Example:

```text
Personal Loan

Original:
Rp13.000.000

Remaining:
Rp13.000.000

Monthly payment:
Rp1.500.000

Status:
ACTIVE
```

---

# 28. Goals Page

Route:

```text
/goals
```

Features:

* create goal
* edit goal
* add contribution
* progress tracking
* target date
* projected completion date

---

# 29. Financial Summary Engine

Backend harus menyediakan financial summary.

Function:

```typescript
getFinancialSummary(userId, period)
```

Output:

```typescript
{
  income,
  expense,
  netCashFlow,
  savings,
  savingsRate,
  totalDebt,
  debtPayment,
  debtRatio,
  totalAssets,
  totalLiabilities,
  netWorth
}
```

---

# 30. Financial Metrics

## Savings Rate

```text
Savings Rate =
Savings / Income × 100
```

## Debt Payment Ratio

```text
Debt Payment Ratio =
Monthly Debt Payment / Monthly Income × 100
```

## Budget Utilization

```text
Budget Utilization =
Actual Spending / Budget × 100
```

## Net Cash Flow

```text
Net Cash Flow =
Income - Expenses - Debt Payments
```

Important:

Debt payment harus diperlakukan konsisten.

Jika debt payment sudah direpresentasikan sebagai expense transaction, jangan dikurangi dua kali.

---

# 31. Net Worth

Net worth:

```text
Assets - Liabilities
```

Assets:

```text
Cash
Bank
E-wallet
Other positive accounts
```

Liabilities:

```text
Credit card liability
Debt
Other liabilities
```

System harus memiliki definisi yang konsisten.

---

# 32. Basic Recommendation Engine

Phase 1 belum menggunakan LLM sebagai financial decision maker.

Buat deterministic rules.

Example:

### High spending

```text
IF
current category spending >
3-month average × 1.20
```

Generate:

```text
CATEGORY_SPENDING_INCREASE
```

---

### Budget warning

```text
IF
budget utilization >= 80%
```

Generate:

```text
BUDGET_WARNING
```

---

### Over budget

```text
IF
actual > budget
```

Generate:

```text
OVER_BUDGET
```

---

### Savings warning

```text
IF
actual monthly saving < target saving
```

Generate:

```text
SAVING_TARGET_RISK
```

---

### Debt warning

```text
IF
debt payment is overdue
```

Generate:

```text
DEBT_PAYMENT_OVERDUE
```

---

# 33. Recommendation Model

```typescript
FinancialRecommendation {
  _id
  userId

  type

  severity

  title
  message

  relatedCategoryId?
  relatedDebtId?
  relatedGoalId?

  metadata?

  period

  createdAt
  expiresAt?
}
```

Severity:

```text
INFO
WARNING
CRITICAL
```

---

# 34. AI Architecture

AI provider harus abstraction layer.

```typescript
interface AIProvider {
  generateText(input: AIRequest): Promise<AIResponse>
}
```

Implementation:

```text
OpenRouterProvider
```

Configuration:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

Optional:

```env
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=
```

Jangan expose API key ke browser.

---

# 35. AI Phase 1 Usage

AI hanya digunakan untuk **optional financial explanation**.

Example:

Backend generates:

```json
{
  "income": 8200000,
  "expense": 5100000,
  "savingRate": 19.5,
  "topCategory": "Food",
  "foodVsAverage": 32,
  "budgetExceeded": ["Shopping"]
}
```

AI kemudian menghasilkan explanation:

```text
Your food spending is 32% above your recent average.
Shopping is also above the monthly budget.
```

AI tidak boleh mengubah:

* transaction
* balance
* debt
* budget

tanpa explicit user action.

---

# 36. AI Safety / Financial Accuracy

AI output harus memiliki disclaimer internal bahwa:

* AI memberikan informasi berdasarkan recorded financial data.
* AI bukan source of truth.
* AI tidak boleh invent financial transactions.
* AI tidak boleh invent balances.
* AI tidak boleh invent interest rates.
* AI tidak boleh invent exchange rates.
* AI tidak boleh execute financial actions.

All financial calculations must come from backend.

---

# 37. API Structure

Recommended:

```text
/api/auth

/api/accounts
/api/accounts/:id

/api/transactions
/api/transactions/:id

/api/categories
/api/categories/:id

/api/budgets
/api/budgets/:id

/api/debts
/api/debts/:id
/api/debts/:id/payments

/api/goals
/api/goals/:id

/api/dashboard
/api/financial-summary

/api/recommendations

/api/ai/chat
```

---

# 38. API Response Standard

Use consistent response format.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid transaction amount"
  }
}
```

---

# 39. Authentication

Authentication harus melindungi seluruh user-owned resources.

Rules:

```text
User A
↓
Only access User A data

User B
↓
Only access User B data
```

Never trust `userId` submitted by client.

Get user identity from authenticated session.

---

# 40. Validation

Use Zod schemas.

Example:

```typescript
const createTransactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: z.number().positive(),
  accountId: z.string(),
  categoryId: z.string().optional(),
  date: z.coerce.date(),
  description: z.string().optional()
});
```

Validation must occur server-side.

---

# 41. Error Handling

Implement centralized error handling.

Categories:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
DATABASE_ERROR
INTERNAL_ERROR
```

Never expose raw MongoDB errors to frontend.

---

# 42. Database Indexing

Minimum indexes:

### Transaction

```text
userId + date
userId + accountId
userId + categoryId
userId + type
```

### Budget

```text
userId + year + month
userId + categoryId
```

### Debt

```text
userId + status
```

### Goals

```text
userId + status
```

Indexes harus dibuat berdasarkan actual query patterns.

---

# 43. UI Structure

Recommended routes:

```text
/
├── login
├── dashboard
├── transactions
├── accounts
├── budget
├── debts
├── goals
├── reports
└── settings
```

Sidebar:

```text
Dashboard

Money
  Transactions
  Accounts

Planning
  Budget
  Debts
  Goals

Analytics
  Reports

Settings
```

---

# 44. Responsive Design

Desktop-first karena aplikasi primarily digunakan untuk dashboard.

Namun harus responsive untuk:

```text
Desktop
Tablet
Mobile
```

Mobile transaction entry harus mudah digunakan.

---

# 45. Dark / Light Mode

Support:

```text
Light
Dark
System
```

UI harus menggunakan design tokens, bukan hardcoded colors.

---

# 46. Currency Handling

Every monetary value must contain:

```text
amount
currency
```

Example:

```json
{
  "amount": 100000,
  "currency": "IDR"
}
```

Never assume all transactions are IDR.

User memiliki:

```text
baseCurrency
```

Example:

```text
baseCurrency = EUR
```

Conversion layer harus disiapkan, tetapi automatic exchange-rate provider dapat ditambahkan pada phase berikutnya.

---

# 47. Recurring Transactions

Phase 1 boleh memiliki basic recurring configuration.

Example:

```text
Salary
Rp8.200.000
Every month
25th
```

Schema:

```typescript
RecurringTransaction {
  frequency
  interval
  nextOccurrence
  endDate?
  isActive
}
```

Namun automated background generation dapat dibuat sederhana terlebih dahulu.

---

# 48. Monthly Snapshot

Sistem harus dapat menyimpan monthly financial snapshot.

Example:

```typescript
MonthlySnapshot {
  userId

  year
  month

  totalIncome
  totalExpense
  netCashFlow

  totalDebt
  debtPayment

  savings
  savingsRate

  totalAssets
  totalLiabilities
  netWorth

  createdAt
}
```

Purpose:

* historical analytics
* future AI context
* monthly comparison
* performance tracking

---

# 49. Reports

Phase 1 basic reports:

### Monthly Income vs Expense

### Expense by Category

### Cash Flow

### Budget vs Actual

### Debt Progress

### Savings Progress

Time range:

```text
1 month
3 months
6 months
12 months
```

---

# 50. Testing Requirements

Minimum:

### Unit tests

Financial calculations:

* savings rate
* debt ratio
* budget utilization
* net cash flow
* net worth

### Integration tests

* create transaction
* edit transaction
* delete transaction
* create debt
* make debt payment
* create budget
* create savings goal

### Authorization tests

User A must not access User B data.

---

# 51. Seed Data

Development environment should include seed data.

Example:

```text
Accounts
- BCA
- Cash
- Bank Austria

Categories
- Food
- Transport
- Housing
- Shopping
- Entertainment
- Bills
- Salary
- Other

Transactions
- sample income
- sample expenses
- sample transfers
```

Seed data must never be used in production.

---

# 52. Environment Variables

Example:

```env
MONGODB_URI=

AUTH_SECRET=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

NEXT_PUBLIC_APP_NAME=
```

Never commit `.env` files.

`.env.local` must be included in `.gitignore`.

---

# 53. Security Requirements

Implement:

* authentication
* authorization
* server-side validation
* input sanitization
* rate limiting for AI endpoints
* secure environment variables
* no API secrets in frontend
* no userId trust from request body
* protected API routes

AI endpoint should have stricter rate limiting.

---

# 54. Phase 1 Definition of Done

Phase 1 dianggap selesai apabila user dapat:

### Accounts

* [ ] Create account
* [ ] Edit account
* [ ] Archive account
* [ ] See account balance

### Transactions

* [ ] Create income
* [ ] Create expense
* [ ] Create transfer
* [ ] Edit transaction
* [ ] Delete transaction
* [ ] Search transaction
* [ ] Filter transaction

### Categories

* [ ] View system categories
* [ ] Create custom category
* [ ] Edit custom category
* [ ] Archive category

### Budget

* [ ] Create monthly budget
* [ ] See budget utilization
* [ ] See over-budget categories

### Debt

* [ ] Create debt
* [ ] Edit debt
* [ ] Record payment
* [ ] See remaining debt
* [ ] See payment history

### Goals

* [ ] Create savings goal
* [ ] Add contribution
* [ ] See progress

### Dashboard

* [ ] Monthly income
* [ ] Monthly expense
* [ ] Net cash flow
* [ ] Total balance
* [ ] Total debt
* [ ] Net worth
* [ ] Budget overview
* [ ] Expense breakdown
* [ ] Recent transactions

### Intelligence

* [ ] Basic spending analysis
* [ ] Budget warning
* [ ] Over-budget warning
* [ ] Savings warning
* [ ] Debt payment warning

### AI

* [ ] OpenRouter abstraction exists
* [ ] API key remains server-side
* [ ] AI can receive structured financial context
* [ ] AI can explain financial metrics
* [ ] AI cannot directly mutate financial data

---

# 55. Recommended Development Order

Agent harus mengerjakan dalam urutan berikut.

## Step 1 — Project Setup

* Next.js
* TypeScript
* Tailwind
* shadcn/ui
* MongoDB
* Mongoose
* Auth.js
* Zod
* Recharts

## Step 2 — Database Layer

Implement:

```text
User
Account
Category
Transaction
Budget
Debt
DebtPayment
SavingsGoal
MonthlySnapshot
Recommendation
```

## Step 3 — Authentication

Implement:

* login
* session
* protected routes
* user isolation

## Step 4 — Transaction Engine

Implement:

```text
Income
Expense
Transfer
```

Ensure account balances remain consistent.

## Step 5 — Accounts

Implement account management and balance calculation.

## Step 6 — Categories

Implement hierarchical categories.

## Step 7 — Budget

Implement budget creation and actual-vs-budget calculation.

## Step 8 — Debt

Implement debt and payment tracking.

## Step 9 — Goals

Implement savings goals.

## Step 10 — Dashboard

Connect all financial metrics.

## Step 11 — Financial Analytics

Implement:

```text
Cash flow
Savings rate
Debt ratio
Net worth
Budget utilization
Category analysis
```

## Step 12 — Recommendation Engine

Implement deterministic rules.

## Step 13 — OpenRouter

Implement:

```text
AIProvider
OpenRouterProvider
FinancialContextBuilder
```

Do not build autonomous AI actions.

## Step 14 — Testing

Run:

```text
unit tests
integration tests
authorization tests
build
lint
```

---

# 56. Expected Architecture

Final Phase 1 architecture:

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         │                     │
                         │ React / Next.js UI  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Next.js App     │
                         │                     │
                         │ Route Handlers      │
                         │ Server Actions      │
                         │ Auth                │
                         │ Validation          │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
             ┌────────────┐ ┌──────────────┐ ┌──────────────┐
             │ Financial  │ │ Recommendation│ │ AI Layer     │
             │ Engine     │ │ Engine        │ │              │
             └─────┬──────┘ └──────────────┘ │ OpenRouter   │
                   │                         └──────────────┘
                   ▼
             ┌────────────┐
             │  MongoDB   │
             │  Mongoose  │
             └────────────┘
```

---

# 57. Important Agent Rules

The coding agent MUST follow these rules.

### Rule 1

Do not over-engineer Phase 1.

### Rule 2

Do not introduce microservices.

### Rule 3

Do not introduce Redis unless there is a demonstrated requirement.

### Rule 4

Do not make AI responsible for financial calculations.

### Rule 5

Never allow an AI response to directly modify financial data.

### Rule 6

All monetary calculations must be deterministic.

### Rule 7

Avoid JavaScript floating-point errors for money.

Use integer minor units where appropriate.

For example:

```text
IDR:
100000

EUR:
1050 cents
```

or use a Decimal implementation consistently.

Do not use:

```javascript
0.1 + 0.2
```

for financial calculations.

### Rule 8

All financial operations must be traceable.

### Rule 9

All user data must be isolated by authenticated `userId`.

### Rule 10

Write clean TypeScript and keep financial business logic separate from UI components.

---

# 58. Phase 1 Success Criteria

The user should be able to open the application and understand within seconds:

1. How much money they currently have.
2. How much they earned this month.
3. How much they spent this month.
4. Where their money went.
5. How much debt remains.
6. Whether they are over budget.
7. How much they are saving.
8. Progress toward their financial goals.
9. Whether there are financial warnings that require attention.

The application should establish a reliable financial data foundation that Phase 2 can use for:

* intelligent budget recommendations;
* debt payoff optimization;
* spending pattern analysis;
* financial forecasting;
* AI financial assistant;
* personalized financial planning.

# PRD — Personal Finance Management System

## Phase 2 — Financial Intelligence & Smart Budgeting

**Version:** 1.0
**Status:** Ready for Development
**Depends On:** Phase 1
**Primary Goal:** Transform the Phase 1 financial ledger into an intelligent budgeting and recommendation system that analyzes historical spending, detects financial patterns, recommends monthly budgets, and provides actionable financial insights.

---

# 1. Phase 2 Overview

Phase 1 menyediakan financial data foundation:

* accounts
* transactions
* categories
* budgets
* debts
* debt payments
* savings goals
* dashboard
* basic financial metrics

Phase 2 menggunakan data tersebut untuk menjawab:

> **"Berdasarkan kondisi keuangan saya, berapa sebaiknya budget saya bulan ini dan apa yang harus saya perhatikan?"**

Phase 2 harus menghasilkan:

```text
Historical Data
       ↓
Financial Analytics
       ↓
Pattern Detection
       ↓
Budget Recommendation
       ↓
Financial Recommendations
       ↓
User Approval
       ↓
Actual Budget
```

AI belum menjadi decision maker.

---

# 2. Core Principle

Phase 2 harus menggunakan **deterministic financial intelligence**.

Contoh:

```text
3-month average Food spending
= Rp950.000

Current Food spending
= Rp1.250.000

Increase
= +31.6%
```

System dapat menyimpulkan secara deterministic:

```text
Food spending is significantly above historical average.
```

Tetapi keputusan seperti:

> "Kamu harus berhenti makan di restoran."

tidak boleh dibuat secara otomatis.

System harus memberikan recommendation yang dapat diterima atau diubah oleh user.

---

# 3. Phase 2 Goals

Phase 2 harus menyediakan:

* historical spending analysis;
* monthly spending trends;
* category spending trends;
* recurring expense detection;
* spending anomaly detection;
* budget recommendation;
* savings recommendation;
* debt payment recommendation;
* cash-flow forecast;
* financial health indicators;
* monthly financial review;
* recommendation center;
* budget comparison;
* what-if budget simulation;
* financial context builder untuk Phase 3 AI.

---

# 4. Non-Goals

Tidak termasuk Phase 2:

* autonomous financial decisions;
* executing payments;
* bank synchronization;
* investment recommendations;
* stock/crypto advice;
* tax optimization;
* automatic bank transactions;
* AI chat interface penuh;
* autonomous AI agent;
* financial product recommendations.

AI conversational assistant masuk Phase 3.

---

# 5. Financial Analysis Periods

System harus mendukung:

```text
Current Month
Previous Month
Last 3 Months
Last 6 Months
Last 12 Months
```

Default analytical window:

```text
Last 3 completed months
```

Current incomplete month tidak boleh dianggap sebagai full-month historical comparison tanpa adjustment.

---

# 6. Monthly Financial Profile

Create a calculated financial profile.

```typescript
FinancialProfile {
  userId

  period

  averageMonthlyIncome
  averageMonthlyExpense
  averageMonthlySavings

  averageFixedExpense
  averageVariableExpense

  averageDebtPayment

  averageSavingsRate

  incomeStability
  expenseStability

  topExpenseCategories[]

  recurringExpenses[]

  createdAt
}
```

Profile harus dapat dihitung ulang dari transaction data.

---

# 7. Expense Classification

Setiap expense category harus dapat diklasifikasikan:

```text
ESSENTIAL
IMPORTANT
DISCRETIONARY
UNKNOWN
```

Example:

```text
Housing
→ ESSENTIAL

Food / Groceries
→ ESSENTIAL

Transport
→ IMPORTANT

Restaurant
→ DISCRETIONARY

Entertainment
→ DISCRETIONARY

Shopping
→ DISCRETIONARY
```

Classification harus dapat diubah user.

Jangan hardcode sehingga user tidak bisa override.

---

# 8. Fixed vs Variable Expense

System harus mengidentifikasi:

### Fixed

Expense yang relatif stabil.

Contoh:

```text
Rent
Internet
Subscription
Insurance
```

### Variable

Expense yang berubah-ubah.

Contoh:

```text
Food
Transport
Shopping
Entertainment
```

Classification dapat menggunakan:

* recurring transaction;
* historical variance;
* user-defined category settings.

---

# 9. Spending Analytics

System harus menghitung per category:

```text
Current Month
Previous Month
3M Average
6M Average
12M Average
```

Example:

```text
Food

October:
Rp1.200.000

September:
Rp950.000

3M Average:
Rp900.000

Difference:
+33.3%
```

---

# 10. Spending Trend Detection

Detect:

### Increasing

```text
Current > historical average
```

### Decreasing

```text
Current < historical average
```

### Stable

Within configured variance threshold.

Default:

```text
±10%
```

Output:

```typescript
SpendingTrend {
  categoryId

  currentAmount
  historicalAverage

  percentageChange

  trend
  confidence

  period
}
```

Trend:

```text
INCREASING
DECREASING
STABLE
INSUFFICIENT_DATA
```

---

# 11. Spending Anomaly Detection

Detect unusual spending.

Example:

Historical Food spending:

```text
800k
850k
900k
950k
```

Current:

```text
2.100k
```

System generates:

```text
UNUSUAL_CATEGORY_SPENDING
```

Recommended initial rule:

```text
currentAmount >
historicalAverage + 2 × standardDeviation
```

If insufficient historical data:

Use fallback:

```text
currentAmount >
historicalAverage × 1.5
```

Do not generate anomaly with fewer than 2 comparable historical periods.

---

# 12. Category Spending Velocity

For current month:

```text
Days elapsed
Days remaining
Current spending
Projected monthly spending
```

Example:

```text
October 10

Food:
Spent = Rp600.000

Days elapsed = 10
Days in month = 31

Projected:
≈ Rp1.860.000
```

System can compare:

```text
Projected spending
vs
Budget
```

Output:

```text
Projected to exceed budget by Rp860.000
```

This is more useful than waiting until budget is already exceeded.

---

# 13. Smart Budget Engine

This is the main Phase 2 feature.

Function:

```typescript
generateBudgetRecommendation(userId, month)
```

Inputs:

```text
Historical income
Historical expenses
Fixed expenses
Variable expenses
Debt obligations
Savings goals
Existing budgets
User preferences
```

Output:

```typescript
BudgetRecommendation {
  month
  currency

  categories[]

  totalIncome
  totalExpenses
  totalDebtPayment
  totalSavings

  rationale[]

  confidence
}
```

---

# 14. Budget Recommendation Algorithm

Budget recommendation must not use a fixed 50/30/20 rule as the primary method.

Use:

```text
Historical Spending
+
Income
+
Fixed Obligations
+
Debt
+
Savings Goals
+
User Constraints
```

Recommended calculation:

### Step 1

Calculate expected income.

```text
expectedIncome =
average recurring income
+
expected one-time income
```

If current month income is already known, prioritize actual/current known income.

---

### Step 2

Reserve fixed obligations.

```text
mandatoryBudget =
housing
+
bills
+
minimumDebtPayments
+
other mandatory expenses
```

---

### Step 3

Reserve target savings.

```text
targetSavings =
goal-based requirement
```

If user has no explicit savings target:

Use historical savings rate as baseline.

---

### Step 4

Calculate discretionary capacity.

```text
discretionaryCapacity =
expectedIncome
-
mandatoryBudget
-
targetSavings
```

---

### Step 5

Distribute variable spending based on historical behavior.

Use weighted historical average:

```text
50% last month
30% 2 months ago
20% 3 months ago
```

Adjust based on trend.

---

# 15. Budget Adjustment Rules

If category is consistently increasing:

```text
3-month trend > threshold
```

Recommendation should not simply increase the budget indefinitely.

Instead:

```text
Recommended Budget =
historical baseline
+
controlled adjustment
```

Example:

```text
3M average = Rp900k

Current = Rp1.2m

Recommended budget:
Rp1.050m
```

This prevents the system from simply rewarding overspending.

---

# 16. Budget Guardrails

System must enforce:

```text
Total Recommended Budget
<= Expected Income
```

And:

```text
Debt minimum payment
must be reserved
```

And:

```text
Target savings
cannot exceed realistic disposable income
```

If constraints cannot be satisfied:

Generate:

```text
BUDGET_CONFLICT
```

Example:

```text
Expected Income:
Rp8.2m

Mandatory:
Rp7.8m

Savings Target:
Rp2m

Result:
Impossible under current income.
```

Recommendation:

> Savings target needs adjustment or discretionary spending must decrease.

Do not silently create an impossible budget.

---

# 17. Budget Recommendation UI

Page:

```text
/budget/recommendation
```

Example:

```text
October 2026 Smart Budget

Expected Income
Rp8.200.000

Recommended Allocation

Housing          Rp1.500.000
Food             Rp1.050.000
Transport          Rp500.000
Bills              Rp500.000
Lifestyle          Rp600.000
Debt             Rp1.500.000
Savings          Rp2.000.000
Buffer             Rp550.000

────────────────────────────
Total            Rp8.200.000
```

Each recommendation should have explanation.

Example:

```text
Food
Recommended: Rp1.050.000

Based on:
• 3-month average: Rp900.000
• Current trend: +12%
• Current month spending: Rp1.000.000
```

---

# 18. User Approval

Recommended budget must NOT automatically overwrite existing budget.

Flow:

```text
System Recommendation
        ↓
User Review
        ↓
Adjust
        ↓
Approve
        ↓
Create Actual Budget
```

Buttons:

```text
Accept All
Adjust
Reject
```

---

# 19. Budget Simulation

User can manually change recommended amounts.

Example:

```text
Food
System: Rp1.050.000

User:
Rp1.200.000
```

System immediately calculates:

```text
Remaining budget
Savings impact
Cash flow impact
```

Example:

```text
Increase Food budget
+Rp150.000

Projected Savings
Rp2.000.000 → Rp1.850.000
```

This is a **what-if simulation**, not a transaction.

---

# 20. Savings Recommendation

System should determine:

```text
Current average savings
Target savings
Potential additional savings
```

Example:

```text
Average monthly savings:
Rp1.600.000

Potential:
Rp2.000.000

Recommended increase:
Rp400.000
```

Recommendation should identify source:

```text
Potential reduction:

Food          -Rp150k
Shopping      -Rp150k
Entertainment -Rp100k
```

---

# 21. Debt Recommendation

System should calculate:

```text
Current monthly debt payment
Minimum payment
Remaining debt
Debt ratio
Estimated payoff period
```

If disposable income exists:

Provide scenarios.

```text
Current:
Rp1.500.000/month

Scenario A:
Rp1.500.000

Scenario B:
Rp1.750.000

Scenario C:
Rp2.000.000
```

Show:

```text
Estimated payoff month
```

Do not select one as "best."

Present scenarios objectively.

---

# 22. Debt Payoff Calculator

Inputs:

```text
Debt balance
Interest rate
Minimum payment
Additional payment
```

Outputs:

```text
Estimated months
Total payment
Estimated interest
```

If interest rate is unavailable:

```text
Interest calculation unavailable.
```

Do not assume 0%.

---

# 23. Emergency Fund Analysis

If user has an Emergency Fund goal:

Calculate:

```text
Monthly essential expenses
```

Then:

```text
Emergency Fund Coverage =
Emergency Fund / Essential Monthly Expenses
```

Example:

```text
Emergency Fund:
Rp15m

Essential expenses:
Rp5m/month

Coverage:
3 months
```

System can display:

```text
Current emergency fund coverage:
3.0 months
```

Avoid declaring an arbitrary target unless user configured one.

---

# 24. Financial Health Indicators

Create several independent indicators.

Do NOT combine them into a misleading single score.

Metrics:

```text
Cash Flow
Savings Rate
Debt Payment Ratio
Budget Utilization
Emergency Fund Coverage
Expense Stability
```

Example:

```text
Financial Overview

Savings Rate          19.5%
Debt Payment Ratio    18.3%
Emergency Coverage    3.1 months
Budget Utilization    74%
```

Each metric should have its own interpretation.

---

# 25. Recommendation Engine

Create:

```text
RecommendationEngine
```

Architecture:

```text
Rules
  ↓
Analyzer
  ↓
Recommendation
  ↓
Priority
  ↓
UI
```

Recommendation types:

```text
SPENDING_INCREASE
SPENDING_DECREASE
BUDGET_WARNING
BUDGET_OVERFLOW
PROJECTED_BUDGET_OVERFLOW
SAVINGS_OPPORTUNITY
SAVINGS_TARGET_RISK
DEBT_PAYMENT_RISK
DEBT_PAYOFF_SCENARIO
EMERGENCY_FUND_GAP
INCOME_CHANGE
CASHFLOW_RISK
```

---

# 26. Recommendation Priority

Use:

```text
LOW
MEDIUM
HIGH
```

Priority must be based on deterministic criteria.

Example:

```text
Budget > 100%
→ HIGH

Budget 80–100%
→ MEDIUM

Budget < 80%
→ LOW
```

The system must not use AI to determine priority.

---

# 27. Recommendation Object

Extend Phase 1 recommendation model:

```typescript
FinancialRecommendation {
  _id
  userId

  type
  priority

  title
  message

  categoryId?
  debtId?
  goalId?

  currentValue?
  recommendedValue?
  difference?

  evidence[]

  actionType?

  status

  period

  createdAt
  expiresAt?
}
```

Evidence example:

```json
{
  "metric": "food_spending",
  "current": 1200000,
  "average3m": 900000,
  "changePercent": 33.3
}
```

---

# 28. Recommendation Status

```text
NEW
VIEWED
ACCEPTED
DISMISSED
EXPIRED
```

User actions must be recorded.

This allows future analysis of recommendation usefulness.

---

# 29. Recommendation Center

Page:

```text
/insights
```

Example:

```text
Financial Insights

HIGH
Projected Shopping budget overflow

Your current spending pace is likely to exceed
the monthly budget by Rp250.000.

[View Budget]

────────────────────────────

MEDIUM
Food spending increased

Food spending is 24% above your 3-month average.

[View Spending]

────────────────────────────

LOW
Savings opportunity

Your average monthly cash flow suggests
approximately Rp300.000 additional savings capacity.

[Simulate]
```

---

# 30. Monthly Review

Page:

```text
/reports/monthly
```

At month end generate:

```text
October 2026 Review
```

Sections:

### Income

```text
Rp8.200.000
```

### Expenses

```text
Rp5.100.000
```

### Savings

```text
Rp1.600.000
```

### Debt

```text
Payment:
Rp1.500.000
```

### Top categories

```text
Food
Transport
Shopping
```

### Biggest changes

```text
Food +24%
Shopping -15%
Transport +8%
```

### Budget performance

```text
5 categories within budget
2 categories over budget
```

### Goals

```text
Emergency Fund
+Rp1.500.000
```

---

# 31. Monthly Comparison

Allow:

```text
October vs September
```

Metrics:

```text
Income
Expenses
Savings
Debt Payment
Net Cash Flow
```

Example:

```text
Income       +2.0%
Expenses     +8.2%
Savings      -5.0%
Debt         -10.0%
```

Do not label the month as "good" or "bad" automatically.

---

# 32. Cash Flow Forecast

Phase 2 should implement basic deterministic forecasting.

Input:

```text
Historical income
Historical recurring income
Historical expenses
Recurring expenses
Current month transactions
```

Output:

```text
Projected income
Projected expenses
Projected debt payment
Projected savings
Projected ending balance
```

---

# 33. Forecast Method

Start simple.

For recurring income:

```text
use expected recurring transactions
```

For recurring expenses:

```text
use known recurring expenses
```

For variable categories:

Use weighted historical average.

Example:

```text
50% latest month
30% previous
20% previous
```

Forecast must expose assumptions.

Example:

```text
Forecast assumes spending remains
similar to the previous 3 months.
```

---

# 34. Forecast Confidence

Use:

```text
HIGH
MEDIUM
LOW
```

Based on:

* historical data availability;
* income stability;
* expense stability;
* number of historical periods.

Example:

```text
Only 1 month of data
→ LOW

3–5 months
→ MEDIUM

6–12 months with stable income
→ HIGH
```

This is an analytical confidence indicator, not a probability of financial outcome.

---

# 35. What-If Simulator

Page:

```text
/simulator
```

User can modify:

```text
Income
Food budget
Lifestyle budget
Debt payment
Savings
```

System calculates:

```text
Projected savings
Projected debt payoff
Projected ending balance
Goal timeline
```

Example:

```text
Current Salary
Rp8.2m

Scenario Salary
Rp9.0m

Additional Income
Rp800k

Projected Savings
Rp2.4m

Debt payoff
X months
```

The simulation must never mutate actual transactions.

---

# 36. Scenario Model

```typescript
FinancialScenario {
  incomeOverride?
  expenseOverrides[]
  debtPaymentOverrides[]
  savingsOverride?

  result: {
    cashFlow
    savings
    debtPayoff
    goalProgress
  }
}
```

---

# 37. Financial Context Builder

Create a reusable service for Phase 3.

```typescript
buildFinancialContext(userId, period)
```

Output must be structured.

Example:

```json
{
  "period": "2026-10",
  "baseCurrency": "IDR",

  "income": {
    "current": 8200000,
    "average3m": 8100000
  },

  "expenses": {
    "current": 5100000,
    "average3m": 4700000
  },

  "savings": {
    "current": 1600000,
    "average3m": 1800000
  },

  "debts": {
    "total": 13000000,
    "monthlyPayment": 1500000
  },

  "budget": {
    "utilization": 0.78
  },

  "topCategories": [],

  "recommendations": []
}
```

This is the bridge to OpenRouter in Phase 3.

---

# 38. OpenRouter Preparation

Phase 2 must not build full AI chat.

However, create:

```text
AIContextService
```

and:

```text
OpenRouterProvider
```

from Phase 1.

OpenRouter calls must only happen server-side.

Architecture:

```text
Financial Engine
       ↓
Financial Context Builder
       ↓
AIContext
       ↓
OpenRouter
```

AI output should never directly write to MongoDB.

---

# 39. AI Prompt Preparation

Prepare structured context instead of sending raw database records.

Bad:

```text
Send all transactions to LLM.
```

Good:

```text
Financial Context
├── Monthly summary
├── Historical trends
├── Budget status
├── Debt status
├── Savings goals
└── Existing recommendations
```

This reduces token usage and protects unnecessary personal data.

---

# 40. Privacy

Do not send unnecessary information to OpenRouter.

Do not send:

```text
account numbers
bank credentials
authentication data
session information
unnecessary merchant metadata
```

Only send information needed to answer a financial question.

---

# 41. UI Navigation

Update Phase 1 navigation:

```text
Dashboard

Money
  Transactions
  Accounts

Planning
  Smart Budget
  Budget
  Debts
  Goals

Insights
  Financial Insights
  Monthly Review
  Simulator

Settings
```

AI Assistant remains Phase 3.

---

# 42. Dashboard Phase 2 Upgrade

Dashboard should add:

### Financial Insights

```text
3 recommendations
```

### Spending Trend

```text
Food ↑ 24%
Transport ↓ 8%
Shopping ↑ 15%
```

### Budget Forecast

```text
Projected month-end:
Rp1.850.000

Target:
Rp2.000.000

Gap:
-Rp150.000
```

### Savings Opportunity

```text
Potential additional saving:
Rp300.000
```

---

# 43. Smart Budget UX

Flow:

```text
Open Budget
      ↓
Select Month
      ↓
View Existing Budget
      ↓
Generate Smart Recommendation
      ↓
Review Recommendation
      ↓
Adjust
      ↓
Approve
```

Do not automatically change user budget.

---

# 44. Recommendation Explainability

Every recommendation must show:

```text
Recommendation
Why?
Evidence
Potential Impact
Action
```

Example:

```text
Food Budget Recommendation

Recommended:
Rp1.050.000

Why?
Your 3-month average is Rp900.000 and
current spending is trending upward.

Evidence:
Current: Rp1.200.000
3M Average: Rp900.000
Change: +33%

Potential impact:
Saving target may decrease by Rp150.000
if spending continues.

[Accept]
[Adjust]
[Dismiss]
```

---

# 45. Database Additions

Phase 2 may introduce:

```text
FinancialProfile
SpendingTrend
FinancialRecommendation
MonthlySnapshot
FinancialScenario
```

Phase 1 models should be extended rather than duplicated.

---

# 46. Performance Requirements

Analytics endpoints should avoid loading all transactions into memory where unnecessary.

Use MongoDB aggregation for:

```text
monthly totals
category totals
trend analysis
budget utilization
```

Example:

```text
$match
$group
$sort
```

Add appropriate indexes.

---

# 47. Caching

Do not introduce Redis by default.

Use:

* database aggregation;
* Next.js caching where appropriate;
* precomputed monthly snapshots.

Redis is only justified after performance profiling.

---

# 48. Testing Requirements

Unit tests:

```text
calculateWeightedAverage()
calculateBudgetRecommendation()
calculateBudgetUtilization()
detectSpendingTrend()
detectAnomaly()
calculateSavingsCapacity()
calculateDebtScenario()
forecastMonthlyCashflow()
calculateEmergencyCoverage()
```

Integration tests:

```text
Generate budget recommendation
Accept recommendation
Run monthly review
Generate financial insights
Run what-if scenario
```

Edge cases:

```text
No transaction history
One month history
Missing income
No debt
No savings goal
Multiple currencies
Zero income
Zero expense
Budget = 0
Over-budget category
Paid debt
Incomplete month
```

---

# 49. Multi-Currency Rules

Do not mix currencies directly.

If:

```text
EUR
+
IDR
```

conversion requires exchange-rate data.

Phase 2 should support:

```text
currency-aware aggregation
```

but automatic live exchange-rate integration can remain Phase 3+.

If no exchange rate exists:

```text
Cannot calculate consolidated value.
```

Never silently assume:

```text
1 EUR = X IDR
```

---

# 50. Recommendation Audit Trail

Every generated recommendation should store:

```text
rule
inputs
calculated values
timestamp
period
```

Example:

```json
{
  "rule": "CATEGORY_SPENDING_INCREASE",
  "inputs": {
    "current": 1200000,
    "average3m": 900000
  },
  "result": {
    "changePercent": 33.33
  }
}
```

This is important for debugging and future AI evaluation.

---

# 51. Phase 2 Definition of Done

Phase 2 is complete when:

## Analytics

* [ ] 3-month spending analysis
* [ ] 6-month spending analysis
* [ ] 12-month spending analysis
* [ ] Category trends
* [ ] Spending anomaly detection
* [ ] Fixed/variable expense analysis

## Smart Budget

* [ ] Generate recommended budget
* [ ] Explain recommendation
* [ ] Review recommendation
* [ ] Adjust recommendation
* [ ] Accept recommendation
* [ ] Reject recommendation

## Forecast

* [ ] Current month projection
* [ ] End-of-month balance
* [ ] Projected expenses
* [ ] Projected savings
* [ ] Forecast confidence

## Debt

* [ ] Debt scenarios
* [ ] Payoff calculator
* [ ] Additional payment simulation

## Savings

* [ ] Savings capacity
* [ ] Goal impact
* [ ] Emergency fund coverage

## Insights

* [ ] Recommendation center
* [ ] Spending alerts
* [ ] Budget alerts
* [ ] Savings opportunities
* [ ] Debt insights

## Simulator

* [ ] Income scenario
* [ ] Expense scenario
* [ ] Debt payment scenario
* [ ] Savings scenario
* [ ] Combined scenario

## AI Preparation

* [ ] FinancialContextBuilder
* [ ] Structured AI context
* [ ] OpenRouter provider
* [ ] Server-side API calls
* [ ] No AI database mutation

---

# 52. Phase 2 Acceptance Test

Given:

```text
Monthly income:
Rp8.200.000

3-month average income:
Rp8.100.000

Food:
Current Rp1.200.000
3M average Rp900.000

Transport:
Current Rp450.000
3M average Rp500.000

Debt payment:
Rp1.500.000

Savings target:
Rp2.000.000
```

The system should:

1. Detect Food spending increase.
2. Identify Transport as relatively stable/decreasing.
3. Calculate debt payment ratio.
4. Calculate savings requirement.
5. Generate a Smart Budget.
6. Explain the Smart Budget using deterministic evidence.
7. Show projected end-of-month cash flow.
8. Allow user to modify the recommended budget.
9. Show the effect of modifications.
10. Allow user to accept the final budget.
11. Store the recommendation audit trail.
12. Generate a structured `FinancialContext` suitable for Phase 3 OpenRouter AI.

---

# 53. Phase 2 Development Order

Agent MUST implement in this order:

### Step 1

Financial analytics service.

### Step 2

Historical aggregation.

### Step 3

Spending trend engine.

### Step 4

Anomaly detection.

### Step 5

Cash-flow forecasting.

### Step 6

Smart Budget Engine.

### Step 7

Budget recommendation UI.

### Step 8

Savings analysis.

### Step 9

Debt scenarios.

### Step 10

What-if simulator.

### Step 11

Recommendation Engine.

### Step 12

Financial Insights UI.

### Step 13

Monthly Review.

### Step 14

Financial Context Builder.

### Step 15

OpenRouter integration preparation.

### Step 16

Testing and performance optimization.

---

# 54. Critical Agent Rules

1. Do not use LLM to calculate financial numbers.

2. Do not automatically modify the user's budget.

3. Never treat recommendations as transactions.

4. Never treat transfers as expenses.

5. Never silently convert currencies.

6. Never invent missing financial data.

7. Every recommendation must contain evidence.

8. Every forecast must expose its assumptions.

9. Every simulation must be isolated from real financial data.

10. Do not introduce Redis or microservices without demonstrated need.

11. Do not build the AI chat interface in Phase 2.

12. Prepare the architecture for Phase 3 OpenRouter integration.

13. Preserve all Phase 1 functionality.

14. Do not break existing API contracts unless necessary; use versioning or backward-compatible changes.

15. All financial calculations must have unit tests.

---

# 55. Phase 2 Output

At the end of Phase 2, the application should feel fundamentally different from Phase 1.

Phase 1:

> "Here is what happened with your money."

Phase 2:

> "Here is what is happening, why it is happening, what is likely to happen by the end of the month, and what budget adjustments you can consider."

Phase 3 will then add:

> "You can discuss your financial situation with the system using natural language."

import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { Debt } from "@/models/Debt";
import { User } from "@/models/User";
import { getPayCycleBuffer } from "@/lib/financial/pay-cycle";
import {
  monthlyInstallment,
  remainingInstallments,
  simulateDebtRepayment,
  suggestedAffordableBudget,
  type RepaymentStrategy,
} from "@/lib/financial/debt-repayment";
import type { Currency } from "@/types";
import { z } from "zod";

const bodySchema = z.object({
  monthlyBudget: z.number().int().min(0),
  strategy: z.enum(["SNOWBALL", "AVALANCHE", "PROPORTIONAL"]).optional(),
  currency: z.enum(["IDR", "EUR"]).optional(),
});

export async function GET() {
  try {
    const { userId } = await requireUser();
    const [user, debts, cycle] = await Promise.all([
      User.findById(userId).lean(),
      Debt.find({ userId, status: "ACTIVE" }).sort({ remainingAmount: 1 }).lean(),
      getPayCycleBuffer(userId),
    ]);

    const currency = (user?.baseCurrency as Currency) ?? cycle.currency ?? "IDR";
    const income = user?.monthlySalary ?? cycle.monthlySalary ?? 0;
    const fixedCosts = cycle.fixedCostTotal ?? 0;
    // Spare for debt = salary - fixed costs - other non-debt expenses already spent this cycle
    // Exclude debtRemaining from buffer so we don't double-count debt vs budget.
    const spareCashFlow = Math.max(
      0,
      (cycle.startingBalance ?? 0) +
        income +
        (cycle.otherIncome ?? 0) -
        (cycle.expenses ?? 0) -
        fixedCosts
    );

    const debtRows = debts
      .filter((d) => d.currency === currency)
      .map((d) => ({
        debtId: d._id.toString(),
        name: d.name,
        remainingAmount: d.remainingAmount,
        currency: d.currency as Currency,
        interestRate: d.interestRate ?? null,
        plannedPayment: d.plannedPayment ?? null,
        minimumPayment: d.minimumPayment ?? null,
        installmentMonths: d.installmentMonths ?? null,
        dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
        monthlyPayment: monthlyInstallment({
          debtId: d._id.toString(),
          name: d.name,
          remainingAmount: d.remainingAmount,
          currency: d.currency as Currency,
          plannedPayment: d.plannedPayment,
          minimumPayment: d.minimumPayment,
        }),
        remainingInstallments: remainingInstallments({
          debtId: d._id.toString(),
          name: d.name,
          remainingAmount: d.remainingAmount,
          currency: d.currency as Currency,
          plannedPayment: d.plannedPayment,
          minimumPayment: d.minimumPayment,
          installmentMonths: d.installmentMonths,
        }),
      }));

    const minimumTotal = debtRows.reduce((sum, d) => {
      const min = Math.min(
        d.remainingAmount,
        d.monthlyPayment > 0
          ? d.monthlyPayment
          : Math.ceil(d.remainingAmount / 12) || d.remainingAmount
      );
      return sum + min;
    }, 0);

    const suggestedBudget = suggestedAffordableBudget({
      income,
      spareCashFlow,
      minimumTotal,
    });

    return ok({
      currency,
      income,
      spareCashFlow,
      fixedCosts,
      minimumTotal,
      suggestedBudget,
      cycleLabel: cycle.cycle.label,
      debts: debtRows,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = bodySchema.parse(await request.json());
    const [user, debts, cycle] = await Promise.all([
      User.findById(userId).lean(),
      Debt.find({ userId, status: "ACTIVE" }).lean(),
      getPayCycleBuffer(userId),
    ]);

    const currency =
      body.currency ??
      (user?.baseCurrency as Currency) ??
      cycle.currency ??
      "IDR";
    const income = user?.monthlySalary ?? cycle.monthlySalary ?? 0;
    const fixedCosts = cycle.fixedCostTotal ?? 0;
    const spareCashFlow = Math.max(
      0,
      (cycle.startingBalance ?? 0) +
        income +
        (cycle.otherIncome ?? 0) -
        (cycle.expenses ?? 0) -
        fixedCosts
    );

    const simulation = simulateDebtRepayment({
      debts: debts.map((d) => ({
        debtId: d._id.toString(),
        name: d.name,
        remainingAmount: d.remainingAmount,
        currency: d.currency as Currency,
        interestRate: d.interestRate ?? null,
        plannedPayment: d.plannedPayment ?? null,
        minimumPayment: d.minimumPayment ?? null,
        installmentMonths: d.installmentMonths ?? null,
        dueDate: d.dueDate,
      })),
      monthlyBudget: body.monthlyBudget,
      strategy: (body.strategy ?? "SNOWBALL") as RepaymentStrategy,
      income,
      spareCashFlow,
      currency,
    });

    return ok(simulation);
  } catch (error) {
    return handleError(error);
  }
}

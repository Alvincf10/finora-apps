import {
  defaultClassification,
  defaultNature,
} from "@/lib/financial/phase2-math";

export const SYSTEM_CATEGORIES = [
  { name: "Salary", type: "INCOME" as const, icon: "wallet" },
  { name: "Freelance", type: "INCOME" as const, icon: "briefcase" },
  { name: "Other Income", type: "INCOME" as const, icon: "plus" },
  {
    name: "Food",
    type: "EXPENSE" as const,
    icon: "utensils",
    children: ["Groceries", "Coffee", "Delivery"],
  },
  {
    name: "Housing",
    type: "EXPENSE" as const,
    icon: "home",
    children: ["Rent", "Electricity", "Internet", "Maintenance"],
  },
  {
    name: "Lifestyle",
    type: "EXPENSE" as const,
    icon: "sparkles",
    children: ["Shopping", "Entertainment", "Travel", "Subscription"],
  },
  {
    name: "Relationship",
    type: "EXPENSE" as const,
    icon: "heart",
  },
  { name: "Bills", type: "EXPENSE" as const, icon: "receipt" },
  { name: "Debt Payment", type: "EXPENSE" as const, icon: "landmark" },
  { name: "Savings", type: "EXPENSE" as const, icon: "piggy-bank" },
  { name: "Other", type: "EXPENSE" as const, icon: "circle" },
];

export function categoryMeta(name: string, type: "INCOME" | "EXPENSE") {
  if (type === "INCOME") {
    return { classification: "UNKNOWN" as const, nature: "UNKNOWN" as const };
  }
  const classification = defaultClassification(name);
  const nature = defaultNature(name, classification);
  return { classification, nature };
}

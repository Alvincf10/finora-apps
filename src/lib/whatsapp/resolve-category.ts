import { Category } from "@/models/Category";

/** Find best matching category id by name (parent or child) for this user. */
export async function resolveCategoryId(
  userId: string,
  type: "INCOME" | "EXPENSE",
  hint: string
): Promise<string | null> {
  const filter = {
    type,
    isActive: true,
    userId,
  };

  const exact = await Category.findOne({
    ...filter,
    name: new RegExp(`^${escapeRegex(hint)}$`, "i"),
  });

  if (exact) return String(exact._id);

  const fuzzy = await Category.findOne({
    ...filter,
    name: new RegExp(escapeRegex(hint), "i"),
  });

  if (fuzzy) return String(fuzzy._id);

  const fallbackName = type === "INCOME" ? "Other Income" : "Other";
  const fallback = await Category.findOne({
    ...filter,
    name: fallbackName,
  });
  return fallback ? String(fallback._id) : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

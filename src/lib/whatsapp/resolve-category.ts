import { categoryMeta, SYSTEM_CATEGORIES } from "@/lib/seed/categories";
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

  // Auto-create known system categories (e.g. Flazz / Transport added later)
  const created = await ensureSystemCategory(userId, type, hint);
  if (created) return created;

  const fallbackName = type === "INCOME" ? "Other Income" : "Other";
  const fallback = await Category.findOne({
    ...filter,
    name: fallbackName,
  });
  return fallback ? String(fallback._id) : null;
}

async function ensureSystemCategory(
  userId: string,
  type: "INCOME" | "EXPENSE",
  hint: string
): Promise<string | null> {
  const wanted = hint.trim().toLowerCase();
  if (!wanted) return null;

  const match = SYSTEM_CATEGORIES.find(
    (c) => c.type === type && c.name.toLowerCase() === wanted
  );
  if (!match) return null;

  const meta = categoryMeta(match.name, type);
  const doc = await Category.create({
    userId,
    name: match.name,
    type,
    icon: match.icon,
    classification: meta.classification,
    nature: meta.nature,
    isSystem: true,
    isActive: true,
  });
  return String(doc._id);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

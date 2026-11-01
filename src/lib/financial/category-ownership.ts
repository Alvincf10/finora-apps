import { Category } from "@/models/Category";

/** Ensure categoryId belongs to user (or is unset). Throws NOT_FOUND / VALIDATION. */
export async function assertCategoryOwned(
  userId: string,
  categoryId: string | null | undefined
): Promise<void> {
  if (categoryId == null || categoryId === "") return;
  const cat = await Category.findOne({ _id: categoryId, userId })
    .select("_id")
    .lean();
  if (!cat) throw new Error("NOT_FOUND");
}

/** Ensure parentId is another category owned by the same user. */
export async function assertCategoryParentOwned(
  userId: string,
  parentId: string | null | undefined
): Promise<void> {
  if (parentId == null || parentId === "") return;
  const parent = await Category.findOne({ _id: parentId, userId, isActive: true })
    .select("_id")
    .lean();
  if (!parent) throw new Error("NOT_FOUND");
}

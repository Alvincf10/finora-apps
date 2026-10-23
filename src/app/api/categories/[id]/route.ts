import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { categoryMeta } from "@/lib/seed/categories";
import { updateCategorySchema } from "@/lib/validations";
import { Category } from "@/models/Category";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const input = updateCategorySchema.parse(await request.json());

    const category = await Category.findOne({ _id: id, userId });
    if (!category) throw new Error("NOT_FOUND");

    if (input.name !== undefined) category.name = input.name;
    if (input.icon !== undefined) category.icon = input.icon;
    if (input.color !== undefined) category.color = input.color;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.parentId !== undefined) {
      category.parentId = input.parentId || undefined;
    }

    if (input.name !== undefined && category.type === "EXPENSE") {
      const meta = categoryMeta(category.name, category.type);
      category.classification = meta.classification;
      category.nature = meta.nature;
    }

    await category.save();
    return ok(category);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const category = await Category.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!category) throw new Error("NOT_FOUND");
    return ok(category);
  } catch (error) {
    return handleError(error);
  }
}

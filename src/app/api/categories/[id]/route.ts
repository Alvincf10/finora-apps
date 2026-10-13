import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
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
    if (category.isSystem && input.name) {
      throw new Error("System categories cannot be renamed");
    }

    Object.assign(category, input);
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
      { _id: id, userId, isSystem: false },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!category) throw new Error("NOT_FOUND");
    return ok(category);
  } catch (error) {
    return handleError(error);
  }
}

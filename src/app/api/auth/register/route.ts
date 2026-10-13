import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { registerSchema } from "@/lib/validations";
import { User } from "@/models/User";
import { Category } from "@/models/Category";
import { SYSTEM_CATEGORIES, categoryMeta } from "@/lib/seed/categories";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);
    await connectDB();

    const existing = await User.findOne({ email: input.email });
    if (existing) {
      return fail("EMAIL_EXISTS", "Email already registered", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      baseCurrency: input.baseCurrency,
    });

    for (const cat of SYSTEM_CATEGORIES) {
      const parentMeta = categoryMeta(cat.name, cat.type);
      const parent = await Category.create({
        userId: user._id,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        classification: parentMeta.classification,
        nature: parentMeta.nature,
        isSystem: true,
        isActive: true,
      });

      if ("children" in cat && cat.children) {
        for (const child of cat.children) {
          const childMeta = categoryMeta(child, cat.type);
          await Category.create({
            userId: user._id,
            name: child,
            type: cat.type,
            parentId: parent._id,
            classification: childMeta.classification,
            nature: childMeta.nature,
            isSystem: true,
            isActive: true,
          });
        }
      }
    }

    return ok(
      {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}

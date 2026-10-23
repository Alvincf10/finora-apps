import mongoose from "mongoose";
import { readFileSync } from "fs";
import { suggestPaydayAllocation } from "../src/lib/financial/payday-allocation";

async function main() {
  const env = readFileSync(".env.local", "utf8");
  const uri = env
    .split("\n")
    .find((l) => l.startsWith("MONGODB_URI="))
    ?.slice("MONGODB_URI=".length);
  if (!uri) throw new Error("no uri");

  await mongoose.connect(uri);
  const s = await suggestPaydayAllocation(
    "6abe5f4cfe1209422a0d8ba4",
    new Date(),
    { ignoreSaved: true }
  );
  console.log(
    JSON.stringify(
      {
        cycle: s.cycle.label,
        salary: s.salary,
        startingCash: s.startingCash,
        totalIn: s.totalIn,
        allocated: s.allocated,
        remaining: s.remaining,
        envelopes: s.envelopes.map((e) => ({
          label: e.label,
          kind: e.kind,
          amount: e.amount,
        })),
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

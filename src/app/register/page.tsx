"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          baseCurrency: form.get("baseCurrency") || "IDR",
        }),
      });

      const result = await signIn("credentials", {
        email: String(form.get("email")),
        password: String(form.get("password")),
        redirect: false,
      });

      if (result?.error) {
        toast.error("Registered, but sign-in failed. Try logging in.");
        router.push("/login");
        return;
      }

      toast.success("Account created");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#d1fae5,transparent_40%),radial-gradient(circle_at_80%_0%,#e2e8f0,transparent_35%),linear-gradient(180deg,#f8fafc,#ecfdf5)] px-4 dark:bg-[radial-gradient(circle_at_20%_20%,#064e3b55,transparent_40%),linear-gradient(180deg,#020617,#0f172a)]">
      <Card className="w-full max-w-md border-emerald-900/10 shadow-xl">
        <CardHeader>
          <p className="font-heading text-2xl font-semibold text-emerald-800 dark:text-emerald-300">
            Finly
          </p>
          <CardTitle className="text-xl">Create account</CardTitle>
          <CardDescription>
            Start tracking income, expenses, debts, and goals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseCurrency">Base currency</Label>
              <select
                id="baseCurrency"
                name="baseCurrency"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                defaultValue="IDR"
              >
                <option value="IDR">IDR</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-700 underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

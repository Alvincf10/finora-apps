"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
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

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      toast.error(t("auth.invalidCredentials"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#d1fae5,transparent_40%),radial-gradient(circle_at_80%_0%,#e2e8f0,transparent_35%),linear-gradient(180deg,#f8fafc,#ecfdf5)] px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-[radial-gradient(circle_at_20%_20%,#064e3b55,transparent_40%),linear-gradient(180deg,#020617,#0f172a)]">
      <Card className="w-full max-w-md border-emerald-900/10 shadow-xl">
        <CardHeader>
          <div className="mb-2 flex justify-end">
            <LanguageSwitcher compact />
          </div>
          <p className="font-heading text-2xl font-semibold text-emerald-800 dark:text-emerald-300">
            Finora
          </p>
          <CardTitle className="text-xl">{t("auth.welcomeBack")}</CardTitle>
          <CardDescription>{t("auth.signInSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" method="post" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

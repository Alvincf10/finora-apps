"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FinoraLiveStatus = "alive" | "connecting" | "down";

type WaSession = {
  status: "disconnected" | "qr" | "connecting" | "connected" | "error";
  desiredState: "stopped" | "running";
  qrData: string | null;
  qrUpdatedAt: string | null;
  phoneNumber: string | null;
  defaultAccountId: string | null;
  allowedFrom: string | null;
  lastError: string | null;
  lastMessageAt: string | null;
  lastHeartbeatAt: string | null;
  finoraStatus: FinoraLiveStatus;
  finoraStatusLabel: string;
  finoraDownReason: string | null;
  alive: boolean;
  workerHint: string;
};

type Account = {
  _id: string;
  name: string;
  currency: string;
  isActive: boolean;
};

function statusVariant(
  status: WaSession["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "error") return "destructive";
  if (status === "qr" || status === "connecting") return "secondary";
  return "outline";
}

function FinoraStatusBanner({ session }: { session: WaSession }) {
  const { t } = useI18n();

  if (session.finoraStatus === "alive") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-50"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 space-y-1">
          <p className="font-heading text-base font-semibold tracking-tight">
            {t("whatsapp.finoraAliveTitle")}
          </p>
          <p className="text-sm text-emerald-900/80 dark:text-emerald-100/80">
            {t("whatsapp.finoraAliveDesc", {
              phone: session.phoneNumber
                ? t("whatsapp.finoraAlivePhone", {
                    phone: session.phoneNumber,
                  })
                : "",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (session.finoraStatus === "connecting") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50"
      >
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 space-y-1">
          <p className="font-heading text-base font-semibold tracking-tight">
            {t("whatsapp.finoraConnectingTitle")}
          </p>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            {t("whatsapp.finoraConnectingDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50"
    >
      <XCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 space-y-1">
        <p className="font-heading text-base font-semibold tracking-tight">
          {t("whatsapp.finoraDownTitle")}
        </p>
        <p className="text-sm text-red-900/85 dark:text-red-100/85">
          {session.finoraDownReason || t("whatsapp.finoraDownFallback")}
        </p>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const { t, intlLocale } = useI18n();
  const [session, setSession] = useState<WaSession | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allowedFrom, setAllowedFrom] = useState("");
  const [busy, setBusy] = useState(false);

  const statusLabel: Record<WaSession["status"], string> = {
    connected: t("whatsapp.statusConnected"),
    qr: t("whatsapp.statusQr"),
    connecting: t("whatsapp.statusConnecting"),
    disconnected: t("whatsapp.statusDisconnected"),
    error: t("whatsapp.statusError"),
  };

  const load = useCallback(async () => {
    const [wa, accs] = await Promise.all([
      api<WaSession>("/api/whatsapp"),
      api<Account[]>("/api/accounts"),
    ]);
    setSession(wa);
    setAccounts(accs.filter((a) => a.isActive));
    setAllowedFrom(wa.allowedFrom ?? "");
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  useEffect(() => {
    if (!session) return;
    const intervalMs =
      session.finoraStatus === "connecting" || session.status === "qr"
        ? 2000
        : 5000;
    const id = setInterval(() => {
      api<WaSession>("/api/whatsapp")
        .then(setSession)
        .catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(id);
  }, [session?.finoraStatus, session?.status]);

  async function action(act: "start" | "stop" | "logout") {
    setBusy(true);
    try {
      const wa = await api<WaSession>("/api/whatsapp", {
        method: "POST",
        body: JSON.stringify({ action: act }),
      });
      setSession(wa);
      if (act === "start") {
        toast.success(t("whatsapp.connectedToast"));
      } else if (act === "stop") {
        toast.message(t("whatsapp.stoppedToast"));
      } else {
        toast.success(t("whatsapp.logoutToast"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);
      const defaultAccountId = String(fd.get("defaultAccountId") || "");
      const from = allowedFrom.replace(/\D/g, "");
      if (!from || from.length < 8) {
        toast.error(t("whatsapp.senderRequired"));
        return;
      }
      if (!defaultAccountId) {
        toast.error(t("whatsapp.accountRequired"));
        return;
      }
      const wa = await api<WaSession>("/api/whatsapp", {
        method: "PATCH",
        body: JSON.stringify({
          defaultAccountId,
          allowedFrom: from,
        }),
      });
      setSession(wa);
      toast.success(t("whatsapp.savedToast"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading flex items-center gap-2 text-3xl font-semibold">
            <MessageCircle className="size-8 text-emerald-700" />
            {t("whatsapp.title")}
          </h1>
          <p className="text-muted-foreground">{t("whatsapp.subtitle")}</p>
        </div>
        {session && (
          <Badge
            variant={
              session.finoraStatus === "alive"
                ? "default"
                : session.finoraStatus === "down"
                  ? "destructive"
                  : "secondary"
            }
            className="text-sm"
          >
            {session.finoraStatusLabel}
          </Badge>
        )}
      </div>

      {session && <FinoraStatusBanner session={session} />}

      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.connection")}</CardTitle>
          <CardDescription>
            {t("whatsapp.connectionDesc")}{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              npm run wa:vira
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("whatsapp.socketLabel")}
            </span>
            {session && (
              <Badge variant={statusVariant(session.status)}>
                {statusLabel[session.status]}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                session?.desiredState === "running" ||
                !session?.allowedFrom ||
                !session?.defaultAccountId
              }
              onClick={() => action("start")}
              title={
                !session?.allowedFrom
                  ? t("whatsapp.needSender")
                  : !session?.defaultAccountId
                    ? t("whatsapp.needAccount")
                    : undefined
              }
            >
              {t("whatsapp.connect")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || session?.desiredState === "stopped"}
              onClick={() => action("stop")}
            >
              {t("whatsapp.disconnect")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => action("logout")}
            >
              {t("whatsapp.logoutRescan")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => load().catch((e) => toast.error(e.message))}
              title={t("common.refresh")}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {session?.phoneNumber && (
            <p className="text-sm text-muted-foreground">
              {t("whatsapp.connectedNumber")}{" "}
              <span className="font-medium text-foreground">
                +{session.phoneNumber}
              </span>
            </p>
          )}
          {session?.lastError && (
            <p className="text-sm text-destructive">{session.lastError}</p>
          )}

          {session?.status === "qr" && session.qrData ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border bg-white p-6 dark:bg-zinc-950">
              <p className="text-sm font-medium">{t("whatsapp.scanQr")}</p>
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={session.qrData} size={240} level="M" />
              </div>
              {session.qrUpdatedAt && (
                <p className="text-xs text-muted-foreground">
                  {t("whatsapp.qrUpdated", {
                    time: new Date(session.qrUpdatedAt).toLocaleTimeString(
                      intlLocale
                    ),
                  })}
                </p>
              )}
            </div>
          ) : session?.desiredState === "running" &&
            session.status !== "connected" ? (
            <p className="text-sm text-muted-foreground">
              {t("whatsapp.waitingQr")}
            </p>
          ) : null}

          {session?.alive && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {t("whatsapp.aliveHint")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.settings")}</CardTitle>
          <CardDescription>{t("whatsapp.settingsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultAccountId">
                {t("whatsapp.defaultAccount")}
              </Label>
              <select
                id="defaultAccountId"
                name="defaultAccountId"
                defaultValue={session?.defaultAccountId ?? ""}
                key={session?.defaultAccountId ?? "none"}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("whatsapp.selectAccount")}</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="allowedFrom">{t("whatsapp.allowedSender")}</Label>
              <Input
                id="allowedFrom"
                value={allowedFrom}
                onChange={(e) => setAllowedFrom(e.target.value)}
                placeholder="62812xxxxxxxx"
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                {t("whatsapp.allowedSenderHint")}
              </p>
            </div>
            <Button type="submit" disabled={busy || !session}>
              {t("whatsapp.saveSettings")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

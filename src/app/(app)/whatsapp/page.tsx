"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { MessageCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/client-api";
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
  workerHint: string;
};

type Account = {
  _id: string;
  name: string;
  currency: string;
  isActive: boolean;
};

const STATUS_LABEL: Record<WaSession["status"], string> = {
  connected: "Aktif",
  qr: "Menunggu QR",
  connecting: "Menghubungkan",
  disconnected: "Putus",
  error: "Error",
};

function statusVariant(
  status: WaSession["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "error") return "destructive";
  if (status === "qr" || status === "connecting") return "secondary";
  return "outline";
}

export default function WhatsAppPage() {
  const [session, setSession] = useState<WaSession | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allowedFrom, setAllowedFrom] = useState("");
  const [busy, setBusy] = useState(false);

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

  // Poll while connecting / waiting for QR / running
  useEffect(() => {
    if (!session) return;
    const shouldPoll =
      session.desiredState === "running" ||
      session.status === "qr" ||
      session.status === "connecting";
    if (!shouldPoll) return;

    const id = setInterval(() => {
      api<WaSession>("/api/whatsapp")
        .then(setSession)
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [session?.desiredState, session?.status]);

  async function action(act: "start" | "stop" | "logout") {
    setBusy(true);
    try {
      const wa = await api<WaSession>("/api/whatsapp", {
        method: "POST",
        body: JSON.stringify({ action: act }),
      });
      setSession(wa);
      if (act === "start") {
        toast.success("Vira mulai connect — scan QR jika muncul");
      } else if (act === "stop") {
        toast.message("Vira dihentikan");
      } else {
        toast.success("Session logout — scan QR baru untuk connect lagi");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
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
        toast.error("Nomor pengirim diizinkan wajib diisi (min. 8 digit)");
        return;
      }
      if (!defaultAccountId) {
        toast.error("Pilih rekening default");
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
      toast.success("Pengaturan Vira tersimpan");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
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
            WhatsApp (Vira)
          </h1>
          <p className="text-muted-foreground">
            Catat expense lewat chat. Scan QR di sini, pantau status koneksi.
          </p>
        </div>
        {session && (
          <Badge variant={statusVariant(session.status)} className="text-sm">
            {STATUS_LABEL[session.status]}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Koneksi</CardTitle>
          <CardDescription>
            Jalankan worker di terminal:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              npm run wa:vira
            </code>
            . QR kadaluarsa diganti otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  ? "Isi nomor pengirim diizinkan dulu"
                  : !session?.defaultAccountId
                    ? "Pilih rekening default dulu"
                    : undefined
              }
            >
              Connect
            </Button>
            <Button
              variant="outline"
              disabled={busy || session?.desiredState === "stopped"}
              onClick={() => action("stop")}
            >
              Disconnect
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => action("logout")}
            >
              Logout & scan ulang
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => load().catch((e) => toast.error(e.message))}
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {session?.phoneNumber && (
            <p className="text-sm text-muted-foreground">
              Nomor terhubung:{" "}
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
              <p className="text-sm font-medium">
                Scan QR ini dari WhatsApp → Linked devices
              </p>
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={session.qrData} size={240} level="M" />
              </div>
              {session.qrUpdatedAt && (
                <p className="text-xs text-muted-foreground">
                  QR diperbarui{" "}
                  {new Date(session.qrUpdatedAt).toLocaleTimeString("id-ID")}
                  {" · "}otomatis ganti jika expired
                </p>
              )}
            </div>
          ) : session?.desiredState === "running" &&
            session.status !== "connected" ? (
            <p className="text-sm text-muted-foreground">
              Menunggu QR dari worker… pastikan{" "}
              <code className="text-xs">npm run wa:vira</code> berjalan.
            </p>
          ) : null}

          {session?.status === "connected" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              Vira aktif (prefix <strong>finora </strong> supaya tidak bentrok
              OpenClaw). Contoh: <strong>finora makan 50rb</strong> ·{" "}
              <strong>finora total pengeluaran</strong>. Ketik{" "}
              <strong>finora help</strong> di WA untuk daftar lengkap.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan</CardTitle>
          <CardDescription>
            Rekening default dan nomor pengirim wajib diisi sebelum Connect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultAccountId">Rekening default</Label>
              <select
                id="defaultAccountId"
                name="defaultAccountId"
                defaultValue={session?.defaultAccountId ?? ""}
                key={session?.defaultAccountId ?? "none"}
                required
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">— pilih rekening —</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="allowedFrom">
                Nomor pengirim diizinkan (wajib)
              </Label>
              <Input
                id="allowedFrom"
                value={allowedFrom}
                onChange={(e) => setAllowedFrom(e.target.value)}
                placeholder="62812xxxxxxxx"
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Hanya nomor ini yang boleh mengirim perintah{" "}
                <code className="text-[11px]">finora …</code>. Contoh:{" "}
                <code className="text-[11px]">62812xxxxxxxx</code>.
              </p>
            </div>
            <Button type="submit" disabled={busy || !session}>
              Simpan pengaturan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

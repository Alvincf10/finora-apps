"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Insight = {
  _id: string;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  message: string;
  evidence?: Array<Record<string, unknown>>;
  actionType?: string;
  status: string;
};

export default function InsightsPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const data = await api<Insight[]>(
        `/api/insights${refresh ? "?refresh=1" : ""}`
      );
      setItems(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: "VIEWED" | "ACCEPTED" | "DISMISSED") {
    try {
      await api("/api/insights", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  function actionHref(actionType?: string) {
    if (actionType === "VIEW_BUDGET") return "/budget";
    if (actionType === "SIMULATE") return "/simulator";
    if (actionType === "VIEW_SPENDING") return "/transactions";
    return "/budget/recommendation";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Financial Insights
          </h1>
          <p className="text-muted-foreground">
            Deterministic recommendations with evidence — approve or dismiss.
          </p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={loading}>
          {loading ? "Refreshing..." : "Regenerate"}
        </Button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No insights yet. Add more transaction history, then regenerate.
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
            <Card key={item._id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      item.priority === "HIGH"
                        ? "destructive"
                        : item.priority === "MEDIUM"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {item.priority}
                  </Badge>
                  <Badge variant="outline">{item.status}</Badge>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </div>
                <CardDescription>{item.message}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.evidence?.length ? (
                  <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
                    {JSON.stringify(item.evidence, null, 2)}
                  </pre>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={actionHref(item.actionType)}
                    className="inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem]"
                  >
                    Open
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setStatus(item._id, "ACCEPTED")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus(item._id, "DISMISSED")}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

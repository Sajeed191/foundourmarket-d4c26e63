import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, LifeBuoy, ArrowRightLeft, Loader2, Clock } from "lucide-react";
import { useRegion } from "@/lib/region";
import { requestRegionChange, getMyRegionState } from "@/lib/region-admin.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Account-level region lock card. The customer's region is permanent; they may
 * only request a change (staff approval) or contact support.
 */
export function RegionLockCard() {
  const { market, currency, locked } = useRegion();
  const submit = useServerFn(requestRegionChange);
  const fetchState = useServerFn(getMyRegionState);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  const target = market === "india" ? "international" : "india";

  useEffect(() => {
    let active = true;
    fetchState()
      .then((s) => {
        if (active) setPending(s.latestRequest?.status === "pending");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchState]);

  if (!locked) return null;

  async function send() {
    if (reason.trim().length < 5) {
      toast.error("Please tell us why you need to change your region.");
      return;
    }
    setBusy(true);
    try {
      const res = await submit({ data: { requestedRegion: target, reason: reason.trim() } });
      if (res.ok) {
        toast.success("Request submitted", {
          description: "Our team will review your region change shortly.",
        });
        setPending(true);
        setOpen(false);
        setReason("");
      } else {
        toast.error(res.reason ?? "Could not submit your request.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">Shopping region</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You're shopping in{" "}
            <span className="font-medium text-foreground">
              {market === "india" ? "India" : "International"} · {currency}
            </span>
            . This determines pricing, currency, shipping, taxes and payment methods.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Your shopping region is currently locked. If you need to change your region, please
            contact support for verification.
          </p>

          {pending ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest text-amber-400">
              <Clock className="size-3" /> Change request under review
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/account/support">
                  <LifeBuoy className="size-4" /> Contact Support
                </Link>
              </Button>
              <Button size="sm" onClick={() => setOpen(true)}>
                <ArrowRightLeft className="size-4" /> Request Region Change
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request region change</DialogTitle>
            <DialogDescription>
              Switch from {market === "india" ? "India" : "International"} to{" "}
              {target === "india" ? "India" : "International"}. A team member will verify and
              apply the change.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={800}
            placeholder="Why do you need to change your region? (e.g. relocated, wrong selection)"
            className="w-full resize-none rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/40"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={busy} onClick={send}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

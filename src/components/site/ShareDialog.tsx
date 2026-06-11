import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  Facebook,
  Mail,
  Link2,
  Twitter,
  Check,
  Linkedin,
  MessageSquare,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { onOpenShareDialog, copyToClipboard, type ShareData } from "@/lib/share";

type Channel = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  href: (d: ShareData) => string;
};

const CHANNELS: Channel[] = [
  {
    label: "WhatsApp",
    icon: MessageCircle,
    tint: "text-emerald-500",
    href: (d) =>
      `https://wa.me/?text=${encodeURIComponent(`${d.title ? d.title + " — " : ""}${d.url}`)}`,
  },
  {
    label: "Telegram",
    icon: Send,
    tint: "text-sky-500",
    href: (d) =>
      `https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.title ?? "")}`,
  },
  {
    label: "Facebook",
    icon: Facebook,
    tint: "text-blue-600",
    href: (d) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(d.url)}`,
  },
  {
    label: "X",
    icon: Twitter,
    tint: "text-foreground",
    href: (d) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.title ?? "")}`,
  },
  {
    label: "LinkedIn",
    icon: Linkedin,
    tint: "text-blue-700",
    href: (d) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(d.url)}`,
  },
  {
    label: "SMS",
    icon: MessageSquare,
    tint: "text-green-600",
    href: (d) => `sms:?&body=${encodeURIComponent(`${d.title ? d.title + " — " : ""}${d.url}`)}`,
  },
  {
    label: "Email",
    icon: Mail,
    tint: "text-amber-500",
    href: (d) =>
      `mailto:?subject=${encodeURIComponent(d.title ?? "Check this out")}&body=${encodeURIComponent(`${d.text ? d.text + "\n\n" : ""}${d.url}`)}`,
  },
];

export function ShareDialog() {
  const [data, setData] = useState<ShareData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => onOpenShareDialog((d) => {
    setCopied(false);
    setData(d);
  }), []);

  const open = data !== null;

  const handleCopy = async () => {
    if (!data) return;
    const ok = await copyToClipboard(data.url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && setData(null)}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Share</DrawerTitle>
          <DrawerDescription className="truncate">
            {data?.title ?? "Share this link"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-4 gap-3 py-2 sm:grid-cols-5">
            {data &&
              CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <a
                    key={c.label}
                    href={c.href(data)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setData(null)}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/40 transition-colors active:scale-95 hover:bg-accent/10 hover:border-accent/40">
                      <Icon className={`size-6 ${c.tint}`} />
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">{c.label}</span>
                  </a>
                );
              })}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 p-2">
            <span className="flex-1 truncate px-2 text-xs text-muted-foreground">{data?.url}</span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity active:scale-95 hover:opacity-90"
            >
              {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

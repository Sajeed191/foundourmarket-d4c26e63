// Professional, mobile-first renderer for parsed product descriptions.
// Turns admin free-text into Amazon/Flipkart-style structured sections:
// overview paragraphs, bulleted feature/package lists, and a spec table.
// Long content collapses behind a "Read more" toggle for readability.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Sparkles,
  ListChecks,
  PackageOpen,
  Info,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  parseDescription,
  type DescriptionSection,
  type SpecItem,
} from "@/lib/product-description";

type ExtraSpecs = SpecItem[];

function SectionHeading({ icon: Icon, children }: { icon: typeof FileText; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight mb-3">
      <span className="size-7 rounded-lg bg-accent/10 text-accent grid place-items-center shrink-0">
        <Icon className="size-3.5" />
      </span>
      {children}
    </h3>
  );
}

function SpecTable({ specs }: { specs: SpecItem[] }) {
  return (
    <dl className="glass rounded-2xl overflow-hidden divide-y divide-border/50">
      {specs.map((s, i) => (
        <div key={`${s.label}-${i}`} className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-3 px-4 py-3">
          <dt className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/80 leading-relaxed break-words">
            {s.label}
          </dt>
          <dd className="text-sm font-medium text-foreground leading-relaxed break-words">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
          <span className="mt-0.5 size-4 rounded-full bg-accent/15 text-accent grid place-items-center shrink-0">
            <Check className="size-2.5" />
          </span>
          <span className="break-words min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionView({ section }: { section: DescriptionSection }) {
  switch (section.kind) {
    case "overview":
      return (
        <div>
          <SectionHeading icon={FileText}>{section.title}</SectionHeading>
          <div className="space-y-3">
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed break-words">
                {p}
              </p>
            ))}
          </div>
        </div>
      );
    case "features":
      return (
        <div>
          <SectionHeading icon={Sparkles}>{section.title}</SectionHeading>
          <BulletList items={section.items} />
        </div>
      );
    case "package":
      return (
        <div>
          <SectionHeading icon={PackageOpen}>{section.title}</SectionHeading>
          <BulletList items={section.items} />
        </div>
      );
    case "specs":
      return (
        <div>
          <SectionHeading icon={ListChecks}>{section.title}</SectionHeading>
          <SpecTable specs={section.specs} />
        </div>
      );
    case "info":
      return (
        <div>
          <SectionHeading icon={Info}>{section.title}</SectionHeading>
          <div className="space-y-3">
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed break-words">
                {p}
              </p>
            ))}
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function ProductDescription({
  description,
  extraSpecs,
  collapsible = true,
}: {
  description: string | null | undefined;
  /** Always-present specs from structured product fields (category, warranty…). */
  extraSpecs?: ExtraSpecs;
  collapsible?: boolean;
}) {
  const { sections } = useMemo(() => parseDescription(description), [description]);
  const [expanded, setExpanded] = useState(false);

  // Merge structured product specs into a single spec section so admins don't
  // duplicate them inside the description text.
  const merged = useMemo<DescriptionSection[]>(() => {
    const out = [...sections];
    if (extraSpecs && extraSpecs.length) {
      const idx = out.findIndex((s) => s.kind === "specs");
      if (idx >= 0 && out[idx].kind === "specs") {
        const existing = out[idx] as Extract<DescriptionSection, { kind: "specs" }>;
        const seen = new Set(existing.specs.map((s) => s.label.toLowerCase()));
        const additions = extraSpecs.filter((s) => !seen.has(s.label.toLowerCase()));
        out[idx] = { ...existing, specs: [...existing.specs, ...additions] };
      } else {
        out.push({ kind: "specs", title: "Specifications", specs: extraSpecs });
      }
    }
    return out;
  }, [sections, extraSpecs]);

  if (merged.length === 0) {
    return <p className="text-sm text-muted-foreground">No description available.</p>;
  }

  // Estimate content length to decide whether collapsing helps readability.
  const longContent =
    collapsible &&
    merged.reduce((n, s) => {
      if (s.kind === "overview" || s.kind === "info") return n + s.paragraphs.join(" ").length;
      if (s.kind === "features" || s.kind === "package") return n + s.items.join(" ").length;
      return n + s.specs.length * 24;
    }, 0) > 600;

  const isCollapsed = longContent && !expanded;

  return (
    <div>
      <div className="relative">
        <div className={isCollapsed ? "max-h-[22rem] overflow-hidden" : ""}>
          <div className="space-y-7">
            {merged.map((s, i) => (
              <SectionView key={`${s.kind}-${i}`} section={s} />
            ))}
          </div>
        </div>
        <AnimatePresence>
          {isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
            />
          )}
        </AnimatePresence>
      </div>
      {longContent && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-accent hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

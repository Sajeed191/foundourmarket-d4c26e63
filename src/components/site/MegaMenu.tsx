import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ChevronDown, Smartphone, Home as HomeIcon, Gem, HeartPulse,
  Car, Tent, PawPrint, Baby, ArrowRight, type LucideIcon,
} from "lucide-react";
import { useAllCategories } from "@/lib/use-categories";

type Sub = { name: string; main: string; sub: string };
type MainCat = {
  name: string;
  slug: string;
  icon: LucideIcon;
  blurb: string;
  tagline: string;
  subs: Sub[];
};

/** Static merchandising map mirrors the published catalog taxonomy. */
const MENU: MainCat[] = [
  {
    name: "Electronics & Gadgets", slug: "electronics", icon: Smartphone,
    blurb: "Audio, lighting & smart tech",
    tagline: "Premium technology curated globally.",
    subs: [
      { name: "Audio & Speakers", main: "electronics", sub: "speakers" },
      { name: "LED Lighting", main: "electronics", sub: "led" },
      { name: "Portable Gadgets", main: "electronics", sub: "portablegad" },
      { name: "Mobile Accessories", main: "electronics", sub: "mobile-accessories" },
      { name: "Computer Accessories", main: "electronics", sub: "computer-accessories" },
      { name: "Smartwatches", main: "electronics", sub: "smartwatches" },
    ],
  },
  {
    name: "Home & Kitchen", slug: "homeandkitchen", icon: HomeIcon,
    blurb: "Decor, storage & appliances",
    tagline: "Elegant essentials for modern living.",
    subs: [
      { name: "Bathroom Accessories", main: "homeandkitchen", sub: "homeutilities" },
      { name: "Cleaning Supplies", main: "homeandkitchen", sub: "cleaningsupplies" },
      { name: "Home Decor", main: "homeandkitchen", sub: "homedecor" },
      { name: "Kitchen Tools", main: "homeandkitchen", sub: "kitchentools" },
      { name: "Storage & Organization", main: "homeandkitchen", sub: "storage" },
      { name: "Home Appliances", main: "homeandkitchen", sub: "homeappli" },
    ],
  },
  {
    name: "Beauty & Personal Care", slug: "bhandpersonalcareeauen", icon: Gem,
    blurb: "Devices, grooming & skincare",
    tagline: "Professional beauty & self-care products.",
    subs: [
      { name: "Beauty Devices", main: "bhandpersonalcareeauen", sub: "healthandwesjsj" },
      { name: "Grooming", main: "bhandpersonalcareeauen", sub: "massagetoolssnsjsj" },
      { name: "Hair Care", main: "bhandpersonalcareeauen", sub: "haircare" },
      { name: "Skincare Tools", main: "bhandpersonalcareeauen", sub: "toothbrush" },
    ],
  },
  {
    name: "Health & Wellness", slug: "healthandwellness", icon: HeartPulse,
    blurb: "Fitness, recovery & wellness",
    tagline: "Everyday wellness, elevated.",
    subs: [
      { name: "Fitness Accessories", main: "healthandwellness", sub: "fitness" },
      { name: "Massagers", main: "healthandwellness", sub: "masaage" },
      { name: "Posture Support", main: "healthandwellness", sub: "post" },
      { name: "Wellness Devices", main: "healthandwellness", sub: "wellnessdevis" },
    ],
  },
  {
    name: "Car & Bike Accessories", slug: "automotiveaccessories", icon: Car,
    blurb: "On-the-go essentials",
    tagline: "Refined gear for every journey.",
    subs: [
      { name: "Bike Accessories", main: "automotiveaccessories", sub: "bikeaccessories" },
      { name: "Car Accessories", main: "automotiveaccessories", sub: "caraccessories" },
      { name: "Cleaning Tools", main: "automotiveaccessories", sub: "cleaningtools" },
      { name: "Electronics", main: "automotiveaccessories", sub: "bikeanncar" },
      { name: "Phone Holders", main: "automotiveaccessories", sub: "phonehild" },
      { name: "Organizers", main: "automotiveaccessories", sub: "oraganizers" },
    ],
  },
  {
    name: "Sports & Outdoor", slug: "sportsandoutdoor", icon: Tent,
    blurb: "Camping, fitness & travel",
    tagline: "Built for the great outdoors.",
    subs: [
      { name: "Camping Gear", main: "sportsandoutdoor", sub: "camping" },
      { name: "Fitness Gear", main: "sportsandoutdoor", sub: "fitnessgear" },
      { name: "Outdoor Equipment", main: "sportsandoutdoor", sub: "ooutdooreu" },
      { name: "Travel Essentials", main: "sportsandoutdoor", sub: "ttravelessen" },
    ],
  },
  {
    name: "Pet Supplies", slug: "pet-supplies", icon: PawPrint,
    blurb: "Everything for your pets",
    tagline: "Thoughtful care for every companion.",
    subs: [
      { name: "Pet Accessories", main: "pet-supplies", sub: "ppetasse" },
      { name: "Pet Feeding", main: "pet-supplies", sub: "catfood" },
      { name: "Pet Grooming", main: "pet-supplies", sub: "ppetgroom" },
      { name: "Pet Toys", main: "pet-supplies", sub: "ppettoys" },
    ],
  },
  {
    name: "Baby & Kids", slug: "banykid", icon: Baby,
    blurb: "Gentle care for little ones",
    tagline: "Gentle care for little ones.",
    subs: [
      { name: "Baby Care", main: "banykid", sub: "babycare" },
    ],
  },
];

/** Premium desktop mega-menu. Desktop-only; mobile uses the existing drawer. */
export function MegaMenu() {
  const [active, setActive] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { categories } = useAllCategories();

  const imageFor = (slug: string) =>
    categories.find((c) => c.slug === slug)?.image ||
    categories.find((c) => c.slug === slug)?.banner_image ||
    null;

  const open = (slug: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setActive(slug), 160);
  };
  const scheduleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActive(null), 160);
  };

  return (
    <div className="hidden md:flex flex-1 justify-center items-center gap-1.5 lg:gap-2.5 text-[13px] lg:text-[14px] font-medium text-muted-foreground">
      <Link
        to="/"
        activeOptions={{ exact: true }}
        activeProps={{ className: "text-foreground bg-white/5" }}
        className="px-4 py-2.5 rounded-full hover:text-foreground hover:bg-white/5 transition-all duration-200 whitespace-nowrap"
      >
        Shop
      </Link>

      {MENU.map((cat) => {
        const Icon = cat.icon;
        const isOpen = active === cat.slug;
        const img = imageFor(cat.slug);
        return (
          <div
            key={cat.slug}
            className="relative"
            onMouseEnter={() => open(cat.slug)}
            onMouseLeave={scheduleClose}
          >
            <Link
              to="/category/$slug"
              params={{ slug: cat.slug }}
              className={`flex items-center gap-1.5 px-3 lg:px-3.5 py-2.5 rounded-full transition-all duration-200 whitespace-nowrap ${
                isOpen ? "text-foreground bg-white/5" : "hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className="hidden lg:inline">{cat.name.split(" & ")[0].split(" ")[0]}</span>
              <span className="lg:hidden">{cat.name.split(" ")[0]}</span>
              <ChevronDown
                className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : "opacity-60"}`}
              />
            </Link>

            {/* Mega dropdown panel */}
            <div
              className={`absolute left-1/2 top-full z-50 pt-3.5 -translate-x-1/2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 translate-y-1 scale-[0.98] pointer-events-none"
              }`}
            >
              <div className="flex w-[680px] overflow-hidden rounded-2xl glass-strong ring-1 ring-white/12 shadow-[var(--shadow-float),0_0_70px_-22px_oklch(0.74_0.19_49/0.5)] backdrop-blur-2xl">
                {/* LEFT — cinematic category showcase (35%) */}
                <div className="relative w-[35%] shrink-0 overflow-hidden">
                  {img ? (
                    <img src={img} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <div className="absolute inset-0" style={{ background: "var(--gradient-ember)" }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/20" />
                  <div className="absolute inset-0" style={{ background: "radial-gradient(80% 60% at 30% 20%, oklch(0.74 0.19 49 / 0.18), transparent 70%)" }} />
                  <div className="relative flex h-full flex-col justify-end p-5">
                    <span className="grid place-items-center size-11 rounded-2xl bg-accent/15 ring-1 ring-accent/30 text-accent mb-3">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="text-[15px] font-display font-semibold text-foreground leading-tight">{cat.name}</h3>
                    <p className="mt-1.5 text-[12px] text-muted-foreground leading-snug">{cat.tagline}</p>
                    <Link
                      to="/category/$slug"
                      params={{ slug: cat.slug }}
                      className="group mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-accent/90 text-accent-foreground px-4 py-2 text-[11px] font-semibold uppercase tracking-widest hover:brightness-110 transition shadow-[var(--shadow-ember)]"
                    >
                      Explore Category
                      <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" />
                    </Link>
                  </div>
                </div>

                {/* RIGHT — organized subcategory grid (65%) */}
                <div className="w-[65%] p-5">
                  <p className="mb-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70">Subcategories</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {cat.subs.map((s) => (
                      <Link
                        key={s.sub}
                        to="/category/$main/$sub"
                        params={{ main: s.main, sub: s.sub }}
                        className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                      >
                        <span className="grid place-items-center size-7 rounded-lg bg-white/5 ring-1 ring-white/10 group-hover:ring-accent/40 group-hover:bg-accent/10 transition shrink-0">
                          <span className="size-1.5 rounded-full bg-accent/50 group-hover:bg-accent transition" />
                        </span>
                        <span className="truncate">{s.name}</span>
                        <ArrowRight className="ml-auto size-3.5 text-accent opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <Link
        to="/deals"
        activeProps={{ className: "text-foreground bg-white/5" }}
        className="px-4 py-2.5 rounded-full hover:text-foreground hover:bg-white/5 transition-all duration-200 whitespace-nowrap"
      >
        Deals
      </Link>
    </div>
  );
}

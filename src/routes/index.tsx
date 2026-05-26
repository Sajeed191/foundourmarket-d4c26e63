import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Shield, Truck, Headset, ArrowRight, Star } from "lucide-react";
import { useCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";

import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ — Everything You Need. All In One Place." },
      { name: "description", content: "Premium global marketplace. Curated electronics, fashion, home, fitness and more — delivered worldwide." },
    ],
  }),
  component: Home,
});

function Home() {
  const { products } = useProducts();
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const categoryCounts = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <>
      {/* Hero */}
      <section className="relative pt-24 pb-32 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <p className="animate-fade-up text-[11px] font-mono uppercase tracking-[0.3em] text-accent mb-6">
            Global Marketplace · Curated Worldwide
          </p>
          <h1 className="animate-fade-up text-5xl md:text-7xl lg:text-8xl font-display font-semibold tracking-tight text-balance leading-[0.9] mb-8">
            Everything You Need.
            <br />
            <span className="text-muted-foreground">All In One Place.</span>
          </h1>
          <p className="animate-fade-up [animation-delay:100ms] text-lg text-muted-foreground max-w-2xl mx-auto text-balance mb-12">
            A premium independent marketplace sourcing top-quality products from across the world — delivered to your door with cinematic precision.
          </p>

          {/* Smart Search */}
          <form
            onSubmit={(e) => { e.preventDefault(); nav({ to: "/search", search: { q: query } }); }}
            className="animate-fade-up [animation-delay:200ms] max-w-2xl mx-auto relative"
          >
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the global marketplace..."
              className="w-full bg-card border border-border rounded-full pl-14 pr-32 py-5 text-base focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all placeholder:text-muted-foreground/60"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-bold px-6 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all">
              Search
            </button>
          </form>

          <div className="animate-fade-up [animation-delay:300ms] mt-10 flex flex-wrap justify-center gap-4">
            <Link to="/category/$slug" params={{ slug: "electronics" }} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background text-xs uppercase tracking-widest font-semibold hover:brightness-110 transition-all">
              Explore Products <ArrowRight className="size-3.5" />
            </Link>
            <a href="#categories" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-xs uppercase tracking-widest font-semibold hover:bg-white/5 transition-all">
              Shop Categories
            </a>
          </div>
        </div>
        {/* ember glow */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] -z-0 rounded-full animate-glow"
          style={{ background: "var(--gradient-ember)", filter: "blur(80px)" }}
        />
      </section>

      {/* Trust Strip */}
      <section className="border-y border-border bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Truck, label: "Worldwide Shipping" },
            { icon: Shield, label: "Secure Payments" },
            { icon: Star, label: "Curated Quality" },
            { icon: Headset, label: "24/7 Support" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="size-10 grid place-items-center rounded-full bg-accent/10 text-accent shrink-0">
                <Icon className="size-4" />
              </div>
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Browse</p>
            <h2 className="text-3xl md:text-4xl font-display tracking-tight">Featured Categories</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CATEGORIES.map((cat, i) => (
            <Link
              key={cat.slug}
              to="/category/$slug"
              params={{ slug: cat.slug }}
              className="group relative aspect-square bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/40 transition-all hover:-translate-y-1"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="absolute inset-0 grid place-items-center text-6xl font-display font-bold text-white/[0.04] group-hover:text-accent/20 transition-colors">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--gradient-ember)" }}
              />
              <div className="absolute inset-0 p-6 flex flex-col justify-end z-10">
                <p className="font-mono text-[10px] text-accent mb-1">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="text-lg font-medium">{cat.name}</h3>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{categoryCounts[cat.slug] ?? 0} items</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Trending Products */}
      <section className="px-6 py-24 max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Curated</p>
            <h2 className="text-3xl md:text-4xl font-display tracking-tight">Trending Now</h2>
          </div>
          <Link to="/" className="text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.slice(0, 8).map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Why FoundOurMarket</p>
          <h2 className="text-3xl md:text-4xl font-display tracking-tight">Built for the modern buyer</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: "Secure Payments", desc: "Bank-grade encryption on every transaction with trusted global gateways." },
            { title: "Worldwide Shipping", desc: "Fast, tracked delivery to 180+ countries from our global distribution hubs." },
            { title: "Trusted Sellers", desc: "Every supplier hand-verified. Only premium products make it to the marketplace." },
            { title: "Premium Quality", desc: "Curated catalog — no filler, no fakes. Every item meets our quality bar." },
            { title: "Fast Delivery", desc: "Express options available. Most orders arrive within 5–10 business days." },
            { title: "24/7 Support", desc: "Real humans, ready to help — anytime, anywhere in the world." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-8 hover:border-accent/40 transition-colors">
              <h4 className="text-lg font-medium mb-3">{f.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <section className="px-6 py-32 overflow-hidden">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block size-1 bg-accent mb-12" />
          <blockquote className="text-2xl md:text-4xl font-display text-pretty leading-tight mb-8">
            "FoundOurMarket has completely redefined how I source premium goods. The quality of the marketplace is unmatched."
          </blockquote>
          <cite className="not-italic font-mono text-xs uppercase tracking-widest text-accent">
            Marcus Thorne — Curator
          </cite>
        </div>
      </section>

      {/* Newsletter */}
      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto bg-card border border-border p-12 rounded-3xl text-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-display tracking-tight mb-4">Join the Inner Circle</h2>
            <p className="text-muted-foreground mb-8 text-pretty">
              Exclusive drops and curator insights — plus 10% off your first order.
            </p>
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                required
                placeholder="Email address"
                className="flex-1 bg-black/40 border border-border rounded-full px-6 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button className="bg-accent text-accent-foreground font-bold px-8 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all">
                Subscribe
              </button>
            </form>
          </div>
          <div
            aria-hidden
            className="absolute -bottom-24 -right-24 size-64 rounded-full"
            style={{ background: "var(--gradient-ember)", filter: "blur(60px)" }}
          />
        </div>
      </section>
    </>
  );
}

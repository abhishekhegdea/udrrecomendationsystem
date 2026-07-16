import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  ShoppingBag,
  Heart,
  ArrowUpRight,
  ArrowRight,
  Star,
  MapPin,
  Globe,
  Truck,
  Sparkles,
  Plus,
  Minus,
} from "lucide-react";

import heroArtisan from "@/assets/hero-artisan.jpg";
import storyPackaging from "@/assets/story-packaging.jpg";
import artisanPortrait from "@/assets/artisan-portrait.jpg";
import catTextile from "@/assets/cat-textile.jpg";
import catPottery from "@/assets/cat-pottery.jpg";
import catWood from "@/assets/cat-wood.jpg";
import catBrass from "@/assets/cat-brass.jpg";
import catJewelry from "@/assets/cat-jewelry.jpg";
import catBasket from "@/assets/cat-basket.jpg";
import productVase from "@/assets/product-vase.jpg";
import productScarf from "@/assets/product-scarf.jpg";
import productBox from "@/assets/product-box.jpg";
import productLamp from "@/assets/product-lamp.jpg";

export function LandingPage() {
  return <Home />;
}

/* ---------- primitives ---------- */

function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16 ${className}`}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-ink/60">
      <span className="h-px w-8 bg-ink/30" />
      {children}
    </span>
  );
}

function PrimaryButton({
  children,
  variant = "solid",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "solid" | "ghost";
  className?: string;
}) {
  const base =
    "group inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-8 text-sm font-medium transition-all duration-300";
  const styles =
    variant === "solid"
      ? "bg-ink text-background hover:bg-ink/90 hover:shadow-[0_20px_40px_-20px_rgba(17,17,17,0.5)]"
      : "border border-ink/15 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/[0.03]";
  return (
    <button className={`${base} ${styles} ${className}`}>
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </button>
  );
}

/* ---------- data ---------- */

const categories = [
  { name: "Textiles", count: "12,400+", img: catTextile },
  { name: "Pottery", count: "8,200+", img: catPottery },
  { name: "Woodwork", count: "6,900+", img: catWood },
  { name: "Brass", count: "4,100+", img: catBrass },
  { name: "Jewelry", count: "9,700+", img: catJewelry },
  { name: "Basketry", count: "3,300+", img: catBasket },
];

const products = [
  {
    name: "Jaipur Blue Pottery Vase",
    seller: "Meera's Studio",
    location: "Jaipur, IN",
    price: "$84",
    img: productVase,
    tag: "New",
  },
  {
    name: "Handwoven Pashmina Stole",
    seller: "Kashmir Looms",
    location: "Srinagar, IN",
    price: "$142",
    img: productScarf,
    tag: "Bestseller",
  },
  {
    name: "Carved Rosewood Keepsake Box",
    seller: "Rao Craftworks",
    location: "Mysore, IN",
    price: "$68",
    img: productBox,
    tag: "Limited",
  },
  {
    name: "Etched Brass Diya, Set of 2",
    seller: "Moradabad Metals",
    location: "Moradabad, IN",
    price: "$46",
    img: productLamp,
    tag: "Handmade",
  },
];

const stats = [
  { n: "10,000+", l: "Artisans" },
  { n: "2,00,000+", l: "Products" },
  { n: "500+", l: "Cities" },
  { n: "50+", l: "Countries" },
];

const testimonials = [
  {
    q: "Every piece arrives with a story. The pottery from Jaipur is now the centerpiece of our living room in Copenhagen.",
    name: "Astrid Berg",
    role: "Interior Designer",
    city: "Copenhagen",
  },
  {
    q: "UdrCrafts feels like walking through a hidden bazaar — but everything is curated, verified, and shipped beautifully.",
    name: "Naomi Chen",
    role: "Home Stylist",
    city: "Singapore",
  },
  {
    q: "I finally source directly from the makers. The transparency, the packaging, the care — it's on another level.",
    name: "David Okafor",
    role: "Boutique Owner",
    city: "London",
  },
];

const faqs = [
  {
    q: "Where do the products ship from?",
    a: "Directly from artisan workshops across India, quality-checked at our Delhi and Bengaluru studios before global dispatch.",
  },
  {
    q: "How long does international delivery take?",
    a: "Most orders arrive within 6–9 business days worldwide, with real-time tracking and carbon-neutral shipping.",
  },
  {
    q: "Can I become a seller on UdrCrafts?",
    a: "Yes. Our onboarding takes under 20 minutes and includes photography support, storefront setup, and weekly payouts.",
  },
  {
    q: "Are the products truly handmade?",
    a: "Every listing is verified handmade by a named artisan or workshop. No factory goods, no drop-shipping — ever.",
  },
];

/* ---------- reveal ---------- */

function Reveal({
  children,
  delay = 0,
  y = 24,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------- nav ---------- */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-ink/5"
          : "bg-transparent"
      }`}
    >
      <Container className="flex h-20 items-center justify-between gap-6">
        <a href="#" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-background text-display text-sm">
            U
          </span>
          <span className="text-display text-lg tracking-tight">UdrCrafts</span>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-ink/70 md:flex">
          {["Marketplace", "Artisans", "Journal", "Sell with us"].map((i) => (
            <a
              key={i}
              href="#"
              className="relative after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-ink after:transition-all after:duration-300 hover:text-ink hover:after:w-full"
            >
              {i}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden h-11 items-center gap-2 rounded-full border border-ink/10 bg-background/70 px-4 backdrop-blur md:flex">
            <Search className="h-4 w-4 text-ink/40" />
            <input
              placeholder="Search 200,000 handmade goods"
              className="w-56 bg-transparent text-sm placeholder:text-ink/40 focus:outline-none"
            />
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-full border border-ink/10 hover:bg-ink/[0.04]">
            <Heart className="h-4 w-4" />
          </button>
          <button onClick={() => navigate('/login')} className="hidden sm:block rounded-full bg-ink text-background hover:bg-ink/90 px-5 py-2.5 text-sm font-medium transition-colors">
            Partner Login
          </button>
          <button className="grid h-11 w-11 place-items-center rounded-full bg-ink text-background hover:bg-ink/90">
            <ShoppingBag className="h-4 w-4" />
          </button>
        </div>
      </Container>
    </header>
  );
}

/* ---------- hero ---------- */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const yImg = useTransform(scrollYProgress, [0, 1], [0, -60]);

  return (
    <section ref={ref} className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* decorative orb */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-saffron/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-40 h-[420px] w-[420px] rounded-full bg-terracotta/20 blur-3xl" />

      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left */}
          <motion.div style={{ y }} className="lg:col-span-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 inline-flex items-center gap-3 rounded-full border border-ink/10 bg-background/60 py-2 pl-2 pr-5 backdrop-blur"
            >
              <span className="rounded-full bg-saffron px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink">
                New
              </span>
              <span className="text-sm text-ink/70">Diwali Collection — 340 makers</span>
              <ArrowRight className="h-3.5 w-3.5 text-ink/50" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="text-display text-[46px] leading-[1.15] tracking-[-0.03em] sm:text-[64px] lg:text-[84px]"
            >
              Crafted by
              <br />
              Indian hands.
              <br />
              <span className="text-serif italic text-terracotta">Loved</span> around
              <br />
              the world.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7 }}
              className="mt-8 max-w-lg text-lg leading-relaxed text-ink/65"
            >
              Bring authentic handcrafted treasures from India's local markets directly to your
              home — from a village loom in Kutch to a doorstep in Copenhagen.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <PrimaryButton>Explore Marketplace</PrimaryButton>
              <PrimaryButton variant="ghost">Become a Seller</PrimaryButton>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-16 grid grid-cols-2 gap-y-8 sm:grid-cols-4"
            >
              {stats.map((s) => (
                <div key={s.l}>
                  <div className="text-display text-2xl sm:text-3xl">{s.n}</div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-ink/50">{s.l}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right */}
          <div className="relative lg:col-span-6">
            <motion.div
              style={{ y: yImg }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="relative overflow-hidden rounded-[36px] shadow-[0_40px_80px_-30px_rgba(138,90,68,0.45)]">
                <img
                  src={heroArtisan}
                  alt="Indian artisan hand-painting a terracotta pottery vase"
                  width={1200}
                  height={1500}
                  className="h-[560px] w-full object-cover md:h-[680px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/20 via-transparent to-transparent" />
              </div>

              {/* Floating card 1 */}
              <motion.div
                initial={{ opacity: 0, y: 30, x: -20 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ delay: 0.6, duration: 0.7 }}
                className="absolute left-2 top-16 flex items-center gap-3 rounded-2xl border border-ink/5 bg-background/90 p-3 pr-5 shadow-xl backdrop-blur md:-left-4 lg:-left-6"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-forest/10 text-forest">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium">Verified handmade</div>
                  <div className="text-xs text-ink/50">Every single listing</div>
                </div>
              </motion.div>

              {/* Floating card 2 */}
              <motion.div
                initial={{ opacity: 0, y: 30, x: 20 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ delay: 0.75, duration: 0.7 }}
                className="absolute -bottom-6 right-2 flex items-center gap-3 rounded-2xl border border-ink/5 bg-background/90 p-3 pr-5 shadow-xl backdrop-blur md:-right-4"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-saffron/25 text-clay">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium">Delivered to 50+ countries</div>
                  <div className="text-xs text-ink/50">Carbon-neutral shipping</div>
                </div>
              </motion.div>

              {/* Floating price tag */}
              <motion.div
                initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: -8 }}
                transition={{ delay: 0.9, duration: 0.6 }}
                className="absolute right-6 top-8 grid h-24 w-24 place-items-center rounded-full bg-saffron text-center text-ink shadow-lg"
              >
                <div>
                  <div className="text-[10px] uppercase tracking-widest">From</div>
                  <div className="text-display text-xl leading-none">$24</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- press marquee ---------- */

function Marquee() {
  const items = [
    "As featured in Vogue India",
    "Forbes 30 Under 30",
    "Condé Nast Traveller",
    "Architectural Digest",
    "Kinfolk Journal",
    "Wallpaper*",
  ];
  return (
    <section className="border-y border-ink/[0.07] bg-cream/60 py-6">
      <div className="flex overflow-hidden">
        <div className="marquee flex shrink-0 items-center gap-16 whitespace-nowrap px-8 text-sm uppercase tracking-[0.2em] text-ink/45">
          {[...items, ...items].map((i, idx) => (
            <span key={idx} className="flex items-center gap-16">
              {i}
              <span className="h-1 w-1 rounded-full bg-ink/20" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- categories ---------- */

function Categories() {
  return (
    <section className="py-28 lg:py-36">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <Eyebrow>Explore by craft</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Six centuries of craft,
              <br />
              <span className="text-serif italic text-terracotta">
                one marketplace.
              </span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <a
              href="#"
              className="group inline-flex items-center gap-2 text-sm font-medium text-ink/70 hover:text-ink"
            >
              View all categories
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </Reveal>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((c, i) => (
            <Reveal key={c.name} delay={i * 0.06}>
              <a href="#" className="group block text-center">
                <div className="relative aspect-square overflow-hidden rounded-full ring-1 ring-ink/5 transition-all duration-500 group-hover:ring-saffron/60 group-hover:shadow-[0_20px_50px_-20px_rgba(249,176,0,0.5)]">
                  <img
                    src={c.img}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
                </div>
                <div className="mt-5 text-display text-lg">{c.name}</div>
                <div className="text-xs text-ink/50">{c.count} pieces</div>
              </a>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- features ---------- */

function Features() {
  const feats = [
    {
      icon: Sparkles,
      title: "Authentic Handmade",
      desc: "Every piece is verified handmade by a named artisan or workshop. No factories, no imitations.",
      tone: "bg-saffron/20 text-clay",
    },
    {
      icon: Globe,
      title: "Secure Global Shipping",
      desc: "Insured, tracked, and carbon-neutral. From an Indian workshop to your door in 6–9 days.",
      tone: "bg-forest/10 text-forest",
    },
    {
      icon: Heart,
      title: "Empowering Local Artisans",
      desc: "Makers keep 82% of every sale. Weekly payouts, fair wages, and long-term partnerships.",
      tone: "bg-terracotta/15 text-terracotta",
    },
  ];
  return (
    <section className="bg-cream/70 py-28 lg:py-36">
      <Container>
        <Reveal>
          <Eyebrow>The UdrCrafts promise</Eyebrow>
          <h2 className="mt-4 max-w-3xl text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Handmade, honest, and
            <span className="text-serif italic text-terracotta"> delivered with care.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {feats.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <div className="group relative flex h-full flex-col rounded-3xl border border-ink/5 bg-background p-8 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(17,17,17,0.25)]">
                <div className={`grid h-14 w-14 place-items-center rounded-2xl ${f.tone}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-8 text-display text-2xl">{f.title}</h3>
                <p className="mt-3 text-ink/60">{f.desc}</p>
                <div className="mt-8 flex items-center gap-2 text-sm font-medium text-ink/60 transition group-hover:text-ink">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- products ---------- */

function Products() {
  return (
    <section className="py-28 lg:py-36">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <Eyebrow>This week's picks</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Curated by our
              <span className="text-serif italic text-terracotta"> in-house artisans.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="flex flex-wrap gap-2">
              {["All", "New", "Bestsellers", "Under $50"].map((t, i) => (
                <button
                  key={t}
                  className={`h-10 rounded-full px-5 text-sm transition ${
                    i === 0
                      ? "bg-ink text-background"
                      : "border border-ink/10 text-ink/60 hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.06}>
              <article className="group flex h-full flex-col">
                <div className="relative overflow-hidden rounded-3xl bg-cream">
                  <img
                    src={p.img}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                    <span className="rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-ink backdrop-blur">
                      {p.tag}
                    </span>
                    <button className="grid h-10 w-10 place-items-center rounded-full bg-background/90 text-ink shadow-sm backdrop-blur transition hover:bg-background hover:text-terracotta">
                      <Heart className="h-4 w-4" />
                    </button>
                  </div>
                  <button className="absolute inset-x-4 bottom-4 flex translate-y-4 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-medium text-background opacity-0 shadow-lg transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    <ShoppingBag className="h-4 w-4" />
                    Add to cart
                  </button>
                </div>

                <div className="mt-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-display text-lg">{p.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink/50">
                      <span>{p.seller}</span>
                      <span className="h-1 w-1 rounded-full bg-ink/30" />
                      <MapPin className="h-3 w-3" />
                      <span>{p.location}</span>
                    </div>
                  </div>
                  <div className="text-display text-lg">{p.price}</div>
                </div>

                <div className="mt-2 flex items-center gap-1 text-xs text-ink/60">
                  <Star className="h-3 w-3 fill-saffron text-saffron" />
                  <span className="font-medium text-ink">4.9</span>
                  <span>· 218 reviews</span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- seller story ---------- */

function SellerStory() {
  const steps = [
    { n: "01", t: "Apply in 5 minutes", d: "Tell us about your craft. No paperwork, no fees." },
    { n: "02", t: "We photograph & list", d: "Our studio creates world-class product visuals for free." },
    { n: "03", t: "Ship to 50+ countries", d: "We handle logistics, customs, and returns end-to-end." },
    { n: "04", t: "Get paid weekly", d: "Direct bank transfer. Keep 82% of every sale." },
  ];
  return (
    <section className="bg-ink text-background grain">
      <Container className="relative py-28 lg:py-36">
        <div className="grid items-center gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-6 relative">
            <div className="relative overflow-hidden rounded-[32px]">
              <img
                src={artisanPortrait}
                alt="Portrait of an Indian artisan"
                loading="lazy"
                className="h-[560px] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 right-2 rounded-3xl bg-background px-6 py-5 text-ink shadow-2xl md:right-8">
              <div className="text-xs uppercase tracking-widest text-ink/50">Sellers earn</div>
              <div className="mt-1 text-display text-3xl">₹4.2Cr+</div>
              <div className="text-xs text-ink/50">paid last quarter</div>
            </div>
          </Reveal>

          <div className="lg:col-span-6 lg:col-start-7">
            <Reveal>
              <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-saffron">
                <span className="h-px w-8 bg-saffron/60" /> For makers
              </span>
              <h2 className="mt-4 text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Your craft, on
                <span className="text-serif italic text-saffron"> every continent.</span>
              </h2>
              <p className="mt-6 max-w-lg text-lg text-background/70">
                We built UdrCrafts for the potter in Khurja, the weaver in Kutch, the metalsmith
                in Moradabad. Global reach, zero overhead.
              </p>
            </Reveal>

            <div className="mt-12 space-y-2">
              {steps.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.08}>
                  <div className="group flex items-start gap-6 border-t border-background/10 py-6">
                    <div className="text-serif text-2xl text-saffron">{s.n}</div>
                    <div className="flex-1">
                      <div className="text-display text-xl">{s.t}</div>
                      <div className="mt-1 text-background/60">{s.d}</div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-background/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-saffron" />
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="mt-10">
              <button className="group inline-flex h-[54px] items-center gap-2 rounded-full bg-saffron px-8 text-sm font-medium text-ink transition hover:bg-saffron/90">
                Start selling today
                <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- delivery / global ---------- */

function Delivery() {
  return (
    <section className="py-28 lg:py-36">
      <Container>
        <div className="grid gap-6 lg:grid-cols-12">
          <Reveal className="lg:col-span-7 relative overflow-hidden rounded-[32px] bg-cream p-10 lg:p-14">
            <Eyebrow>From local markets</Eyebrow>
            <h2 className="mt-4 text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              From a village loom
              <br />
              to a <span className="text-serif italic text-terracotta">home in Oslo.</span>
            </h2>
            <p className="mt-6 max-w-md text-ink/60">
              We consolidate, quality-check, and ship every order through insured global
              partners — with plastic-free packaging designed in-house.
            </p>

              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-ink/10 pt-8">
                {[
                  { n: "6-9d", l: "Avg delivery" },
                  { n: "99.4%", l: "On-time rate" },
                  { n: "0", l: "Plastic used" },
                ].map((k) => (
                  <div key={k.l}>
                    <div className="text-display text-3xl">{k.n}</div>
                    <div className="mt-1 text-xs uppercase tracking-widest text-ink/50">
                      {k.l}
                    </div>
                  </div>
                ))}
              </div>

              {/* decorative route */}
              <svg
                viewBox="0 0 600 200"
                className="mt-10 h-32 w-full text-terracotta/60"
                fill="none"
              >
                <path
                  d="M20 150 Q 150 20, 300 100 T 580 60"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />
                <circle cx="20" cy="150" r="6" fill="currentColor" />
                <circle cx="580" cy="60" r="6" fill="currentColor" />
              </svg>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-5 relative overflow-hidden rounded-[32px]">
            <img
              src={storyPackaging}
              alt="Handcrafted UdrCrafts package with textile and brass"
              loading="lazy"
              className="h-full min-h-[420px] w-full object-cover"
            />
            <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-background/90 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-widest text-ink/50">
                Signature packaging
              </div>
              <div className="mt-1 text-display text-lg">
                Kraft, jute, marigold. Every parcel a keepsake.
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ---------- testimonials ---------- */

function Testimonials() {
  return (
    <section className="bg-cream/70 py-28 lg:py-36">
      <Container>
        <Reveal>
          <Eyebrow>Loved around the world</Eyebrow>
          <h2 className="mt-4 max-w-3xl text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            A quiet obsession, from
            <span className="text-serif italic text-terracotta"> Copenhagen to Kyoto.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <figure
                className={`flex h-full flex-col justify-between rounded-3xl border border-ink/5 bg-background p-8 ${
                  i === 1 ? "md:-translate-y-6" : ""
                }`}
              >
                <div>
                  <div className="mb-6 flex gap-1 text-saffron">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Star key={k} className="h-4 w-4 fill-saffron" />
                    ))}
                  </div>
                  <blockquote className="text-serif text-2xl leading-snug text-ink">
                    "{t.q}"
                  </blockquote>
                </div>
                <figcaption className="mt-8 flex items-center gap-3 border-t border-ink/5 pt-6">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-terracotta/20 text-display text-clay">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-ink/50">
                      {t.role} · {t.city}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- FAQ ---------- */

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-28 lg:py-36">
      <Container>
        <div className="grid gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-4 text-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              Everything you'd like
              <span className="text-serif italic text-terracotta"> to know.</span>
            </h2>
            <p className="mt-6 max-w-sm text-ink/60">
              Still curious? Our concierge team replies within 4 hours, in 8 languages.
            </p>
          </Reveal>

          <div className="lg:col-span-7">
            {faqs.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className="border-b border-ink/10">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className="text-display text-lg sm:text-xl">{f.q}</span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10">
                      {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 pr-16 text-ink/65">{f.a}</p>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- footer ---------- */

function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-background">
      <div className="pointer-events-none absolute -top-40 right-0 h-[420px] w-[420px] rounded-full bg-saffron/10 blur-3xl" />
      <Container className="relative py-24">
        {/* newsletter */}
        <div className="grid gap-10 border-b border-background/10 pb-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h3 className="text-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
              Stories from the
              <br />
              <span className="text-serif italic text-saffron">makers, monthly.</span>
            </h3>
          </div>
          <div className="lg:col-span-5">
            <p className="text-background/60">
              Behind-the-scenes journals, limited drops, and early access to new artisan
              collections.
            </p>
            <form className="mt-6 flex h-[54px] items-center gap-2 rounded-full border border-background/15 bg-background/[0.03] pl-6 pr-2">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-transparent text-sm placeholder:text-background/40 focus:outline-none"
              />
              <button className="inline-flex h-11 items-center gap-2 rounded-full bg-saffron px-5 text-sm font-medium text-ink transition hover:bg-saffron/90">
                Subscribe
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* links */}
        <div className="grid gap-10 py-16 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <a href="#" className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-saffron text-ink text-display">
                U
              </span>
              <span className="text-display text-2xl">UdrCrafts</span>
            </a>
            <p className="mt-5 max-w-xs text-background/60">
              From local markets to global homes — a marketplace built for India's artisans.
            </p>
            <div className="mt-6 flex gap-2">
              <a
                href="#"
                className="grid h-10 w-10 place-items-center rounded-full border border-background/15 text-background/70 transition hover:border-saffron hover:text-saffron"
              >
                <Globe className="h-4 w-4" />
              </a>
            </div>
          </div>

          {[
            {
              t: "Shop",
              l: ["New arrivals", "Bestsellers", "Collections", "Gift cards"],
            },
            {
              t: "Makers",
              l: ["Become a seller", "Seller stories", "Pricing", "Resources"],
            },
            {
              t: "Support",
              l: ["Help center", "Shipping", "Returns", "Contact"],
            },
          ].map((col) => (
            <div key={col.t}>
              <div className="text-xs uppercase tracking-widest text-background/50">{col.t}</div>
              <ul className="mt-5 space-y-3 text-background/80">
                {col.l.map((li) => (
                  <li key={li}>
                    <a href="#" className="transition hover:text-saffron">
                      {li}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* massive wordmark */}
        <div className="border-t border-background/10 pt-16">
          <div className="text-display text-[22vw] leading-none tracking-[-0.06em] text-background/[0.06]">
            UDRCRAFTS
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-background/50">
          <div>© 2026 UdrCrafts. Made with care in India.</div>
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" />
            <select className="bg-transparent focus:outline-none">
              <option className="text-ink">India (INR ₹)</option>
              <option className="text-ink">United States (USD $)</option>
              <option className="text-ink">United Kingdom (GBP £)</option>
              <option className="text-ink">Europe (EUR €)</option>
            </select>
          </div>
        </div>
      </Container>
    </footer>
  );
}

/* ---------- page ---------- */

function Home() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Categories />
        <Features />
        <Products />
        <SellerStory />
        <Delivery />
        <Testimonials />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}

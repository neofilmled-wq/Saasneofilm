'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import gsap from 'gsap';
import {
  Film, Megaphone, Monitor, Shield, Tv, MapPin, BarChart3,
  Zap, Eye, Target, DollarSign, Users, CheckCircle2, ArrowRight,
  ArrowUpRight, Building2, UtensilsCrossed, Palmtree, Landmark, Store,
  Hotel, Home, ChevronRight, Sparkles, Play, Check,
} from 'lucide-react';
import { SectionReveal } from '@/components/section-reveal';
import { Navbar } from '@/components/navbar';

/* ------------------------------------------------------------------ */
/*  URLs                                                               */
/* ------------------------------------------------------------------ */

const URLS = {
  advertiser: process.env.NEXT_PUBLIC_ADVERTISER_URL ?? 'http://localhost:3003/login',
  partner: process.env.NEXT_PUBLIC_PARTNER_URL ?? 'http://localhost:3002/login',
  admin: process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3000/login',
  advertiserSignup: process.env.NEXT_PUBLIC_ADVERTISER_SIGNUP_URL ?? 'http://localhost:3003/signup',
  partnerSignup: process.env.NEXT_PUBLIC_PARTNER_SIGNUP_URL ?? 'http://localhost:3002/signup',
} as const;

const DASHBOARD_URLS = {
  advertiser: process.env.NEXT_PUBLIC_ADVERTISER_DASHBOARD_URL ?? 'http://localhost:3003/campaigns',
  partner: process.env.NEXT_PUBLIC_PARTNER_DASHBOARD_URL ?? 'http://localhost:3002/partner/screens',
  admin: process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL ?? 'http://localhost:3000/admin',
} as const;

type InterfaceType = 'advertiser' | 'partner' | 'admin';

function detectAuth(): InterfaceType | null {
  try {
    if (localStorage.getItem('neofilm_admin_token')) return 'admin';
    if (localStorage.getItem('neofilm_partner_token')) return 'partner';
    if (localStorage.getItem('neofilm_adv_token')) return 'advertiser';
  } catch { /* noop */ }
  return null;
}

/* ------------------------------------------------------------------ */
/*  1. HERO                                                            */
/* ------------------------------------------------------------------ */

const TV_AD_CAMPAIGNS = [
  {
    title: 'La Brasserie du Port',
    desc: 'Menu du jour \u00e0 12\u20ac \u2014 Poisson frais & dessert maison',
    badge: 'Restaurant',
    gradient: 'from-amber-500/90 to-orange-600/90',
    icon: UtensilsCrossed,
  },
  {
    title: 'Jet Ski Azur',
    desc: 'Sessions jet ski d\u00e8s 45\u20ac \u2014 R\u00e9servez en ligne',
    badge: 'Activit\u00e9',
    gradient: 'from-cyan-500/90 to-blue-600/90',
    icon: Palmtree,
  },
  {
    title: 'March\u00e9 Proven\u00e7al',
    desc: 'Tous les dimanches \u2014 Place de l\u2019\u00c9glise, 8h\u201313h',
    badge: '\u00c9v\u00e9nement',
    gradient: 'from-emerald-500/90 to-teal-600/90',
    icon: Store,
  },
  {
    title: 'Spa & Bien-\u00eatre',
    desc: 'Massages, hammam, soins \u2014 \u221220% cette semaine',
    badge: 'Promo',
    gradient: 'from-violet-500/90 to-purple-600/90',
    icon: Sparkles,
  },
  {
    title: 'Mus\u00e9e Oc\u00e9anographique',
    desc: 'Exposition immersive \u2014 Tarif r\u00e9duit visiteurs',
    badge: 'Culture',
    gradient: 'from-blue-500/90 to-indigo-600/90',
    icon: Landmark,
  },
  {
    title: 'Navette A\u00e9roport',
    desc: 'Transferts 24/7 \u2014 R\u00e9servation instantan\u00e9e',
    badge: 'Transport',
    gradient: 'from-rose-500/90 to-pink-600/90',
    icon: MapPin,
  },
];

function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const tvRef = useRef<HTMLDivElement>(null);
  const adCardsRef = useRef<HTMLDivElement>(null);
  const logoGridRef = useRef<HTMLDivElement>(null);
  const tvWrapperRef = useRef<HTMLDivElement>(null);

  // Scroll-driven reveal for TV ad cards
  const handleScroll = useCallback(() => {
    if (!adCardsRef.current || !tvRef.current) return;
    const tvRect = tvRef.current.getBoundingClientRect();
    const viewH = window.innerHeight;

    // Calculate how far the TV is scrolled into view (0 to 1+)
    const scrollProgress = Math.max(0, (viewH - tvRect.top) / (viewH + tvRect.height));

    const cards = adCardsRef.current.children;
    const total = cards.length;
    for (let i = 0; i < total; i++) {
      // Dramatic 3D slide-in from right
      const cardStart = 0.10 + (i * 0.032);
      const cardEnd = cardStart + 0.12;
      const progress = Math.min(1, Math.max(0, (scrollProgress - cardStart) / (cardEnd - cardStart)));
      const card = cards[i] as HTMLElement;
      // Elastic ease
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      card.style.opacity = String(eased);
      const translateX = 80 * (1 - eased);
      const scale = 0.7 + 0.3 * eased;
      const rotateY = 15 * (1 - eased);
      card.style.transform = `perspective(600px) translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`;
      if (eased >= 0.95 && !card.classList.contains('visible')) {
        card.classList.add('visible');
        card.style.setProperty('--shimmer-delay', `${i * 0.7}s`);
        card.style.setProperty('--breathe-delay', `${i * 0.4}s`);
      }
    }

    // Scroll-reveal for logo grid — 3D perspective flip-in per cell
    if (logoGridRef.current) {
      const logos = logoGridRef.current.children;
      for (let i = 0; i < logos.length; i++) {
        const cellStart = 0.08 + (i * 0.028);
        const cellEnd = cellStart + 0.12;
        const progress = Math.min(1, Math.max(0, (scrollProgress - cellStart) / (cellEnd - cellStart)));
        const logo = logos[i] as HTMLElement;
        // Eased progress for snappier feel
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        logo.style.opacity = String(eased);
        const scale = 0.4 + 0.6 * eased;
        const rotateX = 40 * (1 - eased);
        const rotateZ = 6 * (1 - eased) * (i % 2 === 0 ? 1 : -1);
        const translateY = 30 * (1 - eased);
        logo.style.transform = `perspective(600px) translateY(${translateY}px) scale(${scale}) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`;
        if (eased >= 0.95 && !logo.classList.contains('logo-card-revealed')) {
          logo.classList.add('logo-card-revealed');
          logo.style.setProperty('--float-delay', `${i * 0.5}s`);
        }
      }
    }
  }, []);

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { handleScroll(); rafId = 0; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    handleScroll();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(rafId); };
  }, [handleScroll]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (leftRef.current) {
        tl.fromTo(
          leftRef.current.children,
          { opacity: 0, y: 40, filter: 'blur(10px)', scale: 0.95 },
          { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out' }
        );
      }

      if (rightRef.current) {
        tl.fromTo(
          rightRef.current.children,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
          '-=0.3'
        );
      }

      if (tvRef.current) {
        tl.fromTo(
          tvRef.current,
          { opacity: 0, y: 80, scale: 0.88, rotateX: 8, transformPerspective: 1200 },
          { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 1.2, ease: 'power3.out' },
          '-=0.2'
        );
      }
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const stats = [
    { value: '150+', label: '\u00c9crans actifs', desc: 'R\u00e9seau en expansion' },
    { value: '60+', label: 'Partenaires', desc: 'Lieux premium' },
    { value: '<5min', label: 'Installation', desc: 'Plug & play' },
    { value: '24/7', label: 'Analytics', desc: 'Temps r\u00e9el' },
  ];

  return (
    <section ref={heroRef} className="relative flex flex-col overflow-hidden bg-white">
      {/* Dynamic background — lightweight orbs + grid (no blur filters) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-grid absolute inset-0" />
        <div className="hero-orb hero-orb-1" style={{ top: '-15%', right: '-10%' }} />
        <div className="hero-orb hero-orb-2" style={{ bottom: '5%', left: '-12%' }} />
        <div className="hero-orb hero-orb-3" style={{ top: '25%', left: '50%' }} />
      </div>

      <Navbar />

      {/* Hero split content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-32 pb-12 text-center sm:px-6 lg:pt-36 lg:pb-14">
        {/* Left — text + CTA */}
        <div ref={leftRef}>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-600" style={{ opacity: 0 }}>
            <Sparkles className="h-3.5 w-3.5" />
            Affichage digital nouvelle g&eacute;n&eacute;ration
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-[3.5rem]" style={{ opacity: 0 }}>
            Diffusez vos campagnes sur les &eacute;crans les plus{' '}
            <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">fr&eacute;quent&eacute;s.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-gray-500" style={{ opacity: 0 }}>
            Automatisez la diffusion de vos publicit&eacute;s locales et touchez les voyageurs au bon moment gr&acirc;ce &agrave; un r&eacute;seau d&apos;&eacute;crans intelligent.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ opacity: 0 }}>
            <button
              onClick={() => { window.location.href = URLS.advertiserSignup; }}
              className="cta-primary group flex items-center justify-center gap-2 rounded-lg bg-[#0B1220] px-7 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#151f33] hover:shadow-lg"
            >
              Commencer gratuitement
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => { window.location.href = URLS.partnerSignup; }}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-7 py-3.5 text-[15px] font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              Devenir partenaire
            </button>
          </div>
        </div>

      </div>

      {/* TV Mockup — real image frame + scroll-reveal ad campaigns */}
      <div ref={tvWrapperRef} className="relative mx-auto w-full max-w-[1600px] px-4 pb-4 sm:px-6">
        {/* Soft glow behind TV — no blur filter, uses pre-blurred gradient */}
        <div className="pointer-events-none absolute -inset-x-12 -top-16 bottom-0 rounded-3xl bg-gradient-to-b from-blue-50/80 via-violet-50/40 to-transparent" style={{ filter: 'blur(60px)' }} />

        <div ref={tvRef} className="relative z-10" style={{ opacity: 0, filter: 'drop-shadow(0 40px 80px rgba(59,130,246,0.35)) drop-shadow(0 15px 35px rgba(168,85,247,0.25)) drop-shadow(0 5px 12px rgba(236,72,153,0.2))' }}>
          {/* Screen content — behind the TV frame, fills the white screen area */}
          <div className="absolute z-0 overflow-hidden" style={{ top: '10.5%', left: '8%', right: '7.5%', bottom: '17.5%' }}>
            <div className="flex h-full w-full overflow-hidden rounded-[2px] bg-[#0a0f1a]">
              {/* LEFT 70% — TV Channel area */}
              <div className="relative flex w-[70%] flex-col">
                {/* Top nav bar */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600">
                      <Film className="h-2.5 w-2.5 text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white">NeoFilm TV</span>
                    <span className="text-[9px] text-gray-500">&mdash; H&ocirc;tel Belvista</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-gray-500">En direct</span>
                  </div>
                </div>

                {/* Tab navigation */}
                <div className="flex gap-1 px-4 pb-2">
                  {['TNT', 'Streaming', 'Activit\u00e9s', 'Infos'].map((tab, i) => (
                    <span
                      key={tab}
                      className={`rounded-md px-3 py-1 text-[9px] font-semibold ${
                        i === 1
                          ? 'tv-tab-active bg-blue-600 text-white'
                          : 'bg-white/[0.06] text-gray-400'
                      }`}
                    >
                      {tab}
                    </span>
                  ))}
                </div>

                {/* Streaming content — app grid with REAL logos */}
                <div className="flex-1 overflow-hidden p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Vos applications</p>
                  <div ref={logoGridRef} className="grid grid-cols-3 gap-3">
                    {[
                      { src: '/logos/netflix.png', alt: 'Netflix', size: 'max-h-[55%] w-[55%]' },
                      { src: '/logos/disney-plus.png', alt: 'Disney+', size: 'max-h-[55%] w-[55%]' },
                      { src: '/logos/prime-video.png', alt: 'Prime Video', size: 'max-h-[90%] w-[90%]' },
                      { src: '/logos/youtube.png', alt: 'YouTube', size: 'max-h-[55%] w-[55%]' },
                      { src: '/logos/twitch.svg', alt: 'Twitch', size: 'max-h-[55%] w-[55%]' },
                      { src: '/logos/spotify.png', alt: 'Spotify', size: 'max-h-[90%] w-[90%]' },
                    ].map((logo) => (
                      <div key={logo.alt} className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/10 p-2" style={{ opacity: 0 }}>
                        <img src={logo.src} alt={logo.alt} className={`${logo.size} object-contain`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT 30% — Ad zone (annonceurs) */}
              <div className="relative flex w-[30%] flex-col border-l border-white/[0.06] bg-[#0d1929]">
                {/* Ad zone header */}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Annonces</span>
                  <Megaphone className="h-3 w-3 text-gray-600" />
                </div>

                {/* Ad cards — scroll-reveal */}
                <div ref={adCardsRef} className="flex flex-1 flex-col gap-2 overflow-hidden px-2 pb-2">
                  {TV_AD_CAMPAIGNS.map((ad) => (
                    <div
                      key={ad.title}
                      className={`tv-ad-card relative overflow-hidden bg-gradient-to-br ${ad.gradient}`}
                      style={{ opacity: 0 }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20">
                        <ad.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-[11px] font-bold leading-tight text-white">{ad.title}</h4>
                        <p className="truncate text-[9px] leading-tight text-white/70">{ad.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom fade */}
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-10 bg-gradient-to-t from-[#0d1929] to-transparent" />
              </div>
            </div>
          </div>

          {/* TV frame image — on top with multiply blend: white screen becomes see-through, dark bezels stay */}
          <img
            src="/tv-mockup.webp"
            alt=""
            className="pointer-events-none relative z-10 block w-full mix-blend-multiply"
            draggable={false}
          />
        </div>

      </div>

      {/* Stats banner — horizontal strip below TV */}
      <div ref={rightRef} className="relative mx-auto -mt-2 flex w-full max-w-5xl items-stretch justify-center rounded-2xl border border-gray-100 bg-white/80 px-4 shadow-sm backdrop-blur-sm sm:px-6">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-1 flex-col items-center justify-center py-6 ${
              i < stats.length - 1 ? 'border-r border-gray-100' : ''
            }`}
          >
            <p className="stat-value text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl" style={{ '--stat-delay': `${i * 0.5}s` } as React.CSSProperties}>{s.value}</p>
            <p className="mt-1 text-xs font-semibold text-gray-700 sm:text-sm">{s.label}</p>
            <p className="mt-0.5 text-[10px] text-gray-400 sm:text-xs">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-6" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  2. PROBLEME — Scroll-driven reveal                                 */
/* ------------------------------------------------------------------ */

function ProblemLine({ text }: { text: string; index: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.78', 'start 0.45'],
  });

  // Phase 1: appear (0→0.35)
  const textOpacity = useTransform(scrollYProgress, [0, 0.35], [0, 1]);
  const textY = useTransform(scrollYProgress, [0, 0.35], [20, 0]);
  // Phase 2: strikethrough draws (0.4→0.65)
  const strikeScaleX = useTransform(scrollYProgress, [0.4, 0.65], [0, 1]);
  // Phase 3: text fades after strike (0.6→0.85)
  const textDim = useTransform(scrollYProgress, [0.6, 0.85], [1, 0.25]);
  // Flash on strike
  const flashOpacity = useTransform(scrollYProgress, [0.4, 0.5, 0.6], [0, 0.06, 0]);

  return (
    <motion.div ref={ref} className="relative">
      <motion.p
        style={{
          opacity: useTransform([textOpacity, textDim], ([a, b]) => (a as number) * (b as number)),
          y: textY,
        }}
        className="text-2xl font-semibold text-gray-400 sm:text-4xl lg:text-[2.75rem]"
      >
        {text}
      </motion.p>
      {/* Strikethrough */}
      <motion.div
        style={{ scaleX: strikeScaleX }}
        className="absolute top-1/2 left-0 h-[2px] w-full origin-left bg-red-400/60"
      />
      {/* Subtle flash */}
      <motion.div
        style={{ opacity: flashOpacity }}
        className="absolute inset-0 rounded bg-red-400/20"
      />
    </motion.div>
  );
}

function ProblemSection() {
  const problems = [
    'Publicités Facebook ignorées.',
    'Flyers jetés à la poubelle.',
    'Affichage urbain hors de prix.',
    'Écrans TV qui ne rapportent rien.',
  ];

  const promiseRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: promiseProgress } = useScroll({
    target: promiseRef,
    offset: ['start 0.8', 'start 0.3'],
  });

  const promiseWords = ['Il', 'existe', 'une'];
  const highlightWords = ['meilleure', 'approche.'];

  return (
    <section className="px-4 py-32 sm:py-44">
      <div className="mx-auto max-w-4xl">
        {/* Striking out the old ways — each line driven by its own scroll position */}
        <div className="space-y-8 sm:space-y-10">
          {problems.map((text, i) => (
            <ProblemLine key={text} text={text} index={i} total={problems.length} />
          ))}
        </div>

        {/* The promise — word by word, scroll driven */}
        <div ref={promiseRef} className="mt-24 sm:mt-32">
          <p className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {promiseWords.map((word, i) => {
              const start = 0.0 + i * 0.08;
              const end = start + 0.2;
              return (
                <ScrollWord key={word} word={word} progress={promiseProgress} range={[start, end]} className="text-gray-900" />
              );
            })}
            {highlightWords.map((word, i) => {
              const start = 0.3 + i * 0.1;
              const end = start + 0.25;
              return (
                <ScrollWord key={word} word={word} progress={promiseProgress} range={[start, end]} className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent" scale />
              );
            })}
          </p>

          {/* Subtitle with gradient line reveal */}
          <div className="relative mt-8">
            <motion.div
              style={{
                scaleX: useTransform(promiseProgress, [0.6, 0.8], [0, 1]),
              }}
              className="mb-6 h-px w-32 origin-left bg-gradient-to-r from-blue-500 to-transparent"
            />
            <motion.p
              style={{
                opacity: useTransform(promiseProgress, [0.7, 0.9], [0, 1]),
                y: useTransform(promiseProgress, [0.7, 0.9], [15, 0]),
              }}
              className="max-w-xl text-lg leading-relaxed text-gray-400"
            >
              Un réseau d&apos;écrans intelligents qui connecte annonceurs locaux et voyageurs, directement dans les lieux qu&apos;ils visitent.
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A single word that fades/slides in based on parent scroll progress */
function ScrollWord({
  word, progress, range, className, scale: doScale,
}: {
  word: string;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  range: [number, number];
  className: string;
  scale?: boolean;
}) {
  const opacity = useTransform(progress, range, [0, 1]);
  const y = useTransform(progress, range, [doScale ? 40 : 25, 0]);
  const scaleVal = useTransform(progress, range, doScale ? [0.85, 1] : [1, 1]);
  const blur = useTransform(progress, range, [8, 0]);

  return (
    <motion.span
      style={{
        opacity,
        y,
        scale: scaleVal,
        filter: useTransform(blur, (v) => `blur(${v}px)`),
      }}
      className={`mr-[0.3em] inline-block ${className}`}
    >
      {word}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/*  3. COMMENT CA MARCHE — Scroll-driven steps                         */
/* ------------------------------------------------------------------ */

function HowItWorksStep({ step, index }: { step: { n: string; title: string; desc: string; I: typeof Tv; accent: string }; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.9', 'start 0.35'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.25], [0, 1]);
  const numScale = useTransform(scrollYProgress, [0, 0.3], [0.5, 1]);
  const numBlur = useTransform(scrollYProgress, [0, 0.25], [14, 0]);
  const titleY = useTransform(scrollYProgress, [0.15, 0.4], [25, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0.15, 0.4], [0, 1]);
  const underlineWidth = useTransform(scrollYProgress, [0.35, 0.6], ['0%', '100%']);
  const descX = useTransform(scrollYProgress, [0.25, 0.55], [40, 0]);
  const descOpacity = useTransform(scrollYProgress, [0.25, 0.55], [0, 1]);
  const descBlur = useTransform(scrollYProgress, [0.25, 0.5], [6, 0]);
  const dotScale = useTransform(scrollYProgress, [0.1, 0.3], [0, 1]);
  const pulseScale = useTransform(scrollYProgress, [0.3, 0.6], [0.8, 2.5]);
  const pulseOpacity = useTransform(scrollYProgress, [0.3, 0.45, 0.6], [0, 0.4, 0]);

  return (
    <motion.div
      ref={ref}
      style={{ opacity }}
      className={`group relative grid items-center gap-8 py-16 sm:py-24 md:grid-cols-[80px_1fr_1.2fr] ${index < 2 ? 'border-b border-gray-50' : ''}`}
    >
      {/* Step indicator — animated dot */}
      <div className="hidden md:flex md:justify-center">
        <motion.div style={{ scale: dotScale }} className="relative">
          <motion.div
            style={{ scale: pulseScale, opacity: pulseOpacity }}
            className={`absolute inset-0 rounded-full bg-gradient-to-r ${step.accent}`}
          />
          <div className={`relative flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r ${step.accent} shadow-sm`}>
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
          </div>
        </motion.div>
      </div>

      {/* Big number + title */}
      <div className="relative">
        <motion.span
          style={{
            scale: numScale,
            filter: useTransform(numBlur, (v) => `blur(${v}px)`),
          }}
          className="block text-[100px] font-black leading-none text-gray-100 transition-colors duration-500 group-hover:text-gray-200 sm:text-[140px] lg:text-[180px]"
        >
          {step.n}
        </motion.span>
        <motion.h3
          style={{ opacity: titleOpacity, y: titleY }}
          className="-mt-5 text-3xl font-bold tracking-tight text-gray-900 sm:-mt-7 sm:text-4xl lg:text-5xl"
        >
          {step.title}
          <motion.span
            style={{ width: underlineWidth }}
            className={`mt-3 block h-[3px] max-w-[2em] rounded-full bg-gradient-to-r ${step.accent}`}
          />
        </motion.h3>
      </div>

      {/* Description + icon */}
      <motion.div
        style={{
          opacity: descOpacity,
          x: descX,
          filter: useTransform(descBlur, (v) => `blur(${v}px)`),
        }}
        className="flex items-start gap-5"
      >
        <motion.div
          whileHover={{ rotate: 8, scale: 1.1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-50 transition-colors duration-300 group-hover:bg-gray-100"
        >
          <step.I className="h-5 w-5 text-gray-300 transition-colors duration-300 group-hover:text-gray-500" />
        </motion.div>
        <p className="text-lg leading-relaxed text-gray-400 transition-colors duration-300 group-hover:text-gray-600 sm:text-xl">
          {step.desc}
        </p>
      </motion.div>
    </motion.div>
  );
}

function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 0.8', 'end 0.4'],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 0.9], [0, 1]);

  const steps = [
    {
      n: '01',
      title: 'Installez',
      desc: 'Les partenaires activent NeoFilm sur leurs TV en quelques minutes. Aucune configuration technique requise.',
      I: Tv,
      accent: 'from-blue-500 to-blue-600',
    },
    {
      n: '02',
      title: 'Diffusez',
      desc: 'Les annonceurs locaux créent leurs campagnes, choisissent les écrans et lancent en un clic.',
      I: Megaphone,
      accent: 'from-violet-500 to-violet-600',
    },
    {
      n: '03',
      title: 'Convertissez',
      desc: 'Les voyageurs découvrent vos offres directement sur l\'écran de leur logement, au bon moment.',
      I: MapPin,
      accent: 'from-emerald-500 to-emerald-600',
    },
  ];

  return (
    <section className="px-4 py-32 sm:py-44">
      <div ref={sectionRef} className="mx-auto max-w-5xl">
        {/* Vertical progress line that grows with scroll */}
        <div className="relative">
          <motion.div
            style={{ scaleY: lineScaleY }}
            className="absolute top-0 left-8 hidden h-full w-px origin-top bg-gradient-to-b from-blue-200 via-violet-200 to-emerald-200 md:block"
          />

          <div className="space-y-0">
            {steps.map((s, i) => (
              <HowItWorksStep key={s.n} step={s} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  4. AVANTAGES ANNONCEUR                                             */
/* ------------------------------------------------------------------ */

/* ── Leaflet map (dynamic import — needs window) ── */
import dynamic from 'next/dynamic';
const LeafletMap = dynamic(() => import('@/components/leaflet-map'), { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-gray-50"><div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" /></div> });

/* ── Screen pin data: 100 screens across France, 50 clustered in Clermont-Ferrand ── */
const SCREEN_PINS: { id: number; lat: number; lng: number; label: string; type: string }[] = [
  // ── 50 major French cities ──
  { id: 1, lat: 48.8566, lng: 2.3522, label: 'Cinéma Pathé — Paris', type: 'cinema' },
  { id: 2, lat: 48.8606, lng: 2.3376, label: 'Hôtel du Louvre — Paris 1er', type: 'hotel' },
  { id: 3, lat: 48.8738, lng: 2.2950, label: 'UGC Étoile — Paris 17e', type: 'cinema' },
  { id: 4, lat: 48.8450, lng: 2.3740, label: 'Novotel Bastille — Paris 11e', type: 'hotel' },
  { id: 5, lat: 48.8530, lng: 2.3499, label: 'MK2 Odéon — Paris 6e', type: 'cinema' },
  { id: 6, lat: 43.2965, lng: 5.3698, label: 'Pathé Madeleine — Marseille', type: 'cinema' },
  { id: 7, lat: 43.3002, lng: 5.3810, label: 'Ibis Vieux-Port — Marseille', type: 'hotel' },
  { id: 8, lat: 45.7640, lng: 4.8357, label: 'UGC Confluence — Lyon', type: 'cinema' },
  { id: 9, lat: 45.7580, lng: 4.8320, label: 'Accor Perrache — Lyon', type: 'hotel' },
  { id: 10, lat: 45.7710, lng: 4.8500, label: 'Pathé Bellecour — Lyon', type: 'cinema' },
  { id: 11, lat: 43.6047, lng: 1.4442, label: 'CGR Blagnac — Toulouse', type: 'cinema' },
  { id: 12, lat: 43.6100, lng: 1.4500, label: 'Novotel Centre — Toulouse', type: 'hotel' },
  { id: 13, lat: 43.7102, lng: 7.2620, label: 'Pathé Masséna — Nice', type: 'cinema' },
  { id: 14, lat: 43.7050, lng: 7.2680, label: 'Marriott Promenade — Nice', type: 'hotel' },
  { id: 15, lat: 47.2184, lng: -1.5536, label: 'Gaumont Nantes — Nantes', type: 'cinema' },
  { id: 16, lat: 47.2130, lng: -1.5600, label: 'Ibis Centre — Nantes', type: 'hotel' },
  { id: 17, lat: 48.5734, lng: 7.7521, label: 'UGC Ciné Cité — Strasbourg', type: 'cinema' },
  { id: 18, lat: 48.5800, lng: 7.7500, label: 'Hilton — Strasbourg', type: 'hotel' },
  { id: 19, lat: 44.8378, lng: -0.5792, label: 'UGC Talence — Bordeaux', type: 'cinema' },
  { id: 20, lat: 44.8420, lng: -0.5730, label: 'Mercure Centre — Bordeaux', type: 'hotel' },
  { id: 21, lat: 48.1173, lng: -1.6778, label: 'Gaumont Rennes — Rennes', type: 'cinema' },
  { id: 22, lat: 50.6292, lng: 3.0573, label: 'UGC Lille — Lille', type: 'cinema' },
  { id: 23, lat: 50.6350, lng: 3.0630, label: 'Novotel Gare — Lille', type: 'hotel' },
  { id: 24, lat: 43.6108, lng: 3.8767, label: 'Gaumont Odysseum — Montpellier', type: 'cinema' },
  { id: 25, lat: 43.6150, lng: 3.8800, label: 'Ibis Comédie — Montpellier', type: 'hotel' },
  { id: 26, lat: 47.3220, lng: 5.0415, label: 'Pathé Dijon — Dijon', type: 'cinema' },
  { id: 27, lat: 49.4432, lng: 1.0993, label: 'Pathé Rouen — Rouen', type: 'cinema' },
  { id: 28, lat: 49.2583, lng: 4.0317, label: 'CGR Reims — Reims', type: 'cinema' },
  { id: 29, lat: 47.3941, lng: 0.6848, label: 'CGR Tours — Tours', type: 'cinema' },
  { id: 30, lat: 48.3904, lng: -4.4861, label: 'Multiplexe Brest — Brest', type: 'cinema' },
  { id: 31, lat: 43.1242, lng: 5.9280, label: 'Pathé Liberté — Toulon', type: 'cinema' },
  { id: 32, lat: 46.5802, lng: 0.3404, label: 'CGR Poitiers — Poitiers', type: 'cinema' },
  { id: 33, lat: 47.4784, lng: -0.5632, label: 'Pathé Angers — Angers', type: 'cinema' },
  { id: 34, lat: 48.4469, lng: -4.4183, label: 'Ibis Brest Centre — Brest', type: 'hotel' },
  { id: 35, lat: 43.8367, lng: 4.3601, label: 'Gaumont Nîmes — Nîmes', type: 'cinema' },
  { id: 36, lat: 44.9334, lng: 4.8924, label: 'Pathé Valence — Valence', type: 'cinema' },
  { id: 37, lat: 49.1829, lng: -0.3707, label: 'Pathé Caen — Caen', type: 'cinema' },
  { id: 38, lat: 45.4397, lng: 4.3872, label: 'CGR Saint-Étienne — Saint-Étienne', type: 'cinema' },
  { id: 39, lat: 48.0846, lng: -1.6809, label: 'Novotel Gare — Rennes', type: 'hotel' },
  { id: 40, lat: 43.9493, lng: 4.8059, label: 'Pathé Cap Sud — Avignon', type: 'cinema' },
  { id: 41, lat: 46.1591, lng: -1.1520, label: 'CGR La Rochelle — La Rochelle', type: 'cinema' },
  { id: 42, lat: 45.1885, lng: 5.7245, label: 'Pathé Échirolles — Grenoble', type: 'cinema' },
  { id: 43, lat: 45.1920, lng: 5.7300, label: 'Ibis Grenoble — Grenoble', type: 'hotel' },
  { id: 44, lat: 48.6921, lng: 6.1844, label: 'UGC Nancy — Nancy', type: 'cinema' },
  { id: 45, lat: 49.8941, lng: 2.2958, label: 'Gaumont Amiens — Amiens', type: 'cinema' },
  { id: 46, lat: 47.7508, lng: 7.3359, label: 'Pathé Mulhouse — Mulhouse', type: 'cinema' },
  { id: 47, lat: 48.2020, lng: -2.9326, label: 'Cinéland — Saint-Brieuc', type: 'cinema' },
  { id: 48, lat: 46.3234, lng: -0.4564, label: 'CGR Niort — Niort', type: 'cinema' },
  { id: 49, lat: 42.6887, lng: 2.8948, label: 'Méga Castillet — Perpignan', type: 'cinema' },
  { id: 50, lat: 44.5588, lng: 6.0795, label: 'Ibis Gap Centre — Gap', type: 'hotel' },
  // ── 50 screens in Clermont-Ferrand area ──
  ...Array.from({ length: 50 }, (_, i) => {
    const angle = (i / 50) * Math.PI * 2 + (i % 7) * 0.3;
    const radius = 0.005 + (i % 5) * 0.004 + Math.random() * 0.003;
    return {
      id: 51 + i,
      lat: 45.7772 + Math.cos(angle) * radius * (1 + (i % 3) * 0.5),
      lng: 3.0870 + Math.sin(angle) * radius * 1.3 * (1 + (i % 4) * 0.3),
      label: `Écran ${i + 1} — Clermont-Fd`,
      type: i % 2 === 0 ? 'cinema' : 'hotel',
    };
  }),
];

/* ── Scroll-Driven Content Wave ── */
const WAVE_ITEMS: { label: string; img: string; Icon: typeof Film }[] = [
  { label: 'Restaurants', Icon: UtensilsCrossed, img: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=900&fit=crop&q=80' },
  { label: 'Commerces', Icon: Store, img: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=600&h=900&fit=crop&q=80' },
  { label: 'Spectacles', Icon: Building2, img: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=900&fit=crop&q=80' },
  { label: 'Tourisme', Icon: Palmtree, img: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=600&h=900&fit=crop&q=80' },
  { label: 'Mairies', Icon: Landmark, img: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=600&h=900&fit=crop&q=80' },
  { label: 'Hôtels', Icon: Hotel, img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&h=900&fit=crop&q=80' },
  { label: 'Cinémas', Icon: Film, img: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&h=900&fit=crop&q=80' },
  { label: 'Événements', Icon: Users, img: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&h=900&fit=crop&q=80' },
  { label: 'Centres commerciaux', Icon: Store, img: 'https://images.unsplash.com/photo-1581417478175-a9ef18f210c2?w=600&h=900&fit=crop&q=80' },
  { label: 'Aéroports', Icon: Monitor, img: 'https://images.unsplash.com/photo-1556388158-158ea5ccacbd?w=600&h=900&fit=crop&q=80' },
  { label: 'Gares', Icon: Home, img: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&h=900&fit=crop&q=80' },
  { label: 'Salles de sport', Icon: Zap, img: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=600&h=900&fit=crop&q=80' },
  { label: 'Pharmacies', Icon: Shield, img: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=600&h=900&fit=crop&q=80' },
  { label: 'Bars & Cafés', Icon: UtensilsCrossed, img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=900&fit=crop&q=80' },
  { label: 'Musées', Icon: Eye, img: 'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=600&h=900&fit=crop&q=80' },
  { label: 'Coworking', Icon: Sparkles, img: 'https://images.unsplash.com/photo-1527192491265-7e15c55b1ed2?w=600&h=900&fit=crop&q=80' },
];

function ContentWave() {
  const listRef = useRef<HTMLUListElement>(null);

  // Mouse drag-to-scroll with dead-zone to prevent jitter
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;
    const DRAG_THRESHOLD = 5;

    const onDown = (e: MouseEvent) => {
      isDown = true;
      isDragging = false;
      startX = e.pageX;
      scrollLeft = list.scrollLeft;
    };
    const onUp = () => {
      if (isDragging) list.style.cursor = 'grab';
      isDown = false;
      isDragging = false;
    };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (!isDragging && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!isDragging) { isDragging = true; list.style.cursor = 'grabbing'; }
      e.preventDefault();
      list.scrollLeft = scrollLeft - dx;
    };

    list.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => { list.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove); };
  }, []);

  return (
    <div className="content-wave-container relative overflow-hidden rounded-xl">
      <ul
        ref={listRef}
        className="content-wave-list flex items-end gap-4 overflow-x-auto px-8 pt-16 pb-4"
        style={{
          scrollbarWidth: 'none',
          height: 'clamp(280px, 35vw, 400px)',
        }}
      >
        {WAVE_ITEMS.map((item) => (
          <li key={item.label} className="content-wave-item flex shrink-0 items-end">
            <article className="content-wave-card relative flex flex-col justify-end overflow-hidden rounded-xl shadow-lg" style={{ aspectRatio: '2/3', height: 'clamp(180px, 22vw, 280px)' }}>
              <div className="relative flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.img}
                  alt={item.label}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
                  draggable={false}
                  style={{ filter: 'brightness(1.05) saturate(1.1)' }}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                  <item.Icon className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="truncate text-xs font-semibold uppercase tracking-wider text-white">{item.label}</span>
              </div>
            </article>
          </li>
        ))}
      </ul>
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}

/* ── Auto-selection animation: picks 50 pins with accelerating pace, diffuses, resets, loops ── */
function useAutoSelectAnimation() {
  const [selectedPins, setSelectedPins] = useState<number[]>([]);
  const [phase, setPhase] = useState<'selecting' | 'diffusing' | 'done' | 'idle'>('idle');
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef(0);

  // Shuffled order of pin IDs to select (pick 50 out of 100)
  const selectionOrder = useRef<number[]>([]);

  const startCycle = useCallback(() => {
    // Shuffle all pin IDs and pick first 50
    const shuffled = SCREEN_PINS.map((p) => p.id).sort(() => Math.random() - 0.5);
    selectionOrder.current = shuffled.slice(0, 50);
    cycleRef.current = 0;
    setSelectedPins([]);
    setPhase('selecting');
  }, []);

  useEffect(() => {
    // Start first cycle after 1.5s
    const initTimer = setTimeout(startCycle, 1500);
    return () => { clearTimeout(initTimer); if (animRef.current) clearTimeout(animRef.current); };
  }, [startCycle]);

  useEffect(() => {
    if (phase !== 'selecting') return;

    const idx = cycleRef.current;
    if (idx >= 50) {
      // All 50 selected — trigger diffuse
      setPhase('diffusing');
      animRef.current = setTimeout(() => setPhase('done'), 3000);
      return;
    }

    // Accelerating delay: starts at 600ms, ends around 80ms
    const progress = idx / 50;
    const delay = Math.max(80, 600 * (1 - progress * progress));

    animRef.current = setTimeout(() => {
      const pinId = selectionOrder.current[idx];
      setSelectedPins((prev) => [...prev, pinId]);
      cycleRef.current = idx + 1;
      // Trigger re-render to continue loop
      setPhase('selecting');
    }, delay);

    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [phase, selectedPins.length]);

  useEffect(() => {
    if (phase === 'done') {
      // Hold for 2s then reset and start new cycle
      animRef.current = setTimeout(() => {
        setSelectedPins([]);
        setPhase('idle');
        setTimeout(startCycle, 1500);
      }, 2500);
      return () => { if (animRef.current) clearTimeout(animRef.current); };
    }
  }, [phase, startCycle]);

  return { selectedPins, phase };
}

function AdvertiserSection() {
  const [activeStep, setActiveStep] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { selectedPins, phase } = useAutoSelectAnimation();
  const togglePin = useCallback(() => {}, []);

  const steps = [
    {
      num: '01',
      title: 'Cr\u00e9ez votre campagne',
      desc: 'Importez votre vid\u00e9o ou cr\u00e9ez-la avec notre \u00e9diteur int\u00e9gr\u00e9 et l\u2019IA.',
      I: Sparkles,
      img: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&h=500&fit=crop&q=80',
    },
    {
      num: '02',
      title: 'Ciblez vos \u00e9crans',
      desc: 'S\u00e9lectionnez les lieux et zones g\u00e9ographiques qui comptent pour vous.',
      I: Target,
      img: '',
    },
    {
      num: '03',
      title: 'Diffusez & mesurez',
      desc: 'Lancez en un clic et suivez vos performances en temps r\u00e9el.',
      I: BarChart3,
      img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=500&fit=crop&q=80',
    },
  ];

  useEffect(() => {
    stepTimerRef.current = setInterval(() => setActiveStep((p) => (p + 1) % 3), 5000);
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  }, []);

  const handleStep = useCallback((i: number) => {
    setActiveStep(i);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => setActiveStep((p) => (p + 1) % 3), 5000);
  }, []);

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4">
        {/* Centered header */}
        <SectionReveal className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Megaphone className="h-3.5 w-3.5" /> Annonceurs
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Diffusez votre publicit&eacute; directement l&agrave; o&ugrave; vos clients arrivent
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Touchez les voyageurs, touristes et visiteurs au moment o&ugrave; ils d&eacute;couvrent la ville.
          </p>
        </SectionReveal>

        {/* Accordion steps — same pattern as PartnerSection */}
        <SectionReveal delay={0.15}>
          <div className="flex gap-2 sm:gap-3" style={{ height: 'clamp(320px, 32vw, 440px)' }}>
            {steps.map((step, i) => {
              const isActive = i === activeStep;
              return (
                <button
                  key={step.num}
                  onClick={() => handleStep(i)}
                  className="group relative overflow-hidden rounded-2xl transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  style={{ flex: isActive ? '4 1 0%' : '0.8 1 0%', minWidth: 0 }}
                >
                  {/* Background — dark gradient per panel */}
                  {i === 1 ? (
                    <div className="absolute inset-0 bg-[#0B1220]">
                      <div
                        className="absolute inset-0 transition-opacity duration-700"
                        style={{ opacity: isActive ? 1 : 0.4, clipPath: 'inset(0)', overflow: 'hidden' }}
                      >
                        <LeafletMap pins={SCREEN_PINS} selectedPins={selectedPins} onTogglePin={togglePin} phase={phase} />
                      </div>
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1220] via-[#0B1220]/30 to-[#0B1220]/60" />
                    </div>
                  ) : i === 0 ? (
                    <div className="absolute inset-0 bg-[#0A0F1E]">
                      <div className="pointer-events-none absolute inset-0" style={{
                        background: isActive
                          ? 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.12) 0%, transparent 60%), linear-gradient(160deg, #0A0F1E 0%, #111827 50%, #0A0F1E 100%)'
                          : 'linear-gradient(160deg, #0A0F1E 0%, #0D1321 100%)',
                      }} />
                      {/* Subtle grid pattern */}
                      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                      }} />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-[#070D1A]">
                      <div className="pointer-events-none absolute inset-0" style={{
                        background: isActive
                          ? 'radial-gradient(ellipse at 70% 80%, rgba(16,185,129,0.10) 0%, transparent 60%), linear-gradient(200deg, #070D1A 0%, #0F172A 50%, #070D1A 100%)'
                          : 'linear-gradient(200deg, #070D1A 0%, #0B1120 100%)',
                      }} />
                      {/* Subtle dot pattern */}
                      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                      }} />
                    </div>
                  )}

                  {/* Blue accent glow */}
                  {isActive && (
                    <div className="pointer-events-none absolute inset-0" style={{
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, transparent 50%)',
                    }} />
                  )}

                  {/* Collapsed: vertical label */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-500"
                    style={{ opacity: isActive ? 0 : 1 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                      <step.I className="h-5 w-5 text-white/70" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                      {step.num}
                    </span>
                    <span
                      className="text-xs font-semibold uppercase tracking-wider text-white/50"
                      style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
                    >
                      {step.title}
                    </span>
                  </div>

                  {/* Expanded: full content */}
                  <div
                    className="absolute inset-0 flex flex-col justify-end p-6 transition-all duration-700 sm:p-8"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(0)' : 'translateY(16px)',
                    }}
                  >
                    {/* Step number + icon */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                        <step.I className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">&Eacute;tape {step.num}</span>
                        <h3 className="text-xl font-bold text-white sm:text-2xl">{step.title}</h3>
                      </div>
                    </div>
                    <p className="mt-2 max-w-md text-sm text-white/60">{step.desc}</p>

                    {/* Step-specific inline mockup — mirrors real NeoFilm advertiser UI */}
                    {i === 0 && (
                      <div className="mt-4 flex max-w-lg flex-col gap-2.5">
                        {/* Mini wizard mockup */}
                        <div className="rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
                          <div className="mb-2 flex items-center gap-4">
                            {['Informations', 'M\u00e9dia', 'Ciblage', 'Validation'].map((s, j) => (
                              <div key={s} className="flex items-center gap-1.5">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${j === 0 ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/30'}`}>{j + 1}</span>
                                <span className={`hidden text-[10px] font-medium sm:inline ${j === 0 ? 'text-white/80' : 'text-white/30'}`}>{s}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            <div className="h-6 w-3/4 rounded bg-white/8" />
                            <div className="h-6 w-full rounded bg-white/8" />
                            <div className="flex gap-2">
                              {['Spot publicitaire', 'Fiche catalogue'].map((t, j) => (
                                <div key={t} className={`flex-1 rounded-md border px-2 py-1.5 text-center text-[9px] font-semibold ${j === 0 ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-white/10 bg-white/5 text-white/40'}`}>
                                  <Tv className="mx-auto mb-0.5 h-3 w-3" /> {t}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Upload zone mockup */}
                        <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/3 p-2.5">
                          <div className="flex h-10 w-14 items-center justify-center rounded-md bg-blue-500/15">
                            <Play className="h-4 w-4 text-blue-400" />
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-white/70">spot_restaurant_15s.mp4</span>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="text-[9px] text-white/40">15s &middot; 1080p &middot; 4.2 MB</span>
                              <span className="flex items-center gap-0.5 text-[9px] font-medium text-emerald-400"><Check className="h-2.5 w-2.5" /> Pr&ecirc;t</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {i === 1 && (
                      <div className="mt-4 flex max-w-lg items-center gap-3">
                        {/* Pack selector chips */}
                        <div className="flex gap-1.5">
                          {[50, 100, 200].map((n) => (
                            <span key={n} className={`rounded-md px-2 py-1 text-[10px] font-bold ${n === 50 ? 'bg-blue-500/25 text-blue-300 ring-1 ring-blue-400/40' : 'bg-white/5 text-white/30'}`}>
                              {n} TV
                            </span>
                          ))}
                        </div>
                        <div className="h-4 w-px bg-white/10" />
                        <div className="text-xs">
                          {phase === 'done' ? (
                            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> 50 &eacute;crans cibl&eacute;s
                            </motion.span>
                          ) : phase === 'diffusing' ? (
                            <span className="flex items-center gap-1.5 font-medium text-blue-400">
                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="h-3 w-3 rounded-full border-2 border-blue-400/30 border-t-blue-400" />
                              Diffusion...
                            </span>
                          ) : selectedPins.length > 0 ? (
                            <span className="flex items-center gap-2 font-semibold text-slate-200">
                              <motion.span
                                key={selectedPins.length}
                                initial={{ scale: 1.5, opacity: 0.3 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md bg-blue-500/25 px-1.5 text-xs font-black tabular-nums text-blue-300 ring-1 ring-blue-400/40"
                              >
                                {selectedPins.length}
                              </motion.span>
                              <span className="text-[10px]">/ 50 &eacute;crans</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">S&eacute;lection...</span>
                          )}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 ring-1 ring-emerald-500/20">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </span>
                          <span className="text-[9px] font-medium text-emerald-400">{SCREEN_PINS.length} live</span>
                        </div>
                      </div>
                    )}
                    {i === 2 && (
                      <div className="mt-4 flex max-w-lg flex-col gap-2.5">
                        {/* KPI row */}
                        <div className="flex gap-2">
                          {[
                            { v: '24 580', l: 'Vues totales', Ic: Eye, c: 'text-blue-400' },
                            { v: '94%', l: 'Compl\u00e9tion', Ic: CheckCircle2, c: 'text-emerald-400' },
                            { v: '3', l: 'Actives', Ic: Zap, c: 'text-amber-400' },
                          ].map((k) => (
                            <div key={k.l} className="flex-1 rounded-lg border border-white/10 bg-white/5 p-2 backdrop-blur-sm">
                              <k.Ic className={`mb-1 h-3 w-3 ${k.c}`} />
                              <div className="text-sm font-black text-white">{k.v}</div>
                              <div className="text-[8px] uppercase tracking-wider text-white/35">{k.l}</div>
                            </div>
                          ))}
                        </div>
                        {/* Mini sparkline chart mockup */}
                        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Vues 30 jours</span>
                            <span className="text-[9px] font-bold text-emerald-400">+12%</span>
                          </div>
                          <svg viewBox="0 0 200 40" className="h-8 w-full" preserveAspectRatio="none">
                            <defs><linearGradient id="chart-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.3" /><stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0" /></linearGradient></defs>
                            <path d="M0,35 Q20,30 40,28 T80,22 T120,18 T160,10 T200,5 L200,40 L0,40Z" fill="url(#chart-g)" />
                            <path d="M0,35 Q20,30 40,28 T80,22 T120,18 T160,10 T200,5" fill="none" stroke="rgb(59,130,246)" strokeWidth="1.5" />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Progress bar */}
                    <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        key={`adv-progress-${activeStep}`}
                        className="block h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 partner-tab-progress"
                        style={{ animationDuration: '5s' }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionReveal>

        {/* CTA */}
        <SectionReveal delay={0.4} className="mt-12 text-center">
          <button
            onClick={() => { window.location.href = URLS.advertiserSignup; }}
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_-8px_hsl(var(--primary)/0.5)]"
          >
            Diffuser ma publicit&eacute; <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </SectionReveal>
      </div>

      {/* Scroll-Driven Content Wave */}
      <div className="mt-16">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ils diffusent sur NeoFilm</p>
        <ContentWave />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  5. AVANTAGES PARTENAIRE                                            */
/* ------------------------------------------------------------------ */

function PartnerSection() {
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const partners = [
    { I: Home, l: 'Airbnb', img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=500&fit=crop&q=80', stat: '2 400+', statLabel: 'logements \u00e9quip\u00e9s' },
    { I: Hotel, l: 'H\u00f4tels', img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&h=500&fit=crop&q=80', stat: '850+', statLabel: 'chambres connect\u00e9es' },
    { I: Building2, l: 'Conciergeries', img: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&h=500&fit=crop&q=80', stat: '340+', statLabel: 'propri\u00e9t\u00e9s g\u00e9r\u00e9es' },
    { I: Palmtree, l: 'R\u00e9sidences', img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=500&fit=crop&q=80', stat: '120+', statLabel: 'r\u00e9sidences premium' },
    { I: Landmark, l: 'Lieux culturels', img: 'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=800&h=500&fit=crop&q=80', stat: '75+', statLabel: 'lieux partenaires' },
    { I: Users, l: 'Espaces publics', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=500&fit=crop&q=80', stat: '200+', statLabel: 'espaces \u00e9quip\u00e9s' },
  ];

  const benefits = [
    { I: DollarSign, title: 'Revenus passifs', desc: 'G\u00e9n\u00e9rez des revenus r\u00e9currents sans effort.' },
    { I: Zap, title: 'Activation rapide', desc: 'Installez en quelques minutes sur vos \u00e9crans.' },
    { I: Users, title: 'Contenu utile', desc: 'Offrez des infos locales \u00e0 vos visiteurs.' },
    { I: BarChart3, title: 'Tableau de bord', desc: 'Suivez revenus et \u00e9crans en temps r\u00e9el.' },
  ];

  useEffect(() => {
    timerRef.current = setInterval(() => setActive((p) => (p + 1) % 6), 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleTab = useCallback((i: number) => {
    setActive(i);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setActive((p) => (p + 1) % 6), 4000);
  }, []);

  return (
    <section className="relative px-4 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/[0.02] to-transparent" />
      <div className="relative mx-auto max-w-6xl">
        {/* Header */}
        <SectionReveal className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-400">
            <Monitor className="h-3.5 w-3.5" /> Partenaires
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Transformez vos &eacute;crans TV en nouvelle source de{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">revenus</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Mon&eacute;tisez les &eacute;crans de vos logements ou &eacute;tablissements sans effort.
          </p>
        </SectionReveal>

        {/* Expanding accordion cards */}
        <SectionReveal delay={0.15}>
          <div className="flex gap-2 sm:gap-3" style={{ height: 'clamp(280px, 28vw, 380px)' }}>
            {partners.map((p, i) => {
              const isActive = i === active;
              return (
                <button
                  key={p.l}
                  onClick={() => handleTab(i)}
                  className="group relative overflow-hidden rounded-2xl transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  style={{
                    flex: isActive ? '4 1 0%' : '0.6 1 0%',
                    minWidth: 0,
                  }}
                >
                  {/* Background image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.img}
                    alt={p.l}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700"
                    style={{
                      filter: isActive ? 'brightness(0.6) saturate(1.2)' : 'brightness(0.3) saturate(0.5)',
                      transform: isActive ? 'scale(1.05)' : 'scale(1.15)',
                    }}
                    loading="lazy"
                  />
                  {/* Overlay gradient */}
                  <div
                    className="absolute inset-0 transition-opacity duration-500"
                    style={{
                      background: isActive
                        ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.3) 100%)'
                        : 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 100%)',
                    }}
                  />
                  {/* Violet accent glow on active */}
                  {isActive && (
                    <div className="pointer-events-none absolute inset-0" style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, transparent 50%)',
                    }} />
                  )}

                  {/* Collapsed state: vertical label */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-500"
                    style={{ opacity: isActive ? 0 : 1 }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                      <p.I className="h-5 w-5 text-white/70" />
                    </div>
                    <span
                      className="text-xs font-semibold uppercase tracking-wider text-white/50"
                      style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
                    >
                      {p.l}
                    </span>
                  </div>

                  {/* Expanded state: full content */}
                  <div
                    className="absolute inset-0 flex flex-col justify-end p-6 transition-all duration-700 sm:p-8"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(0)' : 'translateY(16px)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md"
                      >
                        <p.I className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <span className="text-xl font-bold text-white sm:text-2xl">{p.l}</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black text-violet-400 sm:text-3xl">{p.stat}</span>
                          <span className="text-xs text-white/50 sm:text-sm">{p.statLabel}</span>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        key={`progress-${active}`}
                        className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 partner-tab-progress"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionReveal>

        {/* Benefits row */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <SectionReveal key={b.title} delay={0.3 + i * 0.08}>
              <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-all hover:border-violet-300/40 hover:shadow-lg hover:shadow-violet-500/5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10">
                  <b.I className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <h4 className="font-semibold">{b.title}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">{b.desc}</p>
                </div>
              </div>
            </SectionReveal>
          ))}
        </div>

        {/* CTA */}
        <SectionReveal delay={0.5} className="mt-10 text-center">
          <button
            onClick={() => { window.location.href = URLS.partnerSignup; }}
            className="group inline-flex items-center gap-2 rounded-xl bg-violet-500 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-violet-500/90 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]"
          >
            Mon&eacute;tiser mes &eacute;crans <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </SectionReveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  6. PREUVE SOCIALE                                                  */
/* ------------------------------------------------------------------ */

function TestimonialsSection() {
  const testimonials = [
    {
      quote: 'En 3 mois, nos annonces sur NeoFilm ont g\u00e9n\u00e9r\u00e9 plus de r\u00e9servations que 6 mois de flyers. Les touristes voient notre restaurant au bon moment, sur l\u2019\u00e9cran de leur h\u00f4tel.',
      name: 'Sophie Martin',
      role: 'G\u00e9rante, La Brasserie du Port',
      type: 'annonceur' as const,
    },
    {
      quote: 'L\u2019installation a pris 10 minutes par \u00e9cran. Depuis, nos 12 appartements g\u00e9n\u00e8rent un revenu passif chaque mois sans aucun effort de notre part.',
      name: 'Thomas Durand',
      role: 'Fondateur, Azur Conciergerie',
      type: 'partenaire' as const,
    },
    {
      quote: 'Le ciblage g\u00e9ographique est redoutable. Je s\u00e9lectionne les \u00e9crans autour de ma boutique et je touche exactement les visiteurs de passage dans le quartier.',
      name: 'Am\u00e9lie Roux',
      role: 'Responsable marketing, March\u00e9 Proven\u00e7al',
      type: 'annonceur' as const,
    },
    {
      quote: 'Nos clients adorent l\u2019interface TV : streaming, infos locales, activit\u00e9s\u2026 et nous, on est r\u00e9mun\u00e9r\u00e9s pour \u00e7a. C\u2019est gagnant-gagnant.',
      name: 'Marc Lefebvre',
      role: 'Directeur, H\u00f4tel Belvista',
      type: 'partenaire' as const,
    },
  ];

  return (
    <section className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionReveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Ils nous font <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">confiance</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Annonceurs et partenaires partagent leur exp&eacute;rience avec NeoFilm.
          </p>
        </SectionReveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {testimonials.map((t, i) => (
            <SectionReveal key={t.name} delay={i * 0.1}>
              <div className="relative flex h-full flex-col justify-between rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
                {/* Badge */}
                <div className="mb-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    t.type === 'annonceur'
                      ? 'border border-blue-200 bg-blue-50 text-blue-600'
                      : 'border border-violet-200 bg-violet-50 text-violet-600'
                  }`}>
                    {t.type === 'annonceur' ? <Megaphone className="h-2.5 w-2.5" /> : <Monitor className="h-2.5 w-2.5" />}
                    {t.type}
                  </span>
                </div>
                {/* Quote */}
                <p className="flex-1 text-[15px] leading-relaxed text-gray-600">
                  &laquo;&nbsp;{t.quote}&nbsp;&raquo;
                </p>
                {/* Author */}
                <div className="mt-6 flex items-center gap-3 border-t border-gray-50 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  7. DEMO PRODUIT                                                    */
/* ------------------------------------------------------------------ */

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'Combien co\u00fbte NeoFilm pour un annonceur\u00a0?',
      a: 'NeoFilm fonctionne par packs TV. Le pack Diffusion d\u00e9marre \u00e0 39\u00a0\u20ac/mois pour 50\u00a0TV. Vous pouvez aussi ajouter un pack Catalogue d\u00e8s 18,90\u00a0\u20ac/mois. Chaque diffusion est certifi\u00e9e avec un reporting transparent en temps r\u00e9el.',
    },
    {
      q: 'Faut-il un mat\u00e9riel sp\u00e9cifique pour les partenaires\u00a0?',
      a: 'Non. NeoFilm fonctionne sur n\u2019importe quelle Smart TV ou Android TV. L\u2019application s\u2019installe en quelques minutes sans \u00e9quipement suppl\u00e9mentaire.',
    },
    {
      q: 'Y a-t-il un engagement minimum\u00a0?',
      a: 'Pour les packs jusqu\u2019\u00e0 200\u00a0TV, aucun engagement \u2014 abonnement mensuel r\u00e9siliable \u00e0 tout moment. Le pack 300\u00a0TV n\u00e9cessite un engagement de 6\u00a0mois minimum. C\u00f4t\u00e9 partenaires, aucun engagement dans tous les cas.',
    },
    {
      q: 'Comment sont mesur\u00e9es les performances\u00a0?',
      a: 'Chaque diffusion est certifi\u00e9e par une preuve crypt\u00e9e (signature HMAC). Vous acc\u00e9dez en temps r\u00e9el au nombre de vues, au taux de compl\u00e9tion et aux zones de diffusion.',
    },
    {
      q: 'Quel revenu peut g\u00e9n\u00e9rer un partenaire\u00a0?',
      a: 'Un partenaire re\u00e7oit une r\u00e9trocession de 10 \u00e0 20\u00a0% sur chaque abonnement annonceur diffus\u00e9 sur ses \u00e9crans. Plus vous avez d\u2019\u00e9crans et d\u2019annonceurs actifs, plus vos revenus augmentent.',
    },
    {
      q: 'Les visiteurs peuvent-ils d\u00e9sactiver les publicit\u00e9s\u00a0?',
      a: 'L\u2019interface TV offre streaming, TNT et infos locales en priorit\u00e9. Les publicit\u00e9s sont int\u00e9gr\u00e9es de mani\u00e8re non intrusive dans un bandeau lat\u00e9ral, sans interrompre le contenu principal.',
    },
  ];

  return (
    <section className="relative px-4 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent" />
      <div className="relative mx-auto max-w-3xl">
        <SectionReveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Questions <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">fr&eacute;quentes</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Tout ce que vous devez savoir avant de vous lancer.
          </p>
        </SectionReveal>

        <div className="mt-12 space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <SectionReveal key={i} delay={i * 0.06}>
                <div className="rounded-xl border border-gray-100 bg-white shadow-sm transition-all hover:border-gray-200">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left"
                  >
                    <span className="text-[15px] font-semibold text-gray-900">{faq.q}</span>
                    <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isOpen ? '200px' : '0px', opacity: isOpen ? 1 : 0 }}
                  >
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                  </div>
                </div>
              </SectionReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  8. RESEAU                                                          */
/* ------------------------------------------------------------------ */

/* NetworkSection removed — stats already in Hero banner */

/* ------------------------------------------------------------------ */
/*  9. CTA FINAL                                                       */
/* ------------------------------------------------------------------ */

function FinalCTASection() {
  return (
    <section className="relative px-4 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.08] blur-[100px]" />
      </div>
      <div className="relative mx-auto max-w-4xl">
        <SectionReveal>
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lg">
            <div className="grid md:grid-cols-2">
              {/* Annonceur CTA */}
              <div className="flex flex-col justify-center border-b border-gray-100 p-8 sm:p-10 md:border-b-0 md:border-r">
                <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  <Megaphone className="h-3 w-3" /> Annonceurs
                </div>
                <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Lancez votre premi&egrave;re campagne
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Cr&eacute;ez votre compte gratuitement. D&eacute;finissez votre budget, ciblez vos &eacute;crans et diffusez en quelques minutes.
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> D&egrave;s 39&nbsp;&euro;/mois</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> R&eacute;siliable &agrave; tout moment</span>
                </div>
                <button
                  onClick={() => { window.location.href = URLS.advertiserSignup; }}
                  className="group mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_-8px_hsl(var(--primary)/0.5)]"
                >
                  Commencer gratuitement <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>

              {/* Partenaire CTA */}
              <div className="flex flex-col justify-center p-8 sm:p-10">
                <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">
                  <Monitor className="h-3 w-3" /> Partenaires
                </div>
                <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Mon&eacute;tisez vos &eacute;crans TV
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Activez NeoFilm sur vos TV existantes et g&eacute;n&eacute;rez des revenus passifs d&egrave;s le premier mois. Installation en 5 minutes.
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> 10-20% de r&eacute;trocession</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Aucun mat&eacute;riel</span>
                </div>
                <button
                  onClick={() => { window.location.href = URLS.partnerSignup; }}
                  className="group mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-violet-500 px-7 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500/90 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]"
                >
                  Devenir partenaire <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  10. FOOTER                                                         */
/* ------------------------------------------------------------------ */

function FooterSection() {
  return (
    <footer className="border-t border-gray-100 px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary"><Film className="h-3.5 w-3.5 text-primary-foreground" /></div>
          <span className="text-sm font-bold">NeoFilm</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <button onClick={() => { window.location.href = URLS.advertiser; }} className="transition-colors hover:text-foreground">Annonceur</button>
          <button onClick={() => { window.location.href = URLS.partner; }} className="transition-colors hover:text-foreground">Partenaire</button>
          <button onClick={() => { window.location.href = URLS.admin; }} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"><Shield className="h-3 w-3" />Admin</button>
        </div>
        <p className="text-xs text-muted-foreground/50">&copy; {new Date().getFullYear()} NeoFilm. Tous droits r&eacute;serv&eacute;s.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function PortalPage() {
  useEffect(() => {
    const authed = detectAuth();
    if (authed) { window.location.href = DASHBOARD_URLS[authed]; }
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <AdvertiserSection />
      <PartnerSection />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
      <FooterSection />
    </div>
  );
}

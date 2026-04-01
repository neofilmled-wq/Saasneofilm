'use client';

import {
  ArrowRight, Monitor, DollarSign, Shield, Zap, BarChart3, Users,
  CheckCircle2, Film, Tv, Wifi, Clock, ChevronRight, Settings,
  TrendingUp, Heart, Star, Smartphone, Lock, Gift,
} from 'lucide-react';
import { useState } from 'react';
import { Navbar } from '@/components/navbar';
import { SectionReveal } from '@/components/section-reveal';

/* ------------------------------------------------------------------ */
/*  URLs                                                               */
/* ------------------------------------------------------------------ */

const URLS = {
  partnerSignup: process.env.NEXT_PUBLIC_PARTNER_SIGNUP_URL ?? 'http://localhost:3002/signup',
  partnerLogin: process.env.NEXT_PUBLIC_PARTNER_URL ?? 'http://localhost:3002/login',
} as const;

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const HERO_STATS = [
  { value: '10-20%', label: 'Rétrocession / abo' },
  { value: '0€', label: 'Coût d\'installation' },
  { value: '5 min', label: 'Mise en service' },
];

const ADVANTAGES = [
  {
    icon: DollarSign,
    title: 'Revenus passifs garantis',
    desc: 'Vous touchez 10 à 20% de rétrocession sur chaque abonnement annonceur diffusé sur vos écrans. Paiement mensuel automatique.',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: Zap,
    title: 'Installation en 5 minutes',
    desc: 'Aucun matériel supplémentaire. Votre Smart TV suffit. Scannez le QR code de pairing et c\'est parti.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Shield,
    title: 'Contenu 100% modéré',
    desc: 'Chaque publicité est validée par notre équipe avant diffusion. Aucun risque de contenu inapproprié pour vos visiteurs.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Tv,
    title: 'TNT + Streaming intégré',
    desc: 'Vos écrans ne diffusent pas que des pubs. Vos visiteurs accèdent aussi aux chaînes TNT, au streaming et aux infos locales.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: BarChart3,
    title: 'Dashboard de suivi',
    desc: 'Suivez vos revenus, le statut de chaque écran et les performances en temps réel depuis votre tableau de bord.',
    color: 'bg-pink-50 text-pink-600',
  },
  {
    icon: Lock,
    title: 'Sans engagement',
    desc: 'Pas de contrat, pas de durée minimum. Désactivez NeoFilm à tout moment depuis votre dashboard.',
    color: 'bg-cyan-50 text-cyan-600',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Inscrivez-vous',
    desc: 'Créez votre compte partenaire en 30 secondes. Totalement gratuit, sans carte bancaire.',
    icon: Smartphone,
  },
  {
    step: '02',
    title: 'Ajoutez vos écrans',
    desc: 'Déclarez vos Smart TV dans le dashboard. Renseignez l\'emplacement et le type d\'établissement.',
    icon: Monitor,
  },
  {
    step: '03',
    title: 'Scannez le QR code',
    desc: 'L\'app NeoFilm s\'affiche sur votre TV. Scannez le QR code depuis votre dashboard pour connecter l\'écran.',
    icon: Wifi,
  },
  {
    step: '04',
    title: 'Gagnez de l\'argent',
    desc: 'Les publicités sont diffusées automatiquement. Vous êtes payé chaque mois, automatiquement.',
    icon: TrendingUp,
  },
];

const WHAT_YOUR_VISITORS_GET = [
  {
    icon: Tv,
    title: 'Chaînes TNT en direct',
    desc: 'Toutes les chaînes de la TNT accessibles en un clic sur l\'interface NeoFilm.',
  },
  {
    icon: Film,
    title: 'Catalogue streaming',
    desc: 'Accès aux plateformes de streaming populaires directement depuis l\'écran TV.',
  },
  {
    icon: Heart,
    title: 'Activités locales',
    desc: 'Restaurants, excursions, événements — vos visiteurs découvrent les meilleures adresses autour.',
  },
  {
    icon: Star,
    title: 'Expérience premium',
    desc: 'Une interface moderne et intuitive qui valorise votre établissement et le confort de vos clients.',
  },
];

const REVENUE_EXAMPLES = [
  { screens: '5 écrans', revenue: '50 – 200 €', label: 'Petit hébergeur', desc: 'Gîte, chambre d\'hôtes' },
  { screens: '20 écrans', revenue: '200 – 800 €', label: 'Hôtel moyen', desc: 'Hôtel 2-3 étoiles' },
  { screens: '50+ écrans', revenue: '800 – 3 000 €', label: 'Grande structure', desc: 'Résidence, chaîne hôtelière' },
];

const PARTNER_TYPES = [
  { title: 'Hôtels & résidences', desc: 'Monétisez les TV de vos chambres et espaces communs.', icon: '🏨' },
  { title: 'Cinémas', desc: 'Rentabilisez les écrans de vos halls et couloirs.', icon: '🎬' },
  { title: 'Restaurants & bars', desc: 'Transformez vos écrans muraux en source de revenus.', icon: '🍺' },
  { title: 'Salles d\'attente', desc: 'Cabinets médicaux, garages — monétisez l\'attente.', icon: '⏳' },
  { title: 'Espaces de coworking', desc: 'Rentabilisez les écrans de vos espaces communs.', icon: '💻' },
  { title: 'Campings & villages vacances', desc: 'Offrez du contenu TV premium et générez des revenus.', icon: '⛺' },
];

const TESTIMONIALS = [
  {
    quote: 'On a branché NeoFilm sur 12 TV de notre résidence. En 3 mois, ça couvre largement notre abonnement internet. Et nos clients adorent l\'interface.',
    name: 'Pierre M.',
    role: 'Gérant — Résidence Les Oliviers',
  },
  {
    quote: 'Zéro investissement, zéro galère technique. J\'ai activé NeoFilm en 10 minutes sur les TV du hall et du restaurant. Les revenus tombent tous les mois.',
    name: 'Nadia K.',
    role: 'Directrice — Hôtel Bleu Azur',
  },
  {
    quote: 'Le fait que les pubs soient modérées me rassure. Et le dashboard de suivi est top — je vois exactement combien chaque écran rapporte.',
    name: 'Thomas R.',
    role: 'Propriétaire — Cinéma Le Rex',
  },
];

const FAQ = [
  {
    q: 'Est-ce vraiment gratuit pour les partenaires ?',
    a: 'Oui, à 100%. L\'inscription, l\'installation et l\'utilisation sont entièrement gratuites. Vous touchez une rétrocession de 10 à 20% sur chaque abonnement annonceur diffusé sur vos écrans.',
  },
  {
    q: 'De quel matériel ai-je besoin ?',
    a: 'Une Smart TV connectée à internet suffit. Aucun boîtier externe, aucune clé HDMI. L\'application NeoFilm tourne directement sur la TV via son navigateur intégré.',
  },
  {
    q: 'Les publicités sont-elles intrusives pour mes clients ?',
    a: 'Non. Les pubs sont diffusées dans un format non-intrusif (bandeau latéral ou interstitiel court entre les contenus). Vos clients gardent accès à la TNT, au streaming et aux activités locales.',
  },
  {
    q: 'Comment et quand suis-je payé ?',
    a: 'Les revenus sont calculés mensuellement et virés automatiquement sur votre compte bancaire (via Stripe Connect). Vous pouvez suivre vos gains en temps réel dans le dashboard.',
  },
  {
    q: 'Puis-je choisir les publicités diffusées ?',
    a: 'Vous ne choisissez pas les publicités individuellement, mais notre équipe modère chaque contenu avant diffusion. Vous pouvez aussi bloquer certaines catégories depuis vos paramètres.',
  },
  {
    q: 'Que se passe-t-il si je veux arrêter ?',
    a: 'Vous pouvez désactiver NeoFilm à tout moment depuis votre dashboard. Aucun engagement, aucun frais de résiliation. Il suffit de retirer l\'application de vos TV.',
  },
];

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function PartenairesPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-4 pt-32 pb-20 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-50/60 to-white" />
        <div className="relative mx-auto max-w-5xl text-center">
          <SectionReveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-violet-600">
              <Monitor className="h-3.5 w-3.5" /> Pour les partenaires
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Transformez vos TV en{' '}
              <span className="bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent">
                source de revenus
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
              Installez NeoFilm sur vos écrans TV et générez des revenus passifs chaque mois.
              100% gratuit, sans engagement, sans matériel supplémentaire.
            </p>
          </SectionReveal>

          <SectionReveal delay={0.15} className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => { window.location.href = URLS.partnerSignup; }}
              className="group flex items-center gap-2 rounded-xl bg-violet-500 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-violet-600 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]"
            >
              Devenir partenaire gratuitement <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => { window.location.href = URLS.partnerLogin; }}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-8 py-3.5 text-sm font-semibold text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900"
            >
              Se connecter
            </button>
          </SectionReveal>

          {/* Stats */}
          <SectionReveal delay={0.3} className="mt-14">
            <div className="mx-auto flex max-w-md justify-center gap-8 sm:gap-14">
              {HERO_STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-black text-gray-900 sm:text-3xl">{s.value}</p>
                  <p className="mt-1 text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ── Avantages ── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pourquoi devenir partenaire NeoFilm ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Zéro investissement, zéro risque — uniquement des avantages.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <SectionReveal key={a.title} delay={i * 0.08}>
                <div className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-violet-200 hover:shadow-md">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.color}`}>
                    <a.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-bold text-gray-900">{a.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">{a.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="border-t border-gray-100 bg-gray-50/50 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Comment ça marche ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              4 étapes pour commencer à gagner de l&apos;argent avec vos écrans TV.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <SectionReveal key={step.step} delay={i * 0.1}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/20">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <span className="mt-4 text-xs font-bold uppercase tracking-widest text-violet-600">Étape {step.step}</span>
                  <h3 className="mt-2 text-[15px] font-bold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-500">{step.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ce que vos visiteurs obtiennent ── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Vos visiteurs aussi en profitent
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              NeoFilm n&apos;est pas qu&apos;un outil publicitaire. C&apos;est une expérience TV complète pour vos clients.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {WHAT_YOUR_VISITORS_GET.map((item, i) => (
              <SectionReveal key={item.title} delay={i * 0.1}>
                <div className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-violet-200 hover:shadow-md">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                    <item.icon className="h-6 w-6 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Estimation de revenus ── */}
      <section className="border-t border-gray-100 bg-gray-50/50 px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Combien pouvez-vous gagner ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Estimation de revenus mensuels selon votre parc d&apos;écrans.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {REVENUE_EXAMPLES.map((ex, i) => (
              <SectionReveal key={ex.screens} delay={i * 0.1}>
                <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm transition-all hover:border-violet-200 hover:shadow-md">
                  <p className="text-3xl font-black text-violet-600">{ex.revenue}</p>
                  <p className="mt-2 text-sm font-bold text-gray-900">{ex.screens}</p>
                  <p className="text-xs text-gray-400">{ex.label}</p>
                  <p className="mt-1 text-xs text-gray-400">{ex.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>

          <SectionReveal delay={0.4} className="mt-8 text-center">
            <p className="text-sm text-gray-400">
              Estimations basées sur un CPM moyen constaté. Les revenus réels dépendent de la localisation, la saisonnalité et le volume publicitaire.
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* ── Qui peut devenir partenaire ── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Qui peut devenir partenaire ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Tout établissement disposant d&apos;écrans TV accessibles au public.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNER_TYPES.map((pt, i) => (
              <SectionReveal key={pt.title} delay={i * 0.07}>
                <div className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-violet-200 hover:shadow-md">
                  <span className="text-2xl">{pt.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{pt.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">{pt.desc}</p>
                  </div>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Témoignages ── */}
      <section className="border-t border-gray-100 bg-gray-50/50 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ils sont déjà partenaires
            </h2>
          </SectionReveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <SectionReveal key={t.name} delay={i * 0.1}>
                <div className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <p className="flex-1 text-sm italic leading-relaxed text-gray-600">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <p className="text-sm font-bold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions fréquentes</h2>
          </SectionReveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <SectionReveal key={i} delay={i * 0.05}>
                  <div className="rounded-xl border border-gray-100 bg-white shadow-sm transition-all hover:border-gray-200">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-4 p-5 text-left"
                    >
                      <span className="text-[15px] font-semibold text-gray-900">{faq.q}</span>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                    <div
                      className="overflow-hidden transition-all duration-300"
                      style={{ maxHeight: isOpen ? '200px' : '0px', opacity: isOpen ? 1 : 0 }}
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-gray-500">{faq.a}</p>
                    </div>
                  </div>
                </SectionReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="px-4 pb-24">
        <SectionReveal>
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 p-10 text-center text-white sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Prêt à monétiser vos écrans ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-violet-100">
              Rejoignez le réseau NeoFilm et commencez à générer des revenus dès aujourd&apos;hui. C&apos;est gratuit et sans engagement.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={() => { window.location.href = URLS.partnerSignup; }}
                className="group flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-violet-600 transition-all hover:shadow-xl"
              >
                Devenir partenaire <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <p className="mt-5 text-xs text-violet-200">
              100% gratuit &middot; Sans engagement &middot; 10-20% de r&eacute;trocession par abonnement
            </p>
          </div>
        </SectionReveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 px-4 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600"><Film className="h-3.5 w-3.5 text-white" /></div>
            <span className="text-sm font-bold">NeoFilm</span>
          </div>
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} NeoFilm. Tous droits r&eacute;serv&eacute;s.</p>
        </div>
      </footer>
    </div>
  );
}

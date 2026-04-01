'use client';

import {
  ArrowRight, Megaphone, Target, BarChart3, Eye, Shield, Zap,
  Film, CheckCircle2, Monitor, MapPin, Sparkles, Play, Users,
  TrendingUp, Palette, MousePointerClick, Clock, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { Navbar } from '@/components/navbar';
import { SectionReveal } from '@/components/section-reveal';

/* ------------------------------------------------------------------ */
/*  URLs                                                               */
/* ------------------------------------------------------------------ */

const URLS = {
  advertiserSignup: process.env.NEXT_PUBLIC_ADVERTISER_SIGNUP_URL ?? 'http://localhost:3003/signup',
  advertiserLogin: process.env.NEXT_PUBLIC_ADVERTISER_URL ?? 'http://localhost:3003/login',
} as const;

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const HERO_STATS = [
  { value: 'Dès 39€', label: 'Par mois / 50 TV' },
  { value: '300+', label: 'Écrans disponibles' },
  { value: '100%', label: 'Diffusion certifiée' },
];

const ADVANTAGES = [
  {
    icon: Target,
    title: 'Ciblage géographique précis',
    desc: 'Choisissez exactement où diffuser vos publicités : par ville, quartier, type d\'établissement ou même par écran individuel.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Eye,
    title: 'Audience captive garantie',
    desc: 'Vos annonces sont diffusées dans des lieux d\'attente (lobbys, salles d\'attente, restaurants) où l\'attention est naturellement disponible.',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: BarChart3,
    title: 'Analytics en temps réel',
    desc: 'Suivez les performances de chaque campagne : impressions, taux de complétion, répartition géographique et horaire.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Shield,
    title: 'Preuve de diffusion certifiée',
    desc: 'Chaque passage publicitaire est signé cryptographiquement (HMAC). Vous avez la preuve irréfutable que votre annonce a été diffusée.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Palette,
    title: 'Création vidéo intégrée',
    desc: 'Créez vos visuels directement depuis la plateforme avec notre éditeur ou générez-les par IA. Pas besoin d\'agence.',
    color: 'bg-pink-50 text-pink-600',
  },
  {
    icon: Zap,
    title: 'Lancement en 5 minutes',
    desc: 'Créez votre campagne, sélectionnez vos écrans, uploadez votre créa et lancez. C\'est aussi simple que ça.',
    color: 'bg-cyan-50 text-cyan-600',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Créez votre compte',
    desc: 'Inscription gratuite en 30 secondes. Aucune carte bancaire requise pour démarrer.',
    icon: MousePointerClick,
  },
  {
    step: '02',
    title: 'Créez votre campagne',
    desc: 'Définissez vos dates, votre budget et uploadez vos visuels (vidéo ou image). Notre IA peut aussi générer votre créa.',
    icon: Sparkles,
  },
  {
    step: '03',
    title: 'Ciblez vos écrans',
    desc: 'Sélectionnez les écrans sur une carte interactive. Filtrez par localisation, type d\'établissement et audience.',
    icon: MapPin,
  },
  {
    step: '04',
    title: 'Lancez et suivez',
    desc: 'Publiez en un clic. Suivez les performances en temps réel depuis votre tableau de bord.',
    icon: TrendingUp,
  },
];

const USE_CASES = [
  {
    title: 'Restaurants & bars',
    desc: 'Promouvez votre menu du jour, vos soirées et événements directement sur les écrans des hôtels et résidences à proximité.',
    icon: '🍽️',
  },
  {
    title: 'Activités touristiques',
    desc: 'Jet ski, excursions, visites guidées… Touchez les vacanciers au moment où ils cherchent quoi faire.',
    icon: '🏄',
  },
  {
    title: 'Commerces locaux',
    desc: 'Boulangeries, boutiques, salons de coiffure — attirez une clientèle de passage avec des offres ciblées.',
    icon: '🛍️',
  },
  {
    title: 'Événements & festivals',
    desc: 'Concerts, marchés, expositions — communiquez sur les écrans des établissements environnants.',
    icon: '🎪',
  },
  {
    title: 'Agences immobilières',
    desc: 'Affichez vos biens à vendre ou à louer dans les halls d\'hôtels et résidences de la zone.',
    icon: '🏠',
  },
  {
    title: 'Services de santé',
    desc: 'Pharmacies, cabinets, cliniques — informez les résidents sur vos services et horaires.',
    icon: '⚕️',
  },
];

const TESTIMONIALS = [
  {
    quote: 'En 2 semaines sur NeoFilm, on a eu plus de réservations que sur un mois de flyers. Et on peut mesurer chaque diffusion.',
    name: 'Sophie L.',
    role: 'Gérante — Jet Ski Azur',
  },
  {
    quote: 'L\'outil de ciblage est redoutable. On ne diffuse que dans les hôtels 4 étoiles de la zone, et le ROI est immédiat.',
    name: 'Marc D.',
    role: 'Directeur marketing — Spa Riviera',
  },
  {
    quote: 'La preuve de diffusion certifiée, c\'est ce qui manquait à l\'affichage digital. Enfin de la transparence.',
    name: 'Julie T.',
    role: 'Media buyer — Agence Pulse',
  },
];

const FAQ = [
  {
    q: 'Combien coûte une campagne NeoFilm ?',
    a: 'NeoFilm fonctionne par packs TV. Le pack Diffusion démarre à 39€/mois pour 50 TV. Vous pouvez aussi ajouter un pack Catalogue (dès 18,90€/mois) pour apparaître dans la rubrique Activités locales. Voir la page Tarifs pour le détail.',
  },
  {
    q: 'Quels formats publicitaires sont acceptés ?',
    a: 'Vidéo (MP4, MOV, WebM) et image (JPG, PNG). Résolution recommandée : 1920×1080 (Full HD). Durée max : 30 secondes par spot. Vous pouvez aussi créer directement via notre éditeur intégré ou l\'IA générative.',
  },
  {
    q: 'Comment fonctionne le ciblage ?',
    a: 'Vous sélectionnez les écrans sur une carte interactive. Vous pouvez filtrer par ville, code postal, type d\'établissement (hôtel, résidence, cinéma), capacité d\'audience et créneaux horaires.',
  },
  {
    q: 'Comment suis-je sûr que ma pub est bien diffusée ?',
    a: 'Chaque diffusion génère une preuve cryptographique signée (HMAC + hash du média). Vous accédez à un rapport de diffusion détaillé avec horodatage, écran et durée effective.',
  },
  {
    q: 'Puis-je modifier une campagne en cours ?',
    a: 'Oui. Vous pouvez mettre en pause, modifier le budget, changer les créas ou ajuster le ciblage à tout moment depuis votre tableau de bord.',
  },
  {
    q: 'Y a-t-il un engagement minimum ?',
    a: 'Pour les packs jusqu\'à 200 TV, aucun engagement — abonnement mensuel résiliable à tout moment. Le pack 300 TV nécessite un engagement minimum de 6 mois.',
  },
];

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function AnnonceursPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-4 pt-32 pb-20 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-50/60 to-white" />
        <div className="relative mx-auto max-w-5xl text-center">
          <SectionReveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600">
              <Megaphone className="h-3.5 w-3.5" /> Pour les annonceurs
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Diffusez vos pubs sur des{' '}
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                écrans TV réels
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
              NeoFilm vous connecte à un réseau d&apos;écrans TV installés dans des hôtels, résidences et cinémas.
              Ciblez votre audience locale, mesurez chaque diffusion, et ne payez que pour ce qui est réellement affiché.
            </p>
          </SectionReveal>

          <SectionReveal delay={0.15} className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => { window.location.href = URLS.advertiserSignup; }}
              className="group flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 hover:shadow-[0_0_40px_-8px_rgba(59,130,246,0.5)]"
            >
              Créer mon compte gratuitement <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => { window.location.href = URLS.advertiserLogin; }}
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
              Pourquoi choisir NeoFilm ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Tout ce dont un annonceur a besoin pour des campagnes locales performantes.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <SectionReveal key={a.title} delay={i * 0.08}>
                <div className="group flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
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
              De l&apos;inscription à la diffusion, tout se fait en quelques minutes.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <SectionReveal key={step.step} delay={i * 0.1}>
                <div className="relative flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <span className="mt-4 text-xs font-bold uppercase tracking-widest text-blue-600">Étape {step.step}</span>
                  <h3 className="mt-2 text-[15px] font-bold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-500">{step.desc}</p>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cas d'usage ── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              NeoFilm s&apos;adapte à votre activité
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Quel que soit votre secteur, touchez une audience locale engagée.
            </p>
          </SectionReveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((uc, i) => (
              <SectionReveal key={uc.title} delay={i * 0.07}>
                <div className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                  <span className="text-2xl">{uc.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{uc.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">{uc.desc}</p>
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
              Ils font confiance à NeoFilm
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
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-10 text-center text-white sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Prêt à toucher votre audience locale ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-blue-100">
              Cr&eacute;ez votre premi&egrave;re campagne en quelques minutes. D&egrave;s 39&euro;/mois pour 50 TV.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={() => { window.location.href = URLS.advertiserSignup; }}
                className="group flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-blue-600 transition-all hover:shadow-xl"
              >
                Commencer gratuitement <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <p className="mt-5 text-xs text-blue-200">
              D&egrave;s 39&euro;/mois &middot; Sans engagement (jusqu&apos;&agrave; 200 TV) &middot; Lancement en 5 min
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

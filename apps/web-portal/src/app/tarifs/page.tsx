'use client';

import { useState } from 'react';
import {
  Check, ArrowRight, Megaphone, Monitor, Tv, Zap, Eye, BarChart3,
  Shield, Target, DollarSign, Film, ChevronRight, Users, Sparkles,
  MapPin, CheckCircle2, Info,
} from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { SectionReveal } from '@/components/section-reveal';

/* ------------------------------------------------------------------ */
/*  URLs                                                               */
/* ------------------------------------------------------------------ */

const URLS = {
  advertiserSignup: process.env.NEXT_PUBLIC_ADVERTISER_SIGNUP_URL ?? 'http://localhost:3003/signup',
  partnerSignup: process.env.NEXT_PUBLIC_PARTNER_SIGNUP_URL ?? 'http://localhost:3002/signup',
} as const;

/* ------------------------------------------------------------------ */
/*  PRICING DATA (real pricing engine values)                          */
/* ------------------------------------------------------------------ */

const DIFFUSION_PACKS = [
  { tvCount: 50, price: 39.00, perTv: '0,78' },
  { tvCount: 100, price: 66.30, perTv: '0,66' },
  { tvCount: 150, price: 109.39, perTv: '0,73' },
  { tvCount: 200, price: 175.03, perTv: '0,88' },
  { tvCount: 300, price: 262.55, perTv: '0,88', minDuration: 6 },
];

const CATALOGUE_PACKS = [
  { tvCount: 50, price: 18.90, perTv: '0,38' },
  { tvCount: 100, price: 27.41, perTv: '0,27' },
  { tvCount: 150, price: 38.37, perTv: '0,26' },
  { tvCount: 200, price: 51.80, perTv: '0,26' },
  { tvCount: 300, price: 67.33, perTv: '0,22', minDuration: 6 },
];

const ALL_FEATURES = [
  'Ciblage géographique par écran',
  'Éditeur vidéo + IA générative',
  'Analytics temps réel + export',
  'Preuve de diffusion certifiée (HMAC)',
  'Support client dédié',
  'Tableau de bord analytique',
];

const PARTNER_BENEFITS = [
  { I: DollarSign, title: '10 à 20% de rétrocession', desc: 'Vous touchez une commission sur chaque abonnement annonceur diffusé sur vos écrans.' },
  { I: Zap, title: 'Installation 5 min', desc: 'Aucun matériel supplémentaire. Votre Smart TV suffit.' },
  { I: Shield, title: 'Contenu modéré', desc: 'Chaque publicité est validée avant diffusion.' },
  { I: BarChart3, title: 'Tableau de bord', desc: 'Suivez vos revenus et écrans en temps réel.' },
  { I: Users, title: 'Contenu utile', desc: 'Vos visiteurs accèdent au streaming, TNT et infos locales.' },
  { I: CheckCircle2, title: 'Sans engagement', desc: 'Désactivez à tout moment depuis votre dashboard.' },
];

const FAQ = [
  {
    q: 'Quelle est la différence entre Diffusion et Catalogue\u00a0?',
    a: 'Le pack Diffusion permet de diffuser vos publicités vidéo et image sur les écrans TV du réseau. Le pack Catalogue permet d\'afficher votre établissement dans la rubrique "Activités locales" de l\'interface TV, visible par tous les visiteurs.',
  },
  {
    q: 'Puis-je combiner Diffusion et Catalogue\u00a0?',
    a: 'Oui. Vous pouvez souscrire un pack Diffusion et un pack Catalogue séparément. Par exemple, Diffusion 200 TV + Catalogue 150 TV = 175,03€ + 38,37€ = 213,40€/mois.',
  },
  {
    q: 'Pourquoi le pack 300 TV nécessite un engagement\u00a0?',
    a: 'Le pack 300 TV offre le meilleur coût par TV. En contrepartie, un engagement minimum de 6 mois est requis pour garantir la stabilité du réseau à cette échelle.',
  },
  {
    q: 'Comment fonctionne la facturation\u00a0?',
    a: 'Vous souscrivez un abonnement mensuel via Stripe. La facturation est récurrente chaque mois. Vous pouvez également opter pour une facturation trimestrielle ou annuelle.',
  },
  {
    q: 'Les partenaires paient-ils quelque chose\u00a0?',
    a: 'Non. L\'inscription et l\'utilisation sont entièrement gratuites pour les partenaires. Ils touchent une rétrocession de 10 à 20% sur chaque abonnement annonceur diffusé sur leurs écrans.',
  },
  {
    q: 'Qu\'est-ce que la preuve de diffusion certifiée\u00a0?',
    a: 'Chaque diffusion de publicité génère une preuve cryptographique (signature HMAC + hash du média) qui certifie que votre annonce a été diffusée sur l\'écran prévu, à l\'heure prévue.',
  },
  {
    q: 'Et si j\'ai besoin de plus de 300 TV\u00a0?',
    a: 'Au-delà de 300 TV, nous proposons des tarifs sur mesure. Contactez-nous pour un devis personnalisé adapté à votre réseau.',
  },
];

/* ------------------------------------------------------------------ */
/*  COMPONENTS                                                         */
/* ------------------------------------------------------------------ */

function PricingToggle({ tab, setTab }: { tab: 'annonceur' | 'partenaire'; setTab: (t: 'annonceur' | 'partenaire') => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-1">
      <button
        onClick={() => setTab('annonceur')}
        className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
          tab === 'annonceur' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <Megaphone className="h-3.5 w-3.5" /> Annonceur
      </button>
      <button
        onClick={() => setTab('partenaire')}
        className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
          tab === 'partenaire' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <Monitor className="h-3.5 w-3.5" /> Partenaire
      </button>
    </div>
  );
}

function PackTable({ title, subtitle, packs, accent }: {
  title: string;
  subtitle: string;
  packs: typeof DIFFUSION_PACKS;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`px-6 py-5 ${accent}`}>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-1 text-sm text-white/80">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-6 py-3">Nombre de TV</th>
              <th className="px-6 py-3">Prix / mois</th>
              <th className="px-6 py-3">Co&ucirc;t / TV</th>
              <th className="px-6 py-3">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack, i) => (
              <tr key={pack.tvCount} className={`border-b border-gray-50 ${i === packs.length - 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-6 py-4">
                  <span className="text-sm font-bold text-gray-900">{pack.tvCount} TV</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-lg font-black text-gray-900">{pack.price.toFixed(2).replace('.', ',')} &euro;</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">{pack.perTv} &euro;/TV</span>
                </td>
                <td className="px-6 py-4">
                  {pack.minDuration ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                      Min. {pack.minDuration} mois
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">Sans engagement</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function TarifsPage() {
  const [tab, setTab] = useState<'annonceur' | 'partenaire'>('annonceur');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="px-4 pt-32 pb-16 text-center sm:pt-36">
        <SectionReveal>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Des tarifs <span className="bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">simples et transparents</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
            Choisissez votre pack TV selon le nombre d&apos;&eacute;crans que vous souhaitez cibler. Abonnement mensuel, r&eacute;siliable &agrave; tout moment.
          </p>
        </SectionReveal>

        <SectionReveal delay={0.15} className="mt-10">
          <PricingToggle tab={tab} setTab={setTab} />
        </SectionReveal>
      </section>

      {/* ── Annonceur packs ── */}
      {tab === 'annonceur' && (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-4xl space-y-8">
            {/* Diffusion pack */}
            <SectionReveal>
              <PackTable
                title="Pack Diffusion"
                subtitle="Diffusez vos publicités vidéo et image sur les écrans TV du réseau"
                packs={DIFFUSION_PACKS}
                accent="bg-blue-600"
              />
            </SectionReveal>

            {/* Catalogue pack */}
            <SectionReveal delay={0.15}>
              <PackTable
                title="Pack Catalogue"
                subtitle="Affichez votre établissement dans la rubrique Activités locales de l'interface TV"
                packs={CATALOGUE_PACKS}
                accent="bg-violet-500"
              />
            </SectionReveal>

            {/* Bundle example */}
            <SectionReveal delay={0.25}>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 sm:p-8">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Exemple de combinaison</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Diffusion 200 TV + Catalogue 150 TV = <span className="font-bold">175,03&euro; + 38,37&euro; = 213,40&euro;/mois</span>
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      Au-del&agrave; de 300 TV, contactez-nous pour un tarif sur mesure.
                    </p>
                  </div>
                </div>
              </div>
            </SectionReveal>

            {/* Features included */}
            <SectionReveal delay={0.3}>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8">
                <h4 className="text-sm font-bold text-gray-900">Inclus dans tous les packs</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {ALL_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </SectionReveal>

            {/* CTA */}
            <SectionReveal delay={0.35} className="text-center">
              <button
                onClick={() => { window.location.href = URLS.advertiserSignup; }}
                className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 hover:shadow-[0_0_40px_-8px_rgba(59,130,246,0.5)]"
              >
                Cr&eacute;er mon compte annonceur <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </SectionReveal>
          </div>
        </section>
      )}

      {/* ── Partenaire (gratuit) ── */}
      {tab === 'partenaire' && (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-4xl">
            {/* Big free card */}
            <SectionReveal>
              <div className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50/50 to-white p-8 shadow-sm sm:p-12">
                <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-100/50" />
                <div className="relative">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">
                    <Monitor className="h-3 w-3" /> Partenaire
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    100% gratuit pour les partenaires
                  </h2>
                  <p className="mt-3 max-w-xl text-gray-500">
                    Installez NeoFilm sur vos &eacute;crans TV et g&eacute;n&eacute;rez des revenus passifs.
                    Aucun co&ucirc;t, aucun engagement &mdash; vous touchez 10 &agrave; 20% de r&eacute;trocession par abonnement annonceur.
                  </p>
                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-5xl font-black tracking-tight text-violet-600">0&euro;</span>
                    <span className="text-lg text-gray-400">/ pour toujours</span>
                  </div>
                  <button
                    onClick={() => { window.location.href = URLS.partnerSignup; }}
                    className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-violet-600 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]"
                  >
                    Devenir partenaire <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            </SectionReveal>

            {/* Benefits grid */}
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_BENEFITS.map((b, i) => (
                <SectionReveal key={b.title} delay={i * 0.08}>
                  <div className="flex gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-violet-200 hover:shadow-md">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                      <b.I className="h-5 w-5 text-violet-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{b.title}</h4>
                      <p className="mt-0.5 text-xs text-gray-500">{b.desc}</p>
                    </div>
                  </div>
                </SectionReveal>
              ))}
            </div>

            {/* Revenue split explanation */}
            <SectionReveal delay={0.3} className="mt-12">
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8">
                <h3 className="text-lg font-bold text-gray-900">Comment fonctionne le partage de revenus</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Chaque mois, les revenus g&eacute;n&eacute;r&eacute;s par les publicit&eacute;s diffus&eacute;es sur vos &eacute;crans sont calcul&eacute;s automatiquement.
                  Pour chaque abonnement annonceur diffus&eacute; sur vos &eacute;crans, vous recevez une r&eacute;trocession de <span className="font-bold text-violet-600">10 &agrave; 20%</span>.
                  Le paiement est effectu&eacute; chaque mois par virement automatique via Stripe Connect.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-violet-100 bg-white p-4 text-center">
                    <p className="text-3xl font-black text-violet-600">10-20%</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">R&eacute;trocession pour vous</p>
                    <p className="text-xs text-gray-400">Par abonnement annonceur diffus&eacute;</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
                    <p className="text-3xl font-black text-gray-300">0&euro;</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">Co&ucirc;t pour vous</p>
                    <p className="text-xs text-gray-400">Maintenance, support, infrastructure</p>
                  </div>
                </div>
              </div>
            </SectionReveal>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section className="border-t border-gray-100 px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <SectionReveal className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions sur les tarifs</h2>
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

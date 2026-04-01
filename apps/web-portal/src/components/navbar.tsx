'use client';

import { useState, useEffect } from 'react';
import { Film, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const URLS = {
  advertiser: process.env.NEXT_PUBLIC_ADVERTISER_URL ?? 'http://localhost:3003/login',
  advertiserSignup: process.env.NEXT_PUBLIC_ADVERTISER_SIGNUP_URL ?? 'http://localhost:3003/signup',
} as const;

const NAV_ITEMS = [
  { label: 'Accueil', href: '/' },
  { label: 'Tarifs', href: '/tarifs' },
  { label: 'Annonceurs', href: '/annonceurs' },
  { label: 'Partenaires', href: '/partenaires' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav className="fixed top-4 right-0 left-0 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2">
        {/* Logo pill */}
        <Link href="/" className="flex h-12 items-center gap-2.5 rounded-full border border-gray-200 bg-white/90 px-5 shadow-sm backdrop-blur-xl">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B1220]">
            <Film className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-gray-900">NeoFilm</span>
        </Link>

        {/* Center links pill */}
        <div className="hidden h-12 items-center rounded-full border border-gray-200 bg-white/90 shadow-sm backdrop-blur-xl md:flex">
          {NAV_ITEMS.map((item, i, arr) => {
            const isActive = mounted && (pathname === item.href || (item.href === '/' && pathname === '/'));
            return (
              <span key={item.label} className="flex items-center">
                <Link
                  href={item.href}
                  className={`relative cursor-pointer px-5 text-sm font-medium transition-colors ${
                    isActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-[#0B1220]" />
                  )}
                </Link>
                {i < arr.length - 1 && <span className="h-4 w-px bg-gray-200" />}
              </span>
            );
          })}
        </div>

        {/* Right CTA pill */}
        <div className="flex h-12 items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-2 shadow-sm backdrop-blur-xl">
          <button
            onClick={() => { window.location.href = URLS.advertiser; }}
            className="hidden rounded-full px-4 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 sm:block"
          >
            Connexion
          </button>
          <button
            onClick={() => { window.location.href = URLS.advertiserSignup; }}
            className="flex items-center gap-1.5 rounded-full bg-[#0B1220] px-5 py-2 text-sm font-medium text-white transition-all hover:bg-[#151f33]"
          >
            Commencer
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </nav>
  );
}

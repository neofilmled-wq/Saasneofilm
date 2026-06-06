import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NeoFilm TV',
  description: 'NeoFilm TV Display Application',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        {/* Polyfills for Chrome 74 (old Android TV WebViews) */}
        <script dangerouslySetInnerHTML={{ __html: `
if(!Promise.allSettled){Promise.allSettled=function(a){return Promise.all(a.map(function(p){return Promise.resolve(p).then(function(v){return{status:'fulfilled',value:v}},function(e){return{status:'rejected',reason:e}})}))}}
if(!Object.fromEntries){Object.fromEntries=function(a){var o={};(Array.isArray(a)?a:Array.from(a)).forEach(function(e){o[e[0]]=e[1]});return o}}
if(!Array.prototype.flat){Array.prototype.flat=function(d){d=d===undefined?1:d;return d>0?this.reduce(function(a,v){return a.concat(Array.isArray(v)?v.flat(d-1):v)},[]):this.slice()}}
if(!Array.prototype.flatMap){Array.prototype.flatMap=function(f){return this.map(f).flat()}}
if(!String.prototype.matchAll){String.prototype.matchAll=function(r){var m,a=[];r=new RegExp(r,r.flags.indexOf('g')===-1?r.flags+'g':r.flags);while((m=r.exec(this))!==null)a.push(m);return a}}
if(typeof globalThis==='undefined'){window.globalThis=window}
` }} />
        {/* Boot splash — inline text logo (no static asset dependency). Injected
            via <head> script so it lives OUTSIDE the React hydration tree. The
            script creates the splash div dynamically, then a MutationObserver
            removes it once React renders [data-neofilm-ready]. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var d=document,s=d.createElement('div');
  s.id='neofilm-boot-splash';
  s.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse 80% 60% at 30% 20%, #1a1f4a 0%, #050714 55%),#050714;color:#fff;font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased';
  s.innerHTML='<div style="display:flex;align-items:center;gap:18px;font-weight:800;letter-spacing:0.05em;font-size:64px;line-height:1;text-shadow:0 4px 32px rgba(230,57,70,0.35)"><span style="display:inline-block;width:18px;height:60px;background:linear-gradient(180deg,#E63946,#b71c2c);border-radius:4px;box-shadow:0 0 32px rgba(230,57,70,0.6)"></span><span>NEO<span style="color:#E63946">FILM</span></span></div><div style="margin-top:2rem;font-size:14px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.55)">Chargement</div><div style="margin-top:1.5rem;width:64px;height:3px;background:#E63946;border-radius:2px;animation:nf-pulse 1.5s ease-in-out infinite;box-shadow:0 0 14px rgba(230,57,70,0.6)"></div><style>@keyframes nf-pulse{0%,100%{opacity:.3;width:64px}50%{opacity:1;width:128px}}</style>';
  d.addEventListener('DOMContentLoaded',function(){
    d.body.insertBefore(s,d.body.firstChild);
    var o=new MutationObserver(function(){
      if(d.querySelector('[data-neofilm-ready]')){
        s.style.opacity='0';s.style.transition='opacity 0.3s';
        setTimeout(function(){if(s.parentNode)s.remove()},300);o.disconnect();
      }
    });
    o.observe(d.body,{childList:true,subtree:true});
    setTimeout(function(){if(s.parentNode)s.remove()},15000);
  });
})();
`,
          }}
        />
      </head>
      <body className={`${outfit.className} neo-tv-body h-screen w-screen overflow-hidden antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

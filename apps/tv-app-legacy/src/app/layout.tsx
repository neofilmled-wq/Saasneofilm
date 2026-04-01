import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const outfit = Outfit({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });

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
        {/* Boot splash — injected via <head> script so it lives OUTSIDE the React
            hydration tree. The script creates the splash div dynamically, then a
            MutationObserver removes it once React renders [data-neofilm-ready]. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var d=document,s=d.createElement('div');
  s.id='neofilm-boot-splash';
  s.style.cssText='position:fixed;top:0;right:0;bottom:0;left:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0a0f;color:#fff;font-family:system-ui,sans-serif';
  s.innerHTML='<div style="font-size:3rem;font-weight:700;letter-spacing:-0.02em"><span style="color:#3b82f6">NEO</span>FILM</div><div style="margin-top:1.5rem;font-size:1.25rem;opacity:0.6">Chargement...</div><div style="margin-top:2rem;width:4rem;height:4px;background:#3b82f6;border-radius:2px;animation:nf-pulse 1.5s ease-in-out infinite"></div><style>@keyframes nf-pulse{0%,100%{opacity:.3;width:4rem}50%{opacity:1;width:8rem}}</style>';
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
      <body className={`${outfit.className} h-screen w-screen overflow-hidden antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

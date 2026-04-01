import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE = 'https://raw.githubusercontent.com/LeBazarDeBryan/XTVZ_/main/Stream/Live';

const TNT_CHANNELS = [
  { number: 1,  name: 'TF1',               streamUrl: `${BASE}/TF1.m3u8` },
  { number: 2,  name: 'France 2',          streamUrl: `${BASE}/France_2.m3u8` },
  { number: 3,  name: 'France 3',          streamUrl: `${BASE}/France_3.m3u8` },
  { number: 4,  name: 'Canal+',            streamUrl: `${BASE}/Canal+.m3u8` },
  { number: 5,  name: 'France 5',          streamUrl: `${BASE}/France_5.m3u8` },
  { number: 6,  name: 'M6',                streamUrl: `${BASE}/M6.m3u8` },
  { number: 7,  name: 'Arte',              streamUrl: 'https://artesimulcast.akamaized.net/hls/live/2031003/artelive_fr/index.m3u8' },
  { number: 8,  name: 'C8',                streamUrl: `${BASE}/C8.m3u8` },
  { number: 9,  name: 'W9',                streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/w9/browser-HLS8/w9.m3u8' },
  { number: 10, name: 'TMC',               streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/tmc/browser-HLS8/tmc.m3u8' },
  { number: 11, name: 'TFX',               streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/nt1/browser-HLS8/nt1.m3u8' },
  { number: 12, name: 'NRJ 12',            streamUrl: 'https://nrj12.nrjaudio.fm/hls/live/2038374/nrj_12/master.m3u8' },
  { number: 13, name: 'LCP',               streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/lcp/browser-HLS8/lcp.m3u8' },
  { number: 14, name: 'France 4',          streamUrl: `${BASE}/France_4.m3u8` },
  { number: 15, name: 'BFM TV',            streamUrl: 'https://live-cdn-stream-euw1.bfmtv.bct.nextradiotv.com/master.m3u8' },
  { number: 16, name: 'CNews',             streamUrl: `${BASE}/CNews.m3u8` },
  { number: 17, name: 'CStar',             streamUrl: `${BASE}/CStar.m3u8` },
  { number: 18, name: 'Gulli',             streamUrl: 'https://origin-caf900c010ea8046.live.6cloud.fr/out/v1/c65696b42ca34e97a9b5f54758d6dd50/cmaf/hlsfmp4_short_q2hyb21h_gulli_sd_index.m3u8' },
  { number: 19, name: 'TF1 Séries Films',  streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/hd1/browser-HLS8/hd1.m3u8' },
  { number: 20, name: "L'Équipe",          streamUrl: 'https://dshn8inoshngm.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-gac2i63dmu8b7/LEquipe_FR.m3u8' },
  { number: 21, name: '6ter',              streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/6ter/browser-HLS8/6ter.m3u8' },
  { number: 22, name: 'RMC Story',         streamUrl: `${BASE}/RMC_Story.m3u8` },
  { number: 23, name: 'RMC Découverte',    streamUrl: 'https://viamotionhsi.netplus.ch/live/eds/rmcdecouverte/browser-HLS8/rmcdecouverte.m3u8' },
  { number: 24, name: 'Chérie 25',         streamUrl: `${BASE}/Cherie25.m3u8` },
  { number: 25, name: 'France 24',         streamUrl: 'https://live.france24.com/hls/live/2037179-b/F24_FR_HI_HLS/master_5000.m3u8' },
  { number: 26, name: 'franceinfo',        streamUrl: `${BASE}/franceinfo.m3u8` },
];

async function main() {
  const deleted = await prisma.tvChannel.deleteMany({});
  console.log(`Deleted ${deleted.count} old channels`);

  for (const ch of TNT_CHANNELS) {
    await prisma.tvChannel.create({
      data: {
        name: ch.name,
        number: ch.number,
        streamUrl: ch.streamUrl,
        category: 'GENERAL',
        isActive: true,
      },
    });
    console.log(`  [${ch.number}] ${ch.name}`);
  }

  console.log(`\n${TNT_CHANNELS.length} chaînes TNT ajoutées — TOUTES actives`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

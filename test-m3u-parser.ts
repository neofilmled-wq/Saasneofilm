/**
 * M3U Parser — extrait les chaînes d'une playlist M3U/M3U8
 * Usage: npx tsx test-m3u-parser.ts
 */

interface M3UChannel {
  name: string;          // ex: "TF1 HD (720p) [Geo-Blocked]"
  tvgId: string;         // ex: "TF1.fr@HD"
  tvgLogo: string;       // URL du logo
  group: string;         // ex: "Entertainment"
  streamUrl: string;     // URL du flux (.m3u8 ou .mpd)
}

function parseM3U(content: string): M3UChannel[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const channels: M3UChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF:')) continue;

    const infoLine = lines[i];
    const streamUrl = lines[i + 1] || '';
    if (!streamUrl || streamUrl.startsWith('#')) continue;

    // Parse les attributs de #EXTINF
    const tvgId = infoLine.match(/tvg-id="([^"]*)"/)?.[1] ?? '';
    const tvgLogo = infoLine.match(/tvg-logo="([^"]*)"/)?.[1] ?? '';
    const group = infoLine.match(/group-title="([^"]*)"/)?.[1] ?? '';
    // Le nom est après la dernière virgule
    const name = infoLine.split(',').slice(1).join(',').trim();

    channels.push({ name, tvgId, tvgLogo, group, streamUrl });
  }

  return channels;
}

function searchChannels(channels: M3UChannel[], query: string): M3UChannel[] {
  const q = query.toLowerCase();
  return channels.filter(ch =>
    ch.name.toLowerCase().includes(q) || ch.tvgId.toLowerCase().includes(q)
  );
}

// --- Test ---
async function main() {
  const url = 'https://iptv-org.github.io/iptv/countries/fr.m3u';
  console.log(`Fetching playlist: ${url}\n`);

  const res = await fetch(url);
  const text = await res.text();

  const channels = parseM3U(text);
  console.log(`Total chaînes parsées: ${channels.length}\n`);

  // Recherche TF1
  const tf1Results = searchChannels(channels, 'TF1');
  console.log(`=== Résultats pour "TF1" (${tf1Results.length}) ===`);
  for (const ch of tf1Results) {
    console.log(`  📺 ${ch.name}`);
    console.log(`     ID:     ${ch.tvgId}`);
    console.log(`     Groupe: ${ch.group}`);
    console.log(`     Logo:   ${ch.tvgLogo}`);
    console.log(`     Stream: ${ch.streamUrl}`);
    console.log();
  }

  // Recherche France 2
  const fr2Results = searchChannels(channels, 'France 2');
  console.log(`=== Résultats pour "France 2" (${fr2Results.length}) ===`);
  for (const ch of fr2Results) {
    console.log(`  📺 ${ch.name}`);
    console.log(`     Stream: ${ch.streamUrl}`);
    console.log();
  }

  // Top 10 chaînes TNT classiques
  const tnt = ['TF1', 'France 2', 'France 3', 'France 4', 'France 5', 'M6', 'Arte', 'C8', 'W9', 'TMC', 'BFM'];
  console.log(`=== Chaînes TNT trouvées ===`);
  for (const name of tnt) {
    const found = searchChannels(channels, name);
    const main = found[0];
    console.log(`  ${main ? '✅' : '❌'} ${name} ${main ? `→ ${main.streamUrl}` : '(non trouvée)'}`);
  }
}

main().catch(console.error);

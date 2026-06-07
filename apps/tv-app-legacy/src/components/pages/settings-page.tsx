'use client';

import { Wifi, Volume2, Monitor, Globe, Bluetooth, Info, Settings as SettingsIcon } from 'lucide-react';
import { useDevice } from '@/providers/device-provider';

interface SettingTile {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
}

const SETTING_TILES: SettingTile[] = [
  { key: 'wifi',      label: 'Wi-Fi',     desc: 'Configurer le réseau sans fil', icon: Wifi },
  { key: 'display',   label: 'Affichage', desc: 'Résolution, luminosité',         icon: Monitor },
  { key: 'sound',     label: 'Son',       desc: 'Volume, sortie audio',           icon: Volume2 },
  { key: 'language',  label: 'Langue',    desc: 'Langue de l\'interface',         icon: Globe },
  { key: 'bluetooth', label: 'Bluetooth', desc: 'Appairer télécommandes / casque',icon: Bluetooth },
  { key: 'about',     label: 'À propos',  desc: 'Numéro de série, version',       icon: Info },
];

export function SettingsPage() {
  const { deviceId, screenId, isConnected, state } = useDevice();

  const screenName =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_screen_name') : null;
  const serial =
    typeof window !== 'undefined' ? localStorage.getItem('neofilm_device_serial') : null;

  const openSystemSettings = () => {
    try {
      (window as { NeoFilmAndroid?: { openSystemSettings?: () => void } }).NeoFilmAndroid?.openSystemSettings?.();
    } catch (e) {
      console.error('[Settings] openSystemSettings failed:', e);
    }
  };

  return (
    <div className="neo-subscreen-main" style={{ height: '100%', overflow: 'auto' }}>
      <div className="neo-sub-head">
        <div>
          <div className="neo-crumb">Accueil › Paramètres</div>
          <h1>Paramètres</h1>
        </div>
        <div className="neo-count">{isConnected ? 'Système connecté' : 'Hors ligne'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {SETTING_TILES.map((tile) => {
          const Ic = tile.icon;
          return (
            <button
              key={tile.key}
              data-tv-focusable
              onClick={openSystemSettings}
              className="neo-addr"
              style={{
                appearance: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                cursor: 'pointer',
                gridTemplateColumns: '88px 1fr auto',
                textAlign: 'left',
              }}
            >
              <div
                className="neo-addr-thumb"
                style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff' }}
              >
                <Ic size={24} />
              </div>
              <div className="neo-addr-body">
                <div className="neo-name">{tile.label}</div>
                <div className="neo-desc">{tile.desc}</div>
              </div>
              <div className="neo-addr-cta">Ouvrir →</div>
            </button>
          );
        })}
      </div>

      {/* Device info footer */}
      <div
        style={{
          marginTop: 24,
          padding: 18,
          border: '1px solid var(--neo-line)',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--neo-t-3)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <SettingsIcon size={12} /> Informations appareil
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          <div style={{ color: 'var(--neo-t-3)' }}>État</div>
          <div style={{ color: 'var(--neo-t-1)', fontFamily: 'monospace' }}>{state}</div>
          <div style={{ color: 'var(--neo-t-3)' }}>Écran</div>
          <div style={{ color: 'var(--neo-t-1)', fontFamily: 'monospace' }}>
            {screenName || screenId || '—'}
          </div>
          <div style={{ color: 'var(--neo-t-3)' }}>Appareil</div>
          <div
            style={{
              color: 'var(--neo-t-1)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deviceId || '—'}
          </div>
          <div style={{ color: 'var(--neo-t-3)' }}>Numéro de série</div>
          <div
            style={{
              color: 'var(--neo-t-1)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {serial || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

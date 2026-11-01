import { useEffect, useState } from 'react';
import type { SongFiles } from '../tracks';

const PROJECT_KEY = 'pdm2000_project';

/**
 * OPNAvoid, served from this site so it shares its localStorage: it starts on whatever project is
 * stored as current, so the song's MML goes there before the iframe loads.
 */
async function storeProject({ name, files }: SongFiles): Promise<void> {
  const res = await fetch(files.mml.url);
  if (!res.ok) throw new Error(`cannot load ${files.mml.file}`);
  const now = Date.now();
  localStorage.setItem(PROJECT_KEY, JSON.stringify({
    id: `dante98-ii-${name.slice(0, 2)}`,
    name: `Dante98 II ${name}`,
    mml: await res.text(),
    sampleRefs: [],
    settings: { sampleRate: 44100 },
    createdAt: now,
    updatedAt: now,
  }));
}

export function OpnavoidModal({ song, onClose }: { song: SongFiles; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');

  useEffect(() => {
    let live = true;
    storeProject(song).then(
      () => live && setState('ready'),
      (e: Error) => live && setState(e.message),
    );
    return () => {
      live = false;
    };
  }, [song]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="opnavoid-modal" role="dialog" aria-modal="true" aria-label={`OPNAvoid: ${song.name}`} onClick={onClose}>
      <div className="opnavoid-window" onClick={(e) => e.stopPropagation()}>
        <div className="opnavoid-title">
          <span>
            {song.name}
            <small>OPNAvoid</small>
          </span>
          <button aria-label="Close OPNAvoid" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {state === 'ready' && <iframe title={`OPNAvoid: ${song.name}`} src={`${import.meta.env.BASE_URL}opnavoid/index.html`} allow="autoplay" />}
        {state !== 'ready' && state !== 'loading' && <p className="music-error">{state}</p>}
      </div>
    </div>
  );
}

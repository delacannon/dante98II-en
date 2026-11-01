import { useState } from 'react';
import { songs, type DownloadFormat, type SongFiles } from '../tracks';

const FORMATS: DownloadFormat[] = ['vgz', 'mml'];

const formatSize = (bytes: number): string =>
  bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.ceil(bytes / 1e3)} KB`;

/** Soundtrack files of every song, one link per format; starts collapsed where it would cover the box. */
export function DownloadList({ onOpenMml }: { onOpenMml: (song: SongFiles) => void }) {
  const [open, setOpen] = useState(() => !matchMedia('(max-width: 1100px)').matches);

  if (!open) {
    return (
      <button className="side-open" onClick={() => setOpen(true)}>
        ↓ Downloads
      </button>
    );
  }

  return (
    <aside className="side-panel" aria-label="Soundtrack downloads">
      <header className="side-header">
        <div>
          <h2>Soundtrack</h2>
          <p>{songs.length} tracks · VGZ / MML</p>
        </div>
        <button aria-label="Close downloads" title="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <ol className="downloads-list">
        {songs.map((song) => {
          const { name, files } = song;
          return (
          <li key={name}>
            <span className="downloads-number">{name.slice(0, 2)}</span>
            <div className="downloads-song">
              <span className="downloads-name" title={name.slice(3)}>{name.slice(3)}</span>
              <button className="downloads-opnavoid" title="Open this song's MML in OPNAvoid" onClick={() => onOpenMml(song)}>
                OPNAvoid
              </button>
              <span className="downloads-links">
                {FORMATS.map((format) => (
                  <a key={format} href={files[format].url} download={files[format].file} title={files[format].file}>
                    {format}
                    <small>{formatSize(files[format].size)}</small>
                  </a>
                ))}
              </span>
            </div>
          </li>
          );
        })}
      </ol>
    </aside>
  );
}

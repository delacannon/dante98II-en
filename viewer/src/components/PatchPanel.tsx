import { useRef, useState, type DragEvent } from 'react';
import { patchDisk, type PatchManifest, type PatchResult } from './patcher';

const VERSION = '2026.10.25';
const base = `${import.meta.env.BASE_URL}patch/`;
const IMAGE = /\.(hdi|nhd|hdm|xdf)$/i;

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; name: string }
  | { kind: 'done'; name: string; results: PatchResult[] }
  | { kind: 'already'; results: PatchResult[] }
  | { kind: 'failed'; message: string; results: PatchResult[] };

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot load ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function save(data: Uint8Array, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart]));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function run(file: File): Promise<Status> {
  const manifest = (await (await fetch(`${base}manifest.json`)).json()) as PatchManifest;
  const entries = await Promise.all(
    manifest.files.map(async (f) => [f.patch, await fetchBytes(`${base}${f.patch}`)] as const),
  );
  const { disk, results } = patchDisk(manifest, new Uint8Array(await file.arrayBuffer()), new Map(entries));
  if (!disk) return { kind: 'failed', message: 'Nothing was written: this is not the original disk.', results };
  if (results.every((r) => r.status === 'already')) return { kind: 'already', results };
  const name = file.name.replace(/(\.[^.]+)$/, `-${manifest.lang}$1`);
  save(disk, name);
  return { kind: 'done', name, results };
}

function ResultList({ results }: { results: PatchResult[] }) {
  return (
    <ul className="patch-results">
      {results.map(({ path, status, error }) => (
        <li key={path} className={status}>
          {path.split('/').pop()}
          <span>{status === 'error' ? error : status === 'already' ? 'already patched' : 'patched'}</span>
        </li>
      ))}
    </ul>
  );
}

/** The English translation patch; starts collapsed where it would cover the box. */
export function PatchPanel() {
  const [open, setOpen] = useState(() => !matchMedia('(max-width: 1100px)').matches);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = async (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE.test(file.name)) {
      setStatus({ kind: 'failed', message: `${file.name} is not a .hdi, .nhd or .hdm disk image.`, results: [] });
      return;
    }
    setStatus({ kind: 'working', name: file.name });
    await new Promise((resolve) => setTimeout(resolve, 20)); // let "Patching…" paint
    try {
      setStatus(await run(file));
    } catch (e) {
      setStatus({ kind: 'failed', message: (e as Error).message, results: [] });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void patch(e.dataTransfer.files[0]);
  };

  if (!open) {
    return (
      <button className="side-open right" onClick={() => setOpen(true)}>
        EN Patch
      </button>
    );
  }

  const working = status.kind === 'working';
  return (
    <aside className="side-panel right" aria-label="English patch">
      <header className="side-header">
        <div>
          <h2>English Patch</h2>
          <p>Version {VERSION}</p>
        </div>
        <button aria-label="Close patch panel" title="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </header>
      <div className="patch-body">
        <img className="patch-shot" src={`${base}menu-en.png`} width={640} height={400} alt="Dante98 II main menu in English" />
        <p>The RPG maker and its sample game in English. You need your own hard-disk copy of the game.</p>
        <button
          className={over ? 'patch-drop over' : 'patch-drop'}
          disabled={working}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          {working ? `Patching ${status.name}…` : 'Drop disk image here'}
          <small>{working ? 'Please wait' : '.hdi / .nhd / .hdm, or click to choose'}</small>
        </button>
        <input
          ref={input}
          type="file"
          accept=".hdi,.nhd,.hdm,.xdf"
          hidden
          onChange={(e) => {
            void patch(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="patch-note">Stays on your computer: nothing is uploaded. Your original image is not changed.</p>

        {status.kind === 'done' && (
          <div className="patch-status done" role="status">
            <b>Patched</b> {status.name} saved to your downloads.
            <ResultList results={status.results} />
          </div>
        )}
        {status.kind === 'already' && (
          <div className="patch-status" role="status">
            <b>Already patched</b> Mount this image as it is.
            <ResultList results={status.results} />
          </div>
        )}
        {status.kind === 'failed' && (
          <div className="patch-status failed" role="alert">
            {status.message}
            <ResultList results={status.results} />
          </div>
        )}

        <h3>Then mount it</h3>
        <ul>
          <li><b>np21w:</b> HardDisk → IDE #0 → Open…, then Emulate → Reset</li>
          <li><b>T98-Next:</b> mount as first hard disk (.nhd), then reset</li>
          <li><b>anyPC98:</b> drop the image on the window</li>
        </ul>

        <p className="patch-note">Start a new game: Japanese bookmarks can resume at the wrong line.</p>

        <p className="patch-note">
          Patch source: <a href="https://github.com/delacannon/dante98II-en" target="_blank" rel="noreferrer">delacannon/dante98II-en</a>
        </p>

        <a className="patch-kofi" href="https://ko-fi.com/alammo" target="_blank" rel="noreferrer">
          ♥ Support on Ko-fi
        </a>

        <iframe
          className="patch-video"
          src="https://www.youtube-nocookie.com/embed/N_WwWSnwjBA"
          title="Dante98 II video"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </aside>
  );
}

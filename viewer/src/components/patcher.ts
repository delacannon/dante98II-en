/**
 * Applies the English patch to a PC-98 hard-disk image, in the page. Ported from the release's patch.html:
 * BPS patches for the files in the image's DOS (FAT) partition. Every file is checked before anything is
 * written, and read back after, so a disk is never half-patched.
 */
export interface PatchFile {
  path: string;
  patch: string;
  source: { size: number; crc32: string };
  target: { size: number; crc32: string };
}

export interface PatchManifest {
  lang: string;
  version: string;
  files: PatchFile[];
}

export interface PatchResult {
  path: string;
  status: 'patched' | 'already' | 'error';
  error?: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const hex = (crc: number) => crc.toString(16).padStart(8, '0');
const u16 = (d: Uint8Array, at: number) => d[at] | (d[at + 1] << 8);
const u32 = (d: Uint8Array, at: number) => (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;

function setU16(d: Uint8Array, at: number, value: number): void {
  d[at] = value & 255;
  d[at + 1] = (value >> 8) & 255;
}

function setU32(d: Uint8Array, at: number, value: number): void {
  for (let i = 0; i < 4; i++) d[at + i] = (value >>> (8 * i)) & 255;
}

function applyBps(source: Uint8Array, patch: Uint8Array): Uint8Array {
  if (patch.length < 16 || String.fromCharCode(...patch.subarray(0, 4)) !== 'BPS1') throw new Error('not a BPS patch');
  let p = 4;
  const varint = () => {
    let value = 0;
    let shift = 1;
    for (;;) {
      if (p >= patch.length) throw new Error('truncated BPS patch');
      const byte = patch[p++];
      value += (byte & 127) * shift;
      if (byte & 128) return value;
      shift *= 128;
      value += shift;
    }
  };
  const take = (length: number) => patch.subarray(p, (p += length));

  const sourceSize = varint();
  const targetSize = varint();
  take(varint()); // metadata
  const end = patch.length - 12;
  if (crc32(patch.subarray(0, patch.length - 4)) !== u32(patch, end + 8)) throw new Error('BPS patch is damaged (checksum)');
  if (source.length !== sourceSize || crc32(source) !== u32(patch, end)) throw new Error('this file is not the original the patch was made for');

  const out = new Uint8Array(targetSize);
  let written = 0;
  let sourceAt = 0;
  let targetAt = 0;
  while (p < end) {
    const command = varint();
    const length = Math.floor(command / 4) + 1;
    const action = command % 4;
    if (written + length > out.length) throw new Error('BPS patch writes past the target size');
    if (action === 0) {
      out.set(source.subarray(written, written + length), written);
      written += length;
    } else if (action === 1) {
      out.set(take(length), written);
      written += length;
    } else {
      const offset = varint();
      const delta = (offset & 1 ? -1 : 1) * Math.floor(offset / 2);
      if (action === 2) {
        sourceAt += delta;
        for (let i = 0; i < length; i++) out[written++] = source[sourceAt++];
      } else {
        targetAt += delta;
        for (let i = 0; i < length; i++) out[written++] = out[targetAt++];
      }
    }
  }
  if (written !== out.length || crc32(out) !== u32(patch, end + 4)) throw new Error('patched file checksum mismatch');
  return out;
}

/** a bare FAT volume, without a hard-disk image header */
function isFatVolume(d: Uint8Array): boolean {
  if (d.length < 512 || (d[0] !== 0xeb && d[0] !== 0xe9)) return false;
  const sectorSize = u16(d, 11);
  const sectors = u16(d, 19) || u32(d, 32);
  return [256, 512, 1024].includes(sectorSize) && d[13] > 0 && d[16] > 0 && sectors * sectorSize === d.length;
}

function imageGeometry(d: Uint8Array) {
  if (String.fromCharCode(...d.subarray(0, 14)) === 'T98HDDIMAGE.R0') {
    return { header: u32(d, 272), sectors: u16(d, 282), heads: u16(d, 280), sectorSize: u16(d, 284) };
  }
  if (u32(d, 0) === 0 && u32(d, 8) >= 512 && u32(d, 8) <= 65536) {
    return { header: u32(d, 8), sectorSize: u32(d, 16) || 256, sectors: u32(d, 20) || 33, heads: u32(d, 24) || 4 };
  }
  throw new Error('not a PC-98 hard-disk image (.hdi / .nhd)');
}

interface DirEntry {
  name: string;
  dir: boolean;
  cluster: number;
  size: number;
  at: number;
}

const SJIS = new TextDecoder('shift_jis');

class FatDisk {
  private volume = 0;
  private sectorSize: number;
  private sectorsPerCluster: number;
  private reserved: number;
  private fats: number;
  private rootEntries: number;
  private sectorsPerFat: number;
  private rootAt: number;
  private dataStart: number;
  private clusters: number;
  private fat16: boolean;
  private img: Uint8Array;

  constructor(img: Uint8Array) {
    this.img = img;
    if (!isFatVolume(img)) {
      const g = imageGeometry(img);
      // first entry of the PC-98 partition table, in the sector after the IPL
      const entry = g.header + g.sectorSize;
      const cylinder = u16(img, entry + 10);
      this.volume = g.header + ((cylinder * g.heads + img[entry + 9]) * g.sectors + img[entry + 8]) * g.sectorSize;
    }
    const v = this.volume;
    this.sectorSize = u16(img, v + 11);
    this.sectorsPerCluster = img[v + 13];
    this.reserved = u16(img, v + 14);
    this.fats = img[v + 16];
    this.rootEntries = u16(img, v + 17);
    this.sectorsPerFat = u16(img, v + 22);
    if (!this.sectorSize || !this.sectorsPerCluster || !this.fats || !this.sectorsPerFat || this.sectorSize % 256) {
      throw new Error('no DOS FAT partition found in the disk image');
    }
    const rootSector = this.reserved + this.fats * this.sectorsPerFat;
    this.rootAt = v + rootSector * this.sectorSize;
    this.dataStart = rootSector + Math.ceil((this.rootEntries * 32) / this.sectorSize);
    const sectors = u16(img, v + 19) || u32(img, v + 32);
    this.clusters = Math.floor((sectors - this.dataStart) / this.sectorsPerCluster) + 2;
    this.fat16 = this.clusters - 2 >= 4085;
  }

  private get clusterBytes() {
    return this.sectorsPerCluster * this.sectorSize;
  }

  private get endOfChain() {
    return this.fat16 ? 0xfff8 : 0xff8;
  }

  private fatAt(index: number) {
    return this.volume + (this.reserved + index * this.sectorsPerFat) * this.sectorSize;
  }

  private fat(cluster: number): number {
    const at = this.fatAt(0);
    if (this.fat16) return u16(this.img, at + cluster * 2);
    const value = u16(this.img, at + Math.floor((cluster * 3) / 2));
    return cluster & 1 ? value >> 4 : value & 0xfff;
  }

  private setFat(cluster: number, value: number): void {
    for (let i = 0; i < this.fats; i++) {
      const at = this.fatAt(i);
      if (this.fat16) {
        setU16(this.img, at + cluster * 2, value);
        continue;
      }
      const pos = at + Math.floor((cluster * 3) / 2);
      const old = u16(this.img, pos);
      setU16(this.img, pos, cluster & 1 ? (old & 0xf) | (value << 4) : (old & 0xf000) | value);
    }
  }

  private chain(first: number): number[] {
    const out: number[] = [];
    for (let c = first; c >= 2 && c < this.endOfChain && out.length < this.clusters; c = this.fat(c)) out.push(c);
    return out;
  }

  private clusterAt(cluster: number) {
    return this.volume + (this.dataStart + (cluster - 2) * this.sectorsPerCluster) * this.sectorSize;
  }

  private list(cluster: number): DirEntry[] {
    const spans: [number, number][] = cluster === 0
      ? [[this.rootAt, this.rootEntries * 32]]
      : this.chain(cluster).map((c) => [this.clusterAt(c), this.clusterBytes]);
    const out: DirEntry[] = [];
    for (const [start, length] of spans) {
      for (let i = 0; i < length; i += 32) {
        const e = this.img.subarray(start + i, start + i + 32);
        if (e[0] === 0) return out;
        if (e[0] === 0xe5 || e[11] === 15 || e[11] & 8) continue;
        const base = SJIS.decode(e.subarray(0, 8)).trimEnd();
        const ext = SJIS.decode(e.subarray(8, 11)).trimEnd();
        out.push({ name: ext ? `${base}.${ext}` : base, dir: !!(e[11] & 16), cluster: u16(e, 26), size: u32(e, 28), at: start + i });
      }
    }
    return out;
  }

  find(path: string): DirEntry | null {
    const parts = path.split(/[\\/]/).filter(Boolean);
    let cluster = 0;
    let found: DirEntry | undefined;
    for (const [i, part] of parts.entries()) {
      found = this.list(cluster).find((e) => e.name.toUpperCase() === part.toUpperCase() && e.dir === i < parts.length - 1);
      if (!found) return null;
      cluster = found.cluster;
    }
    return found ?? null;
  }

  /** every file with this name, in any folder of the disk */
  findAll(name: string, cluster = 0, out: DirEntry[] = []): DirEntry[] {
    for (const e of this.list(cluster)) {
      if (e.dir && e.name !== '.' && e.name !== '..') this.findAll(name, e.cluster, out);
      else if (!e.dir && e.name.toUpperCase() === name.toUpperCase()) out.push(e);
    }
    return out;
  }

  read(entry: DirEntry): Uint8Array {
    const out = new Uint8Array(entry.size);
    let done = 0;
    for (const c of this.chain(entry.cluster)) {
      if (done >= entry.size) break;
      const length = Math.min(this.clusterBytes, entry.size - done);
      out.set(this.img.subarray(this.clusterAt(c), this.clusterAt(c) + length), done);
      done += length;
    }
    if (done < entry.size) throw new Error(`${entry.name}: cluster chain shorter than the file`);
    return out;
  }

  write(entry: DirEntry, data: Uint8Array): void {
    const needed = Math.max(1, Math.ceil(data.length / this.clusterBytes));
    let chain = this.chain(entry.cluster);
    if (chain.length < needed) {
      const free: number[] = [];
      for (let c = 2; c < this.clusters && free.length < needed - chain.length; c++) if (this.fat(c) === 0) free.push(c);
      if (free.length < needed - chain.length) {
        throw new Error(`disk full: ${entry.name} needs ${needed - chain.length} more clusters, ${free.length} free`);
      }
      chain = chain.concat(free);
    } else if (chain.length > needed) {
      for (const c of chain.slice(needed)) this.setFat(c, 0);
      chain = chain.slice(0, needed);
    }
    for (let i = 0; i < chain.length - 1; i++) this.setFat(chain[i], chain[i + 1]);
    this.setFat(chain[chain.length - 1], this.fat16 ? 0xffff : 0xfff);
    if (chain[0] !== entry.cluster) setU16(this.img, entry.at + 26, chain[0]);
    chain.forEach((c, i) => {
      const at = this.clusterAt(c);
      this.img.fill(0, at, at + this.clusterBytes);
      this.img.set(data.subarray(i * this.clusterBytes, (i + 1) * this.clusterBytes), at);
    });
    setU32(this.img, entry.at + 28, data.length);
    entry.size = data.length;
    entry.cluster = chain[0];
  }
}

/** The manifest's path, or wherever the install put the game: a file of the right size, original or patched, by name. */
function locate(disk: FatDisk, file: PatchFile): DirEntry | null {
  const name = file.path.split('/').pop()!;
  const all = disk.findAll(name);
  return disk.find(file.path) ?? all.find((e) => e.size === file.source.size || e.size === file.target.size) ?? all[0] ?? null;
}

function patchFile(file: PatchFile, current: Uint8Array, patch: Uint8Array): { out: Uint8Array; result: PatchResult } {
  const crc = hex(crc32(current));
  if (current.length === file.target.size && crc === file.target.crc32) {
    return { out: current, result: { path: file.path, status: 'already' } };
  }
  if (current.length !== file.source.size || crc !== file.source.crc32) {
    const error = `not the original file (size ${current.length}, crc32 ${crc}; expected ${file.source.size}, ${file.source.crc32})`;
    return { out: current, result: { path: file.path, status: 'error', error } };
  }
  try {
    return { out: applyBps(current, patch), result: { path: file.path, status: 'patched' } };
  } catch (e) {
    return { out: current, result: { path: file.path, status: 'error', error: (e as Error).message } };
  }
}

/** Patches `image` in place; `disk` is null, and nothing was written, when any file failed its check. */
export function patchDisk(
  manifest: PatchManifest,
  image: Uint8Array,
  patches: Map<string, Uint8Array>,
): { disk: Uint8Array | null; results: PatchResult[] } {
  const disk = new FatDisk(image);
  const results: PatchResult[] = [];
  const writes: { entry: DirEntry; out: Uint8Array }[] = [];
  const found = new Map<PatchFile, DirEntry>();
  for (const file of manifest.files) {
    const entry = locate(disk, file);
    if (!entry) {
      results.push({ path: file.path, status: 'error', error: 'file not found on the disk' });
      continue;
    }
    found.set(file, entry);
    const { out, result } = patchFile(file, disk.read(entry), patches.get(file.patch)!);
    results.push(result);
    if (result.status === 'patched') writes.push({ entry, out });
  }
  if (results.some((r) => r.status === 'error')) return { disk: null, results };
  for (const { entry, out } of writes) disk.write(entry, out);
  for (const [file, entry] of found) {
    if (hex(crc32(disk.read(entry))) !== file.target.crc32) {
      throw new Error(`${file.path}: verify after writing failed`);
    }
  }
  return { disk: image, results };
}

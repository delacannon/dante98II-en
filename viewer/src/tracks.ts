export interface Track {
  name: string;
  url: string;
}

export type DownloadFormat = 'vgz' | 'mml';

export interface SongFiles {
  name: string;
  files: Record<DownloadFormat, { url: string; file: string; size: number }>;
}

const base = import.meta.env.BASE_URL;
const entry = (dir: string, file: string, size: number) => ({ url: `${base}${dir}/${encodeURIComponent(file)}`, file, size });

// name, then byte sizes of the VGZ and the MML
const SONGS: [name: string, vgz: number, mml: number][] = [
  ["01 Opening 1", 11296, 30156],
  ["02 Opening 2", 5309, 23876],
  ["03 Ending 1", 8058, 35164],
  ["04 Ending 2", 6632, 21778],
  ["05 Battle 1", 6384, 32580],
  ["06 Battle 2", 17579, 116028],
  ["07 Game Over 1", 2111, 4255],
  ["08 Game Over 2", 3428, 15759],
  ["09 Ship, Airship", 4483, 20808],
  ["10 Ship, Airship 2", 4719, 22655],
  ["11 Field 1", 6149, 36732],
  ["12 Field 2", 5915, 38926],
  ["13 Field 3", 6194, 33050],
  ["14 Town 1", 8475, 30445],
  ["15 Town 2", 6702, 33948],
  ["16 Town 3", 4666, 19493],
  ["17 Town 4", 4980, 19808],
  ["18 Dungeon 1", 5226, 16154],
  ["19 Dungeon 2", 8341, 38801],
  ["20 Dungeon 3", 5355, 19655],
  ["21 Tower 1", 3880, 19706],
  ["22 Tower 2", 3630, 13300],
  ["23 Castle 1", 3921, 16180],
  ["24 Castle 2", 3203, 10532],
  ["25 Castle 3", 4402, 18904],
  ["26 Church", 2791, 8388],
  ["27 Shop 1", 5506, 22097],
  ["28 Shop 2", 3203, 11962],
  ["29 Shop 3", 3515, 17587],
  ["30 Shop 4", 3287, 10786],
  ["31 Event 1 (Memories)", 3866, 15728],
  ["32 Event 2 (Farewell)", 6987, 24877],
  ["33 Event 3 (Boss 1)", 2378, 9153],
  ["34 Event 4 (Boss 2)", 2054, 5373],
  ["35 Event 5 (Rest)", 3845, 12178],
  ["36 Event 6 (Lively)", 2722, 9823],
  ["37 Event 7 (Sadness)", 6082, 13931],
  ["38 Event 8 (Victory)", 3565, 15042],
  ["39 Event 9 (Defeat)", 2894, 10688],
  ["40 Event 10 (Angry)", 3997, 19706],
  ["41 Event 11 (Comical)", 2183, 8391],
  ["42 Event 12 (Neverending)", 3352, 9763],
  ["43 Event 13 (Ice World)", 2635, 11652],
  ["44 Event 14 (Dawn)", 3045, 12742],
  ["45 Jingle 1 (Inn)", 1352, 3071],
  ["46 Jingle 2 (Level Up 1)", 1485, 2991],
  ["47 Jingle 3 (Level Up 2)", 1864, 3588],
  ["48 Jingle 4 (Shock)", 1227, 2419],
  ["49 Jingle 5 (Doubt)", 1466, 3432],
  ["50 Jingle 6 (Fanfare 1)", 1645, 4346],
  ["51 Jingle 7 (Fanfare 2)", 1881, 4209],
  ["52 Jingle 8 (Gag Punchline)", 1485, 3090],
  ["53 Loop 1 (Search)", 1771, 5344],
  ["54 Loop 2 (Wind)", 33108, 31080],
  ["55 Loop 3 (Earthquake)", 1511, 2511],
  ["56 Loop 4 (Thunder)", 2378, 20608],
  ["57 Loop 5 (Heart)", 1818, 8831],
  ["58 Loop 6 (Mystery)", 1327, 3418],
  ["59 Loop 7 (Machine Room)", 1358, 4754],
  ["60 Loop 8 (Rhythm)", 980, 1811],
];

export const songs: SongFiles[] = SONGS.map(([name, vgz, mml]) => ({
  name,
  files: {
    vgz: entry('music', `${name}.vgz`, vgz),
    mml: entry('mml', `${name}.mml`, mml),
  },
}));

export const tracks: Track[] = songs.map(({ name, files }) => ({ name, url: files.vgz.url }));

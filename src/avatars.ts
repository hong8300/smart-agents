// デフォルトのアイコン（SVG）。img の data URL として表示する。

const wrap = (bg: string, body: string, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath>${defs}</defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${bg}"/>${body}</g></svg>`;

const PRESET_SVG: Record<string, { label: string; svg: string }> = {
  kuro: {
    label: "黒ねこ",
    svg: wrap(
      "#E07A52",
      `<path d="M13 27 L16 7 L29 18 Z" fill="#1d1d22"/><path d="M51 27 L48 7 L35 18 Z" fill="#1d1d22"/>
       <path d="M17 12 L18.5 21 L24.5 17.5 Z" fill="#f2a7a0"/><path d="M47 12 L45.5 21 L39.5 17.5 Z" fill="#f2a7a0"/>
       <ellipse cx="32" cy="36" rx="20" ry="17" fill="#1d1d22"/>
       <path d="M10 64 C12 52 22 49 32 49 C42 49 52 52 54 64 Z" fill="#1d1d22"/>
       <ellipse cx="24.5" cy="34" rx="4.4" ry="5" fill="#f7d34a"/><ellipse cx="39.5" cy="34" rx="4.4" ry="5" fill="#f7d34a"/>
       <ellipse cx="24.5" cy="34.3" rx="1.5" ry="3.8" fill="#1d1d22"/><ellipse cx="39.5" cy="34.3" rx="1.5" ry="3.8" fill="#1d1d22"/>
       <circle cx="25.6" cy="32.2" r="0.9" fill="#fff"/><circle cx="40.6" cy="32.2" r="0.9" fill="#fff"/>
       <path d="M30 41 h4 l-2 2.2 z" fill="#f2a7a0"/>
       <path d="M32 43.2 q-1.8 2.4 -4.2 1.2 M32 43.2 q1.8 2.4 4.2 1.2" stroke="#9a9aa5" stroke-width="1" fill="none" stroke-linecap="round"/>
       <g stroke="#e7e7ee" stroke-width="0.9" stroke-linecap="round"><path d="M19 41 L7 39 M19 43.5 L8 45 M45 41 L57 39 M45 43.5 L56 45"/></g>`,
    ),
  },
  annie: {
    label: "女の子",
    svg: wrap(
      "url(#ag)",
      `<ellipse cx="32" cy="33" rx="20" ry="20" fill="#3a2b5c"/>
       <rect x="12" y="33" width="40" height="20" rx="7" fill="#3a2b5c"/>
       <path d="M12 64 C14 55 22 51 32 51 C42 51 50 55 52 64 Z" fill="#fff"/>
       <rect x="29" y="47" width="6" height="6" rx="2" fill="#FFE1CC"/>
       <circle cx="32" cy="37" r="14.5" fill="#FFE1CC"/>
       <path d="M15 35 C15 21 23 14 32 14 C41 14 49 21 49 35 C46.5 31 44.5 28 43.5 25.5 C40 29.5 36 30.5 31.5 29.5 C32.5 27.5 32.8 26 32.8 24 C29 28.5 22.5 30.5 17 31.5 Z" fill="#3a2b5c"/>
       <ellipse cx="26.5" cy="38.5" rx="1.9" ry="2.5" fill="#2a2140"/><ellipse cx="37.5" cy="38.5" rx="1.9" ry="2.5" fill="#2a2140"/>
       <circle cx="27.2" cy="37.6" r="0.75" fill="#fff"/><circle cx="38.2" cy="37.6" r="0.75" fill="#fff"/>
       <ellipse cx="23" cy="43" rx="2.6" ry="1.5" fill="#FF8FA6" opacity=".55"/><ellipse cx="41" cy="43" rx="2.6" ry="1.5" fill="#FF8FA6" opacity=".55"/>
       <path d="M29.5 44.3 q2.5 2.2 5 0" stroke="#c0566b" stroke-width="1.3" fill="none" stroke-linecap="round"/>
       <path d="M45 12.5 l1.7 3.5 3.8.5 -2.8 2.6 .7 3.8 -3.4-1.9 -3.4 1.9 .7-3.8 -2.8-2.6 3.8-.5z" fill="#FFD84D" stroke="#fff" stroke-width=".7"/>`,
      `<linearGradient id="ag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F8DF7"/><stop offset="1" stop-color="#A06BF2"/></linearGradient>`,
    ),
  },
  codec: {
    label: "ロボット",
    svg: wrap(
      "url(#cg)",
      `<line x1="32" y1="20" x2="32" y2="11" stroke="#E8F1F2" stroke-width="2.2"/>
       <circle cx="32" cy="10" r="3.2" fill="#FFD166"/>
       <rect x="9.5" y="29" width="5" height="11" rx="2.2" fill="#c9dadd"/><rect x="49.5" y="29" width="5" height="11" rx="2.2" fill="#c9dadd"/>
       <rect x="13" y="19" width="38" height="31" rx="9" fill="#E8F1F2"/>
       <rect x="18.5" y="24.5" width="27" height="19" rx="5.5" fill="#1E2A33"/>
       <circle cx="26" cy="31.5" r="3" fill="#5EF2C5"/><circle cx="38" cy="31.5" r="3" fill="#5EF2C5"/>
       <path d="M27.5 37 l-2.6 2.2 2.6 2.2 M36.5 37 l2.6 2.2 -2.6 2.2 M33.2 36.4 l-2.4 5.6" stroke="#5EF2C5" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
       <rect x="28" y="50" width="8" height="4" fill="#c9dadd"/>
       <rect x="17" y="53" width="30" height="14" rx="6" fill="#E8F1F2"/>`,
      `<linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14B88F"/><stop offset="1" stop-color="#0B6E5A"/></linearGradient>`,
    ),
  },
  me: {
    label: "人",
    svg: wrap(
      "#8A94A6",
      `<circle cx="32" cy="25" r="11" fill="#fff"/><path d="M12 62 C12 47 21 40 32 40 C43 40 52 47 52 62 Z" fill="#fff"/>`,
    ),
  },
  ghost: {
    label: "おばけ",
    svg: wrap(
      "#A78BFA",
      `<path d="M16 54 V30 a16 16 0 0 1 32 0 V54 l-5.3-4 -5.3 4 -5.4-4 -5.3 4 -5.4-4 Z" fill="#fff"/>
       <ellipse cx="26" cy="31" rx="2.6" ry="3.4" fill="#3b2f63"/><ellipse cx="38" cy="31" rx="2.6" ry="3.4" fill="#3b2f63"/>
       <ellipse cx="32" cy="39" rx="3" ry="2.2" fill="#3b2f63"/>`,
    ),
  },
  bear: {
    label: "くま",
    svg: wrap(
      "#F2C14E",
      `<circle cx="17" cy="20" r="7" fill="#8B5A3C"/><circle cx="47" cy="20" r="7" fill="#8B5A3C"/>
       <circle cx="17" cy="20" r="3.5" fill="#C98F6A"/><circle cx="47" cy="20" r="3.5" fill="#C98F6A"/>
       <circle cx="32" cy="35" r="19" fill="#8B5A3C"/>
       <ellipse cx="32" cy="42" rx="9" ry="7" fill="#E3C2A0"/>
       <circle cx="25" cy="31" r="2.3" fill="#2a1a10"/><circle cx="39" cy="31" r="2.3" fill="#2a1a10"/>
       <ellipse cx="32" cy="39.5" rx="3" ry="2.2" fill="#2a1a10"/>
       <path d="M32 41.5 v2.5 M29 45 q3 2 6 0" stroke="#2a1a10" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    ),
  },
  star: {
    label: "ほし",
    svg: wrap(
      "#3B82F6",
      `<path d="M32 9 l6.8 14 15.2 2.1 -11 10.6 2.7 15.2 L32 43.6 18.3 50.9 21 35.7 10 25.1 25.2 23z" fill="#FFD84D" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
       <circle cx="27.5" cy="31" r="1.8" fill="#5a3d00"/><circle cx="36.5" cy="31" r="1.8" fill="#5a3d00"/>
       <path d="M28.5 36 q3.5 3 7 0" stroke="#5a3d00" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
    ),
  },
  alien: {
    label: "うちゅうじん",
    svg: wrap(
      "#1F2937",
      `<circle cx="10" cy="12" r="1" fill="#fff"/><circle cx="54" cy="16" r="1.2" fill="#fff"/><circle cx="48" cy="52" r="0.9" fill="#fff"/>
       <ellipse cx="32" cy="34" rx="17" ry="20" fill="#6EE7B7"/>
       <ellipse cx="24.5" cy="33" rx="5" ry="7" transform="rotate(-20 24.5 33)" fill="#111827"/>
       <ellipse cx="39.5" cy="33" rx="5" ry="7" transform="rotate(20 39.5 33)" fill="#111827"/>
       <path d="M29 45 q3 2 6 0" stroke="#065F46" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
    ),
  },
};

export const PRESET_KEYS = Object.keys(PRESET_SVG);

export function presetLabel(key: string): string {
  return PRESET_SVG[key]?.label ?? key;
}

const cache = new Map<string, string>();
export function presetUrl(key: string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const svg = PRESET_SVG[key]?.svg ?? PRESET_SVG.me.svg;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}

/** 画像ファイルを 128px の正方形に縮小して data URL にする */
export function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像を読み込めませんでした"));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * A generated avatar for agents without an uploaded image or X photo:
 * kelp fronds and bubbles on a deep-sea gradient, unique to the agent id.
 */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function avatarSvg(id: string, size = 400) {
  const r = rng(id);
  const hue = Math.floor(r() * 360);
  const accent = `hsl(${(hue + 140) % 360} 70% 60%)`;
  const count = 3 + Math.floor(r() * 3);
  const fronds = Array.from({ length: count }, (_, i) => {
    const x = 70 + ((i + 0.5) * 260) / count + (r() - 0.5) * 30;
    const top = 90 + r() * 110;
    const sway = (r() - 0.5) * 120;
    const w = 10 + r() * 10;
    const light = 45 + r() * 20;
    return `<path d="M${x} 400 C ${x + sway} ${(400 + top) / 2}, ${x - sway} ${top + 60}, ${x + sway / 2} ${top}" stroke="hsl(${(hue + 100 + i * 12) % 360} 55% ${light}%)" stroke-width="${w}" stroke-linecap="round" fill="none"/>
      <circle cx="${x + sway / 2}" cy="${top}" r="${w * 0.9}" fill="hsl(${(hue + 100 + i * 12) % 360} 60% ${light + 12}%)"/>`;
  }).join("");
  const bubbles = Array.from({ length: 6 }, () => `<circle cx="${40 + r() * 320}" cy="${30 + r() * 220}" r="${3 + r() * 9}" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 18%)"/><stop offset="1" stop-color="hsl(${hue} 50% 6%)"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>${bubbles}${fronds}
</svg>`;
}

export const avatarDataUri = (id: string) => `data:image/svg+xml;base64,${Buffer.from(avatarSvg(id)).toString("base64")}`;

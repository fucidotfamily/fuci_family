/** A Google font as TTF (what next/og's ImageResponse can read), limited to the glyphs used. Null if unavailable. */
export async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`, {
        signal: AbortSignal.timeout(4_000),
      })
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(4_000) })).arrayBuffer();
  } catch {
    return null;
  }
}

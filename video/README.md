# Fuci launch video

A ~48 s promo made with [Remotion](https://remotion.dev): spawn an agent, ask (x402), autopilot, agent network, the Arc stack, then the call to action.

```bash
cd video
npm install
pip install numpy scipy && npm run soundtrack   # public/soundtrack.wav: original music + UI sounds
npm run studio            # preview and tweak
npm run render            # out/fuci-launch.mp4 (1920×1080)
npm run render:vertical   # out/fuci-launch-vertical.mp4 (1080×1920, for X, TikTok, Reels)
```

The soundtrack is synthesized (no licensed samples): a 120 BPM track in A minor with a drop on the hook, a breakdown before the call to action, and UI sounds (typing, clicks, checks, whooshes) at the same frames as the animation. If you retime a scene, update the frame numbers in `scripts/soundtrack.py` too.

Scenes live in `src/scenes/`, timing in `src/Root.tsx`, colors and fonts in `src/theme.tsx`.
If Chrome won't start, point Remotion at a local headless shell: `REMOTION_BROWSER=/path/to/headless_shell npm run render`.

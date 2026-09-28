import React from "react";
import { AbsoluteFill, Composition, Html5Audio, Sequence, staticFile } from "remotion";
import { C, SceneFade } from "./theme";
import { Intro } from "./scenes/Intro";
import { Hook } from "./scenes/Hook";
import { Spawn } from "./scenes/Spawn";
import { Ask } from "./scenes/Ask";
import { Autopilot } from "./scenes/Autopilot";
import { Network } from "./scenes/Network";
import { Stack, Cta } from "./scenes/Outro";
import { Live } from "./scenes/Live";
import { OneDollar } from "./scenes/OneDollar";
import { Bonded } from "./scenes/Bonded";
import { Listed } from "./scenes/Listed";
import { OpenSource } from "./scenes/OpenSource";
import { Dex } from "./scenes/Dex";
import { Lock } from "./scenes/Lock";
import { Market } from "./scenes/Market";
import { Census } from "./scenes/Census";
import { Onramp } from "./scenes/Onramp";
import { News } from "./scenes/News";
import { Tide } from "./scenes/Tide";
import { Arcade } from "./scenes/Arcade";
import { Deep } from "./scenes/Deep";
import { Receipt } from "./scenes/Receipt";
import { Tutorial } from "./scenes/Tutorial";
import { Gecko } from "./scenes/Gecko";
import { Terminal } from "./scenes/Terminal";
import { Kya } from "./scenes/Kya";
import { Reel } from "./scenes/Reel";

const SCENES: [React.FC, number][] = [
  [Intro, 105],
  [Hook, 135],
  [Spawn, 240],
  [Ask, 255],
  [Autopilot, 270],
  [Network, 195],
  [Stack, 135],
  [Cta, 165],
];
const OVERLAP = 10; // scenes cross-fade
const TOTAL = SCENES.reduce((s, [, d]) => s + d, 0) - OVERLAP * (SCENES.length - 1);

const FuciLaunch: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* Original music + UI sounds, synthesized by scripts/soundtrack.py and timed to these scenes. */}
      <Html5Audio src={staticFile("soundtrack.wav")} />
      {SCENES.map(([Scene, duration], i) => {
        const seq = (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SceneFade duration={duration}>
              <Scene />
            </SceneFade>
          </Sequence>
        );
        from += duration - OVERLAP;
        return seq;
      })}
    </AbsoluteFill>
  );
};

/** 5 s: "$FUCI is live on Argus" with the contract address. */
const FuciLive: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Html5Audio src={staticFile("sting.wav")} />
    <Live />
  </AbsoluteFill>
);

/** 10 s: 1 USDC puts an agent on-chain with an ERC-8004 identity (verified factory). */
const FuciOneDollar: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Html5Audio src={staticFile("sting10.wav")} />
    <OneDollar />
  </AbsoluteFill>
);

/** 5 s: "$FUCI bonded" with holders, volume and dividends (same sting as FuciLive). */
const FuciBonded: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Html5Audio src={staticFile("sting.wav")} />
    <Bonded />
  </AbsoluteFill>
);

/** 5 s: "Fuci is listed on DefiLlama" (same sting as FuciLive). */
const FuciListed: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Html5Audio src={staticFile("sting.wav")} />
    <Listed />
  </AbsoluteFill>
);

/** 8 s: "Fuci is open source" on GitHub. Its own look and its own track (scripts/github.py). */
const FuciOpenSource: React.FC = () => (
  <AbsoluteFill style={{ background: "#0d1117" }}>
    <Html5Audio src={staticFile("github.wav")} />
    <OpenSource />
  </AbsoluteFill>
);

/** 15 s: a little Fuci lore, then "$FUCI is listed on DexScreener". Its own track (scripts/lore.py). */
const FuciDex: React.FC = () => (
  <AbsoluteFill style={{ background: "#01060d" }}>
    <Html5Audio src={staticFile("lore.wav")} />
    <Dex />
  </AbsoluteFill>
);

/** 12 s: storm lore, then the dev's $FUCI locked for a year on Argus. Its own track (scripts/storm.py). */
const FuciLock: React.FC = () => (
  <AbsoluteFill style={{ background: "#03070c" }}>
    <Html5Audio src={staticFile("storm.wav")} />
    <Lock />
  </AbsoluteFill>
);

/** 13 s: Fuci Market as an airport departures board. Its own track (scripts/board.py). */
const FuciMarket: React.FC = () => (
  <AbsoluteFill style={{ background: "#050505" }}>
    <Html5Audio src={staticFile("board.wav")} />
    <Market />
  </AbsoluteFill>
);

/** 15 s: "The First Night": every agent on Arc as a star, only 225 so far. Its own track (scripts/census.py). */
const FuciCensus: React.FC = () => (
  <AbsoluteFill style={{ background: "#020308" }}>
    <Html5Audio src={staticFile("census.wav")} />
    <Census />
  </AbsoluteFill>
);

/** 15 s: fund your AI agent with Apple Pay (Onramp Kit on Arc). Its own track (scripts/onramp.py). */
const FuciOnramp: React.FC = () => (
  <AbsoluteFill style={{ background: "#0a0a0a" }}>
    <Html5Audio src={staticFile("onramp.wav")} />
    <Onramp />
  </AbsoluteFill>
);

/** 15 s: "FNN, Fuci News Network": a TV news broadcast of Fuci's on-chain numbers. Its own track (scripts/news.py). */
const FuciNews: React.FC = () => (
  <AbsoluteFill style={{ background: "#0b1b33" }}>
    <Html5Audio src={staticFile("news.wav")} />
    <News />
  </AbsoluteFill>
);

/** 15 s: "The tide is rising": a harbour tide gauge climbing past everything Fuci shipped. Its own track (scripts/tide.py). */
const FuciTide: React.FC = () => (
  <AbsoluteFill style={{ background: "#06121c" }}>
    <Html5Audio src={staticFile("tide.wav")} />
    <Tide />
  </AbsoluteFill>
);

/** 15 s: "FUCI: Agent Quest", an 8-bit arcade game. Its own chiptune track (scripts/arcade.py). */
const FuciArcade: React.FC = () => (
  <AbsoluteFill style={{ background: "#0b1026" }}>
    <Html5Audio src={staticFile("arcade.wav")} />
    <Arcade />
  </AbsoluteFill>
);

/** 15 s: "The Deep", a nature documentary on NOAA deep-sea footage. Its own track (scripts/deep.py). */
const FuciDeep: React.FC = () => (
  <AbsoluteFill style={{ background: "#01060c" }}>
    <Html5Audio src={staticFile("deep.wav")} />
    <Deep />
  </AbsoluteFill>
);

/** 15 s: "Receipt": a thermal printer prints what an agent bought over x402 on Arc. Its own track (scripts/receipt.py). */
const FuciReceipt: React.FC = () => (
  <AbsoluteFill style={{ background: "#0b0a09" }}>
    <Html5Audio src={staticFile("receipt.wav")} />
    <Receipt />
  </AbsoluteFill>
);

/** 15 s: "Motion reel": eight techniques, one bar each at 128 BPM. Its own track (scripts/reel.py). */
const FuciReel: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Html5Audio src={staticFile("reel.wav")} />
    <Reel />
  </AbsoluteFill>
);

/** 48 s: a calm walkthrough of fuci.family/risk built from real screenshots. Its own track (scripts/tutorial.py). */
const FuciTutorial: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Html5Audio src={staticFile("tutorial.wav")} />
    <Tutorial />
  </AbsoluteFill>
);

/** 15 s: "$FUCI is on CoinGecko": search → spinning coin → facts → listing trail. Its own track (scripts/gecko.py). */
const FuciGecko: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Html5Audio src={staticFile("gecko.wav")} />
    <Gecko />
  </AbsoluteFill>
);

/** 15 s: "Know Your Agent": a checkpoint scans agents, grades them A–F, pays the trusted one. Its own track (scripts/kya.py). */
const FuciKya: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Html5Audio src={staticFile("kya.wav")} />
    <Kya />
  </AbsoluteFill>
);

/** 15 s: "Agents paying right now": a terminal tails real x402 payments. Its own track (scripts/terminal.py). */
const FuciTerminal: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Html5Audio src={staticFile("terminal.wav")} />
    <Terminal />
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <>
    <Composition id="FuciKya" component={FuciKya} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciTerminal" component={FuciTerminal} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciTerminalVertical" component={FuciTerminal} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciGecko" component={FuciGecko} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciGeckoVertical" component={FuciGecko} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciTutorial" component={FuciTutorial} durationInFrames={1440} fps={30} width={1920} height={1080} />
    <Composition id="FuciTutorialVertical" component={FuciTutorial} durationInFrames={1440} fps={30} width={1080} height={1920} />
    <Composition id="FuciReel" component={FuciReel} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciReelVertical" component={FuciReel} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciReceipt" component={FuciReceipt} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciReceiptVertical" component={FuciReceipt} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciDeep" component={FuciDeep} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciDeepVertical" component={FuciDeep} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciArcade" component={FuciArcade} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciArcadeVertical" component={FuciArcade} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciTide" component={FuciTide} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciTideVertical" component={FuciTide} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciNews" component={FuciNews} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciNewsVertical" component={FuciNews} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciOnramp" component={FuciOnramp} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciOnrampVertical" component={FuciOnramp} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciCensus" component={FuciCensus} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciCensusVertical" component={FuciCensus} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciMarket" component={FuciMarket} durationInFrames={390} fps={30} width={1920} height={1080} />
    <Composition id="FuciMarketVertical" component={FuciMarket} durationInFrames={390} fps={30} width={1080} height={1920} />
    <Composition id="FuciLock" component={FuciLock} durationInFrames={360} fps={30} width={1920} height={1080} />
    <Composition id="FuciLockVertical" component={FuciLock} durationInFrames={360} fps={30} width={1080} height={1920} />
    <Composition id="FuciDex" component={FuciDex} durationInFrames={450} fps={30} width={1920} height={1080} />
    <Composition id="FuciDexVertical" component={FuciDex} durationInFrames={450} fps={30} width={1080} height={1920} />
    <Composition id="FuciOpenSource" component={FuciOpenSource} durationInFrames={240} fps={30} width={1920} height={1080} />
    <Composition id="FuciOpenSourceVertical" component={FuciOpenSource} durationInFrames={240} fps={30} width={1080} height={1920} />
    <Composition id="FuciListed" component={FuciListed} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="FuciListedVertical" component={FuciListed} durationInFrames={150} fps={30} width={1080} height={1920} />
    <Composition id="FuciBonded" component={FuciBonded} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="FuciBondedVertical" component={FuciBonded} durationInFrames={150} fps={30} width={1080} height={1920} />
    <Composition id="FuciOneDollar" component={FuciOneDollar} durationInFrames={300} fps={30} width={1920} height={1080} />
    <Composition id="FuciOneDollarVertical" component={FuciOneDollar} durationInFrames={300} fps={30} width={1080} height={1920} />
    <Composition id="FuciLive" component={FuciLive} durationInFrames={150} fps={30} width={1920} height={1080} />
    <Composition id="FuciLiveVertical" component={FuciLive} durationInFrames={150} fps={30} width={1080} height={1920} />
    <Composition id="FuciLaunch" component={FuciLaunch} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="FuciLaunchVertical" component={FuciLaunch} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
  </>
);

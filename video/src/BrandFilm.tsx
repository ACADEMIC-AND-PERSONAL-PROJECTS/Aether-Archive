import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FPS = 30;
export const BRAND_DURATION = 44 * FPS;

const C = {
  ink: '#080809',
  paper: '#F2EDE4',
  slate: '#5F6F8A',
  clay: '#B26A5C',
  sage: '#7D8A7A',
  brass: '#B08D57',
  muted: '#AAA49C',
  line: 'rgba(242,237,228,0.2)',
};

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const colors = [C.slate, C.clay, C.sage, C.brass, '#6F8D88', '#A97891'];

const Fonts = () => (
  <style>
    {`
      @font-face {
        font-family: "Cormorant Garamond";
        src: url("${staticFile('fonts/cormorant-garamond.woff2')}") format("woff2");
        font-weight: 400;
      }
      @font-face {
        font-family: "Manrope";
        src: url("${staticFile('fonts/manrope-variable.woff2')}") format("woff2");
        font-weight: 200 800;
      }
    `}
  </style>
);

const Grain = () => (
  <>
    <AbsoluteFill
      style={{
        opacity: 0.1,
        mixBlendMode: 'screen',
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 180 180\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.25\'/%3E%3C/svg%3E")',
      }}
    />
    <AbsoluteFill style={{ border: `1px solid ${C.line}`, boxSizing: 'border-box' }} />
  </>
);

const Kicker = ({ children, color = C.muted }: { children: string; color?: string }) => (
  <div
    style={{
      color,
      fontFamily: 'Manrope, Arial, sans-serif',
      fontSize: 16,
      fontWeight: 500,
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const Serif = ({
  children,
  size = 100,
  color = C.paper,
  style,
}: {
  children: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      color,
      fontFamily: 'Cormorant Garamond, Georgia, serif',
      fontSize: size,
      lineHeight: 0.88,
      letterSpacing: '-0.055em',
      ...style,
    }}
  >
    {children}
  </div>
);

const Grid = ({ opacity = 0.16 }: { opacity?: number }) => (
  <AbsoluteFill
    style={{
      opacity,
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      padding: '0 7.5%',
      pointerEvents: 'none',
    }}
  >
    {Array.from({ length: 13 }).map((_, index) => (
      <div key={index} style={{ borderLeft: `1px solid ${C.paper}`, opacity: index === 0 || index === 12 ? 0.8 : 0.4 }} />
    ))}
  </AbsoluteFill>
);

const Rule = ({ progress = 1, color = C.paper, width = 520 }: { progress?: number; color?: string; width?: number }) => (
  <div
    style={{
      width,
      height: 1,
      backgroundColor: color,
      transform: `scaleX(${progress})`,
      transformOrigin: 'left center',
    }}
  />
);

const Scene = ({
  children,
  accent,
  duration,
}: {
  children: React.ReactNode;
  accent: string;
  duration: number;
}) => {
  const frame = useCurrentFrame();
  const reveal = spring({ frame, fps: FPS, config: { damping: 170, stiffness: 100 } });
  const exit = interpolate(frame, [duration - 18, duration], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.ink,
        clipPath: `inset(0 ${interpolate(reveal, [0, 1], [100, 0])}% 0 0)`,
        opacity: 1 - exit * 0.92,
      }}
    >
      {children}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: accent,
          transform: `translateX(${interpolate(reveal, [0, 1], [0, 2000])}px)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const StreamTiles = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        inset: '-18% -4%',
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gridAutoRows: 205,
        gap: 14,
        transform: `rotate(-7deg) translateX(${interpolate(frame, [0, 180], [0, -520], clamp)}px)`,
      }}
    >
      {Array.from({ length: 54 }).map((_, index) => {
        const color = colors[index % colors.length];
        const wave = Math.sin(index * 1.7 + frame * 0.035) * 10;
        const scale = 0.88 + ((index * 13) % 5) * 0.035;
        return (
          <div
            key={index}
            style={{
              background: `linear-gradient(${120 + index * 7}deg, ${color}, ${C.ink} 76%)`,
              opacity: 0.72,
              transform: `translateY(${wave}px) scale(${scale})`,
              border: `1px solid rgba(242,237,228,${0.08 + (index % 3) * 0.04})`,
            }}
          />
        );
      })}
    </div>
  );
};

const S1 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 25, fps: FPS, config: { damping: 190 } });
  const veil = interpolate(frame, [0, 90, 165, 180], [0.84, 0.34, 0.34, 1], clamp);
  return (
    <Scene duration={180} accent={C.slate}>
      <StreamTiles />
      <AbsoluteFill style={{ backgroundColor: C.ink, opacity: veil }} />
      <Grid opacity={0.13} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>01 / THE PROBLEM</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '7.5%',
          bottom: 130,
          width: 1050,
          transform: `translateY(${interpolate(title, [0, 1], [55, 0])}px)`,
          opacity: title,
        }}
      >
        <Serif size={132}>Your camera roll is a stream.</Serif>
        <div style={{ marginTop: 38 }}>
          <Rule width={560} progress={interpolate(title, [0, 1], [0, 1])} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: '7.5%', bottom: 78 }}>
        <Kicker color={C.paper}>TOO MUCH / TOO FAST</Kicker>
      </div>
      <Grain />
    </Scene>
  );
};

const AuraField = () => {
  const frame = useCurrentFrame();
  const rotation = interpolate(frame, [0, 240], [-8, 12], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 1100,
        height: 780,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
    >
      <div style={{ position: 'absolute', inset: '8% 20%', background: C.slate, opacity: 0.78 }} />
      <div style={{ position: 'absolute', inset: '18% 10% 2% 32%', background: C.clay, opacity: 0.7 }} />
      <div style={{ position: 'absolute', inset: '2% 34% 28% 8%', background: C.sage, opacity: 0.75 }} />
      <div style={{ position: 'absolute', inset: '30% 4% 8% 48%', background: C.brass, opacity: 0.72 }} />
      <div
        style={{
          position: 'absolute',
          inset: 70,
          background: C.ink,
          border: `1px solid ${C.line}`,
          boxShadow: '0 30px 100px rgba(0,0,0,0.36)',
        }}
      />
    </div>
  );
};

const S2 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 20, fps: FPS, config: { damping: 180 } });
  const mask = interpolate(frame, [0, 100], [0, 1], clamp);
  return (
    <Scene duration={180} accent={C.paper}>
      <AuraField />
      <Grid opacity={0.11} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>02 / THE ANSWER</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '7.5%',
          top: 270,
          width: 1050,
          transform: `translateX(${interpolate(title, [0, 1], [120, 0])}px)`,
          opacity: title,
        }}
      >
        <Serif size={132}>Make room for the photos you keep.</Serif>
        <div style={{ marginTop: 36, color: C.muted, fontFamily: 'Manrope, Arial, sans-serif', fontSize: 23, lineHeight: 1.45, maxWidth: 560 }}>
          A quiet, local-first archive for the images that still mean something.
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: '9%',
          bottom: 98,
          transform: `rotate(-90deg) translateX(${interpolate(mask, [0, 1], [90, 0])}px)`,
          transformOrigin: 'right bottom',
          opacity: mask,
        }}
      >
        <Kicker color={C.paper}>IMAGE / MEMORY / PLACE</Kicker>
      </div>
      <Grain />
    </Scene>
  );
};

const Orbit = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 720,
        height: 720,
        border: `1px solid ${C.line}`,
        borderRadius: '50%',
        transform: `translate(-50%, -50%) rotate(${frame * 0.65}deg)`,
      }}
    >
      {colors.map((color, index) => {
        const angle = (index / colors.length) * Math.PI * 2;
        const x = 360 + Math.cos(angle) * 360 - 18;
        const y = 360 + Math.sin(angle) * 360 - 18;
        return (
          <div
            key={color}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: color,
              boxShadow: `0 0 0 8px rgba(8,8,9,0.7)`,
            }}
          />
        );
      })}
      <div style={{ position: 'absolute', inset: 92, border: `1px solid ${C.line}`, borderRadius: '50%' }} />
    </div>
  );
};

const S3 = () => {
  const frame = useCurrentFrame();
  const mark = spring({ frame: frame - 16, fps: FPS, config: { damping: 150, stiffness: 90 } });
  const line = interpolate(frame, [80, 145], [0, 1], clamp);
  return (
    <Scene duration={180} accent={C.clay}>
      <Orbit />
      <Grid opacity={0.08} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>03 / THE NAME</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '7.5%',
          bottom: 190,
          transform: `translateY(${interpolate(mark, [0, 1], [54, 0])}px)`,
          opacity: mark,
        }}
      >
        <Serif size={176}>Aether Archive</Serif>
        <div style={{ marginTop: 30 }}>
          <Rule width={720} color={C.paper} progress={line} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: '7.5%', bottom: 82 }}>
        <Kicker color={C.paper}>A PLACE TO RETURN TO</Kicker>
      </div>
      <Grain />
    </Scene>
  );
};

const MemoryCards = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: '7.5%', top: 230, width: 1020, height: 620 }}>
      {Array.from({ length: 6 }).map((_, index) => {
        const progress = spring({
          frame: frame - index * 7,
          fps: FPS,
          config: { damping: 145, stiffness: 110 },
        });
        const row = Math.floor(index / 3);
        const column = index % 3;
        const x = column * 320;
        const y = row * 310;
        const rotation = [-5, 2, -2, 3, -4, 2][index];
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 280,
              height: 250,
              background: `linear-gradient(${135 + index * 14}deg, ${colors[index]}, ${C.ink} 85%)`,
              border: `1px solid ${C.line}`,
              transform: `translate(${interpolate(progress, [0, 1], [260, 0])}px, ${interpolate(progress, [0, 1], [80, 0])}px) rotate(${rotation}deg) scale(${interpolate(progress, [0, 1], [0.75, 1])})`,
              opacity: progress,
              boxShadow: '0 22px 48px rgba(0,0,0,0.28)',
            }}
          >
            <div style={{ position: 'absolute', left: 20, top: 20 }}>
              <Kicker color={C.paper}>{String(index + 1).padStart(2, '0')}</Kicker>
            </div>
            <div style={{ position: 'absolute', right: 18, bottom: 18, width: 46, height: 1, backgroundColor: C.paper, opacity: 0.6 }} />
          </div>
        );
      })}
    </div>
  );
};

const S4 = () => {
  const frame = useCurrentFrame();
  const copy = spring({ frame: frame - 34, fps: FPS, config: { damping: 180 } });
  return (
    <Scene duration={240} accent={C.sage}>
      <MemoryCards />
      <Grid opacity={0.1} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>04 / THE RITUAL</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          right: '8%',
          top: 320,
          width: 650,
          transform: `translateX(${interpolate(copy, [0, 1], [100, 0])}px)`,
          opacity: copy,
        }}
      >
        <Serif size={112}>One image.</Serif>
        <Serif size={112} color={C.sage}>Six frames.</Serif>
        <Serif size={112}>One ritual.</Serif>
        <div style={{ marginTop: 34, color: C.muted, fontFamily: 'Manrope, Arial, sans-serif', fontSize: 22, lineHeight: 1.5 }}>
          Curate the month. Keep the feeling.
        </div>
      </div>
      <div style={{ position: 'absolute', right: '8%', bottom: 86 }}>
        <Kicker color={C.paper}>SELECT / ORDER / RETURN</Kicker>
      </div>
      <Grain />
    </Scene>
  );
};

const LocalSeal = () => {
  const frame = useCurrentFrame();
  const spin = interpolate(frame, [0, 180], [0, 360], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '48%',
        width: 510,
        height: 510,
        transform: `translate(-50%, -50%) rotate(${spin}deg)`,
        border: `1px solid ${C.line}`,
        borderRadius: '50%',
      }}
    >
      <div style={{ position: 'absolute', inset: 70, border: `1px solid ${C.line}`, borderRadius: '50%' }} />
      <div style={{ position: 'absolute', inset: 176, backgroundColor: C.paper, borderRadius: '50%' }} />
      <div style={{ position: 'absolute', left: 242, top: 20, width: 24, height: 24, borderRadius: '50%', backgroundColor: C.clay }} />
      <div style={{ position: 'absolute', left: 242, bottom: 20, width: 24, height: 24, borderRadius: '50%', backgroundColor: C.slate }} />
    </div>
  );
};

const S5 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 20, fps: FPS, config: { damping: 190 } });
  return (
    <Scene duration={180} accent={C.brass}>
      <LocalSeal />
      <Grid opacity={0.08} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>05 / THE PROMISE</Kicker>
      </div>
      <div style={{ position: 'absolute', left: '7.5%', bottom: 136, width: 1030, opacity: title, transform: `translateY(${interpolate(title, [0, 1], [42, 0])}px)` }}>
        <Serif size={126}>Private by default.</Serif>
        <div style={{ marginTop: 28, display: 'flex', gap: 28, alignItems: 'center' }}>
          <Kicker color={C.paper}>LOCAL-FIRST</Kicker>
          <Rule width={190} color={C.brass} />
          <Kicker color={C.paper}>NO FEED / NO LIKES</Kicker>
        </div>
      </div>
      <div style={{ position: 'absolute', right: '7.5%', top: 80 }}>
        <Kicker color={C.paper}>NO CLOUD REQUIRED</Kicker>
      </div>
      <Grain />
    </Scene>
  );
};

const S6 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 18, fps: FPS, config: { damping: 190 } });
  const rule = interpolate(frame, [36, 95], [0, 1], clamp);
  const sweep = interpolate(frame, [0, 150], [-80, 110], clamp);
  return (
    <Scene duration={180} accent={C.paper}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(110deg, ${C.ink} 0%, ${C.ink} 55%, ${C.slate} 55%, ${C.slate} 70%, ${C.clay} 70%, ${C.clay} 100%)`,
          transform: `translateX(${sweep}px)`,
          opacity: 0.72,
        }}
      />
      <Grid opacity={0.12} />
      <div style={{ position: 'absolute', left: '7.5%', top: 78 }}>
        <Kicker>06 / THE INVITATION</Kicker>
      </div>
      <div style={{ position: 'absolute', left: '7.5%', bottom: 160, opacity: title, transform: `translateY(${interpolate(title, [0, 1], [46, 0])}px)` }}>
        <Serif size={132}>Keep what matters.</Serif>
        <Serif size={132} color={C.paper}>Return to it.</Serif>
        <div style={{ marginTop: 34 }}>
          <Rule width={700} progress={rule} />
        </div>
      </div>
      <Grain />
    </Scene>
  );
};

const S7 = () => {
  const frame = useCurrentFrame();
  const reveal = spring({ frame: frame - 14, fps: FPS, config: { damping: 190 } });
  const pulse = 1 + Math.sin(frame * 0.08) * 0.025;
  return (
    <Scene duration={180} accent={C.slate}>
      <Grid opacity={0.12} />
      <div style={{ position: 'absolute', inset: '9%', border: `1px solid ${C.line}`, padding: 76, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Serif size={58}>Aether</Serif>
          <Kicker>ARCHIVE / 2026</Kicker>
        </div>
        <div style={{ opacity: reveal, transform: `translateY(${interpolate(reveal, [0, 1], [36, 0])}px) scale(${pulse})`, transformOrigin: 'left center' }}>
          <Serif size={144}>A quiet place</Serif>
          <Serif size={144} color={C.sage}>for your photographs.</Serif>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', opacity: reveal }}>
          <Kicker color={C.paper}>LOCAL-FIRST / IMAGE-FIRST</Kicker>
          <Kicker color={C.paper}>AETHER-ARCHIVE</Kicker>
        </div>
      </div>
      <Grain />
    </Scene>
  );
};

export const AetherArchiveBrandFilm = () => (
  <AbsoluteFill style={{ backgroundColor: C.ink }}>
    <Fonts />
    <Sequence from={0} durationInFrames={180}><S1 /></Sequence>
    <Sequence from={180} durationInFrames={180}><S2 /></Sequence>
    <Sequence from={360} durationInFrames={180}><S3 /></Sequence>
    <Sequence from={540} durationInFrames={240}><S4 /></Sequence>
    <Sequence from={780} durationInFrames={180}><S5 /></Sequence>
    <Sequence from={960} durationInFrames={180}><S6 /></Sequence>
    <Sequence from={1140} durationInFrames={180}><S7 /></Sequence>
  </AbsoluteFill>
);

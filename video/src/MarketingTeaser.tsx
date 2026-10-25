import React from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

const COLORS = {
  ink: '#080809',
  paper: '#F2EDE4',
  slate: '#5F6F8A',
  terracotta: '#B26A5C',
  sage: '#7D8A7A',
  brass: '#B08D57',
  muted: '#AAA49C',
  hairline: 'rgba(242,237,228,0.24)',
};

const ASSETS = {
  river: staticFile('assets/app-river-1440.png'),
  workshop: staticFile('assets/workshop-aura.png'),
  workshopOrder: staticFile('assets/workshop-order.png'),
  grafana: staticFile('assets/grafana-dashboard.png'),
};

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const FontStyles = () => (
  <style>
    {`
      @font-face {
        font-family: "Cormorant Garamond";
        src: url("${staticFile('fonts/cormorant-garamond.woff2')}") format("woff2");
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: "Manrope";
        src: url("${staticFile('fonts/manrope-variable.woff2')}") format("woff2");
        font-weight: 200 800;
        font-style: normal;
      }
    `}
  </style>
);

const Grain = ({ opacity = 0.1 }: { opacity?: number }) => (
  <>
    <AbsoluteFill
      style={{
        opacity,
        mixBlendMode: 'screen',
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 180 180\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.24\'/%3E%3C/svg%3E")',
      }}
    />
    <AbsoluteFill
      style={{
        border: `1px solid ${COLORS.hairline}`,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    />
  </>
);

const Kicker = ({
  children,
  color = COLORS.muted,
  style,
}: {
  children: string;
  color?: string;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      color,
      fontFamily: 'Manrope, Arial, sans-serif',
      fontSize: 17,
      fontWeight: 500,
      letterSpacing: '0.24em',
      lineHeight: 1.2,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);

const Display = ({
  children,
  size = 92,
  color = COLORS.paper,
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
      fontWeight: 400,
      letterSpacing: '-0.05em',
      lineHeight: 0.9,
      ...style,
    }}
  >
    {children}
  </div>
);

const Rule = ({
  width = 420,
  color = COLORS.hairline,
  progress = 1,
}: {
  width?: number;
  color?: string;
  progress?: number;
}) => (
  <div
    style={{
      width,
      height: 1,
      backgroundColor: color,
      transformOrigin: 'left center',
      transform: `scaleX(${progress})`,
    }}
  />
);

const ImageLayer = ({
  src,
  scale = 1,
  x = 0,
  y = 0,
  brightness = 1,
  saturate = 1,
  opacity = 1,
}: {
  src: string;
  scale?: number;
  x?: number;
  y?: number;
  brightness?: number;
  saturate?: number;
  opacity?: number;
}) => (
  <Img
    src={src}
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
      filter: `brightness(${brightness}) saturate(${saturate})`,
      opacity,
    }}
  />
);

const FrameTag = ({ number, label }: { number: string; label: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 15,
      color: COLORS.muted,
      fontFamily: 'Manrope, Arial, sans-serif',
      fontSize: 15,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
    }}
  >
    <span style={{ color: COLORS.paper }}>{number}</span>
    <span>{label}</span>
  </div>
);

const Grid = ({ accent = COLORS.hairline }: { accent?: string }) => (
  <AbsoluteFill
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      padding: '0 92px',
      gap: 0,
      pointerEvents: 'none',
    }}
  >
    {Array.from({ length: 7 }).map((_, index) => (
      <div
        key={index}
        style={{
          borderLeft: index === 0 ? `1px solid ${accent}` : undefined,
          borderRight: index === 6 ? `1px solid ${accent}` : undefined,
          borderColor: accent,
        }}
      />
    ))}
  </AbsoluteFill>
);

const SceneFrame = ({
  children,
  duration,
  accent = COLORS.paper,
}: {
  children: React.ReactNode;
  duration: number;
  accent?: string;
}) => {
  const frame = useCurrentFrame();
  const reveal = spring({ frame, fps: VIDEO_FPS, config: { damping: 180, stiffness: 110 } });
  const exit = interpolate(frame, [duration - 20, duration], [0, 1], clamp);
  const wipe = interpolate(reveal, [0, 1], [100, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        clipPath: `inset(0 ${wipe}% 0 0)`,
        opacity: 1 - exit * 0.92,
      }}
    >
      {children}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: accent,
          transform: `translateX(${interpolate(reveal, [0, 1], [0, VIDEO_WIDTH])}px)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const VerticalIndex = ({ current, total }: { current: string; total: string }) => (
  <div
    style={{
      position: 'absolute',
      right: 90,
      top: 86,
      writingMode: 'vertical-rl',
      color: COLORS.muted,
      fontFamily: 'Manrope, Arial, sans-serif',
      fontSize: 14,
      letterSpacing: '0.2em',
    }}
  >
    {current} / {total}
  </div>
);

const Swatches = () => {
  const frame = useCurrentFrame();
  const colors = [COLORS.slate, COLORS.terracotta, COLORS.sage, COLORS.brass, '#6E8F8A', '#A67588'];
  return (
    <div style={{ display: 'flex', gap: 15 }}>
      {colors.map((color, index) => {
        const progress = spring({
          frame: frame - 15 - index * 5,
          fps: VIDEO_FPS,
          config: { damping: 150, stiffness: 130 },
        });
        return (
          <div
            key={color}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: color,
              transform: `translateY(${interpolate(progress, [0, 1], [26, 0])}px) scale(${progress})`,
              opacity: progress,
            }}
          />
        );
      })}
    </div>
  );
};

const S1 = () => {
  const frame = useCurrentFrame();
  const imageX = interpolate(frame, [0, 150], [32, -80], clamp);
  const title = spring({ frame: frame - 16, fps: VIDEO_FPS, config: { damping: 190 } });
  const titleX = interpolate(title, [0, 1], [180, 0]);
  const line = interpolate(frame, [26, 90], [0, 1], clamp);

  return (
    <SceneFrame duration={150} accent={COLORS.slate}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <ImageLayer src={ASSETS.river} x={imageX} scale={1.13} brightness={0.48} saturate={0.76} />
        <AbsoluteFill style={{ backgroundColor: 'rgba(8,8,9,0.3)' }} />
        <div
          style={{
            position: 'absolute',
            inset: '8% 8% 8% 8%',
            border: `1px solid ${COLORS.hairline}`,
            transform: `scale(${interpolate(title, [0, 1], [1.05, 1])})`,
          }}
        />
      </div>
      <Grid />
      <VerticalIndex current="01" total="07" />
      <div style={{ position: 'absolute', left: 92, top: 82 }}>
        <Kicker>THE PROBLEM / THE STREAM</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 142,
          width: 1060,
          transform: `translate3d(${titleX}px, ${interpolate(title, [0, 1], [34, 0])}px, 0)`,
          opacity: title,
        }}
      >
        <Display size={124}>Your photos deserve more than an endless feed.</Display>
        <div style={{ marginTop: 34 }}>
          <Rule width={560} color={COLORS.paper} progress={line} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 92, bottom: 82 }}>
        <FrameTag number="AETHER" label="ARCHIVE" />
      </div>
      <Grain opacity={0.14} />
    </SceneFrame>
  );
};

const S2 = () => {
  const frame = useCurrentFrame();
  const image = spring({ frame, fps: VIDEO_FPS, config: { damping: 180 } });
  const pageX = interpolate(image, [0, 1], [100, 0]);
  const title = spring({ frame: frame - 25, fps: VIDEO_FPS, config: { damping: 200 } });
  const rule = interpolate(frame, [48, 106], [0, 1], clamp);

  return (
    <SceneFrame duration={150} accent={COLORS.paper}>
      <div style={{ position: 'absolute', inset: 72, overflow: 'hidden', backgroundColor: COLORS.ink }}>
        <ImageLayer src={ASSETS.river} x={pageX} scale={1.08} brightness={0.68} />
        <AbsoluteFill style={{ backgroundColor: 'rgba(8,8,9,0.2)' }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 62,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Kicker color={COLORS.paper}>02 / THE QUIET</Kicker>
            <Kicker color={COLORS.paper}>LOCAL-FIRST</Kicker>
          </div>
          <div
            style={{
              width: 920,
              transform: `translateY(${interpolate(title, [0, 1], [40, 0])}px)`,
              opacity: title,
            }}
          >
            <Display size={112}>A gallery becomes a ritual.</Display>
            <div style={{ marginTop: 30 }}>
              <Rule width={640} color={COLORS.paper} progress={rule} />
            </div>
          </div>
        </div>
      </div>
      <Grid />
      <VerticalIndex current="02" total="07" />
      <Grain opacity={0.1} />
    </SceneFrame>
  );
};

const S3 = () => {
  const frame = useCurrentFrame();
  const imageX = interpolate(frame, [0, 150], [-60, 24], clamp);
  const imageScale = interpolate(frame, [0, 150], [1.2, 1.08], clamp);
  const label = spring({ frame: frame - 18, fps: VIDEO_FPS, config: { damping: 170 } });
  const windowX = interpolate(label, [0, 1], [-620, 0]);

  return (
    <SceneFrame duration={150} accent={COLORS.slate}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <ImageLayer src={ASSETS.river} x={imageX} scale={imageScale} brightness={0.62} saturate={0.9} />
        <AbsoluteFill style={{ backgroundColor: `rgba(95,111,138,${0.16 + label * 0.13})` }} />
      </div>
      <Grid accent="rgba(242,237,228,0.14)" />
      <VerticalIndex current="03" total="07" />
      <div style={{ position: 'absolute', left: 92, top: 82 }}>
        <Kicker color={COLORS.paper}>03 / THE IMAGE</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 92,
          top: 254,
          width: 1180,
          transform: `translateX(${windowX}px)`,
          opacity: label,
        }}
      >
        <Display size={126}>One image.</Display>
        <Display size={126} color={COLORS.paper}>
          No distraction.
        </Display>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 102,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          transform: `translateX(${interpolate(label, [0, 1], [-120, 0])}px)`,
          opacity: label,
        }}
      >
        <div style={{ width: 12, height: 12, backgroundColor: COLORS.slate, borderRadius: '50%' }} />
        <FrameTag number="THE RIVER" label="PHOTOGRAPHY FIRST" />
      </div>
      <Grain opacity={0.13} />
    </SceneFrame>
  );
};

const S4 = () => {
  const frame = useCurrentFrame();
  const card = spring({ frame, fps: VIDEO_FPS, config: { damping: 160, stiffness: 110 } });
  const cardX = interpolate(card, [0, 1], [420, 0]);
  const cardRotate = interpolate(card, [0, 1], [8, -2]);
  const copy = spring({ frame: frame - 18, fps: VIDEO_FPS, config: { damping: 190 } });

  return (
    <SceneFrame duration={240} accent={COLORS.sage}>
      <Grid />
      <VerticalIndex current="04" total="07" />
      <div style={{ position: 'absolute', left: 92, top: 82 }}>
        <Kicker>04 / THE WORKSHOP</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 126,
          top: 160,
          width: 630,
          height: 760,
          overflow: 'hidden',
          border: `1px solid ${COLORS.hairline}`,
          backgroundColor: COLORS.ink,
          transform: `translate3d(${cardX}px, 0, 0) rotate(${cardRotate}deg)`,
        }}
      >
        <Img src={ASSETS.workshop} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `20px solid ${COLORS.ink}`,
            opacity: 0.18,
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 930,
          top: 238,
          width: 790,
          transform: `translate3d(${interpolate(copy, [0, 1], [100, 0])}px, 0, 0)`,
          opacity: copy,
        }}
      >
        <Display size={112}>Six frames.</Display>
        <Display size={112} color={COLORS.sage}>
          One memory.
        </Display>
        <div
          style={{
            marginTop: 34,
            maxWidth: 620,
            color: COLORS.muted,
            fontFamily: 'Manrope, Arial, sans-serif',
            fontSize: 24,
            lineHeight: 1.45,
          }}
        >
          Choose them. Order them. Let your images define the aura.
        </div>
        <div style={{ marginTop: 52 }}>
          <Swatches />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 930, bottom: 102 }}>
        <FrameTag number="06" label="PHOTOGRAPHS / 01 AURA" />
      </div>
      <Grain opacity={0.11} />
    </SceneFrame>
  );
};

const S5 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 14, fps: VIDEO_FPS, config: { damping: 190 } });
  const imageX = interpolate(frame, [0, 180], [80, -10], clamp);
  const band = interpolate(frame, [20, 112], [0, 1], clamp);
  const number = interpolate(frame, [30, 110], [0, 1], clamp);

  return (
    <SceneFrame duration={180} accent={COLORS.terracotta}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <ImageLayer src={ASSETS.river} x={imageX} scale={1.16} brightness={0.47} saturate={0.74} />
        <AbsoluteFill style={{ backgroundColor: `rgba(178,106,92,${0.08 + band * 0.2})` }} />
      </div>
      <Grid accent="rgba(242,237,228,0.15)" />
      <VerticalIndex current="05" total="07" />
      <div style={{ position: 'absolute', left: 92, top: 82 }}>
        <Kicker color={COLORS.paper}>05 / THE DUMP</Kicker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 112,
          transform: `translateY(${interpolate(title, [0, 1], [44, 0])}px)`,
          opacity: title,
        }}
      >
        <Display size={132}>One dump. Every month.</Display>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 32 }}>
          <Rule width={160} color={COLORS.terracotta} progress={band} />
          <FrameTag number="01" label="SIX PHOTOGRAPHS" />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 104,
          top: 260,
          color: COLORS.paper,
          fontFamily: 'Manrope, Arial, sans-serif',
          fontSize: 110,
          letterSpacing: '-0.08em',
          opacity: number,
        }}
      >
        06
      </div>
      <Grain opacity={0.14} />
    </SceneFrame>
  );
};

const S6 = () => {
  const frame = useCurrentFrame();
  const split = spring({ frame, fps: VIDEO_FPS, config: { damping: 180, stiffness: 95 } });
  const panelX = interpolate(split, [0, 1], [520, 0]);
  const crop = interpolate(frame, [0, 120], [1.12, 1.18], clamp);

  return (
    <SceneFrame duration={120} accent={COLORS.paper}>
      <div style={{ position: 'absolute', inset: 0, width: '68%', overflow: 'hidden' }}>
        <ImageLayer src={ASSETS.river} scale={crop} brightness={0.56} />
        <AbsoluteFill style={{ backgroundColor: 'rgba(8,8,9,0.24)' }} />
      </div>
      <Grid />
      <VerticalIndex current="06" total="07" />
      <div
        style={{
          position: 'absolute',
          top: 138,
          right: 84,
          width: 710,
          height: 620,
          overflow: 'hidden',
          border: `1px solid ${COLORS.hairline}`,
          transform: `translate3d(${panelX}px, 0, 0)`,
          boxShadow: '0 34px 90px rgba(0,0,0,0.42)',
        }}
      >
        <Img src={ASSETS.grafana} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ position: 'absolute', left: 92, top: 82 }}>
        <Kicker color={COLORS.paper}>06 / LOCAL · OBSERVABLE</Kicker>
      </div>
      <div style={{ position: 'absolute', left: 92, bottom: 104 }}>
        <Display size={100}>Yours by design.</Display>
        <div style={{ marginTop: 25 }}>
          <FrameTag number="NO CLOUD" label="NO FEED / NO LIKES" />
        </div>
      </div>
      <Grain opacity={0.1} />
    </SceneFrame>
  );
};

const S7 = () => {
  const frame = useCurrentFrame();
  const title = spring({ frame: frame - 16, fps: VIDEO_FPS, config: { damping: 200 } });
  const rule = interpolate(frame, [24, 72], [0, 1], clamp);
  const mark = interpolate(frame, [0, 90], [0, 1], clamp);

  return (
    <SceneFrame duration={90} accent={COLORS.paper}>
      <Grid />
      <div
        style={{
          position: 'absolute',
          inset: 92,
          border: `1px solid ${COLORS.hairline}`,
          padding: 72,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Display size={58}>Aether</Display>
          <Kicker>ARCHIVE / 2026</Kicker>
        </div>
        <div
          style={{
            transform: `translate3d(0, ${interpolate(title, [0, 1], [44, 0])}px, 0)`,
            opacity: title,
          }}
        >
          <Display size={136}>The calm after the scroll.</Display>
          <div style={{ marginTop: 32 }}>
            <Rule width={760} color={COLORS.paper} progress={rule} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', opacity: mark }}>
          <FrameTag number="AETHER" label="ARCHIVE" />
          <Kicker color={COLORS.paper}>168.138.70.166.NIP.IO</Kicker>
        </div>
      </div>
      <Grain opacity={0.12} />
    </SceneFrame>
  );
};

export const AetherArchiveMarketing = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
    <FontStyles />
    <Sequence from={0} durationInFrames={150}>
      <S1 />
    </Sequence>
    <Sequence from={150} durationInFrames={150}>
      <S2 />
    </Sequence>
    <Sequence from={300} durationInFrames={150}>
      <S3 />
    </Sequence>
    <Sequence from={450} durationInFrames={240}>
      <S4 />
    </Sequence>
    <Sequence from={690} durationInFrames={180}>
      <S5 />
    </Sequence>
    <Sequence from={870} durationInFrames={120}>
      <S6 />
    </Sequence>
    <Sequence from={990} durationInFrames={90}>
      <S7 />
    </Sequence>
  </AbsoluteFill>
);

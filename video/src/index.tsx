import { Composition, registerRoot } from 'remotion';
import { AetherArchiveBrandFilm, BRAND_DURATION } from './BrandFilm';
import { AetherArchiveMarketing, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from './MarketingTeaser';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="AetherArchiveMarketing"
        component={AetherArchiveMarketing}
        durationInFrames={VIDEO_FPS * 36}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="AetherArchiveBrandFilm"
        component={AetherArchiveBrandFilm}
        durationInFrames={BRAND_DURATION}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
    </>
  );
};

registerRoot(RemotionRoot);

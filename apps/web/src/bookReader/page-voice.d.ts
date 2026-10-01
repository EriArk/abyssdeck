import type { Anchor, PageBounds } from "./pages";
export type Position = { book: string; chapter: number; anchor: Anchor };
export type SpeechPage = PageBounds & { book: string; chapter: number; layout: string };
export type VoiceInfo = {
  available: boolean;
  voice?: string;
  voices?: { voiceURI: string; name: string; lang: string }[];
};
export class PageVoice {
  constructor(
    api: (path: string, body?: Record<string, unknown>) => Promise<unknown>,
    view: {
      position(): Position;
      startPosition(): Position;
      page(position?: Position): SpeechPage;
      next(page: SpeechPage): Promise<SpeechPage | null>;
      layout(): string;
      follow(position: Position, current?: () => boolean): Promise<boolean>;
      state(status: string, error?: string): void;
      save(position?: Position): void;
      finish(position?: Position): void;
    },
    info: VoiceInfo,
    env?: typeof globalThis,
  );
  backend: { rate: number; voiceURI: string };
  status: string;
  readonly active: boolean;
  play(): void;
  pause(): void;
  stop(save?: boolean): void;
  navigate(): boolean;
  reflow(): void;
  setRate(rate: number): void;
  setVoice(voice: string): void;
  url(entry: { id: string }): string;
}

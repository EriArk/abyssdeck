import type { Anchor } from "./pages";
export type Segment = { block: number; start: number; end: number; text: string };
export function chunks(text: string, block: number, limit?: number): Segment[];
export class BrowserSpeech {
  constructor(env?: typeof globalThis);
  available: boolean;
  rate: number;
  voiceURI: string;
  lang: string;
  synth: SpeechSynthesis;
  voices(): SpeechSynthesisVoice[];
  cancel(): void;
}
export class VoiceController {
  constructor(
    backend: BrowserSpeech,
    view: {
      position(): Anchor;
      segments(): Segment[];
      follow(anchor: Anchor): void;
      state(status: string, error?: string): void;
      save(): void;
      next(current: () => boolean): Promise<boolean>;
      finish(): Promise<void>;
    },
  );
  backend: BrowserSpeech;
  status: string;
  readonly active: boolean;
  play(): void;
  pause(): void;
  stop(): void;
  seek(anchor: Anchor, resume?: boolean): void;
}

import { inrToBeans } from './diamondPackages';

export const MIN_RATE_INR = 1;
export const MAX_RATE_INR = 10000;

/** Voice call: callee gets 70%, platform (owner) keeps 30% */
export const CALL_RECEIVER_SHARE = 0.7;
export const CALL_PLATFORM_SHARE = 0.3;

export function receiverBeansFromCallInr(inr: number): number {
  const gross = inrToBeans(inr);
  return Math.floor(gross * CALL_RECEIVER_SHARE);
}

/** Live talk / chat: host gets 70%, platform keeps 30% */
export function receiverBeansFromChatInr(inr: number): number {
  return receiverBeansFromCallInr(inr);
}

export type UserRates = {
  voiceRatePerMin: number;
  chatRatePerMin: number;
  videoRatePerMin: number;
  voiceBeansPerMin: number;
  chatBeansPerMin: number;
  videoBeansPerMin: number;
};

export function resolveRates(
  voiceRate?: number | null,
  chatRate?: number | null,
  defaults?: { voice?: number; chat?: number },
): UserRates {
  const voice = Math.max(MIN_RATE_INR, voiceRate ?? defaults?.voice ?? 1);
  const chat = Math.max(MIN_RATE_INR, chatRate ?? defaults?.chat ?? 1);
  const video = Math.min(MAX_RATE_INR, voice * 2);
  return {
    voiceRatePerMin: voice,
    chatRatePerMin: chat,
    videoRatePerMin: video,
    voiceBeansPerMin: receiverBeansFromCallInr(voice),
    chatBeansPerMin: receiverBeansFromChatInr(chat),
    videoBeansPerMin: receiverBeansFromCallInr(video),
  };
}

export function formatRateLabel(inr: number, beans: number): string {
  return `₹${inr}/min · ${beans} beans`;
}
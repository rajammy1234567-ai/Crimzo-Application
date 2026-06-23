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

export type UserRates = {
  voiceRatePerMin: number;
  chatRatePerMin: number;
  voiceBeansPerMin: number;
  chatBeansPerMin: number;
};

export function resolveRates(
  voiceRate?: number | null,
  chatRate?: number | null,
  defaults?: { voice?: number; chat?: number },
): UserRates {
  const voice = Math.max(MIN_RATE_INR, voiceRate ?? defaults?.voice ?? 1);
  const chat = Math.max(MIN_RATE_INR, chatRate ?? defaults?.chat ?? 1);
  return {
    voiceRatePerMin: voice,
    chatRatePerMin: chat,
    voiceBeansPerMin: receiverBeansFromCallInr(voice),
    chatBeansPerMin: inrToBeans(chat),
  };
}

export function formatRateLabel(inr: number, beans: number): string {
  return `₹${inr}/min · ${beans} beans`;
}
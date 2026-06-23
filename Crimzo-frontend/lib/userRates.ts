import { inrToBeans } from './diamondPackages';

export const MIN_RATE_INR = 1;
export const MAX_RATE_INR = 10000;

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
    voiceBeansPerMin: inrToBeans(voice),
    chatBeansPerMin: inrToBeans(chat),
  };
}

export function formatRateLabel(inr: number, beans: number): string {
  return `₹${inr}/min · ${beans} beans`;
}
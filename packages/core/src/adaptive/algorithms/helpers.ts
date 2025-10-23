export const logistic = (value: number): number =>
  1 / (1 + Math.exp(-value));

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

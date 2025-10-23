export const logistic = (value) => 1 / (1 + Math.exp(-value));
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

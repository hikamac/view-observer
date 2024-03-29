export const atLeast = (num: number | undefined, min: number): void => {
  if (num !== undefined && num < min) {
    throw new RangeError(`${num} must be larger than min(${min})`);
  }
};

export const atMost = (num: number | undefined, max: number): void => {
  if (num !== undefined && num > max) {
    throw new RangeError(`${num} must be smaller than min(${max})`);
  }
};

// utils.js: Small DOM and number helpers shared by every module.

export const v = id => document.getElementById(id);

export const numVal = id => +v(id).value;

export const colorVal = id => v(id).value;

export function syncNum(rangeId, numId) { v(numId).value = v(rangeId).value; }

export function syncRange(numId, rangeId) {
  let val = parseFloat(v(numId).value);
  if (isNaN(val)) return;
  const min = parseFloat(v(numId).min) || 0;
  const max = parseFloat(v(numId).max) || 99999;
  val = Math.max(min, Math.min(max, val));
  v(rangeId).value = val;
  v(numId).value = val;
}

// Snap a value to the nearest value in a sorted array
export function snapToNearest(val, sortedArr) {
  if (!sortedArr || !sortedArr.length) return val;
  let lo = 0, hi = sortedArr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedArr[mid] < val) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(sortedArr[lo-1] - val) <= Math.abs(sortedArr[lo] - val)) lo--;
  return sortedArr[lo];
}

/** Value comparison for native form models; Set membership stays identity-based. */
export function equalModelValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left instanceof Date || right instanceof Date)
    return left instanceof Date && right instanceof Date && +left === +right;
  if (typeof left === "symbol" || typeof right === "symbol") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    )
      return false;
    for (let index = 0; index < left.length; index++)
      if (!equalModelValue(left[index], right[index])) return false;
    return true;
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          equalModelValue(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key],
          ),
      )
    );
  }
  if (
    (left !== null && typeof left === "object") ||
    (right !== null && typeof right === "object")
  )
    return false;
  return String(left) === String(right);
}

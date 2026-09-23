// Replaced with the release version by scripts/build.ts through Bun.build's
// `define`. Running from source, nothing defines it, and `typeof` on an
// undeclared name is "undefined" rather than a ReferenceError.
declare const SKILLWALKER_VERSION: string | undefined

export const skillwalkerVersion = typeof SKILLWALKER_VERSION === 'string' ? SKILLWALKER_VERSION : 'dev'

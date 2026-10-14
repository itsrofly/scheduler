require('dotenv').config();

module.exports = {
  // Tell Jest to use ts-jest for *.ts / *.tsx files
  preset: 'ts-jest',          // <== this is the easiest line

  testEnvironment: 'node',    // or jsdom, whatever you need

  /* Optional – if you want to keep using ES‑modules in your test files */
  extensionsToTreatAsEsm: ['.ts'],   // Jest will treat .ts as ESM
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { useESM: true }           // <-- compile TS → ESM (requires Node ≥ 14)
    ]
  },

  /* If you *don’t* want to run your tests as ESM, drop the two lines above
     and keep only `preset: 'ts-jest'`. ts‑jest will emit CommonJS by default. */
};

// Best-effort navigation wiring for the Game screen. Run from app/ (cwd).
// Pocket Pal uses a drawer navigator in App.tsx + ROUTES in src/utils/navigationConstants.ts.
// This makes minimal, reversible edits; if the upstream structure has drifted it prints a
// manual TODO instead of corrupting files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function patch(file, mutate) {
  if (!existsSync(file)) { console.log(`   skip (missing): ${file}`); return; }
  const before = readFileSync(file, 'utf8');
  const after = mutate(before);
  if (after && after !== before) { writeFileSync(file, after); console.log(`   patched: ${file}`); }
  else console.log(`   no change: ${file}`);
}

// 1. ROUTES.GAME
patch('src/utils/navigationConstants.ts', (s) =>
  s.includes('GAME:') ? s : s.replace(/(ROUTES\s*=\s*\{)/, `$1\n  GAME: 'Game',`),
);

// 2. export GameScreen
patch('src/screens/index.ts', (s) =>
  s.includes('GameScreen') ? s : s + `\nexport {default as GameScreen} from './GameScreen';\n`,
);

console.log(
  '   NOTE: add <Drawer.Screen name={ROUTES.GAME} component={GameScreen} /> in App.tsx\n' +
  '   and pass a story bible + selected LLM id as initialParams (see docs/ARCHITECTURE.md).',
);

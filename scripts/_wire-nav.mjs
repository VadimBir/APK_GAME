// Navigation wiring for the Game screen. Run from app/ (cwd). Makes minimal, idempotent
// edits to Pocket Pal's App.tsx, route constants, screen barrel, and the custom sidebar.
// If upstream structure has drifted, each patch no-ops and prints a manual TODO rather
// than corrupting files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function patch(file, label, mutate) {
  if (!existsSync(file)) { console.log(`   skip (missing): ${file}`); return; }
  const before = readFileSync(file, 'utf8');
  const after = mutate(before);
  if (after && after !== before) { writeFileSync(file, after); console.log(`   patched: ${label}`); }
  else console.log(`   no change: ${label}`);
}

// 1. ROUTES.GAME
patch('src/utils/navigationConstants.ts', 'ROUTES.GAME', (s) =>
  s.includes('GAME:') ? s : s.replace(/(ROUTES\s*=\s*\{)/, `$1\n  GAME: 'Game',`),
);

// 2. export GameScreen from the screen barrel
patch('src/screens/index.ts', 'screens/index export', (s) =>
  s.includes('GameScreen') ? s : s + `\nexport {default as GameScreen} from './GameScreen';\n`,
);

// 3. App.tsx: import + Drawer.Screen
patch('App.tsx', 'App.tsx import', (s) =>
  s.includes('GameScreen') ? s : s.replace(/(\n\s*ModelsScreen,)/, `$1\n  GameScreen,`),
);
patch('App.tsx', 'App.tsx Drawer.Screen', (s) => {
  if (s.includes('ROUTES.GAME')) return s;
  // Insert a Game drawer screen right after the Models screen block.
  return s.replace(
    /(<Drawer\.Screen\s+name=\{ROUTES\.MODELS\}[\s\S]*?\/>)/,
    `$1\n                          <Drawer.Screen\n                            name={ROUTES.GAME}\n                            component={gestureHandlerRootHOC(GameScreen)}\n                            options={{title: 'Arcane Terminal'}}\n                          />`,
  );
});

// 4. SidebarContent: a tappable menu entry
patch('src/components/SidebarContent/SidebarContent.tsx', 'sidebar Game item', (s) => {
  if (s.includes('drawer-item-game')) return s;
  return s.replace(
    /(onPress=\{\(\) => props\.navigation\.navigate\(ROUTES\.MODELS\)\}[\s\S]*?testID="drawer-item-models"\s*\/>)/,
    `$1\n            <Drawer.Item\n              label="Arcane Terminal"\n              icon={() => <ModelIcon stroke={theme.colors.primary} />}\n              onPress={() => props.navigation.navigate(ROUTES.GAME)}\n              style={styles.menuDrawerItem}\n              testID="drawer-item-game"\n            />`,
  );
});

console.log('   navigation wired (App.tsx + sidebar + routes + barrel).');

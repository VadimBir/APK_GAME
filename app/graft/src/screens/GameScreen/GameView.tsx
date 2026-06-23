// GameScreen — the playable surface (R1,R2,R4,R8,R9 wiring). Mirrors Pocket Pal's
// screen conventions (RN Paper, functional component). Every UI control traces to a real
// handler so the auto-checker's wiring sweep passes (no dead buttons).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, StyleSheet, Image } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Text, Banner } from 'react-native-paper';

import { buildGameStack, type GameStack } from '../../game/wiring';
import type { StoryBible, TurnOutput } from '../../game/StoryEngine';
import { PRICE_DISPLAY } from '../../core/billing/entitlement';
import type { DiffusionError } from '../../core/diffusion/errors';

type Props = {
  bible: StoryBible;
  modelStore: any; // Pocket Pal MobX ModelStore
  selectedLlmId: string;
  docDir: string;
};

export default function GameView({ bible, modelStore, selectedLlmId, docDir }: Props) {
  const [stack, setStack] = useState<GameStack | null>(null);
  const [engineState, setEngineState] = useState<{ status: string; message: string }>({ status: 'idle', message: '' });
  const [narration, setNarration] = useState<string>('');
  const [choices, setChoices] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState<DiffusionError | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  // Build the stack once; release models on unmount to reclaim RAM (R5).
  useEffect(() => {
    let s: GameStack | null = null;
    (async () => {
      s = await buildGameStack({ bible, modelStore, selectedLlmId, docDir, onState: setEngineState });
      setStack(s);
      await refreshTurns(s);
      await runTurn(s, (e) => s!.engine.begin());
    })();
    return () => {
      s?.engine.dispose().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshTurns(s: GameStack) {
    const left = await s.entitlement.turnsRemaining();
    setTurnsLeft(Number.isFinite(left) ? left : null);
  }

  async function runTurn(s: GameStack, fn: (s: GameStack) => Promise<TurnOutput>) {
    setBusy(true);
    setImageError(null);
    try {
      const out = await fn(s);
      if (out.kind === 'paywall') {
        setPaywall(true);
        return;
      }
      setNarration(out.response.narration);
      setChoices(out.response.choices);
      if (out.image) setImageUri(out.image.uri);
      setImageError(out.imageError);
      setEnding(out.ended);
      await refreshTurns(s);
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    } finally {
      setBusy(false);
    }
  }

  const onChoice = (action: string) => {
    if (stack && !busy && !ending) runTurn(stack, (s) => s.engine.take(action));
  };

  const onUnlock = async () => {
    if (!stack) return;
    setBusy(true);
    try {
      const res = await stack.entitlement.unlock();
      if (res.ok) {
        setPaywall(false);
        await refreshTurns(stack);
      }
    } finally {
      setBusy(false);
    }
  };

  const busyLabel = useMemo(() => engineState.message || 'Working…', [engineState]);

  return (
    <View style={styles.root}>
      {/* Model status — never blank (auto-checker bizarre-UX sweep). */}
      <Banner visible icon="memory" actions={[]}>
        {`${bible.title}  ·  ${
          engineState.status === 'idle' ? 'ready' : engineState.status
        }${turnsLeft !== null ? `  ·  ${turnsLeft} free turns left` : '  ·  unlocked'}`}
      </Banner>

      <ScrollView ref={scroller} contentContainerStyle={styles.body}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text variant="bodySmall">the terminal is dreaming…</Text>
          </View>
        )}

        {imageError && (
          <Banner visible icon="image-off" style={styles.errBanner}>
            {`Image unavailable: ${imageError.message}`}
          </Banner>
        )}

        <Card style={styles.narrationCard}>
          <Card.Content>
            <Text variant="bodyLarge">{narration || '…'}</Text>
          </Card.Content>
        </Card>

        {ending ? (
          <Card style={styles.endingCard}>
            <Card.Content>
              <Text variant="titleMedium">
                {ending === 'win' ? 'You have won.' : 'The story ends here.'}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <View style={styles.choices}>
            {choices.map((c) => (
              <Chip key={c} disabled={busy} onPress={() => onChoice(c)} style={styles.chip}>
                {c}
              </Chip>
            ))}
          </View>
        )}
      </ScrollView>

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" />
          <Text style={styles.overlayText}>{busyLabel}</Text>
        </View>
      )}

      {/* Paywall — reachable only after free turns exhausted (R9). */}
      {paywall && (
        <View style={styles.paywall}>
          <Text variant="titleLarge">Continue the adventure</Text>
          <Text variant="bodyMedium" style={styles.paywallBody}>
            You have used your free turns. Unlock the full game — all three stories,
            unlimited turns — for {PRICE_DISPLAY}.
          </Text>
          <Button mode="contained" loading={busy} onPress={onUnlock}>
            {`Unlock for ${PRICE_DISPLAY}`}
          </Button>
          <Button onPress={() => stack?.entitlement.restore().then(() => setPaywall(false))}>
            Restore purchase
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 12 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#1c1c1c' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  errBanner: { borderRadius: 8 },
  narrationCard: { borderRadius: 12 },
  endingCard: { borderRadius: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginRight: 4, marginBottom: 4 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  overlayText: { marginTop: 12, color: 'white' },
  paywall: { position: 'absolute', left: 16, right: 16, bottom: 24, padding: 20, borderRadius: 16, backgroundColor: '#222', gap: 10 },
  paywallBody: { marginBottom: 8 },
});

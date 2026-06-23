// GameLauncher — the drawer screen for ARCANE TERMINAL. Picks one of the three stories,
// confirms an LLM is loaded (reusing Pocket Pal's ModelStore), then renders the play
// surface (GameView). This is the reachable entry point wired into App.tsx.

import React, {useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Button, Card, Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import RNFS from '@dr.pogodin/react-native-fs';

import {modelStore} from '../../store';
import GameView from './GameView';

import sunless from '../../game/stories/01_the_sunless_vault.json';
import derelict from '../../game/stories/02_derelict_signal_nine.json';
import blackthorn from '../../game/stories/03_blackthorn_manor.json';

const STORIES = [sunless, derelict, blackthorn] as any[];

const GameLauncher = observer(() => {
  const [bible, setBible] = useState<any | null>(null);

  // Pocket Pal tracks the active/loaded model on the ModelStore. The game needs a
  // downloaded LLM; if none is active, guide the player to the Models tab.
  const activeModelId: string | undefined =
    (modelStore as any).activeModelId ?? (modelStore as any).activeModel?.id;

  if (bible && activeModelId) {
    return (
      <GameView
        bible={bible}
        modelStore={modelStore}
        selectedLlmId={activeModelId}
        docDir={RNFS.DocumentDirectoryPath}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text variant="headlineSmall">Arcane Terminal</Text>
      <Text variant="bodyMedium" style={styles.intro}>
        Choose a story. The terminal narrates with your on-device model and paints each
        scene locally. No network, no accounts.
      </Text>

      {!activeModelId && (
        <Card style={styles.warn}>
          <Card.Content>
            <Text variant="titleSmall">Load a model first</Text>
            <Text variant="bodySmall">
              Open the Models tab, download a small chat model, and tap it to load. Then
              come back and pick a story.
            </Text>
          </Card.Content>
        </Card>
      )}

      {STORIES.map(s => (
        <Card key={s.id} style={styles.card} onPress={() => activeModelId && setBible(s)}>
          <Card.Content>
            <Text variant="titleMedium">{s.title}</Text>
            <Text variant="bodySmall">{s.tagline}</Text>
          </Card.Content>
          <Card.Actions>
            <Button disabled={!activeModelId} onPress={() => setBible(s)}>
              {activeModelId ? 'Play' : 'Load a model first'}
            </Button>
          </Card.Actions>
        </Card>
      ))}
    </ScrollView>
  );
});

export default GameLauncher;

const styles = StyleSheet.create({
  body: {padding: 16, gap: 12},
  intro: {marginBottom: 8},
  warn: {marginBottom: 8},
  card: {borderRadius: 12},
});

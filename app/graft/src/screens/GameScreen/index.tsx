// GameLauncher — the drawer screen for ARCANE TERMINAL. Picks one of the three stories,
// confirms an LLM is loaded (reusing Pocket Pal's ModelStore) and that the on-device
// image model is downloaded, then renders the play surface (GameView).

import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Button, Card, ProgressBar, Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import RNFS from '@dr.pogodin/react-native-fs';

import {modelStore} from '../../store';
import GameView from './GameView';
import {
  DEFAULT_DIFFUSION_MODEL,
  diffusionModelLocalPath,
  huggingFaceUrl,
} from '../../models/diffusionCatalog';

import sunless from '../../game/stories/01_the_sunless_vault.json';
import derelict from '../../game/stories/02_derelict_signal_nine.json';
import blackthorn from '../../game/stories/03_blackthorn_manor.json';

const STORIES = [sunless, derelict, blackthorn] as any[];
const GB = 1024 * 1024 * 1024;

const GameLauncher = observer(() => {
  const [bible, setBible] = useState<any | null>(null);
  const [imgModelReady, setImgModelReady] = useState<boolean | null>(null);
  const [dl, setDl] = useState<{active: boolean; pct: number; error?: string}>({
    active: false,
    pct: 0,
  });

  const docDir = RNFS.DocumentDirectoryPath;
  const sdPath = diffusionModelLocalPath(docDir, DEFAULT_DIFFUSION_MODEL);

  const activeModelId: string | undefined =
    (modelStore as any).activeModelId ?? (modelStore as any).activeModel?.id;

  useEffect(() => {
    RNFS.exists(sdPath).then(setImgModelReady).catch(() => setImgModelReady(false));
  }, [sdPath]);

  // Download the on-device Stable Diffusion model (GGUF) from HuggingFace (R6). The image
  // engine is compiled in; it just needs the weights. The game still plays without it —
  // images degrade gracefully — so this is optional but recommended.
  const downloadImageModel = async () => {
    setDl({active: true, pct: 0});
    try {
      await RNFS.mkdir(sdPath.substring(0, sdPath.lastIndexOf('/')));
      const {promise} = RNFS.downloadFile({
        fromUrl: huggingFaceUrl(DEFAULT_DIFFUSION_MODEL),
        toFile: sdPath,
        progressInterval: 500,
        progress: (r: {bytesWritten: number; contentLength: number}) => {
          const pct = r.contentLength > 0 ? r.bytesWritten / r.contentLength : 0;
          setDl({active: true, pct});
        },
      });
      const res = await promise;
      const ok = res.statusCode === 200;
      setImgModelReady(ok);
      setDl({active: false, pct: 1, error: ok ? undefined : `HTTP ${res.statusCode}`});
    } catch (e: any) {
      setDl({active: false, pct: 0, error: String(e?.message ?? e)});
    }
  };

  if (bible && activeModelId) {
    return (
      <GameView
        bible={bible}
        modelStore={modelStore}
        selectedLlmId={activeModelId}
        docDir={docDir}
      />
    );
  }

  const sizeGb = (DEFAULT_DIFFUSION_MODEL.approxBytes / GB).toFixed(1);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text variant="headlineSmall">Arcane Terminal</Text>
      <Text variant="bodyMedium" style={styles.intro}>
        The terminal narrates with your on-device model and paints each scene locally. No
        network, no accounts.
      </Text>

      {!activeModelId && (
        <Card style={styles.warn}>
          <Card.Content>
            <Text variant="titleSmall">1. Load a chat model</Text>
            <Text variant="bodySmall">
              Open the Models tab, download a small chat model, and tap it to load.
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Image model gate — optional but needed for on-device pictures. */}
      <Card style={styles.warn}>
        <Card.Content>
          <Text variant="titleSmall">2. Image model {imgModelReady ? '✓ ready' : ''}</Text>
          {imgModelReady ? (
            <Text variant="bodySmall">On-device Stable Diffusion is ready.</Text>
          ) : (
            <Text variant="bodySmall">
              Optional: download Stable Diffusion 1.5 ({sizeGb} GB) for local scene images.
              Without it the story still plays (images are skipped).
            </Text>
          )}
          {dl.active && <ProgressBar progress={dl.pct} style={styles.progress} />}
          {dl.error && <Text variant="bodySmall">Download failed: {dl.error}</Text>}
        </Card.Content>
        {!imgModelReady && (
          <Card.Actions>
            <Button disabled={dl.active} loading={dl.active} onPress={downloadImageModel}>
              {dl.active ? `Downloading ${(dl.pct * 100).toFixed(0)}%` : `Download (${sizeGb} GB)`}
            </Button>
          </Card.Actions>
        )}
      </Card>

      <Text variant="titleMedium" style={styles.pick}>
        3. Pick a story
      </Text>
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
  warn: {marginBottom: 4},
  pick: {marginTop: 4},
  card: {borderRadius: 12},
  progress: {marginTop: 8},
});

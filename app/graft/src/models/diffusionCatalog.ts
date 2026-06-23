// Diffusion model catalog (R6). Default to easy HuggingFace GGUF downloads that match
// stable-diffusion.cpp (ADR-004). Sizes/RAM from the diffusion research (docs/RESEARCH.md).
// The app reuses Pocket Pal's existing HF download plumbing (RNFS + DownloadModule);
// these entries just point it at the right repo/file and give a size for the UI.

export type DiffusionModelEntry = {
  id: string;
  label: string;
  hfRepo: string;
  hfFile: string;
  approxBytes: number; // for the download UI / storage pre-check
  approxRamBytes: number; // governor uses this to warn before load
  quant: string;
  recommended?: boolean;
  // Optional NPU/edge variant (R7): a separate artifact for the QNN backend.
  edge?: { backend: 'qnn'; hfRepo: string; hfFile: string };
};

const GB = 1024 * 1024 * 1024;

export const DIFFUSION_CATALOG: DiffusionModelEntry[] = [
  {
    id: 'sd15-q4_0',
    label: 'Stable Diffusion 1.5 (Q4_0) — recommended',
    hfRepo: 'second-state/stable-diffusion-v1-5-GGUF',
    hfFile: 'stable-diffusion-v1-5-Q4_0.gguf',
    approxBytes: Math.round(1.57 * GB),
    approxRamBytes: Math.round(1.6 * GB),
    quant: 'Q4_0',
    recommended: true,
  },
  {
    id: 'sd15-q8_0',
    label: 'Stable Diffusion 1.5 (Q8_0) — higher quality, more RAM',
    hfRepo: 'second-state/stable-diffusion-v1-5-GGUF',
    hfFile: 'stable-diffusion-v1-5-Q8_0.gguf',
    approxBytes: Math.round(1.76 * GB),
    approxRamBytes: Math.round(2.1 * GB),
    quant: 'Q8_0',
  },
];

export const DEFAULT_DIFFUSION_MODEL = DIFFUSION_CATALOG.find((m) => m.recommended) ?? DIFFUSION_CATALOG[0];

// Local path mirrors Pocket Pal's convention: {DocumentDir}/models/diffusion/{repo}/{file}
export function diffusionModelLocalPath(docDir: string, entry: DiffusionModelEntry): string {
  return `${docDir}/models/diffusion/${entry.hfRepo}/${entry.hfFile}`;
}

export function huggingFaceUrl(entry: DiffusionModelEntry): string {
  return `https://huggingface.co/${entry.hfRepo}/resolve/main/${entry.hfFile}`;
}

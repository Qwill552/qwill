export const WAVEFORM_PEAKS_COUNT = 64;

export async function computePeaksFromBlob(blob: Blob, peaksCount = WAVEFORM_PEAKS_COUNT): Promise<number[]> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor();
  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    return computePeaksFromAudioBuffer(audioBuffer, peaksCount);
  } finally {
    void context.close();
  }
}

export function computePeaksFromAudioBuffer(audioBuffer: AudioBuffer, peaksCount = WAVEFORM_PEAKS_COUNT): number[] {
  const channel = audioBuffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / peaksCount));
  const peaks: number[] = [];

  for (let i = 0; i < peaksCount; i += 1) {
    const start = i * bucketSize;
    const end = i === peaksCount - 1 ? channel.length : start + bucketSize;
    let max = 0;
    for (let j = start; j < end && j < channel.length; j += 1) {
      const value = Math.abs(channel[j]!);
      if (value > max) max = value;
    }
    peaks.push(max);
  }

  const loudest = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.min(1, peak / loudest));
}

import { KokoroTTS } from 'kokoro-js';

// Cache the TTS instance to avoid reloading
let kokoroTTS: any = null;

async function loadKokoroTTS() {
  if (!kokoroTTS) {
    console.log('Loading Kokoro TTS...');
    const model_id = "onnx-community/Kokoro-82M-ONNX";
    kokoroTTS = await KokoroTTS.from_pretrained(model_id, {
      dtype: "q8", // Use q8 for better quality vs speed balance
    });
    console.log('Kokoro TTS loaded successfully');
  }
  return kokoroTTS;
}

// Convert audio array to WAV buffer
function audioArrayToWav(audioArray: number[], sampleRate: number = 24000): Buffer {
  const length = audioArray.length;
  const buffer = Buffer.alloc(44 + length * 2); // WAV header + 16-bit samples

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + length * 2, 4); // File size
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(length * 2, 40); // Subchunk2Size

  // Write audio data (16-bit PCM)
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, audioArray[i])); // Clamp to [-1, 1]
    const int16 = Math.round(sample * 32767); // Convert to 16-bit
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

export async function generateBarkSpeech(
  text: string,
  voicePreset: string = 'af_bella' // Default female voice
): Promise<{ audioData: string; contentType: string; fileName: string }> {
  try {
    console.log('Generating Kokoro TTS for text:', text.substring(0, 100) + '...');

    const tts = await loadKokoroTTS();

    // Generate audio with voice
    const audio = await tts.generate(text, {
      voice: voicePreset,
    });

    // Get audio data - assuming audio.data is Float32Array or similar
    const audioArray = Array.from(audio.data || audio) as number[];

    // Convert to WAV
    const wavBuffer = audioArrayToWav(audioArray, 24000); // Kokoro uses 24kHz

    // Convert to base64
    const base64Audio = wavBuffer.toString('base64');

    console.log('Kokoro TTS generated successfully, audio length:', base64Audio.length);

    return {
      audioData: base64Audio,
      contentType: 'audio/wav',
      fileName: `kokoro-tts-${Date.now()}.wav`,
    };
  } catch (error) {
    console.error('Error generating Kokoro TTS:', error);
    throw new Error(`Kokoro TTS generation failed: ${(error as Error).message}`);
  }
}

// Function to filter thinking content from text
export function filterThinkingContent(text: string): string {
  // Remove thinking patterns
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove complete <think> blocks
    .replace(/<think>[\s\S]*$/i, '') // Remove unclosed <think> at end of content
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove <thinking> blocks
    .replace(/<thinking>[\s\S]*$/i, '') // Remove unclosed <thinking> at end
    .replace(/^Thinking:.*$/gm, '') // Remove "Thinking:" lines
    .replace(/^Let me think.*$/gm, '') // Remove "Let me think" lines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}
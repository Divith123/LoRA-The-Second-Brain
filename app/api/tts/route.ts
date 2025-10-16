import { NextRequest, NextResponse } from 'next/server';
import { handleElevenLabsTextToSpeechAction, handleTextToSpeechAction, handleElevenLabsSpeechToTextAction } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle STT (speech-to-text) request
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File;
      const provider = formData.get('provider') as string;

      if (!audioFile) {
        return NextResponse.json({ error: 'Audio file is required for speech-to-text' }, { status: 400 });
      }

      if (provider !== 'elevenlabs') {
        return NextResponse.json({ error: 'Only ElevenLabs is supported for speech-to-text' }, { status: 400 });
      }

      // Convert file to base64
      const arrayBuffer = await audioFile.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');

      const result = await handleElevenLabsSpeechToTextAction(base64Data, audioFile.name);

      return NextResponse.json({
        text: result.text,
      });
    } else {
      // Handle TTS (text-to-speech) request
      const { text, voice, provider } = await request.json();

      if (!text || typeof text !== 'string') {
        return NextResponse.json({ error: 'Text is required' }, { status: 400 });
      }

      let result;

      if (provider === 'elevenlabs') {
        result = await handleElevenLabsTextToSpeechAction(text, voice);
      } else if (provider === 'groq') {
        result = await handleTextToSpeechAction(text, voice, 'wav');
      } else {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
      }

      if (!result || !result.audioData) {
        return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 });
      }

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(result.audioData, 'base64');

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': result.contentType || 'audio/wav',
          'Content-Disposition': `attachment; filename="${result.fileName || 'tts-audio.wav'}"`,
        },
      });
    }
  } catch (error) {
    console.error('TTS/STT API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { handleElevenLabsTextToSpeechAction, handleTextToSpeechAction } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
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
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json({ error: 'Failed to generate speech' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { Client, handle_file } from '@gradio/client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mediaType = formData.get('mediaType') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (limit to 50MB for videos, 10MB for others)
    const maxSize = mediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({
        error: `File too large. Maximum size for ${mediaType} files is ${maxSize / (1024 * 1024)}MB`
      }, { status: 400 });
    }

    // Validate file type based on media type
    const allowedTypes = {
      image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'],
      video: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'],
      audio: ['audio/mp3', 'audio/wav', 'audio/flac', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/wma'],
      'ai-generated-image': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    };

    if (!allowedTypes[mediaType as keyof typeof allowedTypes].some(type => file.type.startsWith(type.split('/')[0] + '/'))) {
      return NextResponse.json({
        error: `Invalid file type for ${mediaType} detection`,
        details: `Expected ${mediaType} file, but got ${file.type}. Allowed types: ${allowedTypes[mediaType as keyof typeof allowedTypes].join(', ')}`
      }, { status: 400 });
    }

    const huggingFaceToken = process.env.HUGGINGFACE_API_TOKEN;
    if (!huggingFaceToken) {
      return NextResponse.json({ error: 'Hugging Face API token not configured' }, { status: 500 });
    }

    console.log('Connecting to Hugging Face space with token...');

    // Connect to the Hugging Face space using Gradio client with status callback
    const client = await Client.connect("Dharshaneshwaran/deepfake", {
      hf_token: huggingFaceToken as `hf_${string}`,
      status_callback: (status) => {
        console.log('Space status:', status);
        if (status.status === 'error' || (status as any).stage === 'error') {
          console.error('Space error:', status.message);
        }
      }
    });

    console.log('Successfully connected to Hugging Face space');

    // Determine which endpoint to use based on media type
    let endpoint = '';
    let payload: any = {};

    switch (mediaType) {
      case 'video':
        endpoint = '/predict';
        // Video endpoint expects: input_video={"video": handle_file(...)}
        payload = {
          input_video: { "video": handle_file(file) }
        };
        break;
      case 'audio':
        endpoint = '/predict_1';
        // Audio endpoint expects: input_audio=handle_file(...)
        payload = { input_audio: handle_file(file) };
        break;
      case 'image':
        // Try predict_2 first (standard image detection)
        endpoint = '/predict_2';
        payload = { input_image: handle_file(file) };
        break;
      case 'ai-generated-image':
        // AI Generated Image detection
        endpoint = '/predict_3';
        payload = { img: handle_file(file) };
        break;
    }

    console.log('Calling endpoint:', endpoint, 'with media type:', mediaType);

    // Call the prediction endpoint with timeout and retry logic
    let result;
    let triedFallback = false;

    const tryPrediction = async (endpointToTry: string, payloadToTry: any) => {
      try {
        console.log('Trying endpoint:', endpointToTry);
        const predictionResult = await client.predict(endpointToTry, payloadToTry);
        console.log('Hugging Face API result:', JSON.stringify(predictionResult, null, 2));

        // Check if the result indicates an error
        if ((predictionResult as any).type === 'status' && (predictionResult as any).stage === 'error') {
          throw new Error(`API returned error status: ${(predictionResult as any).message || 'Unknown error'}`);
        }

        return predictionResult;
      } catch (error) {
        console.error(`Prediction failed for endpoint ${endpointToTry}:`, error);
        throw error;
      }
    };

    try {
      result = await tryPrediction(endpoint, payload);
    } catch (predictError) {
      console.error('Prediction failed for endpoint:', endpoint, predictError);

      // If image endpoint fails and we haven't tried fallback, try predict_3
      if (endpoint === '/predict_2' && !triedFallback) {
        console.log('Trying fallback image endpoint /predict_3');
        triedFallback = true;
        try {
          endpoint = '/predict_3';
          payload = { img: handle_file(file) };
          result = await tryPrediction(endpoint, payload);
        } catch (fallbackError) {
          console.error('Fallback endpoint also failed:', fallbackError);
          return NextResponse.json({
            error: 'Image processing failed on all endpoints',
            details: 'Both standard and AI detection failed. Please try a different image.'
          }, { status: 500 });
        }
      }
      // If video endpoint fails, provide a fallback response
      else if (endpoint === '/predict') {
        console.log('Video processing failed, providing fallback response');
        return NextResponse.json({
          label: 'Unknown' as 'Real' | 'Fake',
          confidence: 0,
          rawResult: 'Video processing temporarily unavailable - please try again later or use image/audio detection'
        });
      } else {
        throw predictError;
      }
    }

    // Parse the result based on the endpoint
    let prediction = '';
    let confidence = 0;

    // Extract data from result - handle different response formats
    let resultData: any = null;
    if ((result as any).type === 'data' && (result as any).data) {
      resultData = (result as any).data;
    } else if (Array.isArray(result)) {
      resultData = result;
    } else if (typeof result === 'string') {
      resultData = [result];
    } else {
      resultData = [result];
    }

    // Ensure resultData is an array
    if (!Array.isArray(resultData)) {
      resultData = [resultData];
    }

    console.log('Parsed result data:', resultData);

    if (endpoint === '/predict') {
      // Video endpoint returns a string like "The video is REAL. \nConfidence score is: 65.00399780273438%"
      const rawResult = resultData[0] || '';
      if (typeof rawResult === 'string') {
        // Extract prediction
        if (rawResult.toUpperCase().includes('REAL')) {
          prediction = 'Real';
        } else if (rawResult.toUpperCase().includes('FAKE')) {
          prediction = 'Fake';
        } else {
          prediction = 'Unknown';
        }
        // Extract confidence
        const confidenceMatch = rawResult.match(/Confidence score is: (\d+\.?\d*)%/);
        confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 50;
      } else {
        prediction = 'Unknown';
        confidence = 50;
      }
    } else if (endpoint === '/predict_1') {
      // Audio endpoint - assuming similar format or simple string
      const rawResult = resultData[0] || 'Unknown';
      if (typeof rawResult === 'string') {
        if (rawResult.toLowerCase().includes('real')) {
          prediction = 'Real';
        } else if (rawResult.toLowerCase().includes('fake')) {
          prediction = 'Fake';
        } else {
          prediction = rawResult;
        }
        confidence = 80; // Default for audio
      } else {
        prediction = 'Unknown';
        confidence = 50;
      }
    } else if (endpoint === '/predict_2') {
      // Standard image endpoint - assuming simple string
      const rawResult = resultData[0] || 'Unknown';
      if (typeof rawResult === 'string') {
        if (rawResult.toLowerCase().includes('real')) {
          prediction = 'Real';
        } else if (rawResult.toLowerCase().includes('fake')) {
          prediction = 'Fake';
        } else {
          prediction = rawResult;
        }
        confidence = 85; // Default for image
      } else {
        prediction = 'Unknown';
        confidence = 50;
      }
    } else if (endpoint === '/predict_3') {
      // Image AI detection endpoint returns a string like "AI-Generated" or "Human-Created"
      const rawPrediction = resultData[0] || 'Unknown';
      const predictionStr = typeof rawPrediction === 'string' ? rawPrediction : 'Unknown';

      // Convert to Real/Fake format
      if (predictionStr.toLowerCase().includes('ai') || predictionStr.toLowerCase().includes('fake')) {
        prediction = 'Fake';
      } else if (predictionStr.toLowerCase().includes('human') || predictionStr.toLowerCase().includes('real')) {
        prediction = 'Real';
      } else {
        prediction = predictionStr;
      }
      confidence = 90; // Default confidence for AI image detection
    }

    // Ensure prediction is either 'Real' or 'Fake'
    if (!['Real', 'Fake'].includes(prediction)) {
      prediction = 'Unknown';
      confidence = 50;
    }

    console.log('Final prediction:', { prediction, confidence, rawResult: resultData[0] });

    return NextResponse.json({
      label: prediction as 'Real' | 'Fake',
      confidence: confidence,
      rawResult: resultData[0] || 'Unknown'
    });

  } catch (error) {
    console.error('DeepSecureAI API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    status: 'healthy',
    service: 'DeepSecureAI API',
    endpoints: ['/predict (video)', '/predict_1 (audio)', '/predict_2 (image)', '/predict_3 (image AI detection)'],
    version: '1.0.0'
  });
}

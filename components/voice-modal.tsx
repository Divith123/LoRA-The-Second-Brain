"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, X, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { transcribeAudioForVoice, continueConversation, handleElevenLabsTextToSpeechAction, handleTextToSpeechAction } from "../app/actions";
import { readStreamableValue } from "ai/rsc";
import { CoreMessage } from "ai";
import { DatabaseService } from "@/lib/database";
import { useUser } from "./user-context";
import { useConversation } from "./conversation-context";
import { useCreateConversation, useUpdateConversation } from "@/lib/database-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProviderType } from "@/lib/model-types";

function detectLanguageFromText(text: string): string {
  const hasEnglishChars = /[a-zA-Z]/.test(text);
  const hasTamilChars = /[\u0B80-\u0BFF]/.test(text); // Tamil Unicode block

  if (hasTamilChars && hasEnglishChars) {
    return 'tanglish'; // Mix of both
  } else if (hasTamilChars) {
    return 'ta'; // Tamil
  } else if (hasEnglishChars) {
    return 'en'; // English
  }
  return 'unknown';
}

interface VoiceModalProps {
  open: boolean;
  onClose: () => void;
  currentModel: string;
  currentProvider: string;
  currentConversationId: string | null;
  currentMessages: CoreMessage[];
  onConversationIdChange: (id: string) => void;
  onMessagesUpdate: (messages: CoreMessage[]) => void;
}

export default function VoiceModal({ open, onClose, currentModel, currentProvider, currentConversationId, currentMessages, onConversationIdChange, onMessagesUpdate }: VoiceModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [showAiCaption, setShowAiCaption] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [isResponsePlaying, setIsResponsePlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aiCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Conversation storage hooks
  const { currentUser } = useUser();
  const { setCurrentConversationId } = useConversation();
  const createConversationMutation = useCreateConversation();
  const updateConversationMutation = useUpdateConversation();
  const queryClient = useQueryClient();

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (aiCaptionTimeoutRef.current) {
        clearTimeout(aiCaptionTimeoutRef.current);
      }
      // Stop any ongoing recording and streams
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Clear live transcription when starting new recording
  useEffect(() => {
    if (isRecording) {
      setLiveTranscription('');
    }
  }, [isRecording]);

  // Get the last user message and AI response from conversation history
  const lastUserMessage = currentMessages.filter(msg => msg.role === 'user').slice(-1)[0]?.content as string || '';
  const lastAiMessage = currentMessages.filter(msg => msg.role === 'assistant').slice(-1)[0]?.content as string || '';

  const displayUserText = liveTranscription || lastUserMessage;
  const displayAiText = aiResponseText || lastAiMessage;
  const saveConversation = useCallback(async (messages: CoreMessage[], model: string) => {
    if (!currentUser) return;

    try {
      const title = messages.length > 0 && messages[0].content
        ? ((messages[0].content as string).length > 50
          ? (messages[0].content as string).slice(0, 50) + '...'
          : (messages[0].content as string))
        : 'Voice Conversation';

      if (currentConversationId) {
        // Update existing conversation
        await updateConversationMutation.mutateAsync({
          id: currentConversationId,
          updates: { messages, model, title },
          password: currentUser.password // Use user's password for encryption
        });
      } else {
        // Create new conversation only if there's no existing conversation
        console.log('Creating new voice conversation with:', { userId: currentUser.id, title, messages: messages.length, model });
        const newConversation = await createConversationMutation.mutateAsync({
          userId: currentUser.id,
          title,
          messages,
          model,
          provider: currentProvider as ProviderType,
          password: currentUser.password // Use user's password for encryption
        });
        console.log('New voice conversation created:', newConversation);
        if (newConversation) {
          onConversationIdChange(newConversation.id);
          // Force refetch of conversations to update sidebar immediately
          queryClient.invalidateQueries({ queryKey: ['conversations', currentUser.id] });
        }
      }
    } catch (error) {
      console.error('Error saving voice conversation:', error);
      toast.error('Failed to save voice conversation');
    }
  }, [currentUser, currentConversationId, currentProvider, createConversationMutation, updateConversationMutation, queryClient, onConversationIdChange]);

  // Function to play audio from TTS result
  const playAudio = useCallback(async (ttsResult: { audioData: string; contentType: string; fileName: string }) => {
    return new Promise<void>((resolve, reject) => {
      try {
        // Validate input data
        if (!ttsResult?.audioData) {
          reject(new Error('No audio data provided'));
          return;
        }

        // Convert base64 to audio and play
        const audioData = Uint8Array.from(atob(ttsResult.audioData), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioData], { type: ttsResult.contentType });
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        let hasResolved = false;

        // Handle successful loading and playback
        audio.onloadeddata = async () => {
          console.log('Audio loaded, duration:', audio.duration, 'seconds');
          if (audio.duration < 0.1) {
            console.warn('Audio duration is very short:', audio.duration, 'seconds - this might indicate corrupted audio data');
            URL.revokeObjectURL(audioUrl);
            if (!hasResolved) {
              hasResolved = true;
              reject(new Error('Audio data appears to be corrupted or empty'));
            }
            return;
          }

          try {
            // Add a small delay to ensure audio is ready
            await new Promise(resolve => setTimeout(resolve, 100));
            await audio.play();
            console.log('Audio started playing');
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          } catch (playError) {
            console.error('Error playing audio:', playError);
            URL.revokeObjectURL(audioUrl);
            if (!hasResolved) {
              hasResolved = true;
              reject(playError);
            }
          }
        };

        // Handle loading errors
        audio.onerror = (error) => {
          console.error('Audio loading error:', error);
          URL.revokeObjectURL(audioUrl);
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error('Failed to load audio data'));
          }
        };

        // Handle abort errors (when audio is stopped prematurely)
        audio.onabort = () => {
          console.log('Audio playback aborted');
          URL.revokeObjectURL(audioUrl);
          if (!hasResolved) {
            hasResolved = true;
            resolve(); // Consider abort as successful completion
          }
        };

        audio.onended = () => {
          console.log('Audio playback ended naturally');
          URL.revokeObjectURL(audioUrl);
          setIsResponsePlaying(false);

          // In continuous mode, restart listening after AI finishes speaking
          if (isContinuousMode && !isProcessing) {
            setTimeout(() => {
              startRecording();
            }, 500); // Small delay before restarting
          }
        };

        // Set source to trigger loading
        audio.src = audioUrl;

        // Add timeout for loading
        setTimeout(() => {
          if (!hasResolved && audio.readyState < 2) {
            console.error('Audio loading timeout');
            URL.revokeObjectURL(audioUrl);
            if (!hasResolved) {
              hasResolved = true;
              reject(new Error('Audio loading timeout'));
            }
          }
        }, 10000); // 10 second timeout

      } catch (error) {
        console.error('Error creating audio:', error);
        reject(error);
      }
    });
  }, [isContinuousMode, isProcessing]);

  // Function to show AI response caption (no auto fade-out)
  const showAiResponseCaption = useCallback((text: string) => {
    setAiResponseText(text);
    setShowAiCaption(true);
    setIsResponsePlaying(true);

    // Clear any existing timeout
    if (aiCaptionTimeoutRef.current) {
      clearTimeout(aiCaptionTimeoutRef.current);
    }
  }, []);

  const startRecording = useCallback(async () => {
    // Prevent starting if already recording, processing, or if a response is playing
    if (isRecording || isProcessing || isResponsePlaying) {
      return;
    }

    // Don't clear AI response here - let it persist until new response comes in
    // setShowAiCaption(false);
    // setAiResponseText('');
    setIsResponsePlaying(false);

    try {
      // If we don't have a stream or it's ended, get a new one
      if (!streamRef.current || streamRef.current.getTracks().some(track => track.readyState === 'ended')) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const mediaRecorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await processAudio(audioBlob);
        // Don't stop tracks in continuous mode - keep stream alive
        if (!isContinuousMode) {
          streamRef.current?.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsListening(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  }, [isRecording, isProcessing, isContinuousMode, isResponsePlaying]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsListening(false);
      setIsProcessing(true);
    }
  }, []);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Determine transcription model and provider based on user's selection
      let transcriptionModel = 'whisper-large-v3';
      let transcriptionProvider = 'groq';
      if (currentModel && currentProvider) {
        if (currentProvider === 'groq' && currentModel.includes('whisper')) {
          transcriptionModel = currentModel;
          transcriptionProvider = currentProvider;
        } else if (currentProvider === 'openai' && currentModel.includes('whisper')) {
          transcriptionModel = currentModel;
          transcriptionProvider = currentProvider;
        }
      }
      // Transcribe audio
      const transcriptionResult = await transcribeAudioForVoice(
        transcriptionModel,
        transcriptionProvider as any,
        base64Data,
        'recording.wav',
        'audio/wav'
      );
      console.log('Transcription result:', transcriptionResult);

      // Show live transcription
      setLiveTranscription(transcriptionResult || '');

      if (!transcriptionResult || transcriptionResult.trim() === '') {
        console.error('No transcription result received');
        setIsProcessing(false);
        // Clear transcription immediately for failed transcriptions
        setLiveTranscription('');
        return;
      }

      // Don't clear AI response here - let it persist until new AI response comes
      // setShowAiCaption(false);
      // setAiResponseText('');
      // setIsResponsePlaying(false);

      // Send transcribed text as a chat message in the background
      // Use the actual chat model/provider for response
      let chatModel = currentModel || 'llama2';
      let chatProvider = currentProvider || 'ollama';
      // Use existing conversation messages as context, append the new user message
      const messagesForAI: CoreMessage[] = [
        ...currentMessages,
        { role: 'user', content: transcriptionResult }
      ];
      const result = await continueConversation(messagesForAI, chatModel, chatProvider as any, {
        mode: 'sarcastic'
      });
      let aiResponse = "";
      for await (const content of readStreamableValue(result)) {
        aiResponse = content as string;
      }

      console.log('AI Response received:', aiResponse);

      if (!aiResponse || aiResponse.trim() === '') {
        console.warn('Empty AI response received');
        setIsProcessing(false);
        return;
      }

      // Clean the AI response by removing all thinking content before saving
      const cleanAiResponse = aiResponse
        .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove complete <think> blocks
        .replace(/<think>[\s\S]*$/i, '') // Remove unclosed <think> at end of content
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove <thinking> blocks
        .replace(/<thinking>[\s\S]*$/i, '') // Remove unclosed <thinking> at end
        .replace(/^Thinking:[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Thinking:" sections
        .replace(/^Let me think[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Let me think" sections
        .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines
        .trim();

      // Clear previous AI response now that we have a new one
      setShowAiCaption(false);
      setAiResponseText('');
      setIsResponsePlaying(false);

      // Append both user message and AI response to existing messages
      const updatedMessages: CoreMessage[] = [
        ...currentMessages,
        { role: "user", content: transcriptionResult },
        { role: "assistant", content: cleanAiResponse },
      ];
      await saveConversation(updatedMessages, chatModel);

      // Update the parent component's messages state
      onMessagesUpdate(updatedMessages);

      // Play the AI response as TTS (already cleaned above)
      if (cleanAiResponse) {
        console.log('Clean response for TTS:', cleanAiResponse);

        // Stop any currently playing audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioRef.current = null;
        }

        // Get API keys for TTS, prioritize DB-stored key over localStorage
        if (!currentUser) {
          console.warn('No current user, skipping TTS');
          return;
        }
        const apiKeys = await DatabaseService.getUserApiKeys(currentUser.id);
        const elevenlabsApiKey = apiKeys?.elevenlabsApiKey || localStorage.getItem('elevenlabs_api_key') || undefined;

        let ttsResult = null;
        let audioPlayed = false;

        // Try ElevenLabs TTS first
        try {
          console.log('Trying ElevenLabs TTS...');

          // Detect language of the AI response to choose appropriate voice
          const detectedLanguage = detectLanguageFromText(cleanAiResponse);
          console.log('Detected language for TTS:', detectedLanguage);

          // Choose voice based on detected language
          let selectedVoiceId = undefined; // Use default if not specified
          if (detectedLanguage === 'ta' || detectedLanguage === 'tanglish') {
            selectedVoiceId = '1XNFRxE3WBB7iI0jnm7p'; // Tamil voice
            console.log('Using Tamil voice for response');
          }

          ttsResult = await handleElevenLabsTextToSpeechAction(cleanAiResponse, selectedVoiceId, elevenlabsApiKey);
          if (ttsResult?.audioData) {
            console.log('ElevenLabs TTS succeeded');
            showAiResponseCaption(cleanAiResponse);
            try {
              await playAudio(ttsResult);
              audioPlayed = true;
            } catch (audioError) {
              console.error('Audio playback failed:', audioError);
              // Hide the caption if audio fails to play
              setShowAiCaption(false);
              setAiResponseText('');
              setIsResponsePlaying(false);
              throw audioError;
            }
          } else {
            throw new Error('ElevenLabs TTS returned no audio data');
          }
        } catch (elevenLabsError) {
          console.warn('ElevenLabs TTS failed, trying Groq TTS:', elevenLabsError);

          // Try Groq TTS as fallback
          try {
            console.log('Trying Groq TTS...');
            const groqResult = await handleTextToSpeechAction(cleanAiResponse, 'Celeste-PlayAI', 'wav', apiKeys?.groqApiKey);
            if (groqResult?.audioData) {
              console.log('Groq TTS succeeded');
              showAiResponseCaption(cleanAiResponse);
              try {
                await playAudio(groqResult);
                audioPlayed = true;
              } catch (audioError) {
                console.error('Groq audio playback failed:', audioError);
                // Hide the caption if audio fails to play
                setShowAiCaption(false);
                setAiResponseText('');
                setIsResponsePlaying(false);
                throw audioError;
              }
            } else {
              throw new Error('Groq TTS returned no audio data');
            }
          } catch (groqError) {
            console.warn('Groq TTS also failed:', groqError);
            toast.error('All text-to-speech services failed. Please check your API keys and try again.');
          }
        }

        if (!audioPlayed) {
          console.warn('No TTS service succeeded');
          // Reset UI state since no audio will play
          setShowAiCaption(false);
          setAiResponseText('');
          setIsResponsePlaying(false);
          // In continuous mode, still restart listening even if TTS failed
          if (isContinuousMode) {
            setTimeout(() => {
              startRecording();
            }, 1000);
          }
        }
      } else {
        // No TTS to play, restart listening in continuous mode
        if (isContinuousMode) {
          setTimeout(() => {
            startRecording();
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);

      // Show specific error messages for common issues
      if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('authentication failed')) {
          toast.error('Voice service authentication failed. Please check your API keys in settings.');
        } else if (error.message.includes('payment issue') || error.message.includes('payment required')) {
          toast.error('ElevenLabs payment issue detected. Please check your billing information on the ElevenLabs website.');
        } else if (error.message.includes('quota exceeded')) {
          toast.error('ElevenLabs usage quota exceeded. Please check your account limits.');
        } else if (error.message.includes('rate limit')) {
          toast.error('Voice service rate limit exceeded. Please wait a moment and try again.');
        } else if (error.message.includes('text-to-speech services failed')) {
          toast.error('All voice services failed. Please check your API keys and account status.');
        } else {
          toast.error(`Voice processing failed: ${error.message}`);
        }
      } else {
        toast.error('Voice processing failed. Please try again.');
      }
    } finally {
      // Only set processing to false if not in continuous mode
      if (!isContinuousMode) {
        setIsProcessing(false);
      } else {
        // In continuous mode, reset processing state
        setIsProcessing(false);
      }
    }
  }, [currentModel, currentProvider, currentMessages, isContinuousMode]);

  const handleMicClick = useCallback(() => {
    if (isContinuousMode) {
      // Exit continuous mode
      setIsContinuousMode(false);
      if (isRecording) {
        stopRecording();
      }
      // Stop the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    } else {
      // Enter continuous mode
      setIsContinuousMode(true);
      startRecording();
    }
  }, [isContinuousMode, isRecording, startRecording, stopRecording, isResponsePlaying]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Top-right settings icon */}
      <div className="absolute top-5 right-5">
        <Button
          variant="ghost"
          size="sm"
          className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200"
          onClick={() => {
            // TODO: Open settings modal or panel
            console.log("Settings clicked");
          }}
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex flex-col justify-center items-center">
        {/* Animated listening circle */}
        <div
          className={`w-40 h-40 rounded-full shadow-lg ${
            (isListening || isProcessing) ? "animate-pulse" : ""
          }`}
          style={{
            background: "radial-gradient(circle at 60% 30%, #FFFFFF, #007BFF)",
            boxShadow: "0 0 30px rgba(0, 0, 255, 0.2)",
          }}
        />
        {isProcessing && (
          <p className="mt-4 text-gray-600">Processing...</p>
        )}
        {isContinuousMode && !isProcessing && (
          <p className="mt-2 text-green-600 text-sm font-medium">Continuous conversation active</p>
        )}

        {/* Live Captions - below the circle */}
        <div className="mt-6 w-full max-w-md px-4 space-y-2">
          {/* User Speech Caption */}
          {displayUserText && (
            <Card className="bg-blue-50 border-blue-200 animate-in slide-in-from-bottom-2 duration-300">
              <CardContent className="p-3">
                <div className="text-xs text-blue-600 font-medium mb-1">You said:</div>
                <div className="text-blue-800 text-sm leading-relaxed">{displayUserText}</div>
              </CardContent>
            </Card>
          )}

          {/* AI Response Caption */}
          {displayAiText && (
            <Card className="bg-green-50 border-green-200 animate-in slide-in-from-bottom-2 duration-300">
              <CardContent className="p-3">
                <div className="text-xs text-green-600 font-medium mb-1">AI says:</div>
                <div className="text-green-800 text-sm leading-relaxed">{displayAiText}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} />

      {/* Bottom controls */}
      <div className="pb-8 flex justify-center items-center gap-8">
        <Button
          variant="ghost"
          size="sm"
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isContinuousMode
              ? "bg-green-100 hover:bg-green-200 border-2 border-green-300"
              : isRecording
              ? "bg-red-100 hover:bg-red-200"
              : "bg-gray-100 hover:bg-gray-200"
          }`}
          onClick={handleMicClick}
          disabled={isProcessing || isResponsePlaying}
        >
          <Mic size={24} className={
            isContinuousMode
              ? "text-green-600"
              : isRecording
              ? "text-red-500"
              : "text-gray-600"
          } />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-14 h-14 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
          onClick={onClose}
          disabled={isProcessing || isResponsePlaying}
        >
          <X size={24} className="text-gray-600" />
        </Button>
      </div>
    </div>
  );
}
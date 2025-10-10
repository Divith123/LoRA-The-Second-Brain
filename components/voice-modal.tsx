"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, X, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { transcribeAudioForVoice, continueConversation, handleElevenLabsTextToSpeechAction, handleTextToSpeechAction } from "../app/actions";
import { readStreamableValue } from "ai/rsc";
import { CoreMessage } from "ai";
import { useUser } from "./user-context";
import { useConversation } from "./conversation-context";
import { useCreateConversation, useUpdateConversation } from "@/lib/database-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProviderType } from "@/lib/model-types";

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Conversation storage hooks
  const { currentUser } = useUser();
  const { setCurrentConversationId } = useConversation();
  const createConversationMutation = useCreateConversation();
  const updateConversationMutation = useUpdateConversation();
  const queryClient = useQueryClient();

  // Function to save conversation (similar to chat component)
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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
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
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsListening(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  }, []);

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
      if (!transcriptionResult || transcriptionResult.trim() === '') {
        console.error('No transcription result received');
        setIsProcessing(false);
        return;
      }
      // Send transcribed text as a chat message in the background
      setIsProcessing(true);
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
      if (cleanAiResponse && audioRef.current) {
        console.log('Clean response for TTS:', cleanAiResponse);

        // Use ElevenLabs TTS for natural voice
        try {
          const ttsResult = await handleElevenLabsTextToSpeechAction(cleanAiResponse, '21m00Tcm4TlvDq8ikWAM', undefined);

          // Convert base64 to audio and play
          const audioData = Uint8Array.from(atob(ttsResult.audioData), c => c.charCodeAt(0));
          const audioBlob = new Blob([audioData], { type: ttsResult.contentType });
          const audioUrl = URL.createObjectURL(audioBlob);

          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
          };

          await audio.play();
        } catch (ttsError) {
          console.warn('ElevenLabs TTS failed, trying Groq TTS:', ttsError);

          // Try Groq TTS as open source alternative
          try {
            const groqResult = await handleTextToSpeechAction(cleanAiResponse, 'af_bella', 'wav', undefined);

            // Convert base64 to audio and play
            const audioData = Uint8Array.from(atob(groqResult.audioData), c => c.charCodeAt(0));
            const audioBlob = new Blob([audioData], { type: groqResult.contentType });
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
            };

            await audio.play();
          } catch (groqError) {
            console.warn('Groq TTS also failed, falling back to Google Translate Indian English TTS:', groqError);

            // Fallback to Google Translate Indian English TTS (free, no API key required)
            try {
              const encodedText = encodeURIComponent(cleanAiResponse);
              const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en-IN&client=tw-ob`;

              const response = await fetch(googleTTSUrl);
              if (!response.ok) {
                throw new Error(`Google Indian English TTS failed: ${response.status}`);
              }

              const audioBuffer = await response.arrayBuffer();
              const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
              const audioUrl = URL.createObjectURL(audioBlob);

              const audio = new Audio(audioUrl);
              audioRef.current = audio;

              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
              };

              await audio.play();
            } catch (googleTTSError) {
              console.warn('All TTS services failed:', googleTTSError);
              toast.error('All text-to-speech services failed. Please check your API keys and try again.');
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [currentModel, currentProvider, currentMessages]);

  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

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
      </div>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} />

      {/* Bottom controls */}
      <div className="pb-8 flex justify-center items-center gap-8">
        <Button
          variant="ghost"
          size="sm"
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isRecording ? "bg-red-100 hover:bg-red-200" : "bg-gray-100 hover:bg-gray-200"
          }`}
          onClick={handleMicClick}
          disabled={isProcessing}
        >
          <Mic size={24} className={isRecording ? "text-red-500" : "text-gray-600"} />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-14 h-14 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
          onClick={onClose}
          disabled={isProcessing}
        >
          <X size={24} className="text-gray-600" />
        </Button>
      </div>
    </div>
  );
}
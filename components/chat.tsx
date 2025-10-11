"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback } from "react";
import { type CoreMessage } from "ai";
import ChatInput from "./chat-input";
import { readStreamableValue } from "ai/rsc";
import { continueConversation, handleTranscriptionAction, handleTextToSpeechAction, handleElevenLabsTextToSpeechAction } from "../app/actions";
import { DatabaseService, Conversation } from "@/lib/database";
import { EncryptedConversationStorage } from "@/lib/encrypted-conversation-storage";
import { toast } from "sonner";
import remarkGfm from "remark-gfm";
import { MemoizedReactMarkdown } from "./markdown";
import { useUser } from "./user-context";
import { useConversations, useCreateConversation, useUpdateConversation } from "@/lib/database-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useConversation } from "./conversation-context";
import { useModel, useFilePreview } from "./app-content";
import { Pin, MoreVertical, Volume2, Clock, Search, BookOpen, ChevronDown, Pause, Mic, Globe } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import FilePreviewModal from "./file-preview-modal";
import prettyBytes from "pretty-bytes";
import jsPDF from "jspdf";
import { ProviderType } from "@/lib/model-types";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import VoiceModal from "./voice-modal";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Extended message type with additional properties
type ExtendedMessage = CoreMessage & {
  mode?: "think-longer" | "deep-research" | "web-search" | "study";
  files?: { id: string; name: string; size?: number }[];
  knowledgeSources?: {
    used: boolean;
    sources: Array<{
      title: string;
      date: string;
      content: string;
    }>;
  };
};

export default function Chat() {
  const { currentUser } = useUser();
  const { currentConversationId, setCurrentConversationId } = useConversation();
  const { currentModel, currentProvider, onModelChange, onOpenFilesDialog } = useModel();
  const { currentFileId } = useFilePreview();
  const { data: conversations = [], isLoading: isLoadingConversations } = useConversations(currentUser?.id || '');
  const queryClient = useQueryClient();
  const router = useRouter();
  const createConversationMutation = useCreateConversation();
  const updateConversationMutation = useUpdateConversation();
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef<string>("");
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [knowledgeSources, setKnowledgeSources] = useState<Array<{title: string; date: string; content: string}>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [currentlyPlayingMessageId, setCurrentlyPlayingMessageId] = useState<string | null>(null);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [thinkingStates, setThinkingStates] = useState<Record<string, boolean>>({});
  const [knowledgeStates, setKnowledgeStates] = useState<Record<string, boolean>>({});
  // Track which messages are currently being pre-generated to prevent duplicates
  const [preGeneratingMessages, setPreGeneratingMessages] = useState<Set<string>>(new Set());
  // Store pre-generated audio data with localStorage persistence
  const [preGeneratedAudio, setPreGeneratedAudio] = useState<Record<string, { audioData: string; contentType: string; audioUrl?: string }>>({});
  // Loading state for input component
  const [isLoading, setIsLoading] = useState(false);
  // User avatar state
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  // Voice modal state
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Helper function to update pre-generated audio with localStorage persistence
  const updatePreGeneratedAudio = useCallback((updater: (prev: Record<string, { audioData: string; contentType: string; audioUrl?: string }>) => Record<string, { audioData: string; contentType: string; audioUrl?: string }>) => {
    setPreGeneratedAudio(prev => {
      const newState = updater(prev);
      // Save to localStorage (exclude audioUrl as it's not serializable)
      if (typeof window !== 'undefined') {
        try {
          const serializableState = Object.fromEntries(
            Object.entries(newState).map(([key, value]) => [key, { audioData: value.audioData, contentType: value.contentType }])
          );
          localStorage.setItem('preGeneratedAudio', JSON.stringify(serializableState));
        } catch (error) {
          console.warn('Failed to save pre-generated audio to localStorage:', error);
        }
      }
      return newState;
    });
  }, []);

  // Load pre-generated audio from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('preGeneratedAudio');
        if (stored) {
          const parsedState = JSON.parse(stored) as Record<string, { audioData: string; contentType: string }>;
          // Recreate audio URLs from stored base64 data
          const restoredState: Record<string, { audioData: string; contentType: string; audioUrl?: string }> = {};
          
          Object.entries(parsedState).forEach(([messageId, audioData]) => {
            try {
              // Convert base64 back to blob and create URL
              const audioDataBytes = Uint8Array.from(atob(audioData.audioData), c => c.charCodeAt(0));
              const audioBlob = new Blob([audioDataBytes], { type: audioData.contentType });
              const audioUrl = URL.createObjectURL(audioBlob);
              
              restoredState[messageId] = {
                audioData: audioData.audioData,
                contentType: audioData.contentType,
                audioUrl
              };
            } catch (error) {
              console.warn(`Failed to restore audio for message ${messageId}:`, error);
            }
          });
          
          setPreGeneratedAudio(restoredState);
          console.log('✅ Restored pre-generated audio from localStorage:', Object.keys(restoredState).length, 'items');
        }
      } catch (error) {
        console.warn('Failed to load pre-generated audio from localStorage:', error);
      }
    }
  }, []);

  // Load thinking states from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('thinkingStates');
        if (stored) {
          const parsedState = JSON.parse(stored) as Record<string, boolean>;
          setThinkingStates(parsedState);
          console.log('✅ Restored thinking states from localStorage:', Object.keys(parsedState).length, 'items');
        }
      } catch (error) {
        console.warn('Failed to load thinking states from localStorage:', error);
      }
    }
  }, []);

  // Helper function to detect and format image URLs and base64 data in text
  const formatMessageWithImages = (content: string): string => {
    if (!content) return content;

    // For Gemini responses, the content already has proper markdown images
    if (content.includes('![Generated Image](')) {
      return content;
    }

    // Regular expression to match image URLs
    const imageUrlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico|tiff|avif)(\?[^\s]*)?)/gi;
    // Regular expression to match base64 image data
    const base64ImageRegex = /data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/gi;

    // Regular expression to match markdown image syntax that's already there
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    let formattedContent = content;

    // First, check if there are already markdown images
    const existingImages = content.match(markdownImageRegex);
    if (existingImages && existingImages.length > 0) {
      return content; // Don't process if already formatted
    }

    // Replace image URLs with markdown image syntax
    formattedContent = formattedContent.replace(imageUrlRegex, (match) => {
      const altText = "Generated image";
      return `![${altText}](${match})`;
    });

    // Replace base64 image data with markdown image syntax
    formattedContent = formattedContent.replace(base64ImageRegex, (match) => {
      const altText = "Generated image";
      return `![${altText}](${match})`;
    });

    return formattedContent;
  };

  // Conversation history retrieval for knowledge base context
  const retrieveRelevantConversationHistory = useCallback(async (
    userId: string,
    currentQuery: string,
    currentConversationId: string | undefined,
    password?: string,
    maxResults: number = 5
  ): Promise<{ formattedText: string; sources: Array<{title: string; date: string; content: string}> }> => {
    try {
      // Get all conversations for the user
      const conversations = await DatabaseService.getConversationsByUserId(userId);

      // Filter out the current conversation to avoid duplication
      const otherConversations = conversations.filter(conv => conv.id !== currentConversationId);

      const relevantSnippets: string[] = [];
      const sources: Array<{title: string; date: string; content: string}> = [];

      for (const conversation of otherConversations.slice(0, 20)) { // Limit to recent 20 conversations for performance
        try {
          let conversationData = conversation;

          // If conversation is encrypted, try to decrypt it
          if (conversation.encryptedPath && password) {
            try {
              conversationData = await EncryptedConversationStorage.loadConversation(
                conversation.encryptedPath,
                password
              );
            } catch (error) {
              // Skip encrypted conversations we can't decrypt
              continue;
            }
          }

          // Skip if no messages
          if (!conversationData.messages || conversationData.messages.length === 0) {
            continue;
          }

          // Check if conversation title or content is relevant to the query
          const titleLower = conversationData.title.toLowerCase();
          const queryLower = currentQuery.toLowerCase();

          // Simple relevance check - look for keyword matches
          const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
          const titleWords = titleLower.split(/\s+/);

          let relevanceScore = 0;

          // Title relevance
          for (const queryWord of queryWords) {
            if (titleWords.some(titleWord => titleWord.includes(queryWord) || queryWord.includes(titleWord))) {
              relevanceScore += 10; // High score for title matches
            }
          }

          // Content relevance - check recent messages
          const recentMessages = conversationData.messages.slice(-6); // Last 6 messages
          for (const message of recentMessages) {
            if (message.role === 'user' || message.role === 'assistant') {
              const content = String(message.content || '').toLowerCase();
              for (const queryWord of queryWords) {
                if (content.includes(queryWord)) {
                  relevanceScore += 2; // Lower score for content matches
                }
              }
            }
          }

          // If relevant enough, extract key information
          if (relevanceScore >= 5) {
            const keyMessages = conversationData.messages
              .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
              .slice(-4) // Last 4 messages
              .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${String(msg.content || '').slice(0, 200)}`)
              .join('\n');

            if (keyMessages.trim()) {
              relevantSnippets.push(
                `From conversation "${conversationData.title}" (${new Date(conversationData.createdAt).toLocaleDateString()}):\n${keyMessages}`
              );
            }
          }

          if (relevantSnippets.length >= maxResults) {
            break; // Stop once we have enough results
          }

        } catch (error) {
          console.warn(`Error processing conversation ${conversation.id}:`, error);
          continue;
        }
      }

      if (relevantSnippets.length > 0) {
        return {
          formattedText: `## Previous Conversation Context\n\n${relevantSnippets.join('\n\n---\n\n')}\n\n`,
          sources
        };
      }

      return { formattedText: '', sources: [] };
    } catch (error) {
      console.error('Error retrieving conversation history:', error);
      return { formattedText: '', sources: [] };
    }
  }, []);

  // Helper functions for collapsible states
  const getThinkingState = useCallback((messageId: string) => thinkingStates[messageId] ?? true, [thinkingStates]);
  const setThinkingState = useCallback((messageId: string, expanded: boolean) => {
    setThinkingStates(prev => {
      const newState = { ...prev, [messageId]: expanded };
      // Save to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('thinkingStates', JSON.stringify(newState));
        } catch (error) {
          console.warn('Failed to save thinking states to localStorage:', error);
        }
      }
      return newState;
    });
  }, []);

  const getKnowledgeState = useCallback((messageId: string) => knowledgeStates[messageId] ?? false, [knowledgeStates]);
  const setKnowledgeState = useCallback((messageId: string, expanded: boolean) => {
    setKnowledgeStates(prev => ({ ...prev, [messageId]: expanded }));
  }, []);

  // Pre-generate TTS audio for a message
  const preGenerateTTS = useCallback(async (messageId: string, text: string) => {
    if (!text || preGeneratedAudio[messageId] || preGeneratingMessages.has(messageId)) return; // Already generated or currently generating

    console.log('🎵 Starting pre-generation for message:', messageId, 'text length:', text.length);

    // Mark as being pre-generated
    setPreGeneratingMessages(prev => new Set(prev).add(messageId));

    try {
      // Strip markdown formatting for better TTS
      const cleanText = text
        .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
        .replace(/\[.*?\]\(.*?\)/g, '$1') // Convert links to just text
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italic
        .replace(/`(.*?)`/g, '$1') // Remove inline code
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .trim();

      if (!cleanText || cleanText.length > 10000) {
        console.log('🎵 Skipping pre-generation: text too short or too long');
        return;
      }

      console.log('🎵 Pre-generating TTS for cleaned text:', cleanText.substring(0, 50) + '...');

      // Try ElevenLabs TTS first (primary)
      try {
        const elevenLabsResult = await handleElevenLabsTextToSpeechAction(cleanText, 'JkpEM0J2p7DL32VXnieS', currentUser?.id);

        // Convert base64 to blob and create URL for instant playback
        const audioData = Uint8Array.from(atob(elevenLabsResult.audioData), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioData], { type: elevenLabsResult.contentType });
        const audioUrl = URL.createObjectURL(audioBlob);

        updatePreGeneratedAudio(prev => ({
          ...prev,
          [messageId]: {
            audioData: elevenLabsResult.audioData,
            contentType: elevenLabsResult.contentType,
            audioUrl
          }
        }));

        console.log('✅ Pre-generated ElevenLabs TTS for message:', messageId);
      } catch (elevenLabsError) {
        console.warn('❌ ElevenLabs pre-generation failed, trying Groq fallback:', elevenLabsError);

        try {
          // Try Groq TTS API
          // Strip markdown formatting for better TTS (same as above)
          const filteredText = cleanText
            .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove <think> blocks
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove <thinking> blocks
            .replace(/^Thinking:[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Thinking:" sections
            .replace(/^Let me think[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Let me think" sections
            .trim();

          const result = await handleTextToSpeechAction(filteredText, 'af_bella', 'wav', currentUser?.id);

          // Convert base64 to blob and create URL for instant playback
          const audioData = Uint8Array.from(atob(result.audioData), c => c.charCodeAt(0));
          const audioBlob = new Blob([audioData], { type: result.contentType });
          const audioUrl = URL.createObjectURL(audioBlob);

          updatePreGeneratedAudio(prev => ({
            ...prev,
            [messageId]: {
              audioData: result.audioData,
              contentType: result.contentType,
              audioUrl
            }
          }));

          console.log('✅ Pre-generated Groq TTS for message:', messageId);
        } catch (groqError) {
          console.warn('❌ Groq pre-generation failed:', groqError);
          // Don't set any audio - will fall back to on-demand generation
        }
      }
    } catch (error) {
      console.error('❌ Error pre-generating TTS for message:', messageId, error);
    } finally {
      // Always remove from pre-generating set
      setPreGeneratingMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  }, [preGeneratedAudio, preGeneratingMessages]);

  // TTS functionality with instant playback from pre-generated audio and pause/resume support
  const handleTextToSpeech = useCallback(async (text: string, messageId?: string, action?: 'play' | 'pause' | 'resume') => {
    // If this is a pause/resume action for the currently playing message
    if (action === 'pause' && currentlyPlayingMessageId === messageId && currentAudioRef.current && !currentAudioRef.current.paused) {
      console.log('Pausing audio for message:', messageId);
      currentAudioRef.current.pause();
      setIsAudioPaused(true);
      return;
    }
  }, [isPlayingTTS, currentAudioRef]);

    if (action === 'resume' && currentlyPlayingMessageId === messageId && currentAudioRef.current && currentAudioRef.current.paused) {
      console.log('Resuming audio for message:', messageId);
      currentAudioRef.current.play().catch(error => {
        console.error('Error resuming audio:', error);
      });
      setIsAudioPaused(false);
      return;
    }

    // If trying to play a different message while another is playing, stop the current one
    if (currentlyPlayingMessageId && currentlyPlayingMessageId !== messageId && currentAudioRef.current) {
      console.log('Stopping current audio for different message');
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsPlayingTTS(false);
      setCurrentlyPlayingMessageId(null);
      setIsAudioPaused(false);
    }

    // If already playing this message, do nothing (shouldn't happen with new logic)
    if (currentlyPlayingMessageId === messageId && isPlayingTTS && !isAudioPaused) {
      console.log('Already playing this message, ignoring request');
      return;
    }

    console.log('Starting TTS for text length:', text.length, 'messageId:', messageId);

    try {
      setIsPlayingTTS(true);
      setCurrentlyPlayingMessageId(messageId || null);
      setIsAudioPaused(false);

      // Check if we have pre-generated audio for this message
      if (messageId && preGeneratedAudio[messageId]?.audioUrl) {
        console.log('🎵 Using pre-generated audio for message:', messageId);

        const audio = new Audio(preGeneratedAudio[messageId].audioUrl!);
        currentAudioRef.current = audio;

        // Add event listeners for debugging
        audio.addEventListener('loadstart', () => console.log('Pre-generated audio load started'));
        audio.addEventListener('canplay', () => console.log('Pre-generated audio can play'));
        audio.addEventListener('play', () => {
          console.log('Pre-generated audio started playing');
          if (currentlyPlayingMessageId === messageId) {
            setIsAudioPaused(false);
          }
        });
        audio.addEventListener('pause', () => {
          console.log('Pre-generated audio paused');
          if (currentlyPlayingMessageId === messageId) {
            setIsAudioPaused(true);
          }
        });
        audio.addEventListener('error', (e) => {
          console.error('Pre-generated audio element error:', e);
          console.error('Audio error code:', audio.error?.code, 'message:', audio.error?.message);
          // Only show error if audio hasn't started playing and we're not waiting for user interaction
          if (!audio.currentTime && !audio.played.length) {
            setIsPlayingTTS(false);
            currentAudioRef.current = null;
          }
        });

        // Try to play
        let autoplayFailed = false;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('Pre-generated audio started playing successfully');
          }).catch(error => {
            console.error('Error playing pre-generated audio:', error);
            console.error('Error name:', error.name, 'Error message:', error.message);
            // Try to play on user interaction if autoplay failed
            if (error.name === 'NotAllowedError') {
              console.log('Pre-generated autoplay blocked, waiting for user interaction');
              autoplayFailed = true;
              const handleUserInteraction = () => {
                if (currentAudioRef.current === audio) {
                  audio.play().then(() => {
                    console.log('Pre-generated audio started after user interaction');
                    autoplayFailed = false; // Reset flag since it worked
                  }).catch(e => {
                    console.error('Still failed to play pre-generated audio after user interaction:', e);
                    // Only show error if it's not another NotAllowedError and audio hasn't played
                    if (e.name !== 'NotAllowedError' && !audio.played.length) {
                      // toast.error('Failed to play pre-generated audio after user interaction'); // Temporarily disabled
                      setIsPlayingTTS(false);
                      currentAudioRef.current = null;
                    }
                  });
                }
                document.removeEventListener('click', handleUserInteraction);
                document.removeEventListener('keydown', handleUserInteraction);
              };
              document.addEventListener('click', handleUserInteraction);
              document.addEventListener('keydown', handleUserInteraction);
            } else {
              // Only show error if audio hasn't started playing
              if (!audio.played.length) {
                // toast.error('Failed to play pre-generated audio'); // Temporarily disabled
                setIsPlayingTTS(false);
                currentAudioRef.current = null;
              }
            }
          });
        }

        // Clean up the URL after playing and reset playing state
        audio.onended = () => {
          setIsPlayingTTS(false);
          setCurrentlyPlayingMessageId(null);
          setIsAudioPaused(false);
          currentAudioRef.current = null;
        };

        return; // Exit early since we're using pre-generated audio
      }

      // Fallback to on-demand generation if no pre-generated audio
      console.log('🎵 No pre-generated audio found, generating on-demand for message:', messageId);

      // Strip markdown formatting for better TTS
      const cleanText = text
        .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
        .replace(/\[.*?\]\(.*?\)/g, '$1') // Convert links to just text
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italic
        .replace(/`(.*?)`/g, '$1') // Remove inline code
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
        .replace(/\n+/g, ' ') // Replace newlines with spaces
        .trim();

      // Filter out thinking content to prevent TTS from reading internal AI reasoning
      const filteredText = cleanText
        .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove complete <think> blocks
        .replace(/<think>[\s\S]*$/i, '') // Remove unclosed <think> at end of content
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove <thinking> blocks
        .replace(/<thinking>[\s\S]*$/i, '') // Remove unclosed <thinking> at end
        .replace(/^Thinking:[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Thinking:" sections
        .replace(/^Let me think[\s\S]*?(?=\n\n|\n[A-Z]|$)/im, '') // Remove "Let me think" sections
        .trim();

      if (!filteredText) {
        toast.error('No text to speak');
        setIsPlayingTTS(false);
        return;
      }

      if (filteredText.length > 10000) {
        toast.error('Text is too long for speech generation (max 10,000 characters)');
        setIsPlayingTTS(false);
        return;
      }

      console.log('Generating TTS for text:', filteredText.substring(0, 100) + '...');

      try {
        // Try ElevenLabs TTS API first (primary)
        const elevenLabsResult = await handleElevenLabsTextToSpeechAction(filteredText, 'JkpEM0J2p7DL32VXnieS', currentUser?.id);

        // Convert base64 to blob and play
        try {
          console.log('Converting ElevenLabs base64 to audio blob...');
          const audioData = Uint8Array.from(atob(elevenLabsResult.audioData), c => c.charCodeAt(0));
          console.log('ElevenLabs audio data length:', audioData.length);

          const audioBlob = new Blob([audioData], { type: elevenLabsResult.contentType });
          console.log('ElevenLabs audio blob size:', audioBlob.size, 'type:', audioBlob.type);

          const audioUrl = URL.createObjectURL(audioBlob);
          console.log('ElevenLabs audio URL created:', audioUrl);

          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          // Add event listeners for debugging
          audio.addEventListener('loadstart', () => console.log('ElevenLabs audio load started'));
          audio.addEventListener('canplay', () => console.log('ElevenLabs audio can play'));
          audio.addEventListener('play', () => {
            console.log('ElevenLabs audio started playing');
            if (currentlyPlayingMessageId === messageId) {
              setIsAudioPaused(false);
            }
          });
          audio.addEventListener('pause', () => {
            console.log('ElevenLabs audio paused');
            if (currentlyPlayingMessageId === messageId) {
              setIsAudioPaused(true);
            }
          });
          audio.addEventListener('error', (e) => {
            console.error('ElevenLabs audio element error:', e);
            console.error('Audio error code:', audio.error?.code, 'message:', audio.error?.message);
            // Only show error if audio hasn't started playing and we're not waiting for user interaction
            if (!audio.currentTime && !audio.played.length) {
              setIsPlayingTTS(false);
              currentAudioRef.current = null;
            }
          });

          // Try to play with user interaction handling
          let autoplayFailed = false;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('ElevenLabs audio started playing successfully');
            }).catch(error => {
              console.error('Error playing ElevenLabs audio:', error);
              console.error('Error name:', error.name, 'Error message:', error.message);
              // Try to play on user interaction if autoplay failed
              if (error.name === 'NotAllowedError') {
                console.log('ElevenLabs autoplay blocked, waiting for user interaction');
                autoplayFailed = true;
                const handleUserInteraction = () => {
                  if (currentAudioRef.current === audio) {
                    audio.play().then(() => {
                      console.log('ElevenLabs audio started after user interaction');
                      autoplayFailed = false; // Reset flag since it worked
                    }).catch(e => {
                      console.error('Still failed to play ElevenLabs audio after user interaction:', e);
                      // Only show error if it's not another NotAllowedError and audio hasn't played
                      if (e.name !== 'NotAllowedError' && !audio.played.length) {
                        // toast.error('Failed to play ElevenLabs audio after user interaction'); // Temporarily disabled
                        setIsPlayingTTS(false);
                        currentAudioRef.current = null;
                      }
                    });
                  }
                  document.removeEventListener('click', handleUserInteraction);
                  document.removeEventListener('keydown', handleUserInteraction);
                };
                document.addEventListener('click', handleUserInteraction);
                document.addEventListener('keydown', handleUserInteraction);
              } else {
                // For non-autoplay errors, show error immediately since user interaction won't help
                // toast.error('Failed to play ElevenLabs audio'); // Temporarily disabled
                setIsPlayingTTS(false);
                currentAudioRef.current = null;
              }
            });
          }

          // Clean up the URL after playing and reset playing state
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setIsPlayingTTS(false);
            setCurrentlyPlayingMessageId(null);
            setIsAudioPaused(false);
            currentAudioRef.current = null;
          };
        } catch (conversionError) {
          console.error('Error converting ElevenLabs audio data:', conversionError);
          toast.error('Failed to process ElevenLabs audio data');
          setIsPlayingTTS(false);
          currentAudioRef.current = null;
        }
      } catch (elevenLabsError) {
        console.warn('ElevenLabs TTS failed, trying Groq fallback:', elevenLabsError);
        toast.info('ElevenLabs failed, using Groq text-to-speech (fallback)');

        try {
          // Try Groq TTS API
          const result = await handleTextToSpeechAction(filteredText, 'af_bella', 'wav', currentUser?.id);

          // Convert base64 to blob and play
          const audioData = Uint8Array.from(atob(result.audioData), c => c.charCodeAt(0));
          console.log('Groq audio data length:', audioData.length);

          const audioBlob = new Blob([audioData], { type: result.contentType });
          console.log('Groq audio blob size:', audioBlob.size, 'type:', audioBlob.type);

          const audioUrl = URL.createObjectURL(audioBlob);
          console.log('Groq audio URL created:', audioUrl);

          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          // Add event listeners for debugging
          audio.addEventListener('loadstart', () => console.log('Groq audio load started'));
          audio.addEventListener('canplay', () => console.log('Groq audio can play'));
          audio.addEventListener('play', () => {
            console.log('Groq audio started playing');
            if (currentlyPlayingMessageId === messageId) {
              setIsAudioPaused(false);
            }
          });
          audio.addEventListener('pause', () => {
            console.log('Groq audio paused');
            if (currentlyPlayingMessageId === messageId) {
              setIsAudioPaused(true);
            }
          });
          audio.addEventListener('error', (e) => {
            console.error('Groq audio element error:', e);
            console.error('Audio error code:', audio.error?.code, 'message:', audio.error?.message);
            // Only show error if audio hasn't started playing and we're not waiting for user interaction
            if (!audio.currentTime && !audio.played.length) {
              setIsPlayingTTS(false);
              currentAudioRef.current = null;
            }
          });

          // Try to play with user interaction handling
          let autoplayFailed = false;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('Groq audio started playing successfully');
            }).catch(error => {
              console.error('Error playing Groq audio:', error);
              console.error('Error name:', error.name, 'Error message:', error.message);
              // Try to play on user interaction if autoplay failed
              if (error.name === 'NotAllowedError') {
                console.log('Groq autoplay blocked, waiting for user interaction');
                autoplayFailed = true;
                const handleUserInteraction = () => {
                  if (currentAudioRef.current === audio) {
                    audio.play().then(() => {
                      console.log('Groq audio started after user interaction');
                      autoplayFailed = false; // Reset flag since it worked
                    }).catch(e => {
                      console.error('Still failed to play Groq audio after user interaction:', e);
                      // Only show error if it's not another NotAllowedError and audio hasn't played
                      if (e.name !== 'NotAllowedError' && !audio.played.length) {
                        // toast.error('Failed to play Groq audio after user interaction'); // Temporarily disabled
                        setIsPlayingTTS(false);
                        currentAudioRef.current = null;
                      }
                    });
                  }
                  document.removeEventListener('click', handleUserInteraction);
                  document.removeEventListener('keydown', handleUserInteraction);
                };
                document.addEventListener('click', handleUserInteraction);
                document.addEventListener('keydown', handleUserInteraction);
              } else {
                // Only show error if audio hasn't started playing
                if (!audio.played.length) {
                  // toast.error('Failed to play Groq audio'); // Temporarily disabled
                  setIsPlayingTTS(false);
                  currentAudioRef.current = null;
                }
              }
            });
          }

          // Clean up the URL after playing and reset playing state
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setIsPlayingTTS(false);
            setCurrentlyPlayingMessageId(null);
            setIsAudioPaused(false);
            currentAudioRef.current = null;
          };
        } catch (groqError) {
          console.warn('Groq TTS API failed, trying Web Speech API fallback:', groqError);
          toast.info('Using browser text-to-speech (fallback)');

          // Fallback to Web Speech API
          if ('speechSynthesis' in window) {
            try {
              const utterance = new SpeechSynthesisUtterance(filteredText);

              // Try to find an English female voice
              const voices = speechSynthesis.getVoices();
              const englishFemaleVoice = voices.find(voice =>
                voice.lang.startsWith('en') && voice.name.toLowerCase().includes('female')
              ) || voices.find(voice =>
                voice.lang.startsWith('en') && (voice.name.toLowerCase().includes('woman') || voice.name.toLowerCase().includes('girl'))
              ) || voices.find(voice =>
                voice.lang.startsWith('en')
              ) || voices[0];

              if (englishFemaleVoice) {
                utterance.voice = englishFemaleVoice;
                console.log('Using voice:', englishFemaleVoice.name, englishFemaleVoice.lang);
              }

              utterance.rate = 0.9; // Slightly slower for clarity
              utterance.pitch = 1.0;
              utterance.volume = 1.0;

              utterance.onstart = () => {
                console.log('Web Speech API started');
              };

              utterance.onend = () => {
                console.log('Web Speech API finished');
                setIsPlayingTTS(false);
                setCurrentlyPlayingMessageId(null);
                setIsAudioPaused(false);
                currentAudioRef.current = null;
              };

              utterance.onerror = (event) => {
                console.error('Web Speech API error:', event.error);
                toast.error('Browser text-to-speech failed');
                setIsPlayingTTS(false);
                currentAudioRef.current = null;
              };

              // Mark as playing
              currentAudioRef.current = { pause: () => speechSynthesis.cancel(), play: () => {} } as any;

              speechSynthesis.speak(utterance);
            } catch (speechError) {
              console.error('Web Speech API fallback failed:', speechError);
              toast.error('All TTS services failed');
              setIsPlayingTTS(false);
              currentAudioRef.current = null;
            }
          } else {
            console.error('Web Speech API not supported');
            toast.error('Text-to-speech not supported in this browser');
            setIsPlayingTTS(false);
            currentAudioRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('Error generating TTS:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('API key not configured')) {
        if (errorMessage.includes('ElevenLabs')) {
          toast.error('ElevenLabs text-to-speech requires ELEVENLABS_API_KEY environment variable. Please configure it.');
        } else {
          toast.error('Text-to-speech requires Groq API key. Please configure GROQ_API_KEY in your environment.');
        }
      } else {
        toast.error(`Failed to generate speech: ${errorMessage}`);
      }
      setIsPlayingTTS(false);
      currentAudioRef.current = null;
    }
  }, [isPlayingTTS, currentAudioRef, preGeneratedAudio, currentlyPlayingMessageId, isAudioPaused]);

  // Copy functionality
  const handleCopy = useCallback(async (text?: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
      toast.success('Copied to clipboard');
    } catch (e) {
      console.error('Copy failed', e);
      toast.error('Failed to copy');
    }
  }, []);

  // PDF export functionality
  const handleExportPdf = useCallback((assistantText?: string, userText?: string, filename: string = 'deep-research.pdf') => {
    if (!assistantText) return;
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const margin = 40;
      const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const lineHeight = 16;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LoRA - Deep Research Chat Export', margin, 60);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const modelText = `Model: ${currentModel || 'Unknown'}`;
      const generatedText = `Generated: ${new Date().toLocaleString()}`;
      doc.text(modelText, margin, 80);
      doc.text(generatedText, margin, 96);

      // Divider
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(margin, 110, margin + pageWidth, 110);

      let cursorY = 130;

      // User section
      if (userText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('You:', margin, cursorY);
        cursorY += 18;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const userLines = doc.splitTextToSize(String(userText), pageWidth);
        doc.text(userLines, margin, cursorY);
        cursorY += userLines.length * lineHeight + 12;

        // subtle divider after user
        doc.setDrawColor(230);
        doc.setLineWidth(0.5);
        doc.line(margin, cursorY, margin + pageWidth, cursorY);
        cursorY += 16;
      }

      // Assistant section
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('LoRA:', margin, cursorY);
      cursorY += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const assistantLines = doc.splitTextToSize(String(assistantText), pageWidth);

      // If content exceeds page, handle simple pagination
      let linesPerPage = Math.floor((doc.internal.pageSize.getHeight() - cursorY - margin) / lineHeight);
      let start = 0;
      while (start < assistantLines.length) {
        const chunk = assistantLines.slice(start, start + linesPerPage);
        doc.text(chunk, margin, cursorY);
        start += linesPerPage;
        if (start < assistantLines.length) {
          doc.addPage();
          cursorY = margin;
          linesPerPage = Math.floor((doc.internal.pageSize.getHeight() - margin * 2) / lineHeight);
        }
      }

      doc.save(filename);
      toast.success('PDF downloaded');
    } catch (e) {
      console.error('PDF export failed', e);
      toast.error('Failed to export PDF');
    }
  }, [currentModel]);

  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      const conversation = await DatabaseService.getConversationById(conversationId);
      if (conversation) {
        if (conversation.encryptedPath && currentUser?.password) {
          try {
            const decrypted = await EncryptedConversationStorage.loadConversation(
              conversation.encryptedPath,
              currentUser.password
            );
            setMessages(decrypted.messages || []);
            if (!currentModel) onModelChange(decrypted.model || "");
          } catch (error) {
            console.error("Failed to decrypt conversation:", error);

            // only fall back if there is real plaintext content
            const hasPlain = Array.isArray(conversation.messages) && conversation.messages.length > 0;
            if (hasPlain) {
              setMessages(conversation.messages);
              if (!currentModel) onModelChange(conversation.model || "");
              toast.error("Failed to load encrypted conversation - using unencrypted data");
            } else {
              // keep whatever is currently shown; don’t overwrite with empty
              toast.error("Failed to load encrypted conversation");
            }
          }
        } else {
          setMessages(conversation.messages || []);
          if (!currentModel) onModelChange(conversation.model || "");
        }
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      toast.error("Failed to load conversation");
      setMessages([]);
    }
  }, [currentUser, currentModel, onModelChange]);

  // Helper function to parse assistant content for thinking and response separation
  const parseAssistantContent = (content: string, isStreaming: boolean) => {
    if (!content) return { think: '', response: content };

    // Look for thinking pattern: content wrapped in <think> or <thinking> tags, or starting with "Thinking:" or "Let me think"
    const thinkPatterns = [
      /<think>([\s\S]*?)<\/think>/i,
      /<thinking>([\s\S]*?)<\/thinking>/i,
      /^Thinking:([\s\S]*?)(?=\n\n|\n[A-Z]|$)/i,
      /^Let me think[\s\S]*?([\s\S]*?)(?=\n\n|\n[A-Z]|$)/i
    ];

    for (const pattern of thinkPatterns) {
      const match = content.match(pattern);
      if (match) {
        const think = match[1].trim();
        const response = content.replace(match[0], '').trim();
        return { think, response: response || '...' };
      }
    }

    return { think: '', response: content };
  };

  // Helper function to parse streaming content with real-time thinking detection
  const parseStreamingContent = (content: string) => {
    if (!content) return { isThinking: false, thinkContent: '', responseContent: content };

    // Check if we have an open <think> tag without closing
    const openThinkMatch = content.match(/<think>([\s\S]*?)$/i);
    const closeThinkMatch = content.match(/<\/think>/i);

    if (openThinkMatch && !closeThinkMatch) {
      // We're currently inside a thinking block
      const thinkContent = openThinkMatch[1];
      const beforeThink = content.substring(0, openThinkMatch.index);
      return {
        isThinking: thinkContent.trim().length > 0,
        thinkContent: thinkContent.trim(),
        responseContent: beforeThink.trim()
      };
    }

    // Check for complete thinking blocks
    const completeThinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
    if (completeThinkMatch) {
      const thinkContent = completeThinkMatch[1].trim();
      const responseContent = content.replace(completeThinkMatch[0], '').trim();
      return {
        isThinking: false,
        thinkContent,
        responseContent
      };
    }

    // No thinking content
    return {
      isThinking: false,
      thinkContent: '',
      responseContent: content
    };
  };

  // Load conversations when user changes
  useEffect(() => {
    if (!currentUser) {
      setMessages([]);
    }
  }, [currentUser]);

  // Load user avatar when user changes
  useEffect(() => {
    const loadUserAvatar = async () => {
      if (currentUser?.id) {
        try {
          const avatarData = await DatabaseService.getUserAvatar(currentUser.id, currentUser.password);
          setUserAvatar(avatarData || null);
        } catch (error) {
          console.warn('Failed to load user avatar:', error);
          setUserAvatar(null);
        }
      } else {
        setUserAvatar(null);
      }
    };

    loadUserAvatar();
  }, [currentUser?.id]);

  // Load conversation when currentConversationId changes
  useEffect(() => {
    console.log('currentConversationId changed:', currentConversationId);
    if (currentConversationId) {
      loadConversation(currentConversationId);
    } else {
      console.log('Clearing messages for new chat');
      // Stop any currently playing audio when starting new chat
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setIsPlayingTTS(false);
      setCurrentlyPlayingMessageId(null);
      setIsAudioPaused(false);

      // Clean up pre-generated audio URLs
      Object.values(preGeneratedAudio).forEach(audio => {
        if (audio.audioUrl) {
          URL.revokeObjectURL(audio.audioUrl);
        }
      });
      updatePreGeneratedAudio(() => ({}));

      setMessages([]);
    }
  }, [currentConversationId, loadConversation]);

  // Update previewFileId when currentFileId changes
  useEffect(() => {
    if (currentFileId) {
      setPreviewFileId(currentFileId);
    }
  }, [currentFileId]);

  const createNewConversation = () => {
    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsPlayingTTS(false);
    setCurrentlyPlayingMessageId(null);
    setIsAudioPaused(false);

    // Clean up pre-generated audio URLs
    Object.values(preGeneratedAudio).forEach(audio => {
      if (audio.audioUrl) {
        URL.revokeObjectURL(audio.audioUrl);
      }
    });
    updatePreGeneratedAudio(() => ({}));

    setMessages([]);
    setCurrentConversationId(null);
  };

  const saveConversation = async (messages: ExtendedMessage[], model: string) => {
    if (!currentUser) return;

    try {
      const title = messages.length > 0 && messages[0].content
        ? ((messages[0].content as string).length > 50
          ? (messages[0].content as string).slice(0, 50) + '...'
          : (messages[0].content as string))
        : 'New Conversation';

      if (currentConversationId) {
        // Update existing conversation
        await updateConversationMutation.mutateAsync({
          id: currentConversationId,
          updates: { messages, model, title },
          password: currentUser.password // Use user's password for encryption
        });
      } else {
        // Create new conversation
        console.log('Creating new conversation with:', { userId: currentUser.id, title, messages: messages.length, model });
        const newConversation = await createConversationMutation.mutateAsync({
          userId: currentUser.id,
          title,
          messages,
          model,
          provider: currentProvider,
          password: currentUser.password // Use user's password for encryption
        });
        console.log('New conversation created:', newConversation);
        if (newConversation) {
          setCurrentConversationId(newConversation.id);
          // Update URL with new conversation
          router.push(`/?conversation=${newConversation.id}`, { scroll: false });
          // Force refetch of conversations to update sidebar immediately
          queryClient.invalidateQueries({ queryKey: ['conversations', currentUser.id] });
        }
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
      toast.error('Failed to save conversation');
    }
  };

  const handleTogglePin = async () => {
    if (!currentConversationId || !currentUser) return;

    try {
      // Get the current conversation to check its pinned status
      const conversation = await DatabaseService.getConversationById(currentConversationId);
      if (!conversation) return;

      const newPinnedState = !conversation.pinned;

      await updateConversationMutation.mutateAsync({
        id: currentConversationId,
        updates: { pinned: newPinnedState },
        password: currentUser.password
      });

      toast.success(newPinnedState ? "Pinned conversation" : "Unpinned conversation");
    } catch (error) {
      console.error('Error updating conversation pin status:', error);
      toast.error("Failed to update conversation");
    }
  };

  const handleModelChange = async (newModel: string, newProvider?: ProviderType) => {
    onModelChange(newModel, newProvider);

    // persist on the conversation record right away
    if (currentUser && currentConversationId) {
      try {
        await updateConversationMutation.mutateAsync({
          id: currentConversationId,
          updates: { model: newModel, provider: newProvider },
          password: currentUser.password
        });
      } catch (e) {
        console.error("Failed to persist model change:", e);
      }
    }
  };

  const handleSubmit = async ({
    input,
    model,
    fileIds,
    files,
    audioFile,
    mode,
  }: {
    input: string;
    model: string;
    fileIds?: string[];
    files?: { id: string; name: string; size?: number }[];
    audioFile?: File;
    mode?: "think-longer" | "deep-research" | "web-search" | "study";
  }) => {
    if (!model.includes('whisper') && input.trim().length === 0) return;
    if (model.includes('whisper') && !audioFile) return;
    if (!model) {
      toast.error("Please select a model first");
      return;
    }

    // Handle transcription separately from regular conversation
    if (model.includes('whisper')) {
      const userMessage = { content: `Transcribe audio file: ${audioFile?.name}`, role: "user" as const };
      const newMessages: CoreMessage[] = [...messages, userMessage];

      setMessages(newMessages);
      setInput("");

      try {
        // Show typing bubble
        const messagesWithAssistant = [
          ...newMessages,
          { content: "", role: "assistant" as const },
        ];
        setMessages(messagesWithAssistant);

        setIsStreaming(true);
        setIsLoading(true);
        let finalAssistantContent = "";

        // Convert File to base64
        const arrayBuffer = await audioFile!.arrayBuffer();
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Call transcription directly (not through continueConversation)
        const result = await handleTranscriptionAction(model, currentProvider || 'groq', base64Data, audioFile!.name, audioFile!.type);

        streamingContentRef.current = "";
        for await (const content of readStreamableValue(result)) {
          streamingContentRef.current = content as string;
          setStreamingContent(streamingContentRef.current);
        }
        finalAssistantContent = streamingContentRef.current;

        setIsStreaming(false);
        setIsLoading(false);
        setStreamingContent("");

        // Finalize assistant message
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: finalAssistantContent,
          };
          return updated;
        });

        // Persist conversation
        const finalMessages: CoreMessage[] = [
          ...newMessages,
          { role: "assistant", content: finalAssistantContent },
        ];
        await saveConversation(finalMessages, model);
      } catch (error) {
        console.error("Error in transcription:", error);
        setMessages(newMessages); // Drop empty assistant on error
        setIsLoading(false); // Reset loading state on error
        toast.error((error as Error).message || "Failed to transcribe audio");
      }
      return;
    }

    const userMessage: ExtendedMessage = {
      content: input,
      role: "user" as const,
      mode: mode || undefined,
      files: files?.map(f => ({ id: f.id, name: f.name, size: f.size }))
    };
    const newMessages: CoreMessage[] = [...messages, userMessage];

    // Check if this is an image generation request
    const isImageRequest = /generate.*image|create.*image|draw.*image|make.*image|produce.*image|generate.*picture|create.*picture|draw.*picture|make.*picture|produce.*picture/i.test(input);

    setMessages(newMessages);
    setInput("");

    try {
      // Set image generation state before showing typing bubble
      if (isImageRequest) {
        setIsGeneratingImage(true);
      }
      
      // show typing bubble
      const messagesWithAssistant = [
        ...newMessages,
        { content: "", role: "assistant" as const },
      ];
      setMessages(messagesWithAssistant);

      // If multiple files attached, prepend a system-level instruction listing them
      const fileListText = files && files.length > 0
        ? `User attached files:\n${files.map((f, i) => `${i + 1}. ${f.name} (${f.size ?? 'unknown'} bytes)`).join('\n')}\n\nPlease use all attached files together when answering.`
        : "";

      const messagesToSend = fileListText ? [{ role: 'system' as const, content: fileListText }, ...newMessages] : newMessages;

      // pass fileIds to RAG-enabled server action (server will run retrieval internally)
      const result = await continueConversation(messagesToSend, model, currentProvider || 'ollama', { 
        fileIds,
        mode: undefined 
      });

      setIsStreaming(true);
      setIsLoading(true);
      let finalAssistantContent = "";

      streamingContentRef.current = "";
      for await (const content of readStreamableValue(result)) {
        streamingContentRef.current = content as string;
        setStreamingContent(streamingContentRef.current);
      }
      finalAssistantContent = streamingContentRef.current;

      setIsStreaming(false);
      setIsLoading(false);
      setIsGeneratingImage(false);
      setStreamingContent("");

      // finalize assistant message
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: finalAssistantContent,
          knowledgeSources: {
            used: knowledgeSources.length > 0,
            sources: knowledgeSources
          }
        };
        
        // Store knowledge sources in localStorage for persistence
        const knowledgeKey = `${currentConversationId || 'new'}-knowledge-${updated.length - 1}`;
        localStorage.setItem(knowledgeKey, JSON.stringify({
          used: knowledgeSources.length > 0,
          sources: knowledgeSources
        }));
        
        // TTS pre-generation disabled to prevent excessive API calls
        // const { response } = parseAssistantContent(finalAssistantContent, false);
        // const messageId = `${updated.length - 1}-${response.length}`;
        // preGenerateTTS(messageId, response);
        
        return updated;
      });

      // persist
      const finalMessages: CoreMessage[] = [
        // keep system file context out of the persisted conversation messages
        ...newMessages,
        { role: "assistant", content: finalAssistantContent },
      ];
      await saveConversation(finalMessages, model);
    } catch (error) {
      console.error("Error in conversation:", error);
      setMessages(newMessages); // drop empty assistant on error
      setIsGeneratingImage(false); // Reset image generation state on error
      setIsLoading(false); // Reset loading state on error
      toast.error((error as Error).message || "Failed to get AI response");
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM updates are complete before scrolling
    const timeoutId = setTimeout(() => {
      messageEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [messages.length]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      // Clean up pre-generated audio URLs
      Object.values(preGeneratedAudio).forEach(audio => {
        if (audio.audioUrl) {
          URL.revokeObjectURL(audio.audioUrl);
        }
      });
    };
  }, []);

  if (messages.length === 0) {
    return (
      <div className="stretch mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pt-[6rem] md:px-0 md:pt-[4rem] xl:pt-[2rem] relative">
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-center text-5xl font-medium tracking-tighter">
            LoRA: The Second Brain
          </h1>
          <div className="mt-6 px-3 md:px-0">
            <h2 className="text-lg font-medium">🔹 What is LoRA: The Second Brain?</h2>
            <p className="mt-2 text-sm text-primary/80">
              LoRA (your project) is an offline personal AI hub. Think of it as your own private assistant + second brain that lives entirely on your device. It&apos;s built on top of Open WebUI, but rebranded and extended with extra features so it&apos;s not &quot;just another AI chat.&quot;
            </p>
            <p className="mt-2 text-sm text-primary/80">
              The idea is:
            </p>
            <ul className="ml-6 mt-2 flex list-disc flex-col items-start gap-2.5 text-sm text-primary/80">
              <li>You download free/open models (from Hugging Face, Ollama, etc.) and run them locally.</li>
              <li>Everything happens offline — no external servers, no spying, no leaks.</li>
              <li>Instead of being just a chatbot, it becomes a knowledge companion that remembers, organizes, and connects your thoughts.</li>
            </ul>
            <h2 className="mt-6 text-lg font-medium">🔹 Second Brain Features</h2>
            <div className="mt-2 space-y-3 text-sm text-primary/80">
              <p><strong>Automatic Memory:</strong> Remembers and connects your thoughts across all conversations automatically - no manual loading required.</p>
              <p><strong>Knowledge Base:</strong> Accesses your conversation history to provide contextually relevant responses.</p>
              <p><strong>Personal Companion:</strong> Acts as your second brain, recalling past discussions and connecting ideas.</p>
              <p><strong>Smart Context:</strong> Automatically finds and includes relevant information from previous chats when answering questions.</p>
              <p><strong>AI Modes:</strong> Choose from Think Longer, Deep Research, Web Search, and Study Mode for specialized assistance.</p>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t flex items-start gap-2">
          <div className="flex-1">
            <ChatInput
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              model={currentModel}
              handleModelChange={handleModelChange}
              isLoading={isLoading}
              onOpenFilesDialog={onOpenFilesDialog}
            />
          </div>
          <div className="py-4 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 rounded-lg border bg-background hover:bg-muted shrink-0"
              disabled={isLoading}
              title="Web search"
              onClick={() => {
                // TODO: Implement web search functionality
                console.log("Web search clicked");
              }}
            >
              <Globe size={16} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 rounded-lg border bg-background hover:bg-muted shrink-0"
              disabled={isLoading}
              title="Voice input"
              onClick={() => setShowVoiceModal(true)}
            >
              <Mic size={16} />
            </Button>
          </div>
        </div>
        <VoiceModal open={showVoiceModal} onClose={() => setShowVoiceModal(false)} currentModel={currentModel} currentProvider={currentProvider || ""} currentConversationId={currentConversationId} currentMessages={messages} onConversationIdChange={setCurrentConversationId} onMessagesUpdate={setMessages} />
      </div>
    );
  }

  return (
    <div className="stretch mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pt-24 md:px-0 relative">
      {/* Conversation Header */}
      {currentConversationId && (
        <div className="flex items-center justify-between mb-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">
              {conversations.find(c => c.id === currentConversationId)?.title || 'Conversation'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleTogglePin}>
                  <Pin className="h-4 w-4 mr-2" />
                  Pin Conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-4 backdrop-blur-sm bg-background/80">
        {messages.map((m, i) => {
          const messageId = `${i}-${m.content?.toString().length || 0}`;
          const message = m as ExtendedMessage;
          const { think, response } = parseAssistantContent(m.content as string, false);
          const responseMessageId = `${i}-${response.length}`;
          return (
            <div key={messageId} className={cn("mb-4 p-2", m.role === "user" ? "flex justify-end" : "flex justify-start")}>
              <div className={cn("flex items-start", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "flex size-8 shrink-0 select-none items-center justify-center rounded-lg",
                    m.role === "user"
                      ? "border bg-background ml-2"
                      : "border border-border mr-2",
                  )}>
                  {m.role === "user" ? (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userAvatar || undefined} alt="User avatar" />
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                  ) : (
                    <img src="/lora.svg" alt="LoRA AI" className="h-6 w-6" />
                  )}
                </div>
                <div className="space-y-2 px-1">
                  {/* Mode indicator for user messages */}
                  {m.role === "user" && message.mode && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-full">
                        {(() => {
                          const modes = [
                            { id: "think-longer" as const, label: "Think Longer", icon: Clock },
                            { id: "deep-research" as const, label: "Deep Research", icon: Search },
                            { id: "web-search" as const, label: "Web Search", icon: Search },
                            { id: "study" as const, label: "Study Mode", icon: BookOpen },
                          ];
                          const mode = modes.find(m => m.id === message.mode);
                          const Icon = mode?.icon;
                          return Icon ? <Icon size={10} /> : null;
                        })()}
                        <span>{(() => {
                          const modes = [
                            { id: "think-longer" as const, label: "Think Longer" },
                            { id: "deep-research" as const, label: "Deep Research" },
                            { id: "web-search" as const, label: "Web Search" },
                            { id: "study" as const, label: "Study Mode" },
                          ];
                          return modes.find(m => m.id === message.mode)?.label;
                        })()}</span>
                      </div>
                    </div>
                  )}

                  {/* File attachments for user messages */}
                  {m.role === "user" && message.files && message.files.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {message.files.map(file => (
                        <div
                          key={file.id}
                          className="inline-flex items-center max-w-full rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-xs hover:bg-muted/60 transition-colors cursor-pointer"
                          onClick={() => setPreviewFileId(file.id)}
                          title={file.name}
                        >
                          <svg viewBox="0 0 24 24" className="mr-1.5 h-3 w-3 opacity-70" aria-hidden>
                            <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z M14,9V3.5L19.5,9H14Z" />
                          </svg>
                          <span className="truncate max-w-[12rem]">{file.name}</span>
                          {typeof file.size === "number" && (
                            <span className="ml-1 tabular-nums text-muted-foreground">
                              ({prettyBytes(file.size)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Show "Generating image..." when image is being generated */}
                  {isGeneratingImage && i === messages.length - 1 && m.role === "assistant" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="italic">Generating image...</span>
                    </div>
                  )}

                  {(() => {
                    const isCurrentlyStreaming = isStreaming && i === messages.length - 1 && m.role === "assistant";
                    const content = isCurrentlyStreaming ? streamingContent : m.content as string;

                    // Always parse thinking content for consistent display
                    const { think, response } = isCurrentlyStreaming
                      ? (() => {
                          const { isThinking, thinkContent, responseContent } = parseStreamingContent(content);
                          return { think: isThinking ? thinkContent : '', response: responseContent };
                        })()
                      : parseAssistantContent(content, false);

                    return (
                      <>
                        {/* Show thinking collapsible when there's thinking content */}
                        {think && think.trim().length > 0 && (
                          <div className="mb-2">
                            <div
                              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              onClick={() => setThinkingState(`${i}`, !getThinkingState(`${i}`))}
                            >
                              <ChevronDown className={cn("h-3 w-3 transition-transform", getThinkingState(`${i}`) ? "rotate-180" : "")} />
                              <span>Thinking</span>
                              {isCurrentlyStreaming && <div className="animate-spin rounded-full h-3 w-3 border-b border-primary ml-1"></div>}
                            </div>
                            {getThinkingState(`${i}`) && (
                              <div className="mt-1 p-2 bg-muted/30 rounded text-xs text-muted-foreground whitespace-pre-wrap">
                                {think}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Show "Thinking..." animation only when streaming and no thinking content yet */}
                        {isCurrentlyStreaming && !think && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            <span className="italic">Thinking...</span>
                          </div>
                        )}

                        <MemoizedReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          className="text-sm">
                          {formatMessageWithImages(response)}
                        </MemoizedReactMarkdown>
                      </>
                    );
                  })()}
                  {m.role === "assistant" && !isStreaming && (
                    <div className="inline-flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          console.log('🎵 Speaker button clicked for messageId:', responseMessageId, 'currentlyPlaying:', currentlyPlayingMessageId, 'isPlaying:', isPlayingTTS, 'isPaused:', isAudioPaused);
                          
                          if (currentlyPlayingMessageId === responseMessageId && isPlayingTTS) {
                            // Currently playing this message - pause it
                            handleTextToSpeech(response, responseMessageId, 'pause');
                          } else if (currentlyPlayingMessageId === responseMessageId && isAudioPaused) {
                            // Currently paused this message - resume it
                            handleTextToSpeech(response, responseMessageId, 'resume');
                          } else {
                            // Not playing this message or playing different message - start playing this one
                            handleTextToSpeech(response, responseMessageId, 'play');
                          }
                        }}
                        disabled={false}
                        className={cn(
                          "h-6 w-6 p-0 ml-2 opacity-60 hover:opacity-100",
                          currentlyPlayingMessageId === responseMessageId && isPlayingTTS && !isAudioPaused && "opacity-100 text-blue-500"
                        )}
                        title={
                          currentlyPlayingMessageId === responseMessageId && isPlayingTTS && !isAudioPaused
                            ? "Pause audio"
                            : currentlyPlayingMessageId === responseMessageId && isAudioPaused
                            ? "Resume audio"
                            : preGeneratedAudio[responseMessageId]
                            ? "Listen to this message (pre-generated)"
                            : "Listen to this message"
                        }
                      >
                        {currentlyPlayingMessageId === responseMessageId && isPlayingTTS && !isAudioPaused ? (
                          <Pause className="h-3 w-3 text-blue-500 animate-pulse" />
                        ) : (
                          <Volume2 className={cn(
                            "h-3 w-3",
                            currentlyPlayingMessageId === responseMessageId && isAudioPaused && "text-blue-500"
                          )} />
                        )}
                      </Button>

                      {/* PDF export only when previous message (user) was deep-research */}
                      {(() => {
                        try {
                          const prev = messages[i - 1] as ExtendedMessage | undefined;
                          return prev && prev.role === 'user' && prev.mode === 'deep-research';
                        } catch (e) {
                          return false;
                        }
                      })() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportPdf(m.content as string, (messages[i - 1] as ExtendedMessage)?.content as string)}
                          className="h-6 w-6 p-0 ml-1 opacity-60 hover:opacity-100"
                          title="Export this deep research response as PDF"
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6v12H4V4a2 2 0 0 1 2-2h8z"/></svg>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(m.content as string)}
                        className="h-6 w-6 p-0 ml-2 opacity-60 hover:opacity-100"
                        title="Copy assistant text"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messageEndRef} />
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t flex items-start gap-2">
        <div className="flex-1">
          <ChatInput
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            model={currentModel}
            handleModelChange={handleModelChange}
            isLoading={isLoading}
            onOpenFilesDialog={onOpenFilesDialog}
          />
        </div>
        <div className="py-4 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 rounded-lg border bg-background hover:bg-muted shrink-0"
            disabled={isLoading}
            title="Web search"
            onClick={() => {
              // TODO: Implement web search functionality
              console.log("Web search clicked");
            }}
          >
            <Globe size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 rounded-lg border bg-background hover:bg-muted shrink-0"
            disabled={isLoading}
            title="Voice input"
            onClick={() => setShowVoiceModal(true)}
          >
            <Mic size={16} />
          </Button>
        </div>
      </div>
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      <VoiceModal open={showVoiceModal} onClose={() => setShowVoiceModal(false)} currentModel={currentModel} currentProvider={currentProvider || ""} currentConversationId={currentConversationId} currentMessages={messages} onConversationIdChange={setCurrentConversationId} onMessagesUpdate={setMessages} />
    </div>
  );
}

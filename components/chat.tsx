"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback } from "react";
import { type CoreMessage } from "ai";
import ChatInput from "./chat-input";
import { readStreamableValue } from "ai/rsc";
import { FaUser } from "react-icons/fa6";
import { FaBrain } from "react-icons/fa6";
import { continueConversation, handleTranscriptionAction, handleTextToSpeechAction } from "../app/actions";
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
import { useModel } from "./app-content";
import { Pin, MoreVertical, Volume2, Clock, Search, BookOpen, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import FilePreviewModal from "./file-preview-modal";
import prettyBytes from "pretty-bytes";
import jsPDF from "jspdf";
import { ProviderType } from "@/lib/model-types";

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
  const { currentModel, currentProvider, onModelChange } = useModel();
  const { data: conversations = [], isLoading: isLoadingConversations } = useConversations(currentUser?.id || '');
  const queryClient = useQueryClient();
  const router = useRouter();
  const createConversationMutation = useCreateConversation();
  const updateConversationMutation = useUpdateConversation();
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [knowledgeSources, setKnowledgeSources] = useState<Array<{title: string; date: string; content: string}>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [thinkingStates, setThinkingStates] = useState<Record<string, boolean>>({});
  const [knowledgeStates, setKnowledgeStates] = useState<Record<string, boolean>>({});

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
  const getThinkingState = useCallback((messageId: string) => thinkingStates[messageId] ?? false, [thinkingStates]);
  const setThinkingState = useCallback((messageId: string, expanded: boolean) => {
    setThinkingStates(prev => ({ ...prev, [messageId]: expanded }));
  }, []);

  const getKnowledgeState = useCallback((messageId: string) => knowledgeStates[messageId] ?? false, [knowledgeStates]);
  const setKnowledgeState = useCallback((messageId: string, expanded: boolean) => {
    setKnowledgeStates(prev => ({ ...prev, [messageId]: expanded }));
  }, []);

  // TTS functionality
  const handleTextToSpeech = useCallback(async (text: string, voice: string = 'Fritz-PlayAI') => {
    // Strict guard: prevent any multiple calls
    if (isPlayingTTS || currentAudioRef.current) {
      console.log('TTS already in progress, ignoring request');
      return;
    }

    console.log('Starting TTS for text length:', text.length);

    try {
      setIsPlayingTTS(true);

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

      if (!cleanText) {
        toast.error('No text to speak');
        setIsPlayingTTS(false);
        return;
      }

      if (cleanText.length > 10000) {
        toast.error('Text is too long for speech generation (max 10,000 characters)');
        setIsPlayingTTS(false);
        return;
      }

      console.log('Generating TTS for text:', cleanText.substring(0, 100) + '...');

      const result = await handleTextToSpeechAction(cleanText, voice, 'wav');

      // Convert base64 to blob and play
      try {
        console.log('Converting base64 to audio blob...');
        const audioData = Uint8Array.from(atob(result.audioData), c => c.charCodeAt(0));
        console.log('Audio data length:', audioData.length);

        const audioBlob = new Blob([audioData], { type: result.contentType });
        console.log('Audio blob size:', audioBlob.size, 'type:', audioBlob.type);

        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('Audio URL created:', audioUrl);

        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        // Add event listeners for debugging
        audio.addEventListener('loadstart', () => console.log('Audio load started'));
        audio.addEventListener('canplay', () => console.log('Audio can play'));
        audio.addEventListener('error', (e) => {
          console.error('Audio element error:', e);
          console.error('Audio error code:', audio.error?.code, 'message:', audio.error?.message);
          // Only show error if audio hasn't started playing yet
          if (!audio.currentTime || audio.currentTime === 0) {
            setIsPlayingTTS(false);
            currentAudioRef.current = null;
          }
        });

        // Try to play with user interaction handling
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('Audio started playing successfully');
          }).catch(error => {
            console.error('Error playing audio:', error);
            console.error('Error name:', error.name, 'Error message:', error.message);
            // Try to play on user interaction if autoplay failed
            if (error.name === 'NotAllowedError') {
              console.log('Autoplay blocked, waiting for user interaction');
              const handleUserInteraction = () => {
                if (currentAudioRef.current === audio) {
                  audio.play().then(() => {
                    console.log('Audio started after user interaction');
                  }).catch(e => {
                    console.error('Still failed to play audio after user interaction:', e);
                    // Only show error if it's not another NotAllowedError and audio hasn't played
                    if (e.name !== 'NotAllowedError' && (!audio.currentTime || audio.currentTime === 0)) {
                      toast.error('Failed to play audio after user interaction');
                    }
                    setIsPlayingTTS(false);
                    currentAudioRef.current = null;
                  });
                }
                document.removeEventListener('click', handleUserInteraction);
                document.removeEventListener('keydown', handleUserInteraction);
              };
              document.addEventListener('click', handleUserInteraction);
              document.addEventListener('keydown', handleUserInteraction);
            } else {
              // Only show error if audio hasn't started playing
              if (!audio.currentTime || audio.currentTime === 0) {
                toast.error('Failed to play audio');
              }
              setIsPlayingTTS(false);
              currentAudioRef.current = null;
            }
          });
        }

        // Clean up the URL after playing and reset playing state
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setIsPlayingTTS(false);
          currentAudioRef.current = null;
        };
      } catch (conversionError) {
        console.error('Error converting audio data:', conversionError);
        toast.error('Failed to process audio data');
        setIsPlayingTTS(false);
        currentAudioRef.current = null;
      }
    } catch (error) {
      console.error('Error generating TTS:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('API key not configured')) {
        toast.error('Text-to-speech requires Groq API key. Please configure GROQ_API_KEY in your environment.');
      } else {
        toast.error(`Failed to generate speech: ${errorMessage}`);
      }
      setIsPlayingTTS(false);
      currentAudioRef.current = null;
    }
  }, [isPlayingTTS, currentAudioRef]);

  // Copy functionality
  const handleCopy = useCallback(async (text?: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
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

  // Load conversations when user changes
  useEffect(() => {
    if (!currentUser) {
      setMessages([]);
    }
  }, [currentUser]);

  // Load conversation when currentConversationId changes
  useEffect(() => {
    console.log('currentConversationId changed:', currentConversationId);
    if (currentConversationId) {
      loadConversation(currentConversationId);
    } else {
      console.log('Clearing messages for new chat');
      setMessages([]);
    }
  }, [currentConversationId, loadConversation]);

  const createNewConversation = () => {
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
        let finalAssistantContent = "";

        // Convert File to base64
        const arrayBuffer = await audioFile!.arrayBuffer();
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Call transcription directly (not through continueConversation)
        const result = await handleTranscriptionAction(model, currentProvider || 'groq', base64Data, audioFile!.name, audioFile!.type);

        for await (const content of readStreamableValue(result)) {
          finalAssistantContent = content as string;
          setStreamingContent(finalAssistantContent);
        }

        setIsStreaming(false);
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
        toast.error((error as Error).message || "Failed to transcribe audio");
      }
      return;
    }

    const userMessage: ExtendedMessage = {
      content: input,
      role: "user" as const,
      mode,
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
      const result = await continueConversation(messagesToSend, model, currentProvider || 'ollama', { fileIds });

      setIsStreaming(true);
      let finalAssistantContent = "";

      for await (const content of readStreamableValue(result)) {
        finalAssistantContent = content as string;
        setStreamingContent(finalAssistantContent);
      }

      setIsStreaming(false);
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
      setIsPlayingTTS(false);
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
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t">
          <ChatInput
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            model={currentModel}
            handleModelChange={handleModelChange}
          />
        </div>
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
      )}

      <div className="flex-1 overflow-y-auto pb-4">
        {messages.map((m, i) => {
          const messageId = `${i}-${m.content?.toString().length || 0}`;
          const message = m as ExtendedMessage;
          return (
            <div key={messageId} className={cn("mb-4 p-2", m.role === "user" ? "flex justify-end" : "flex justify-start")}>
              <div className={cn("flex items-start max-w-[80%]", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "flex size-8 shrink-0 select-none items-center justify-center rounded-lg",
                    m.role === "user"
                      ? "border bg-background ml-2"
                      : "bg-nvidia border border-[#628f10] text-primary-foreground mr-2",
                  )}>
                  {m.role === "user" ? <FaUser /> : <FaBrain />}
                </div>
                <div className="space-y-2 overflow-hidden px-1">
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
                    const content = isStreaming && i === messages.length - 1 && m.role === "assistant"
                      ? streamingContent
                      : m.content as string;
                    const isCurrentlyStreaming = isStreaming && i === messages.length - 1 && m.role === "assistant";
                    const { think, response } = parseAssistantContent(content, isCurrentlyStreaming);
                    return (
                      <>
                        {think && !isCurrentlyStreaming && (
                          <Collapsible
                            open={getThinkingState(messageId)}
                            onOpenChange={(expanded) => setThinkingState(messageId, expanded)}
                            className="mb-2"
                          >
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                              <ChevronDown className={cn("h-3 w-3 transition-transform", getThinkingState(messageId) ? "rotate-180" : "")} />
                              <span>Thinking</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1 p-2 bg-muted/30 rounded text-xs text-muted-foreground whitespace-pre-wrap">
                              {think}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                        {m.role === "assistant" && !isCurrentlyStreaming && (
                          <Collapsible
                            open={getKnowledgeState(messageId)}
                            onOpenChange={(expanded) => setKnowledgeState(messageId, expanded)}
                            className="mb-2"
                          >
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                              <ChevronDown className={cn("h-3 w-3 transition-transform", getKnowledgeState(messageId) ? "rotate-180" : "")} />
                              <span>Knowledge{message.knowledgeSources?.sources?.length ? ` (${message.knowledgeSources.sources.length} sources)` : ""}</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                              {message.knowledgeSources?.sources?.length ? (
                                <div className="space-y-2">
                                  {message.knowledgeSources.sources.map((source, idx) => (
                                    <div key={idx} className="border-l-2 border-primary/30 pl-2">
                                      <div className="font-medium text-primary">{source.title}</div>
                                      <div className="text-xs text-muted-foreground mb-1">{source.date}</div>
                                      <div className="whitespace-pre-wrap">{source.content}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-muted-foreground italic">
                                  No relevant knowledge found from previous conversations.
                                </div>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* Show "Thinking..." during streaming */}
                        {isCurrentlyStreaming && (
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
                          if (!isPlayingTTS) {
                            handleTextToSpeech(m.content as string);
                          }
                        }}
                        disabled={isPlayingTTS}
                        className={cn(
                          "h-6 w-6 p-0 ml-2 opacity-60 hover:opacity-100",
                          isPlayingTTS && "opacity-30 cursor-not-allowed pointer-events-none select-none"
                        )}
                        title={isPlayingTTS ? "Audio is playing" : "Listen to this message"}
                      >
                        <Volume2 className={cn("h-3 w-3", isPlayingTTS && "text-blue-500 animate-pulse")} />
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
                          <svg viewBox="0 0 24 24" className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
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

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t">
        <ChatInput
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          model={currentModel}
          handleModelChange={handleModelChange}
        />
      </div>
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
    </div>
  );
}

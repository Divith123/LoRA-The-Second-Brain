import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

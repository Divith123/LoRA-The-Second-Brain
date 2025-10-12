"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { AlertCircle, CheckCircle, Download, ExternalLink } from "lucide-react";
import { useOllamaStatus } from "@/lib/model-hooks";
import { toast } from "sonner";

interface SystemCheckProps {
  onComplete?: () => void;
}

export function SystemCheck({ onComplete }: SystemCheckProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const { data: isOllamaRunning, isLoading } = useOllamaStatus();

  useEffect(() => {
    // Show system check on first load if Ollama is not running
    const hasSeenCheck = localStorage.getItem('lora_system_check_shown');
    if (!hasSeenCheck && !isLoading) {
      setIsVisible(true);
      localStorage.setItem('lora_system_check_shown', 'true');
    }
  }, [isLoading]);

  const handleInstallOllama = () => {
    window.open('https://ollama.com/download', '_blank');
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('curl -fsSL https://ollama.com/install.sh | sh');
    toast.success('Installation command copied to clipboard');
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setHasChecked(true);
    onComplete?.();
  };

  if (!isVisible || isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blur Background */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold mb-2">System Check</h2>
          <p className="text-sm text-muted-foreground">
            Let&apos;s make sure everything is set up for the best experience
          </p>
        </div>

        <div className="space-y-4">
          {/* IndexedDB Check */}
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-green-900 dark:text-green-100">Browser Storage</div>
              <div className="text-sm text-green-700 dark:text-green-300">Ready for local data storage</div>
            </div>
          </div>

          {/* Ollama Check */}
          <div className={`flex items-center gap-3 p-3 border rounded-lg ${
            isOllamaRunning
              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
              : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
          }`}>
            {isOllamaRunning ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className={`font-medium ${
                isOllamaRunning
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-yellow-900 dark:text-yellow-100'
              }`}>
                Ollama AI Service
              </div>
              <div className={`text-sm ${
                isOllamaRunning
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-yellow-700 dark:text-yellow-300'
              }`}>
                {isOllamaRunning ? 'Running and ready' : 'Not detected - required for AI models'}
              </div>
            </div>
          </div>

          {!isOllamaRunning && (
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">Install Ollama</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Ollama runs AI models locally on your machine for privacy and speed.
              </p>
              <div className="flex gap-2 mb-3">
                <Button size="sm" onClick={handleInstallOllama} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Download Ollama
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyCommand} className="flex-1">
                  Copy Command
                </Button>
              </div>
              <div className="text-xs font-mono bg-background p-2 rounded border">
                curl -fsSL https://ollama.com/install.sh | sh
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Run this command in your terminal, then restart this app.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleDismiss}>
            {isOllamaRunning ? 'Get Started' : 'Continue Anyway'}
          </Button>
        </div>
      </div>
    </div>
  );
}
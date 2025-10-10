"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Eye, EyeOff, Key, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { DatabaseService } from "@/lib/database";
import { useUser } from "./user-context";

interface ApiKeyConfigProps {
  onClose?: () => void;
}

export default function ApiKeyConfig({ onClose }: ApiKeyConfigProps) {
  const { currentUser } = useUser();
  const [apiKeys, setApiKeys] = useState({
    groqApiKey: '',
    elevenlabsApiKey: '',
    openaiApiKey: '',
    openrouterApiKey: '',
    geminiApiKey: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    groqApiKey: false,
    elevenlabsApiKey: false,
    openaiApiKey: false,
    openrouterApiKey: false,
    geminiApiKey: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing API keys on mount
  useEffect(() => {
    if (currentUser?.id) {
      loadApiKeys();
    }
  }, [currentUser?.id]);

  const loadApiKeys = async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    try {
      const userApiKeys = await DatabaseService.getUserApiKeys(currentUser.id);
      if (userApiKeys) {
        setApiKeys({
          groqApiKey: userApiKeys.groqApiKey || '',
          elevenlabsApiKey: userApiKeys.elevenlabsApiKey || '',
          openaiApiKey: userApiKeys.openaiApiKey || '',
          openrouterApiKey: userApiKeys.openrouterApiKey || '',
          geminiApiKey: userApiKeys.geminiApiKey || '',
        });
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.id) {
      toast.error('No user logged in');
      return;
    }

    setIsSaving(true);
    try {
      // Filter out empty strings and only save non-empty keys
      const keysToSave = Object.fromEntries(
        Object.entries(apiKeys).filter(([_, value]) => value.trim() !== '')
      );

      await DatabaseService.updateUserApiKeys(currentUser.id, keysToSave);

      // Update local state to reflect saved keys
      setApiKeys(prev => ({
        ...prev,
        ...keysToSave
      }));

      toast.success('API keys saved successfully');
      onClose?.();
    } catch (error) {
      console.error('Failed to save API keys:', error);
      toast.error('Failed to save API keys');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePasswordVisibility = (key: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const validateApiKey = (key: string, service: string): boolean => {
    if (!key.trim()) return true; // Empty is valid (optional)

    // Basic validation patterns for different services
    const patterns = {
      groq: /^gsk_[a-zA-Z0-9]{48,}$/,
      elevenlabs: /^[a-zA-Z0-9]{20,}$/,
      openai: /^sk-[a-zA-Z0-9]{48,}$/,
      openrouter: /^sk-or-v1-[a-zA-Z0-9]{64,}$/,
      gemini: /^[a-zA-Z0-9_-]{39}$/
    };

    const pattern = patterns[service as keyof typeof patterns];
    return pattern ? pattern.test(key) : true;
  };

  const getApiKeyStatus = (key: string, service: string) => {
    if (!key.trim()) return null;
    return validateApiKey(key, service) ? 'valid' : 'invalid';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading API keys...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          API Key Configuration
        </CardTitle>
        <CardDescription>
          Configure your personal API keys for different AI services. These keys are stored securely and used only for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Groq API Key */}
        <div className="space-y-2">
          <Label htmlFor="groq-api-key" className="flex items-center gap-2">
            Groq API Key
            {getApiKeyStatus(apiKeys.groqApiKey, 'groq') === 'valid' && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            )}
            {getApiKeyStatus(apiKeys.groqApiKey, 'groq') === 'invalid' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="groq-api-key"
              type={showPasswords.groqApiKey ? "text" : "password"}
              placeholder="gsk_..."
              value={apiKeys.groqApiKey}
              onChange={(e) => setApiKeys(prev => ({ ...prev, groqApiKey: e.target.value }))}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => togglePasswordVisibility('groqApiKey')}
            >
              {showPasswords.groqApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for Groq text-to-speech and other Groq services
          </p>
        </div>

        {/* ElevenLabs API Key */}
        <div className="space-y-2">
          <Label htmlFor="elevenlabs-api-key" className="flex items-center gap-2">
            ElevenLabs API Key
            {getApiKeyStatus(apiKeys.elevenlabsApiKey, 'elevenlabs') === 'valid' && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            )}
            {getApiKeyStatus(apiKeys.elevenlabsApiKey, 'elevenlabs') === 'invalid' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="elevenlabs-api-key"
              type={showPasswords.elevenlabsApiKey ? "text" : "password"}
              placeholder="Enter your ElevenLabs API key"
              value={apiKeys.elevenlabsApiKey}
              onChange={(e) => setApiKeys(prev => ({ ...prev, elevenlabsApiKey: e.target.value }))}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => togglePasswordVisibility('elevenlabsApiKey')}
            >
              {showPasswords.elevenlabsApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for high-quality text-to-speech synthesis
          </p>
        </div>

        {/* OpenAI API Key */}
        <div className="space-y-2">
          <Label htmlFor="openai-api-key" className="flex items-center gap-2">
            OpenAI API Key
            {getApiKeyStatus(apiKeys.openaiApiKey, 'openai') === 'valid' && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            )}
            {getApiKeyStatus(apiKeys.openaiApiKey, 'openai') === 'invalid' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="openai-api-key"
              type={showPasswords.openaiApiKey ? "text" : "password"}
              placeholder="sk-..."
              value={apiKeys.openaiApiKey}
              onChange={(e) => setApiKeys(prev => ({ ...prev, openaiApiKey: e.target.value }))}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => togglePasswordVisibility('openaiApiKey')}
            >
              {showPasswords.openaiApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for OpenAI models and services
          </p>
        </div>

        {/* OpenRouter API Key */}
        <div className="space-y-2">
          <Label htmlFor="openrouter-api-key" className="flex items-center gap-2">
            OpenRouter API Key
            {getApiKeyStatus(apiKeys.openrouterApiKey, 'openrouter') === 'valid' && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            )}
            {getApiKeyStatus(apiKeys.openrouterApiKey, 'openrouter') === 'invalid' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="openrouter-api-key"
              type={showPasswords.openrouterApiKey ? "text" : "password"}
              placeholder="sk-or-v1-..."
              value={apiKeys.openrouterApiKey}
              onChange={(e) => setApiKeys(prev => ({ ...prev, openrouterApiKey: e.target.value }))}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => togglePasswordVisibility('openrouterApiKey')}
            >
              {showPasswords.openrouterApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for accessing various AI models through OpenRouter
          </p>
        </div>

        {/* Gemini API Key */}
        <div className="space-y-2">
          <Label htmlFor="gemini-api-key" className="flex items-center gap-2">
            Google Gemini API Key
            {getApiKeyStatus(apiKeys.geminiApiKey, 'gemini') === 'valid' && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valid
              </Badge>
            )}
            {getApiKeyStatus(apiKeys.geminiApiKey, 'gemini') === 'invalid' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              id="gemini-api-key"
              type={showPasswords.geminiApiKey ? "text" : "password"}
              placeholder="Enter your Gemini API key"
              value={apiKeys.geminiApiKey}
              onChange={(e) => setApiKeys(prev => ({ ...prev, geminiApiKey: e.target.value }))}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => togglePasswordVisibility('geminiApiKey')}
            >
              {showPasswords.geminiApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for Google Gemini models
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              'Save API Keys'
            )}
          </Button>
          {onClose && (
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <p className="font-medium mb-1">Security Note:</p>
          <p>Your API keys are stored securely in your browser&apos;s local database and are only used for your account. They are never transmitted to external servers except when making API calls to the respective services.</p>
        </div>
      </CardContent>
    </Card>
  );
}
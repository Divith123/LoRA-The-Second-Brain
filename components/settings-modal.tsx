"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/components/user-context";
import {
  AlertCircle,
  Cpu,
  HardDrive,
  Zap,
  Settings,
  Save,
  RotateCcw,
  User,
  Sliders,
  BookOpen,
  Info,
  X,
  LogOut,
  Globe,
  Trash2,
  AlertTriangle,
  Mic
} from "lucide-react";
import { useExportConversationsForKnowledgeBase } from "@/lib/database-hooks";
import { memoryPresets, LoRAConfig, defaultConfig } from "@/lib/config";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type SettingsSection = 'preferences' | 'environment' | 'knowledge' | 'tts' | 'about';

const sections = [
  { id: 'preferences' as const, label: 'Preferences', icon: Sliders },
  { id: 'environment' as const, label: 'Environment', icon: Globe },
  { id: 'knowledge' as const, label: 'Knowledge', icon: BookOpen },
  { id: 'tts' as const, label: 'Text-to-Speech', icon: Mic },
  { id: 'about' as const, label: 'About', icon: Info },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [config, setConfig] = useState<LoRAConfig>(defaultConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('preferences');
  const exportConversationsMutation = useExportConversationsForKnowledgeBase();
  const { currentUser, users, logout, deleteCurrentUser } = useUser();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Load saved config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('lora_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...defaultConfig, ...parsed });
      } catch (error) {
        console.error('Error loading config:', error);
      }
    }
  }, []);

  // Track changes
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [config]);

  const updateConfig = (updates: Partial<LoRAConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const saveConfig = () => {
    localStorage.setItem('lora_config', JSON.stringify(config));
    setHasUnsavedChanges(false);
    toast.success('Settings saved successfully');
  };

  const resetToDefault = () => {
    setConfig(defaultConfig);
    toast.info('Reset to default settings');
  };

  const applyPreset = (presetKey: keyof typeof memoryPresets) => {
    const preset = memoryPresets[presetKey];
    setConfig(prev => ({ ...prev, ...preset }));
  };

  const getMemoryUsageColor = (memoryMB: number) => {
    if (memoryMB <= 2048) return "text-green-600 bg-green-50 dark:bg-green-950";
    if (memoryMB <= 4096) return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950";
    if (memoryMB <= 8192) return "text-orange-600 bg-orange-50 dark:bg-orange-950";
    return "text-red-600 bg-red-50 dark:bg-red-950";
  };

  const getPerformanceRating = (config: LoRAConfig) => {
    let score = 0;
    if (config.enableGPU) score += 30;
    if (config.threads > 4) score += 20;
    if (config.memoryLimit >= 8192) score += 25;
    if (config.contextWindow >= 4096) score += 15;
    if (config.quantization === 'Q8_0') score += 10;

    if (score >= 80) return { label: "High Performance", color: "bg-green-500" };
    if (score >= 60) return { label: "Balanced", color: "bg-yellow-500" };
    if (score >= 40) return { label: "Low Power", color: "bg-blue-500" };
    return { label: "Ultra Low Power", color: "bg-gray-500" };
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) return;

    setIsDeleting(true);
    try {
      const success = await deleteCurrentUser(deletePassword.trim());
      if (success) {
        toast.success("Account deleted successfully");
        setShowDeleteDialog(false);
        onClose();
        // The logout is handled by deleteCurrentUser
      } else {
        toast.error("Invalid password. Account deletion failed.");
      }
    } catch (error) {
      toast.error("Failed to delete account. Please try again.");
    }
    setIsDeleting(false);
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'preferences':
        return (
          <div className="space-y-6">
            {/* Quick Presets */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Quick Presets
                </CardTitle>
                <CardDescription>
                  Choose a preset optimized for your system&apos;s capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(memoryPresets).map(([key, preset]) => (
                    <Button
                      key={key}
                      variant="outline"
                      onClick={() => applyPreset(key as keyof typeof memoryPresets)}
                      className="flex flex-col items-start h-auto p-4 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 w-full mb-2">
                        <HardDrive className="w-4 h-4" />
                        <span className="font-medium capitalize">
                          {key.replace('-', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-left space-y-1 opacity-80">
                        <div>RAM: {preset.memoryLimit}MB</div>
                        <div>Context: {preset.contextWindow}t</div>
                        <div className={getMemoryUsageColor(preset.memoryLimit)}>
                          {preset.quantization}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Inference Backend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  Inference Backend
                </CardTitle>
                <CardDescription>
                  Choose how models will be executed on your system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="backend" className="text-base">Backend Type</Label>
                    <p className="text-sm text-muted-foreground">
                      CPU is more compatible, GPU offers better performance
                    </p>
                  </div>
                  <Select
                    value={config.inferenceBackend}
                    onValueChange={(value: LoRAConfig['inferenceBackend']) =>
                      updateConfig({ inferenceBackend: value })
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama-cpu">CPU Only (Ollama)</SelectItem>
                      <SelectItem value="ollama-gpu">GPU Accelerated (Ollama)</SelectItem>
                      <SelectItem value="webgpu" disabled>WebGPU (Browser) - Coming Soon</SelectItem>
                      <SelectItem value="wasm" disabled>WASM (Browser) - Coming Soon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="gpu-toggle" className="text-base">Enable GPU Acceleration</Label>
                    <p className="text-sm text-muted-foreground">
                      Uses GPU for faster inference (requires compatible hardware)
                    </p>
                  </div>
                  <Switch
                    id="gpu-toggle"
                    checked={config.enableGPU}
                    onCheckedChange={(checked: boolean) => updateConfig({ enableGPU: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="threads" className="text-base">CPU Threads</Label>
                    <p className="text-sm text-muted-foreground">
                      Number of CPU threads to use (-1 = auto-detect)
                    </p>
                  </div>
                  <Select
                    value={config.threads.toString()}
                    onValueChange={(value) => updateConfig({ threads: parseInt(value) })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">Auto</SelectItem>
                      <SelectItem value="1">1 Thread</SelectItem>
                      <SelectItem value="2">2 Threads</SelectItem>
                      <SelectItem value="4">4 Threads</SelectItem>
                      <SelectItem value="8">8 Threads</SelectItem>
                      <SelectItem value="16">16 Threads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Memory Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Memory Management
                </CardTitle>
                <CardDescription>
                  Control memory usage and context window size
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base">Memory Limit</Label>
                    <Badge className={getMemoryUsageColor(config.memoryLimit)}>
                      {config.memoryLimit} MB
                    </Badge>
                  </div>
                  <Slider
                    value={[config.memoryLimit]}
                    onValueChange={([value]: number[]) => updateConfig({ memoryLimit: value })}
                    max={32768}
                    min={1024}
                    step={512}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1GB</span>
                    <span>32GB</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base">Context Window</Label>
                    <Badge variant="outline">
                      {config.contextWindow} tokens
                    </Badge>
                  </div>
                  <Slider
                    value={[config.contextWindow]}
                    onValueChange={([value]: number[]) => updateConfig({ contextWindow: value })}
                    max={32768}
                    min={512}
                    step={512}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>512</span>
                    <span>32K</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="quantization" className="text-base">Model Quantization</Label>
                    <p className="text-sm text-muted-foreground">
                      Lower quantization uses less memory but may reduce quality
                    </p>
                  </div>
                  <Select
                    value={config.quantization}
                    onValueChange={(value: LoRAConfig['quantization']) =>
                      updateConfig({ quantization: value })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q4_K_M">Q4_K_M (Best balance)</SelectItem>
                      <SelectItem value="Q5_K_M">Q5_K_M (Higher quality)</SelectItem>
                      <SelectItem value="Q8_0">Q8_0 (High quality)</SelectItem>
                      <SelectItem value="FP16">FP16 (Maximum quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-6 border-t">
              <Button variant="outline" onClick={resetToDefault}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>

              <Button onClick={saveConfig} disabled={!hasUnsavedChanges}>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </div>
        );

      case 'environment':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Environment Configuration
                </CardTitle>
                <CardDescription>
                  Configure external services and environment variables
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ollama-host" className="text-base">Ollama Host</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      The URL where Ollama is running. Default is http://localhost:11434
                    </p>
                    <input
                      id="ollama-host"
                      type="text"
                      placeholder="http://localhost:11434"
                      defaultValue={typeof window !== 'undefined' ? (localStorage.getItem('ollama_host') || process.env.OLLAMA_HOST || 'http://localhost:11434') : (process.env.OLLAMA_HOST || 'http://localhost:11434')}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      onChange={(e) => {
                        // Store in localStorage for client-side use
                        localStorage.setItem('ollama_host', e.target.value);
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This setting is stored locally and used for API calls. Restart may be required for changes to take effect.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-medium">Ollama Setup Instructions</h4>
                    <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                      <div className="font-medium">1. Install Ollama:</div>
                      <div className="font-mono text-xs bg-background p-2 rounded">
                        # Download from: https://ollama.com/download
                      </div>

                      <div className="font-medium">2. Start Ollama service:</div>
                      <div className="font-mono text-xs bg-background p-2 rounded">
                        ollama serve
                      </div>

                      <div className="font-medium">3. Pull a model (optional):</div>
                      <div className="font-mono text-xs bg-background p-2 rounded">
                        ollama pull llama2
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <div className="font-medium text-blue-900 dark:text-blue-100">Custom Host Configuration</div>
                        <div className="text-blue-700 dark:text-blue-300 mt-1">
                          If you&apos;re running Ollama on a different machine or port, update the host URL above.
                          The format should be: http://hostname:port
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'knowledge':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Knowledge Base Management
                </CardTitle>
                <CardDescription>
                  Export your conversations for use as knowledge base training data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">Export Conversations</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Export all your conversations in JSON format. This data can be used to train or fine-tune your LoRA models to better understand your communication patterns and preferences.
                    </p>
                    <Button
                      onClick={() => {
                        if (currentUser?.id) {
                          exportConversationsMutation.mutate({ userId: currentUser.id, password: currentUser.password });
                        }
                      }}
                      disabled={exportConversationsMutation.isPending}
                      className="w-full"
                    >
                      {exportConversationsMutation.isPending ? 'Exporting...' : 'Export Knowledge Base'}
                    </Button>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">What gets exported?</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• All conversation messages and metadata</li>
                      <li>• Model information used for each conversation</li>
                      <li>• Timestamps and conversation structure</li>
                      <li>• Pinned status and user information</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-medium mb-2">How to use the exported data?</h3>
                    <p className="text-sm text-muted-foreground">
                      The exported JSON file contains structured conversation data that can be used for:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                      <li>• Fine-tuning language models on your communication style</li>
                      <li>• Creating personalized AI assistants</li>
                      <li>• Building knowledge graphs from your conversations</li>
                      <li>• Training custom LoRA adapters</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'tts':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  Text-to-Speech Settings
                </CardTitle>
                <CardDescription>
                  Configure ElevenLabs voice settings for natural speech synthesis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="elevenlabs-api-key" className="text-base">ElevenLabs API Key</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Your ElevenLabs API key for text-to-speech. Get one from <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="underline">elevenlabs.io</a>
                    </p>
                    <input
                      id="elevenlabs-api-key"
                      type="password"
                      placeholder="sk_..."
                      defaultValue={typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_api_key') || process.env.ELEVENLABS_API_KEY || '' : process.env.ELEVENLABS_API_KEY || ''}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      onChange={(e) => {
                        // Store in localStorage for client-side use
                        if (e.target.value.trim()) {
                          localStorage.setItem('elevenlabs_api_key', e.target.value.trim());
                        } else {
                          localStorage.removeItem('elevenlabs_api_key');
                        }
                      }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="elevenlabs-voice-id" className="text-base">Voice ID</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      The ElevenLabs voice ID to use for speech synthesis. Default: JkpEM0J2p7DL32VXnieS
                    </p>
                    <input
                      id="elevenlabs-voice-id"
                      type="text"
                      placeholder="JkpEM0J2p7DL32VXnieS"
                      defaultValue={typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_voice_id') || process.env.ELEVENLABS_VOICE_ID || 'JkpEM0J2p7DL32VXnieS' : process.env.ELEVENLABS_VOICE_ID || 'JkpEM0J2p7DL32VXnieS'}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      onChange={(e) => {
                        // Store in localStorage for client-side use
                        if (e.target.value.trim()) {
                          localStorage.setItem('elevenlabs_voice_id', e.target.value.trim());
                        } else {
                          localStorage.removeItem('elevenlabs_voice_id');
                        }
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium">Voice Settings</h4>
                    <p className="text-sm text-muted-foreground">
                      These settings control the voice characteristics. Changes take effect immediately.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm">Stability</Label>
                        <p className="text-xs text-muted-foreground mb-1">How stable the voice is (0.0 - 1.0)</p>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          defaultValue="0.5"
                          className="w-full"
                          onChange={(e) => {
                            localStorage.setItem('elevenlabs_stability', e.target.value);
                          }}
                        />
                        <div className="text-xs text-center mt-1">
                          {typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_stability') || '0.5' : '0.5'}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm">Similarity Boost</Label>
                        <p className="text-xs text-muted-foreground mb-1">How similar to the original voice (0.0 - 1.0)</p>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          defaultValue="0.75"
                          className="w-full"
                          onChange={(e) => {
                            localStorage.setItem('elevenlabs_similarity_boost', e.target.value);
                          }}
                        />
                        <div className="text-xs text-center mt-1">
                          {typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_similarity_boost') || '0.75' : '0.75'}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm">Style</Label>
                        <p className="text-xs text-muted-foreground mb-1">How expressive the voice is (0.0 - 1.0)</p>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          defaultValue="0.0"
                          className="w-full"
                          onChange={(e) => {
                            localStorage.setItem('elevenlabs_style', e.target.value);
                          }}
                        />
                        <div className="text-xs text-center mt-1">
                          {typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_style') || '0.0' : '0.0'}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm">Speed</Label>
                        <p className="text-xs text-muted-foreground mb-1">Speech speed multiplier (0.5 - 2.0)</p>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          defaultValue="1.0"
                          className="w-full"
                          onChange={(e) => {
                            localStorage.setItem('elevenlabs_speed', e.target.value);
                          }}
                        />
                        <div className="text-xs text-center mt-1">
                          {typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_speed') || '1.0' : '1.0'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="elevenlabs-speaker-boost"
                        defaultChecked={true}
                        className="rounded"
                        onChange={(e) => {
                          localStorage.setItem('elevenlabs_use_speaker_boost', e.target.checked.toString());
                        }}
                      />
                      <Label htmlFor="elevenlabs-speaker-boost" className="text-sm">
                        Use Speaker Boost
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Emotion Tags</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Add emotion tags to your text for different voice styles. Example: [excited] Hello world!
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><code className="bg-muted px-2 py-1 rounded">[whispering]</code> - Whispering voice</div>
                      <div><code className="bg-muted px-2 py-1 rounded">[angry]</code> - Angry voice</div>
                      <div><code className="bg-muted px-2 py-1 rounded">[shouting]</code> - Shouting voice</div>
                      <div><code className="bg-muted px-2 py-1 rounded">[sad]</code> - Sad voice</div>
                      <div><code className="bg-muted px-2 py-1 rounded">[laughing]</code> - Laughing voice</div>
                      <div><code className="bg-muted px-2 py-1 rounded">[excited]</code> - Excited voice</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  About LoRA
                </CardTitle>
                <CardDescription>
                  Learn more about LoRA: The Second Brain
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">LoRA: The Second Brain</h2>
                  <p className="text-muted-foreground">Version 0.1.0</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">What is LoRA?</h3>
                    <p className="text-sm text-muted-foreground">
                      LoRA (your project) is an offline personal AI hub. Think of it as your own private assistant + second brain that lives entirely on your device.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2">Core Features</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• <strong>Offline AI:</strong> Powered by engines like llama.cpp, Ollama, or vLLM</li>
                      <li>• <strong>Open Model Freedom:</strong> Use LoRA adapters to fine-tune models</li>
                      <li>• <strong>Second Brain:</strong> Remembers and connects your thoughts like Obsidian + memory + AI</li>
                      <li>• <strong>Privacy & Control:</strong> Everything happens locally, no external servers</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2">System Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium">Backend</div>
                        <div className="text-muted-foreground">{config.inferenceBackend}</div>
                      </div>
                      <div>
                        <div className="font-medium">GPU</div>
                        <div className="text-muted-foreground">{config.enableGPU ? 'Enabled' : 'Disabled'}</div>
                      </div>
                      <div>
                        <div className="font-medium">Threads</div>
                        <div className="text-muted-foreground">{config.threads === -1 ? 'Auto' : config.threads}</div>
                      </div>
                      <div>
                        <div className="font-medium">Performance</div>
                        <div className="text-muted-foreground">{config.quantization}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Blur Layer */}
      <div
        className="absolute inset-0 backdrop-blur-sm pointer-events-none"
        onClick={onClose}
        style={{ 
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)'
        }}
      />

      {/* Settings Modal (above everything) */}
      <div className="relative z-20 flex items-center justify-center h-full" onClick={onClose}>
        <div className="w-full max-w-6xl h-[90vh] bg-background border rounded-lg shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 border-r bg-muted/30">
            <div className="p-6 border-b">
              <div className="flex items-center gap-2">
                <Settings className="w-6 h-6" />
                <h2 className="text-lg font-semibold">Settings</h2>
              </div>
            </div>

            <nav className="p-4 space-y-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      activeSection === section.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h1 className="text-2xl font-bold">
                  {sections.find(s => s.id === activeSection)?.label}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {activeSection === 'preferences' && 'Customize your LoRA experience'}
                  {activeSection === 'environment' && 'Configure external services and connections'}
                  {activeSection === 'knowledge' && 'Manage your knowledge base'}
                  {activeSection === 'tts' && 'Configure text-to-speech settings'}
                  {activeSection === 'about' && 'Learn more about LoRA'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeSection === 'preferences' && hasUnsavedChanges && (
                  <Badge variant="secondary" className="animate-pulse">
                    Unsaved Changes
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              {renderSectionContent()}
            </ScrollArea>
          </div>
        </div>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>This action cannot be undone. This will permanently delete:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All your conversations and messages</li>
                <li>All uploaded files and documents</li>
                <li>All projects and project data</li>
                <li>Your account and all associated data</li>
              </ul>
              <p className="font-medium text-destructive">
                You will be immediately logged out and cannot recover this data.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password" className="text-sm font-medium">
                Confirm your password to delete your account
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletePassword("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={!deletePassword.trim() || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
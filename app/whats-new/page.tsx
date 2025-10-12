"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, CheckCircle2, Sparkles, Bug, Zap, Settings as SettingsIcon, Home } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface ChangelogEntry {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  changes: {
    category: "feature" | "improvement" | "bugfix" | "settings";
    items: string[];
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: "1.3.0",
    date: "October 11, 2025",
    type: "minor",
    changes: [
      {
        category: "feature",
        items: [
          "Added Help & Support menu option with direct link to documentation",
          "Introduced What's New page with complete changelog",
          "Implemented usage statistics tracking (conversations, documents, models)",
          "Added Profile page with account overview and statistics"
        ]
      },
      {
        category: "improvement",
        items: [
          "Reduced spacing between sidebar sections for better UX",
          "Enhanced settings modal with proper blur effect",
          "Improved scroll functionality in settings preferences section",
          "Optimized navigation menu structure"
        ]
      },
      {
        category: "settings",
        items: [
          "Removed redundant Account and Notifications options",
          "Streamlined user menu for better accessibility",
          "Added direct links to GitHub Wiki and Releases"
        ]
      }
    ]
  },
  {
    version: "1.2.0",
    date: "October 10, 2025",
    type: "minor",
    changes: [
      {
        category: "feature",
        items: [
          "Implemented smart scroll system in chat interface",
          "Added auto-scroll detection based on user position",
          "Introduced conversation restore functionality"
        ]
      },
      {
        category: "improvement",
        items: [
          "Enhanced chat input with better error handling",
          "Improved message rendering performance",
          "Optimized database queries for faster load times"
        ]
      },
      {
        category: "bugfix",
        items: [
          "Fixed scroll issues in long conversations",
          "Resolved file corruption in chat.tsx",
          "Fixed localhost connectivity problems"
        ]
      }
    ]
  },
  {
    version: "1.1.0",
    date: "October 9, 2025",
    type: "minor",
    changes: [
      {
        category: "feature",
        items: [
          "Added settings modal with blur background effect",
          "Implemented theme customization options",
          "Added model selector with better UI"
        ]
      },
      {
        category: "improvement",
        items: [
          "Enhanced blur effects across all modals",
          "Improved settings layout and organization",
          "Better mobile responsiveness"
        ]
      }
    ]
  },
  {
    version: "1.0.0",
    date: "October 1, 2025",
    type: "major",
    changes: [
      {
        category: "feature",
        items: [
          "Initial release of LoRA - The Second Brain",
          "AI-powered conversation system",
          "Multiple model support (Ollama, OpenAI, Gemini, Groq)",
          "File upload and processing capabilities",
          "Project organization features",
          "User authentication and multi-user support",
          "Conversation history and pinning",
          "Dark/Light theme support"
        ]
      }
    ]
  }
];

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "feature":
      return <Sparkles className="h-4 w-4" />;
    case "improvement":
      return <Zap className="h-4 w-4" />;
    case "bugfix":
      return <Bug className="h-4 w-4" />;
    case "settings":
      return <SettingsIcon className="h-4 w-4" />;
    default:
      return <CheckCircle2 className="h-4 w-4" />;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "feature":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "improvement":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "bugfix":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "settings":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  }
};

const getVersionColor = (type: string) => {
  switch (type) {
    case "major":
      return "bg-gradient-to-r from-red-500 to-pink-500";
    case "minor":
      return "bg-gradient-to-r from-blue-500 to-cyan-500";
    case "patch":
      return "bg-gradient-to-r from-green-500 to-emerald-500";
    default:
      return "bg-gradient-to-r from-gray-500 to-slate-500";
  }
};

export default function WhatsNewPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      {/* Back to Home Button - positioned absolutely in top-left corner */}
      <div className="fixed top-6 left-9 z-50">
        <Button
          onClick={() => router.push('/')}
          variant="outline"
          className="flex items-center gap-2 bg-popover/95 backdrop-blur-sm border-border/50 rounded-2xl shadow-xl"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Button>
      </div>

      {/* Content */}
      <div className="container max-w-4xl py-8 px-4 pt-20">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">What&apos;s New</h1>
        </div>
        
        <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Latest Updates & Features</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Stay up to date with the latest improvements, features, and bug fixes in LoRA
          </p>
        </div>

        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-6 pr-4">
            {changelog.map((entry, index) => (
              <div key={entry.version} className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`${getVersionColor(entry.type)} text-white border-0 font-semibold`}
                      >
                        v{entry.version}
                      </Badge>
                      {index === 0 && (
                        <Badge variant="outline" className="animate-pulse border-primary text-primary">
                          Latest
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{entry.date}</span>
                  </div>
                </div>
                <div className="px-6 pb-6 space-y-4">
                  {entry.changes.map((change, changeIndex) => (
                    <div key={changeIndex}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge
                          variant="outline"
                          className={`${getCategoryColor(change.category)} font-medium`}
                        >
                          {getCategoryIcon(change.category)}
                          <span className="ml-1 capitalize">{change.category === "bugfix" ? "Bug Fixes" : change.category}s</span>
                        </Badge>
                      </div>
                      <ul className="space-y-2 ml-2">
                        {change.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                            <span className="text-muted-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                      {changeIndex < entry.changes.length - 1 && (
                        <Separator className="mt-4" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl p-6 mt-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Want to suggest a feature or report a bug?
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://github.com/Divith123/LoRA-The-Second-Brain/issues', '_blank')}
              >
                Report an Issue
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://github.com/Divith123/LoRA-The-Second-Brain', '_blank')}
              >
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

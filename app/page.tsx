"use client";

import Chat from "@/components/chat";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { useConversation } from "@/components/conversation-context";

function HomeContent() {
  const searchParams = useSearchParams();
  const { setCurrentConversationId } = useConversation();

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      setCurrentConversationId(conversationId);
    } else {
      setCurrentConversationId(null);
    }
  }, [searchParams, setCurrentConversationId]);

  return (
    <main className="flex flex-col items-center justify-between">
      <Chat />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="flex flex-col items-center justify-between">
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}

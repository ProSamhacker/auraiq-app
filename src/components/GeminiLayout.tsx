// src/components/GeminiLayout.tsx

"use client";

import { useState, FC, FormEvent, useEffect, useRef } from 'react';
import { User, Auth, signOut } from 'firebase/auth';
import { Firestore, collection, addDoc, doc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { Message } from '../lib/types';
import { addMessage, deleteAllMessages } from '../lib/messageStorage';
import { useChats } from '../hooks/useChats';
import { useContextFiles } from '../hooks/useContextFiles';
import { useMessages } from '../hooks/useMessages';
import GeminiDesktopSidebar from './GeminiDesktopSidebar';
import GeminiSidebar from './GeminiSidebar';
import ChatInput from './ChatInput';
import ContextPanel from './ContextPanel';
import ChatBubble from './ChatBubble';
import { BrainCircuit, Loader2 } from 'lucide-react';
import { MenuIcon, UserIcon, LogoutIcon, BotIcon } from './Icons';

// --- COMPONENTS ---

// 1. Polished Typing Indicator (Matches ChatBubble style)
export const TypingIndicator = () => (
  <div className="flex items-start gap-3 my-4 fade-in">
    {/* Bot Avatar */}
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
      <BotIcon className="w-5 h-5 text-white" />
    </div>
    
    {/* Animated Dots Bubble */}
    <div className="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 backdrop-blur-sm rounded-2xl rounded-tl-none px-5 py-4 shadow-sm">
      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDuration: '1s', animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDuration: '1s', animationDelay: '0.2s' }} />
      <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDuration: '1s', animationDelay: '0.4s' }} />
    </div>
  </div>
);

export const useSmoothScroll = () => {
  const scrollToBottom = (smooth = true) => {
    const container = document.getElementById('chat-container');
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };
  return { scrollToBottom };
};

export const useMobileKeyboard = () => {
  useEffect(() => {
    const handleResize = () => {
      const viewport = window.visualViewport;
      if (viewport) {
        const isKeyboardOpen = viewport.height < window.innerHeight * 0.75;
        if (isKeyboardOpen) {
          document.documentElement.style.setProperty('--keyboard-height', 
            `${window.innerHeight - viewport.height}px`);
        } else {
          document.documentElement.style.setProperty('--keyboard-height', '0px');
        }
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleResize);
      };
    }
  }, []);
};

const SUGGESTED_PROMPTS = [
  { icon: '💡', title: 'Explain a concept', description: 'Get clear explanations of complex topics' },
  { icon: '💻', title: 'Write code', description: 'Generate code with detailed comments' },
  { icon: '📊', title: 'Analyze data', description: 'Get insights from your data files' },
  { icon: '✍️', title: 'Create content', description: 'Write articles, emails, and more' }
];

export const EmptyState: FC<{ userName: string | null; handlePromptClick: (prompt: { title: string }) => void; }> = ({ userName, handlePromptClick }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
    <div className="w-20 h-20 mb-6 rounded-full bg-gray-700 flex items-center justify-center">
      <BotIcon className="w-10 h-10 text-blue-400" />
    </div>
    <h1 className="text-3xl md:text-4xl font-bold text-blue-400 mb-3">
      Hello, {userName || 'User'}
    </h1>
    <p className="text-gray-400 text-base md:text-lg mb-8 max-w-md">
      I'm AuraIQ, your intelligent AI assistant. How can I help you today?
    </p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
      {SUGGESTED_PROMPTS.map((prompt, i) => (
        <button
          key={i}
          onClick={() => handlePromptClick(prompt)}
          className="p-4 text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-all hover:border-blue-500/50 group"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">{prompt.icon}</span>
            <div>
              <h3 className="font-medium text-white mb-1 group-hover:text-blue-400 transition-colors">
                {prompt.title}
              </h3>
              <p className="text-sm text-gray-400">{prompt.description}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// --- MAIN COMPONENT ---

interface GeminiLayoutProps {
  user: User;
  auth: Auth;
  db: Firestore;
}

const GeminiLayout: FC<GeminiLayoutProps> = ({ user, auth, db }) => {
  const { chats, currentChatId, setCurrentChatId, createNewChat } = useChats(user?.uid, db);
  const { contextFiles } = useContextFiles(user?.uid, db);
  const { messages, setMessages } = useMessages(user?.uid, currentChatId, db);

  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isContextActive, setIsContextActive] = useState(false);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState({ remaining: 20, limit: 20 });

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const finalStreamingMessage = useRef<Message | null>(null);

  const { scrollToBottom } = useSmoothScroll();
  useMobileKeyboard();

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  useEffect(() => {
    if (streamingMessage) {
      finalStreamingMessage.current = streamingMessage;
    }
  }, [streamingMessage]);

  useEffect(() => {
    const saveFinalMessage = async () => {
      if (!isLoading && finalStreamingMessage.current && currentChatId) {
        const finalMessage = finalStreamingMessage.current;
        if (finalMessage.text.trim()) {
          try {
            await addMessage(db, user.uid, currentChatId, finalMessage);
          } catch (error) {
            console.error('Error saving final message:', error);
          }
        }
        setStreamingMessage(null);
        finalStreamingMessage.current = null;
      }
    };
    saveFinalMessage();
  }, [isLoading, currentChatId, user.uid, db]);

  const handleNewChat = () => {
    createNewChat();
    setIsSlideoutOpen(false);
  };

  const handleSelectChat = (id: string) => {
    setCurrentChatId(id);
    setIsSlideoutOpen(false);
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!chatId) return;
    try {
      const messagesRef = collection(db, 'users', user.uid, 'chats', chatId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      const urlsToDelete: string[] = [];
      const urlRegex = /https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\/[^\s\])]+/g;

      messagesSnapshot.docs.forEach(doc => {
        const message = doc.data();
        const matches = message.text?.match(urlRegex);
        if (matches) urlsToDelete.push(...matches);
      });

      if (urlsToDelete.length > 0) {
        const token = await user.getIdToken();
        await fetch('/api/delete-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ urls: urlsToDelete }),
        });
      }

      await deleteAllMessages(db, user.uid, chatId);
      await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId));

      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const handleRenameChat = async (chatId: string, newTitle: string) => {
    if (!chatId || !newTitle.trim()) return;
    const chatRef = doc(db, 'users', user.uid, 'chats', chatId);
    await updateDoc(chatRef, { title: newTitle.trim() });
  };
  
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/context/upload', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'File upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert((error as Error).message);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/context/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'File deletion failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert((error as Error).message);
    }
  };
  
  const handlePromptClick = (prompt: { title: string }) => {
    setInput(prompt.title);
    const textarea = document.querySelector('textarea');
    if (textarea) textarea.focus();
  };

  const handleSendMessage = async (e: FormEvent, taskType: 'auto' | 'daily' | 'coding') => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessageText = attachments.length > 0
      ? `${input}\n[ATTACHMENTS:${attachments.map(f => f.name).join('|||')}]`
      : input;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: userMessageText,
      sender: "user"
    };

    const tempInput = input;
    const tempAttachments = attachments;

    // 1. Update UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    // 2. Set thinking state immediately (id uses future time to avoid collision)
    const aiMessageId = (Date.now() + 1000).toString();
    setStreamingMessage({ id: aiMessageId, text: "", sender: "ai" });

    let tempChatId = currentChatId;

    try {
      if (!tempChatId) {
        const newChatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
          title: tempInput.substring(0, 30) + (tempInput.length > 30 ? "..." : ""),
          timestamp: Date.now(),
          lastMessageAt: Date.now(),
          messageCount: 0,
        });
        tempChatId = newChatRef.id;
        setCurrentChatId(newChatRef.id);
      }

      await addMessage(db, user.uid, tempChatId, userMessage);

      const formData = new FormData();
      formData.append("input", tempInput);
      formData.append("taskType", taskType);
      formData.append("context", isContextActive ? context : "");
      formData.append("history", JSON.stringify(messages));

      if (isContextActive && contextFiles.length > 0) {
        const contextFileUrls = contextFiles.map(f => f.url);
        formData.append("contextFileUrls", JSON.stringify(contextFileUrls));
      }

      tempAttachments.forEach(file => {
        formData.append("files", file);
      });

      const token = await user.getIdToken();

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: abortController.signal,
      });

      const remaining = response.headers.get('X-RateLimit-Remaining');
      const limit = response.headers.get('X-RateLimit-Limit');
      if (remaining && limit) {
        setRateLimitInfo({ remaining: parseInt(remaining), limit: parseInt(limit) });
      }

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a minute before trying again.");
        }
        throw new Error(errorData.error || "API error");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data.trim() === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                // Update stream with accumulated text
                setStreamingMessage({ id: aiMessageId, text: fullText, sender: "ai" });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

    } catch (error) {
      const err = error as Error;

      if (err.name === "AbortError") {
        console.log("Fetch aborted by user.");
      } else {
        console.error("API call failed:", err);
        const errorMessageText = err.message || "An unknown error occurred";
        setStreamingMessage({
          id: (Date.now() + 2).toString(),
          text: `Error: ${errorMessageText}`,
          sender: "ai"
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="chat-container flex h-screen w-full bg-[#131314] text-white overflow-hidden">
      <GeminiDesktopSidebar
        onNewChat={handleNewChat}
        toggleMobileSidebar={() => setIsSlideoutOpen(true)}
        auth={auth}
      />

      <GeminiSidebar
        isOpen={isSlideoutOpen}
        onClose={() => setIsSlideoutOpen(false)}
        onNewChat={handleNewChat}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="flex md:hidden items-center justify-between px-4 py-3 flex-shrink-0 bg-[#131314] border-b border-gray-800 z-10">
          <button
            onClick={() => setIsSlideoutOpen(true)}
            className="p-2 rounded-full hover:bg-gray-800 active:bg-gray-700 transition-colors"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg">AuraIQ</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsContextPanelOpen(true)}
              className="p-2 rounded-full hover:bg-gray-800 active:bg-gray-700 transition-colors"
            >
              <BrainCircuit className="w-6 h-6 text-gray-400" />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center active:bg-gray-600 transition-colors"
              >
                <UserIcon className="w-5 h-5" />
              </button>
              {isProfileMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-[#1e1f20] rounded-lg shadow-xl z-20 overflow-hidden">
                    <button
                      onClick={() => {
                        signOut(auth);
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 active:bg-gray-600 transition-colors"
                    >
                      <LogoutIcon className="w-5 h-5" />
                      <span>Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {rateLimitInfo.remaining < 5 && (
          <div className="flex-shrink-0 bg-yellow-900/50 text-yellow-200 px-4 py-2 text-sm text-center">
            ⚠️ {rateLimitInfo.remaining} requests remaining this minute
          </div>
        )}

        <div 
          ref={scrollContainerRef}
          id="chat-container"
          className="chat-messages flex-1 overflow-y-auto overscroll-contain"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
            {(!currentChatId && messages.length === 0 && !streamingMessage && !isLoading) ? (
              <EmptyState userName={user.email} handlePromptClick={handlePromptClick} />
            ) : (
              <>
                {messages.map(msg => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}

                {/* VISUAL LOGIC:
                    1. streamingMessage exists AND has text -> Show ChatBubble (streaming content)
                    2. streamingMessage exists AND no text -> Show TypingIndicator (thinking phase)
                */}
                {streamingMessage && (
                  streamingMessage.text ? (
                    <ChatBubble message={streamingMessage} />
                  ) : (
                    <TypingIndicator />
                  )
                )}
                
                <div className="h-4 md:h-8" />
              </>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-800 bg-[#131314]">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              input={input}
              setInput={setInput}
              isLoading={isLoading}
              handleSendMessage={handleSendMessage}
              handleStopGenerating={handleStopGenerating}
              toggleContextActive={() => setIsContextActive(!isContextActive)}
              isContextActive={isContextActive}
              attachments={attachments}
              setAttachments={setAttachments}
            />
          </div>
        </div>
      </main>

      <ContextPanel
        context={context}
        setContext={setContext}
        isOpen={isContextPanelOpen}
        onClose={() => setIsContextPanelOpen(false)}
        contextFiles={contextFiles}
        onFileUpload={handleFileUpload}
        onFileDelete={handleFileDelete}
      />
    </div>
  );
};

export default GeminiLayout;
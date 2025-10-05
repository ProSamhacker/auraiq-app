// src/components/GeminiLayout.tsx

"use client";

import { useState, FC, FormEvent, useEffect, useRef } from 'react';
import { User, Auth } from 'firebase/auth';
import { Firestore, collection, query, orderBy, onSnapshot, doc, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Chat, Message } from '../lib/types';

// Import the new Desktop Sidebar
import GeminiDesktopSidebar from './GeminiDesktopSidebar'; 
import GeminiSidebar from './GeminiSidebar';
import ChatInput from './ChatInput';
import ContextPanel from './ContextPanel';
import ChatBubble from './ChatBubble';
import { MenuIcon, UserIcon } from './Icons';

interface GeminiLayoutProps {
  user: User;
  auth: Auth;
  db: Firestore;
}

const WelcomeScreen: FC<{ userName: string | null }> = ({ userName }) => (
    // ... WelcomeScreen component remains the same
    <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-blue-400 mb-4">
            Hello, {userName || 'User'}
        </h1>
        <p className="text-gray-400 text-lg mb-8">How can I help you today?</p>
        <div className="flex flex-wrap justify-center gap-4">
            {['Create Image', 'Write', 'Build', 'Deep Research', 'Create Video'].map(item => (
                <button key={item} className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2 px-5 rounded-full transition-colors">
                    {item}
                </button>
            ))}
        </div>
    </div>
);

const GeminiLayout: FC<GeminiLayoutProps> = ({ user, auth, db }) => {
    // State is now just for the slide-out panel
    const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);
    const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);

    // All your existing chat logic remains the same
    const [chats, setChats] = useState<Chat[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [context, setContext] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);
    const isInitialLoad = useRef(true);

    // All handler functions and useEffects remain the same
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, "users", user.uid, "chats"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const userChats: Chat[] = querySnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            title: docSnap.data().title,
            timestamp: docSnap.data().timestamp,
            messages: [],
          }));
          setChats(userChats);
          if (isInitialLoad.current && userChats.length > 0 && !currentChatId) {
            setCurrentChatId(userChats[0].id);
            isInitialLoad.current = false;
          }
        });
        return () => unsubscribe();
      }, [user, db, currentChatId]);
    
      useEffect(() => {
        if (!currentChatId) {
          setMessages([]);
          return;
        }
        const unsubscribe = onSnapshot(doc(db, "users", user.uid, "chats", currentChatId), (docSnap) => {
          const data = docSnap.data();
          if (data && data.messages) setMessages(data.messages);
        });
        return () => unsubscribe();
      }, [currentChatId, user, db]);
    
      useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, [messages]);
    
      const handleNewChat = () => {
        setCurrentChatId(null);
        setIsSlideoutOpen(false);
      }
      const handleSelectChat = (id: string) => {
        setCurrentChatId(id);
        setIsSlideoutOpen(false);
      }
      const handleDeleteChat = async (chatId: string) => {
        await deleteDoc(doc(db, "users", user.uid, "chats", chatId));
        if (currentChatId === chatId) {
            setCurrentChatId(null);
        }
      };

      const handleSendMessage = async (e: FormEvent) => {
        // ... this entire function remains unchanged
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        const userMessage: Message = { id: crypto.randomUUID(), text: input, sender: "user" };
        const tempInput = input;
        setInput("");
        setIsLoading(true);
        let tempChatId = currentChatId;
        try {
            let chatRef;
            let existingMessages = messages;
            if (!tempChatId) {
                const newChatRef = await addDoc(collection(db, "users", user.uid, "chats"), {
                    title: tempInput.substring(0, 30) + (tempInput.length > 30 ? "..." : ""),
                    messages: [userMessage],
                    timestamp: Date.now(),
                });
                chatRef = newChatRef;
                tempChatId = newChatRef.id;
                setCurrentChatId(newChatRef.id);
                existingMessages = [userMessage];
            } else {
                chatRef = doc(db, "users", user.uid, "chats", tempChatId);
                await setDoc(chatRef, { messages: [...existingMessages, userMessage] }, { merge: true });
            }
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: tempInput, context }),
            });
            if (!response.ok || !response.body) {
                const errorData = await response.json();
                throw new Error(errorData.error || "API error");
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            const aiMessageId = crypto.randomUUID();
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
                                fullResponse += delta;
                                const streamingAIMessage: Message = { id: aiMessageId, text: fullResponse + "▋", sender: "ai" };
                                const updatedMessages = Array.from(new Map([...existingMessages, userMessage, streamingAIMessage].map(m => [m.id, m])).values());
                                await setDoc(chatRef, { messages: updatedMessages }, { merge: true });
                            }
                        } catch { /* Ignore parsing errors */ }
                    }
                }
            }
            const finalAIMessage: Message = { id: aiMessageId, text: fullResponse, sender: "ai" };
            const finalMessages = Array.from(new Map([...existingMessages, userMessage, finalAIMessage].map(m => [m.id, m])).values());
            await setDoc(chatRef, { messages: finalMessages, timestamp: Date.now() }, { merge: true });
        } catch (error) {
            console.error("API call failed:", error);
            const errorMessageText = error instanceof Error ? error.message : "An unknown error occurred";
            const errorMessage: Message = { id: crypto.randomUUID(), text: `Error: ${errorMessageText}`, sender: "ai" };
            if (tempChatId) {
                const chatRef = doc(db, "users", user.uid, "chats", tempChatId);
                const updatedMessages = Array.from(new Map([...messages, errorMessage].map(m => [m.id, m])).values());
                await setDoc(chatRef, { messages: updatedMessages }, { merge: true });
            }
        } finally {
            setIsLoading(false);
        }
      };
    
    const uniqueMessages = Array.from(new Map(messages.map((m) => [m.id, m])).values());

    return (
        <div className="flex h-screen bg-[#131314] text-white">
            {/* The static desktop sidebar is now part of the flex layout */}
            <GeminiDesktopSidebar 
                onNewChat={handleNewChat} 
                toggleMobileSidebar={() => setIsSlideoutOpen(true)} 
            />
            {/* The slide-out sidebar is a separate component that appears on top */}
            <GeminiSidebar 
                isOpen={isSlideoutOpen} 
                onClose={() => setIsSlideoutOpen(false)} 
                onNewChat={handleNewChat}
                chats={chats}
                currentChatId={currentChatId}
                onSelectChat={handleSelectChat}
                onDeleteChat={handleDeleteChat}
            />

            {/* The margin is gone, flexbox handles the layout now */}
            <main className="flex-grow flex flex-col relative">
                <header className="flex items-center justify-between p-4 md:hidden">
                    <button onClick={() => setIsSlideoutOpen(true)} className="p-2 rounded-full hover:bg-gray-800">
                        <MenuIcon className="w-6 h-6" />
                    </button>
                    <h1 className="font-medium">AuraIQ</h1>
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <UserIcon className="w-6 h-6" />
                    </div>
                </header>
                
                <div className="flex-grow overflow-y-auto p-4">
                    <div className="w-full max-w-3xl mx-auto h-full flex flex-col">
                        <div className="flex-grow">
                             {(!currentChatId && uniqueMessages.length === 0) ? (
                                <WelcomeScreen userName={user.email} />
                            ) : (
                                uniqueMessages.map(msg => <ChatBubble key={msg.id} message={msg} />)
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    </div>
                </div>

                <ChatInput
                    input={input}
                    setInput={setInput}
                    isLoading={isLoading}
                    handleSendMessage={handleSendMessage}
                    toggleContextPanel={() => setIsContextPanelOpen(!isContextPanelOpen)}
                    isContextPanelOpen={isContextPanelOpen}
                />
            </main>
            
            <ContextPanel 
                context={context} 
                setContext={setContext}
                isOpen={isContextPanelOpen}
                onClose={() => setIsContextPanelOpen(false)}
            />
        </div>
    );
};

export default GeminiLayout;
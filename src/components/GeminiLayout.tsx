// src/components/GeminiLayout.tsx

"use client";

import { useState, FC, FormEvent, useEffect, useRef } from 'react';
import { User, Auth, signOut } from 'firebase/auth';
import { Firestore, collection, query, orderBy, onSnapshot, doc, addDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Chat, Message } from '../lib/types';
import GeminiDesktopSidebar from './GeminiDesktopSidebar'; 
import GeminiSidebar from './GeminiSidebar';
import ChatInput from './ChatInput';
import ContextPanel from './ContextPanel';
import ChatBubble from './ChatBubble';
import { BrainCircuit } from 'lucide-react'; 
import { MenuIcon, UserIcon, LogoutIcon } from './Icons';

interface GeminiLayoutProps {
  user: User;
  auth: Auth;
  db: Firestore;
}

const WelcomeScreen: FC<{ userName: string | null }> = ({ userName }) => (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-blue-400 mb-4 break-all">
            Hello, {userName || 'User'}
        </h1>
        <p className="text-gray-400 text-lg mb-8">How can I help you today?</p>
    </div>
);

const GeminiLayout: FC<GeminiLayoutProps> = ({ user, auth, db }) => {
    const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isContextActive, setIsContextActive] = useState(false);
    const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);
    const [chats, setChats] = useState<Chat[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [context, setContext] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    }, [messages, streamingMessage]);
    
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

      const handleRenameChat = async (chatId: string, newTitle: string) => {
        if (!chatId || !newTitle.trim()) return;
        const chatRef = doc(db, "users", user.uid, "chats", chatId);
        await updateDoc(chatRef, { title: newTitle.trim() });
      };

      const handleStopGenerating = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsLoading(false);
        }
      };

      const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const userMessage: Message = { id: Date.now().toString(), text: input, sender: "user" };
        const tempInput = input;
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);
        let tempChatId = currentChatId;

        try {
            let chatRef;
            if (!tempChatId) {
                const newChatRef = await addDoc(collection(db, "users", user.uid, "chats"), {
                    title: tempInput.substring(0, 30) + (tempInput.length > 30 ? "..." : ""),
                    messages: [userMessage],
                    timestamp: Date.now(),
                });
                chatRef = newChatRef;
                tempChatId = newChatRef.id;
                setCurrentChatId(newChatRef.id);
            } else {
                chatRef = doc(db, "users", user.uid, "chats", tempChatId);
                await setDoc(chatRef, { messages: newMessages }, { merge: true });
            }

            const contextToSend = isContextActive ? context : "";
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: tempInput,
                    context: contextToSend,
                    history: messages
                }),
                signal: abortController.signal,
            });

            if (!response.ok || !response.body) {
                const errorData = await response.json();
                throw new Error(errorData.error || "API error");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const aiMessageId = (Date.now() + 1).toString();
            setStreamingMessage({ id: aiMessageId, text: "", sender: "ai" });

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
                                setStreamingMessage(prev => (prev ? { ...prev, text: prev.text + delta } : null));
                            }
                        } catch { }
                    }
                }
            }
        // MODIFICATION: Replaced 'error: any' with a proper type assertion to fix the build error
        } catch (error) {
            const err = error as Error;
            if (err.name === "AbortError") {
                console.log("Fetch aborted by user.");
            } else {
                console.error("API call failed:", err);
                const errorMessageText = err.message || "An unknown error occurred";
                setStreamingMessage({ id: (Date.now() + 2).toString(), text: `Error: ${errorMessageText}`, sender: "ai" });
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
      };
      
    const finalStreamingMessage = useRef<Message | null>(null);
    useEffect(() => {
        if (streamingMessage) {
            finalStreamingMessage.current = streamingMessage;
        }
    }, [streamingMessage]);

    useEffect(() => {
        if (!isLoading && finalStreamingMessage.current) {
            const finalMessage = finalStreamingMessage.current;
            if (currentChatId && finalMessage.text.trim()) {
                const chatRef = doc(db, "users", user.uid, "chats", currentChatId);
                const finalMessages = [...messages, finalMessage];
                setDoc(chatRef, { messages: finalMessages }, { merge: true });
                setMessages(finalMessages);
            }
            setStreamingMessage(null);
            finalStreamingMessage.current = null;
        }
    }, [isLoading, currentChatId, user.uid, db, messages]);


    return (
        <div className="flex h-screen bg-[#131314] text-white">
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

            <main className="flex-grow flex flex-col relative overflow-hidden">
                <header className="flex items-center justify-between p-4 flex-shrink-0 md:hidden z-10 bg-[#131314] border-b border-gray-800">
                    <button onClick={() => setIsSlideoutOpen(true)} className="p-2 rounded-full hover:bg-gray-800">
                        <MenuIcon className="w-6 h-6" />
                    </button>
                    <h1 className="font-medium">AuraIQ</h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsContextPanelOpen(true)} className="p-2 rounded-full hover:bg-gray-800">
                            <BrainCircuit className="w-6 h-6 text-gray-400 animate-pulse" />
                        </button>
                        <div className="relative">
                            <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                                <UserIcon className="w-6 h-6" />
                            </button>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-[#1e20] rounded-md shadow-lg z-20">
                                    <button onClick={() => signOut(auth)} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">
                                        <LogoutIcon className="w-5 h-5"/>
                                        <span>Logout</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                
                <div className="flex-grow overflow-y-auto p-4">
                    <div className="w-full max-w-3xl mx-auto h-full flex flex-col">
                        <div className="flex-grow">
                             {(!currentChatId && messages.length === 0 && !streamingMessage) ? (
                                <WelcomeScreen userName={user.email} />
                            ) : (
                                <>
                                    {messages.map(msg => <ChatBubble key={msg.id} message={msg} />)}
                                    {streamingMessage && <ChatBubble message={streamingMessage} />}
                                </>
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
                    handleStopGenerating={handleStopGenerating}
                    toggleContextActive={() => setIsContextActive(!isContextActive)}
                    isContextActive={isContextActive}
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
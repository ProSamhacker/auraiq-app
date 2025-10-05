// src/components/ChatInterface.tsx

"use client";

import { useState, useEffect, useRef, FC, FormEvent } from "react";
import { User, Auth } from "firebase/auth";
import { Firestore, doc, onSnapshot, collection, addDoc, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { Chat, Message } from "../lib/types";
import Sidebar from "./Sidebar";
import ContextPanel from "./ContextPanel";
import ChatBubble from "./ChatBubble";
import { BotIcon, SendIcon, MenuIcon } from "./Icons";

interface ChatInterfaceProps {
  user: User;
  auth: Auth;
  db: Firestore;
}

const ChatInterface: FC<ChatInterfaceProps> = ({ user, auth, db }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Firestore listeners and message handling logic remain here...
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
      if (isInitialLoad.current && userChats.length > 0) {
        setCurrentChatId(userChats[0].id);
        isInitialLoad.current = false;
      }
    });
    return () => unsubscribe();
  }, [user, db]);

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
    setIsSidebarOpen(false);
  }
  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setIsSidebarOpen(false);
  };
  const handleDeleteChat = async (chatId: string) => {
    await deleteDoc(doc(db, "users", user.uid, "chats", chatId));
    if (currentChatId === chatId) handleNewChat();
  };

  const handleSendMessage = async (e: FormEvent) => {
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
    <main className="flex h-screen bg-gray-900 text-white font-sans overflow-hidden relative">
      <Sidebar
        user={user}
        auth={auth}
        chats={chats}
        currentChatId={currentChatId}
        handleNewChat={handleNewChat}
        handleSelectChat={handleSelectChat}
        handleDeleteChat={handleDeleteChat}
        isOpen={isSidebarOpen}
      />
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="absolute inset-0 bg-black/50 z-10 md:hidden"></div>}

      <div className="flex-grow flex flex-col">
         {/* Mobile Header */}
        <div className="p-4 border-b border-gray-700 flex items-center md:hidden">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-md hover:bg-gray-700">
            <MenuIcon className="w-6 h-6" />
          </button>
          <h2 className="ml-4 font-bold text-lg">AuraIQ</h2>
        </div>

        <div className="flex-grow p-6 overflow-y-auto">
          {uniqueMessages.length === 0 && currentChatId === null ? (
            <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full">
              <BotIcon className="w-20 h-20 mx-auto mb-4 text-gray-600" />
              <h2 className="text-3xl font-bold text-gray-400">Welcome to AuraIQ</h2>
              <p>Start a new conversation or select one from your history.</p>
            </div>
          ) : (
            uniqueMessages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-6 bg-gray-900 border-t border-gray-700">
          <form onSubmit={handleSendMessage} className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
              placeholder="Type your message to AuraIQ..."
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 pr-16 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              disabled={isLoading}
            />
            <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={isLoading || !input.trim()}>
              <SendIcon className="w-6 h-6 text-white" />
            </button>
          </form>
        </div>
      </div>

      <ContextPanel context={context} setContext={setContext} />
    </main>
  );
};

export default ChatInterface;
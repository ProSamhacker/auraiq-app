"use client";

import { useState, useEffect, useRef, FC, FormEvent, SVGProps } from 'react';
// --- Firebase Imports ---
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, Auth, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, addDoc, setDoc, deleteDoc, query, orderBy, Firestore } from "firebase/firestore";

// --- Helper Types ---
type Message = { id: string; text: string; sender: 'user' | 'ai'; };
type Chat = { id: string; title: string; messages: Message[]; timestamp: number; };

// --- SVG Icons ---
const BotIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>);
const UserIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const SendIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>);
const PlusIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const TrashIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>);
const LogoutIcon: FC<SVGProps<SVGSVGElement>> = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);

// --- Component: ChatBubble ---
const ChatBubble: FC<{ message: Message }> = ({ message }) => {
    const isUser = message.sender === 'user';
    return (
        <div className={`flex items-start gap-4 my-4 ${isUser ? 'justify-end' : ''}`}>
            {!isUser && <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center"><BotIcon className="w-6 h-6 text-gray-400" /></div>}
            <div className={`max-w-xl p-4 rounded-2xl ${isUser ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-300 rounded-bl-none'}`}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
            </div>
            {isUser && <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center"><UserIcon className="w-6 h-6 text-gray-400" /></div>}
        </div>
    );
};

// --- Auth Component ---
const AuthComponent: FC<{ auth: Auth }> = ({ auth }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (!isLogin && password !== confirmPassword) {
            setError("Passwords do not match.");
            setIsLoading(false);
            return;
        }

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err: any) {
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-xl shadow-lg">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-white">AuraIQ</h1>
                    <p className="text-gray-400">Your intelligent assistant awaits.</p>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {!isLogin && <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-4 py-2 text-gray-200 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />}
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                    <button type="submit" disabled={isLoading} className="w-full px-4 py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-600 transition-colors">
                        {isLoading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>
                <p className="text-sm text-center text-gray-400">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="ml-2 font-medium text-blue-400 hover:underline">
                        {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
};


// --- Chat Component ---
const ChatInterface: FC<{ user: User; auth: Auth; db: Firestore }> = ({ user, auth, db }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const isInitialLoad = useRef(true);

  // Load user's chat history from Firestore. This is now the ONLY place
  // that the chat list (`chats` state) gets updated.
  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'users', user.uid, 'chats'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const userChats: Chat[] = [];
        querySnapshot.forEach((doc) => {
            userChats.push({ id: doc.id, ...doc.data() } as Chat);
        });
        setChats(userChats);
        
        // On the very first load, automatically select the most recent chat.
        if (isInitialLoad.current && userChats.length > 0) {
            setCurrentChatId(userChats[0].id);
            isInitialLoad.current = false;
        }
    });

    return () => unsubscribe();
  }, [user, db]);

  // This effect ensures the chat window always scrolls to the bottom.
  useEffect(() => { 
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [chats, currentChatId]); // Re-scroll whenever the chats list or selected chat changes.

  // The messages on screen are now a "derived" state. They are always
  // calculated directly from the `chats` state, the single source of truth.
  const messages = chats.find(chat => chat.id === currentChatId)?.messages || [];

  const handleNewChat = () => { 
      setCurrentChatId(null);
  };

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
  };

  const handleDeleteChat = async (chatId: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId));
    if (currentChatId === chatId) {
        handleNewChat();
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    
    const tempInput = input;
    setInput('');
    setIsLoading(true);

    let tempChatId = currentChatId;
    
    try {
        let chatRef;
        let existingMessages: Message[] = [];

        if (tempChatId) {
            // If we're in an existing chat, get its reference and messages
            chatRef = doc(db, 'users', user.uid, 'chats', tempChatId);
            const currentChat = chats.find(c => c.id === tempChatId);
            existingMessages = currentChat?.messages || [];
        } else {
            // If it's a new chat, create a new document in Firestore first
            const newChatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
                title: tempInput.substring(0, 30) + (tempInput.length > 30 ? '...' : ''),
                messages: [], // Start with no messages
                timestamp: Date.now(),
            });
            chatRef = newChatRef;
            tempChatId = newChatRef.id;
            setCurrentChatId(newChatRef.id);
        }
        
        // **One-Way Data Flow Step 1:** Save the user's message to Firestore.
        // The `onSnapshot` listener will automatically see this and update the UI.
        const updatedMessages = [...existingMessages, userMessage];
        await setDoc(chatRef, { messages: updatedMessages }, { merge: true });

        // **One-Way Data Flow Step 2:** Call the AI.
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: tempInput, context }) });
        if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'API error'); }
        
        const result = await response.json();
        const aiMessage: Message = { id: (Date.now() + 1).toString(), text: result.text, sender: 'ai' };
        
        // **One-Way Data Flow Step 3:** Save the AI's response to Firestore.
        // The `onSnapshot` listener will see this update and add the AI's message to the UI.
        await setDoc(chatRef, { messages: [...updatedMessages, aiMessage], timestamp: Date.now() }, { merge: true });

    } catch (error: any) {
        console.error("API call failed:", error);
        if(tempChatId) {
            // If there's an error, save an error message to the chat so the user knows.
            const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `Error: ${error.message}`, sender: 'ai' };
            const chatRef = doc(db, 'users', user.uid, 'chats', tempChatId);
            const currentChat = chats.find(c => c.id === tempChatId);
            // We use optional chaining here in case the chat was deleted in the meantime
            const existingMessagesOnError = currentChat?.messages || [userMessage];
            await setDoc(chatRef, { messages: [...existingMessagesOnError, errorMessage] }, { merge: true });
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <main className="flex h-screen bg-gray-900 text-white font-sans">
      <div className="w-1/4 bg-gray-800 flex flex-col border-r border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h1 className="text-xl font-bold">AuraIQ</h1>
              <button onClick={handleNewChat} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="New Chat"><PlusIcon className="w-6 h-6" /></button>
          </div>
          <div className="flex-grow p-2 overflow-y-auto">
              {chats.map(chat => (
                <div key={chat.id} onClick={() => handleSelectChat(chat.id)} className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'}`}>
                    <p className="truncate text-sm font-medium">{chat.title}</p>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }} className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-600/50 opacity-50 hover:opacity-100 transition-all"><TrashIcon className="w-4 h-4"/></button>
                </div>
              ))}
          </div>
          <div className="p-4 border-t border-gray-700 flex justify-between items-center">
              <span className="text-sm text-gray-400 truncate">{user.email}</span>
              <button onClick={() => signOut(auth)} className="flex items-center gap-2 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors" title="Logout">
                <LogoutIcon className="w-5 h-5" />
              </button>
          </div>
      </div>
      <div className="w-1/2 flex flex-col">
        <div className="flex-grow p-6 overflow-y-auto">
            {(messages.length === 0 && currentChatId === null) ? (
                <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full">
                    <BotIcon className="w-20 h-20 mx-auto mb-4 text-gray-600" /><h2 className="text-3xl font-bold text-gray-400">Welcome to AuraIQ</h2><p>Start a new conversation or select one from your history.</p>
                </div>
            ) : (
                messages.map(msg => <ChatBubble key={msg.id} message={msg} />)
            )}
            {isLoading && (
              <div className="flex items-start gap-4 my-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center"><BotIcon className="w-6 h-6 text-gray-400" /></div>
                  <div className="max-w-xl p-4 rounded-2xl bg-gray-800 text-gray-300 rounded-bl-none">
                      <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                      </div>
                  </div>
              </div>
            )}
            <div ref={chatEndRef} />
        </div>
        <div className="p-6 bg-gray-900 border-t border-gray-700">
            <form onSubmit={handleSendMessage} className="relative">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}} placeholder="Type your message to AuraIQ... (Shift+Enter for new line)" className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 pr-16 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} disabled={isLoading}/>
                <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors" disabled={isLoading || !input.trim()}><SendIcon className="w-6 h-6 text-white"/></button>
            </form>
        </div>
      </div>
      <div className="w-1/4 bg-gray-800 flex flex-col border-l border-gray-700">
          <div className="p-4 border-b border-gray-700"><h2 className="text-lg font-semibold text-gray-300">Context & Memory</h2><p className="text-sm text-gray-500">Provide persistent context for the AI.</p></div>
          <div className="flex-grow p-4"><textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Enter long-term context here..." className="w-full h-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"/></div>
          <div className="p-4 border-t border-gray-700 text-xs text-gray-500"><p>This text will be sent with every message to maintain context.</p></div>
      </div>
    </main>
  );
};

// --- Main Page Component ---
export default function Home() {
    const [user, setUser] = useState<User | null>(null);
    const [auth, setAuth] = useState<Auth | null>(null);
    const [db, setDb] = useState<Firestore | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    useEffect(() => {
        // --- Firebase Config ---
        const firebaseConfig = {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };
        
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(dbInstance);

        const unsubscribe = onAuthStateChanged(authInstance, (user) => {
            setUser(user);
            setIsAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (isAuthLoading || !auth) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading...</div>;
    }

    return user && db ? <ChatInterface user={user} auth={auth} db={db} /> : <AuthComponent auth={auth} />;
}


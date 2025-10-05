// src/components/GeminiSidebar.tsx

import { FC } from "react";
import { PlusIcon, MenuIcon, TrashIcon } from "./Icons";
import { Chat } from "../lib/types";

interface GeminiSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

const GeminiSidebar: FC<GeminiSidebarProps> = ({ isOpen, onClose, onNewChat, chats, currentChatId, onSelectChat, onDeleteChat }) => {
  return (
    <>
      {/* This is ONLY the slide-out drawer now */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1e1f20] text-white flex flex-col transition-transform duration-300 ease-in-out
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex p-2 items-center border-b border-gray-700">
            <button onClick={onClose} className="p-3 rounded-full hover:bg-gray-700">
                <MenuIcon className="w-6 h-6" />
            </button>
            <span className="font-semibold ml-2">Chat History</span>
        </div>
        
        <div className="flex-grow p-2 overflow-y-auto">
            <div 
                onClick={onNewChat}
                className="flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-700/50"
            >
                <PlusIcon className="w-6 h-6 mr-4" />
                <span>New Chat</span>
            </div>
            <hr className="border-gray-700 w-full my-2" />
            <div>
                {chats.map((chat) => (
                    <div 
                        key={chat.id} 
                        onClick={() => onSelectChat(chat.id)} 
                        className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id ? "bg-blue-600/30" : "hover:bg-gray-700/50"}`}
                    >
                        <p className="truncate text-sm font-medium">{chat.title}</p>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} 
                            className="p-1 rounded-md text-gray-500 hover:text-red-400 opacity-50 hover:opacity-100"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
      </div>
      {/* Backdrop */}
      {isOpen && <div onClick={onClose} className="fixed inset-0 bg-black/50 z-30"></div>}
    </>
  );
};

export default GeminiSidebar;
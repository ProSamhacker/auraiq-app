// src/components/GeminiSidebar.tsx

import { FC, useState, KeyboardEvent } from "react";
// MODIFICATION: Import Pencil icon
import { PlusIcon, MenuIcon, TrashIcon, Pencil } from "lucide-react";
import { Chat } from "../lib/types";

interface GeminiSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  // MODIFICATION: Add onRenameChat to props
  onRenameChat: (id: string, newTitle: string) => void;
}

const GeminiSidebar: FC<GeminiSidebarProps> = ({ isOpen, onClose, onNewChat, chats, currentChatId, onSelectChat, onDeleteChat, onRenameChat }) => {
  // MODIFICATION: Add state to manage which chat is being edited
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const handleEditClick = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditText(chat.title);
  };

  const handleSaveRename = () => {
    if (editingChatId && editText.trim()) {
      onRenameChat(editingChatId, editText);
    }
    setEditingChatId(null);
    setEditText("");
  };
  
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setEditingChatId(null);
      setEditText("");
    }
  };

  return (
    <>
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
                        onClick={() => editingChatId !== chat.id && onSelectChat(chat.id)} 
                        className={`group flex justify-between items-center p-3 rounded-lg transition-colors ${currentChatId === chat.id ? "bg-blue-600/30" : "hover:bg-gray-700/50"} ${editingChatId !== chat.id ? 'cursor-pointer' : ''}`}
                    >
                        {editingChatId === chat.id ? (
                            <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onBlur={handleSaveRename}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                className="bg-transparent border border-blue-500 rounded-md w-full text-sm font-medium p-1 focus:outline-none"
                            />
                        ) : (
                            <>
                                <p className="truncate text-sm font-medium">{chat.title}</p>
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(chat); }} className="p-1 rounded-md text-gray-400 hover:text-white">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }} className="p-1 rounded-md text-gray-400 hover:text-red-400">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
      </div>
      {isOpen && <div onClick={onClose} className="fixed inset-0 bg-black/50 z-30"></div>}
    </>
  );
};

export default GeminiSidebar;
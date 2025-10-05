// src/components/Sidebar.tsx

import { FC } from "react";
import { User, Auth, signOut } from "firebase/auth";
import { Chat } from "../lib/types";
import { PlusIcon, TrashIcon, LogoutIcon } from "./Icons";

interface SidebarProps {
  user: User;
  auth: Auth;
  chats: Chat[];
  currentChatId: string | null;
  handleNewChat: () => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  isOpen: boolean;
}

const Sidebar: FC<SidebarProps> = ({ user, auth, chats, currentChatId, handleNewChat, handleSelectChat, handleDeleteChat, isOpen }) => {
  return (
    <div className={`absolute top-0 left-0 h-full w-full max-w-xs bg-gray-800 flex flex-col border-r border-gray-700 transition-transform transform ${isOpen ? "translate-x-0" : "-translate-x-full"} md:static md:translate-x-0 md:w-1/4 z-20`}>
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h1 className="text-xl font-bold">AuraIQ</h1>
        <button onClick={handleNewChat} className="p-2 rounded-md hover:bg-gray-700 transition-colors" title="New Chat">
          <PlusIcon className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-grow p-2 overflow-y-auto">
        {chats.map((chat) => (
          <div key={chat.id} onClick={() => handleSelectChat(chat.id)} className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id ? "bg-blue-600/30" : "hover:bg-gray-700/50"}`}>
            <p className="truncate text-sm font-medium">{chat.title}</p>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }} className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-gray-600/50 opacity-50 hover:opacity-100 transition-all">
              <TrashIcon className="w-4 h-4" />
            </button>
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
  );
};

export default Sidebar;
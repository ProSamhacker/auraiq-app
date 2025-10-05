// src/components/GeminiDesktopSidebar.tsx

import { FC } from "react";
// MODIFICATION: Removed HistoryIcon from imports
import { PlusIcon, SettingsIcon, MenuIcon } from "./Icons";

interface GeminiDesktopSidebarProps {
  onNewChat: () => void;
  toggleMobileSidebar: () => void;
}

const SidebarIcon: FC<{ children: React.ReactNode; text: string }> = ({ children, text }) => (
    <div className="relative flex items-center justify-center h-12 w-12 mt-2 mb-2 mx-auto bg-gray-800 hover:bg-blue-600 rounded-full hover:rounded-xl transition-all duration-300 ease-linear cursor-pointer group">
        {children}
        <span className="absolute w-auto p-2 m-2 min-w-max left-14 rounded-md shadow-md text-white bg-gray-900 text-xs font-bold transition-all duration-100 scale-0 origin-left group-hover:scale-100">
        {text}
        </span>
    </div>
);

const GeminiDesktopSidebar: FC<GeminiDesktopSidebarProps> = ({ onNewChat, toggleMobileSidebar }) => {
  return (
    <div className="hidden md:flex h-full w-20 flex-col items-center justify-between bg-[#1e1f20] p-2 flex-shrink-0">
        {/* Top Icons */}
        <div>
            <div className="flex items-center justify-center h-12 w-12 mt-2 mb-2 mx-auto">
                <button onClick={toggleMobileSidebar} className="p-2 rounded-full hover:bg-gray-700">
                    <MenuIcon className="w-6 h-6" />
                </button>
            </div>
            <SidebarIcon text="New Chat" >
                <div onClick={onNewChat}><PlusIcon className="w-6 h-6" /></div>
            </SidebarIcon>
            {/* MODIFICATION: The HistoryIcon and the <hr> have been removed from here */}
        </div>
        {/* Bottom Icons */}
        <div>
            <SidebarIcon text="Settings">
                <SettingsIcon className="w-6 h-6" />
            </SidebarIcon>
        </div>
    </div>
  );
};

export default GeminiDesktopSidebar;
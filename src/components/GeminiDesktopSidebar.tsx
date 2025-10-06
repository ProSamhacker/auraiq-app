// src/components/GeminiDesktopSidebar.tsx

import { FC, useState } from "react";
import { PlusIcon, SettingsIcon, MenuIcon, LogoutIcon } from "./Icons";
import { Auth, signOut } from "firebase/auth"; // Import Auth and signOut

// MODIFICATION: Add the 'auth' prop
interface GeminiDesktopSidebarProps {
  onNewChat: () => void;
  toggleMobileSidebar: () => void;
  auth: Auth; 
}

const SidebarIcon: FC<{ children: React.ReactNode; text: string; onClick?: () => void }> = ({ children, text, onClick }) => (
    <div onClick={onClick} className="relative flex items-center justify-center h-12 w-12 mt-2 mb-2 mx-auto bg-gray-800 hover:bg-blue-600 rounded-full hover:rounded-xl transition-all duration-300 ease-linear cursor-pointer group">
        {children}
        <span className="absolute w-auto p-2 m-2 min-w-max left-14 rounded-md shadow-md text-white bg-gray-900 text-xs font-bold transition-all duration-100 scale-0 origin-left group-hover:scale-100">
        {text}
        </span>
    </div>
);

const GeminiDesktopSidebar: FC<GeminiDesktopSidebarProps> = ({ onNewChat, toggleMobileSidebar, auth }) => {
  // MODIFICATION: Add state to manage the settings menu
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  return (
    <div className="hidden md:flex h-full w-20 flex-col items-center justify-between bg-[#1e1f20] p-2 flex-shrink-0">
        {/* Top Icons */}
        <div>
            <div className="flex items-center justify-center h-12 w-12 mt-2 mb-2 mx-auto">
                <button onClick={toggleMobileSidebar} className="p-2 rounded-full hover:bg-gray-700">
                    <MenuIcon className="w-6 h-6" />
                </button>
            </div>
            <SidebarIcon text="New Chat" onClick={onNewChat}>
                <PlusIcon className="w-6 h-6" />
            </SidebarIcon>
        </div>
        
        {/* Bottom Icons */}
        <div className="relative">
            {/* MODIFICATION: The settings icon now opens a menu */}
            <SidebarIcon text="Settings" onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}>
                <SettingsIcon className="w-6 h-6" />
            </SidebarIcon>

            {/* MODIFICATION: The logout dropdown menu */}
            {isSettingsMenuOpen && (
                <div className="absolute bottom-0 left-20 mb-2 w-48 bg-gray-800 rounded-md shadow-lg z-20">
                    <button
                        onClick={() => signOut(auth)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-md"
                    >
                        <LogoutIcon className="w-5 h-5"/>
                        <span>Logout</span>
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

export default GeminiDesktopSidebar;
// src/components/ContextPanel.tsx

import { FC } from "react";
import { XIcon } from "./Icons";

interface ContextPanelProps {
  context: string;
  setContext: (context: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ContextPanel: FC<ContextPanelProps> = ({ context, setContext, isOpen, onClose }) => {
  return (
    <>
      {/* This main div is now a fixed-position overlay by default */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-xs bg-gray-800 flex flex-col border-l border-gray-700
                    transition-transform transform z-40
                    ${isOpen ? "translate-x-0" : "translate-x-full"} 
                    lg:static lg:translate-x-0 lg:flex-shrink-0`}
      >
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
              <h2 className="text-lg font-semibold text-gray-300">Context & Memory</h2>
              <p className="text-sm text-gray-500">Provide persistent context for the AI.</p>
          </div>
          {/* Close button for mobile/tablet view */}
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-700 lg:hidden">
              <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-grow p-4">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Enter long-term context here..."
            className="w-full h-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
          <p>This text will be sent with every message to maintain context.</p>
        </div>
      </div>

      {/* Backdrop for the overlay */}
      {isOpen && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        ></div>
      )}
    </>
  );
};

export default ContextPanel;
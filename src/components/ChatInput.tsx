// src/components/ChatInput.tsx

import { FC, FormEvent } from "react";
// MODIFICATION: Import Brain from lucide-react
import { Brain } from "lucide-react"; 
// MODIFICATION: No longer need BrainIcon from the local file
import { MicIcon, SendIcon } from "./Icons";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  handleSendMessage: (e: FormEvent) => void;
  toggleContextActive: () => void;
  isContextActive: boolean;
}

const ChatInput: FC<ChatInputProps> = ({ input, setInput, isLoading, handleSendMessage, toggleContextActive, isContextActive }) => {
  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <form onSubmit={handleSendMessage} className="relative">
        <div className="relative flex items-center w-full bg-[#1e1f20] rounded-full">
            <button
              type="button" 
              onClick={toggleContextActive}
              title="Toggle Context & Memory"
              className={`p-3 transition-colors rounded-full ${isContextActive ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:text-white'}`}
            >
              {/* MODIFICATION: Using the Brain icon from Lucide */}
              <Brain className="w-6 h-6" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Ask AuraIQ..."
              className="flex-grow bg-transparent text-gray-200 resize-none focus:outline-none p-3 pr-24"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <button type="button" className="p-2 rounded-full text-gray-400 hover:bg-gray-700">
                    <MicIcon className="w-6 h-6" />
                </button>
                <button
                    type="submit"
                    className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    disabled={isLoading || !input.trim()}
                    >
                    <SendIcon className="w-6 h-6 text-white" />
                </button>
            </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;
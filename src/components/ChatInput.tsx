// src/components/ChatInput.tsx

import { FC, FormEvent, useState, useRef, useEffect } from "react";
import { Brain, Mic, Send, Square } from "lucide-react"; 

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  handleSendMessage: (e: FormEvent) => void;
  handleStopGenerating: () => void;
  toggleContextActive: () => void;
  isContextActive: boolean;
}

const ChatInput: FC<ChatInputProps> = ({ input, setInput, isLoading, handleSendMessage, handleStopGenerating, toggleContextActive, isContextActive }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleMicClick = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Your browser does not support voice recognition.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      // MODIFICATION: Removed the '(window as any)' cast to fix the build error
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.onerror = (event: Event & { error: string }) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.start();
      setIsListening(true);
      recognitionRef.current = recognition;
    }
  };
  
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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
              placeholder={isListening ? "Listening..." : "Ask AuraIQ..."}
              className="flex-grow bg-transparent text-gray-200 resize-none focus:outline-none p-3 pr-24"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <button 
                  type="button"
                  onClick={handleMicClick}
                  className={`p-2 rounded-full transition-colors ${isListening ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:bg-gray-700'}`}
                >
                    <Mic className="w-6 h-6" />
                </button>

                {isLoading ? (
                    <button
                        type="button"
                        onClick={handleStopGenerating}
                        className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                        <Square className="w-6 h-6 text-white" />
                    </button>
                ) : (
                    <button
                        type="submit"
                        className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        disabled={!input.trim()}
                    >
                        <Send className="w-6 h-6 text-white" />
                    </button>
                )}
            </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;
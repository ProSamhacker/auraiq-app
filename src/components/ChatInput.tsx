import { FC, FormEvent, useState, useRef, useEffect } from "react";
import { Brain, Mic, Send, Square, Paperclip, XIcon, FileText } from "lucide-react"; 

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  handleSendMessage: (e: FormEvent, taskType: 'auto' | 'daily' | 'coding') => void;
  handleStopGenerating: () => void;
  toggleContextActive: () => void;
  isContextActive: boolean;
  attachments: File[];
  setAttachments: (files: File[]) => void;
}

const ChatInput: FC<ChatInputProps> = ({ 
  input, setInput, isLoading, handleSendMessage, handleStopGenerating, 
  toggleContextActive, isContextActive, attachments, setAttachments 
}) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [taskType, setTaskType] = useState<'auto' | 'daily' | 'coding'>('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return; 
    handleSendMessage(e, taskType);
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setAttachments([...attachments, ...newFiles]);
    }
  };
  
  const handleRemoveAttachment = (index: number) => {
    const newAttachments = [...attachments];
    newAttachments.splice(index, 1);
    setAttachments(newAttachments);
  };

  const handleMicClick = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setInput(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };
  
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="p-4 w-full md:max-w-2xl lg:max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        {attachments.length > 0 && (
          <div className="p-3 bg-black/20 border-t border-x border-gray-700/50 rounded-t-xl flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div key={index} className="bg-gray-600/80 text-white text-sm rounded-lg pl-2 pr-1 py-1 flex items-center gap-2 transition-colors hover:bg-gray-600">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate max-w-48">{file.name}</span>
                <button 
                  type="button" 
                  onClick={() => handleRemoveAttachment(index)} 
                  className="bg-gray-500/50 hover:bg-gray-500 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                >
                  <XIcon className="w-3.5 h-3.5"/>
                </button>
              </div>
            ))}
          </div>
        )}
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange}
          multiple 
          className="hidden"
        />

        <div className={`relative flex items-center w-full bg-[#1e1f20] ${attachments.length > 0 ? 'rounded-b-full' : 'rounded-full'}`}>
            <button
              type="button" 
              onClick={toggleContextActive}
              title="Toggle Context & Memory"
              className={`p-3 transition-colors rounded-full ${isContextActive ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:text-white'}`}
            >
              <Brain className="w-6 h-6" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
              className="p-3 text-gray-400 hover:text-white"
            >
              <Paperclip className="w-6 h-6" />
            </button>
            
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as 'auto' | 'daily' | 'coding')}
              className="bg-transparent text-gray-400 text-sm focus:outline-none focus:ring-0 border-0"
              title="Select Task Type"
            >
              <option value="auto" className="bg-gray-800">Auto-Select</option>
              <option value="daily" className="bg-gray-800">Daily Task</option>
              <option value="coding" className="bg-gray-800">Coding Task</option>
            </select>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
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
                        disabled={!input.trim() && attachments.length === 0}
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
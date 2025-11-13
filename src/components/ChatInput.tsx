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
  const [taskType, setTaskType] = useState<'auto' | 'daily' | 'coding'>('auto');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

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
    <div className="w-full px-3 py-3 md:px-4 md:py-4">
      <form onSubmit={handleSubmit} className="relative">
        {/* Attachments Display */}
        {attachments.length > 0 && (
          <div className="mb-2 p-2 bg-gray-800/50 border border-gray-700/50 rounded-xl flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div 
                key={index} 
                className="bg-gray-700/80 text-white text-sm rounded-lg pl-2 pr-1 py-1.5 flex items-center gap-2 max-w-full"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate max-w-[180px] md:max-w-[250px]">{file.name}</span>
                <button 
                  type="button" 
                  onClick={() => handleRemoveAttachment(index)} 
                  className="bg-gray-600/50 hover:bg-gray-600 active:bg-gray-500 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5"/>
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange}
          multiple 
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json"
        />

        {/* Input Container */}
        <div className="relative flex items-end gap-2 bg-[#1e1f20] rounded-2xl px-2 py-2 shadow-lg border border-gray-700/50">
          {/* Left Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Context Toggle */}
            <button
              type="button" 
              onClick={toggleContextActive}
              title="Toggle Context & Memory"
              className={`p-2.5 rounded-full transition-all ${
                isContextActive 
                  ? 'text-blue-400 bg-blue-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600'
              }`}
            >
              <Brain className="w-5 h-5" />
            </button>

            {/* File Attach */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
              className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600 rounded-full transition-all"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Task Type Selector - Hidden on small mobile */}
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as 'auto' | 'daily' | 'coding')}
              className="hidden sm:block bg-transparent text-gray-400 text-xs md:text-sm px-1 focus:outline-none focus:ring-0 border-0 cursor-pointer hover:text-white transition-colors"
              title="Select Task Type"
            >
              <option value="auto" className="bg-gray-800">Auto</option>
              <option value="daily" className="bg-gray-800">Daily</option>
              <option value="coding" className="bg-gray-800">Code</option>
            </select>
          </div>
            
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={isListening ? "Listening..." : "Message AuraIQ..."}
            className="flex-1 bg-transparent text-gray-200 text-base resize-none focus:outline-none py-2.5 px-2 min-h-[24px] max-h-[150px] overflow-y-auto"
            rows={1}
            disabled={isLoading}
            style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(156, 163, 175, 0.3) transparent'
            }}
          />

          {/* Right Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Microphone */}
            <button 
              type="button"
              onClick={handleMicClick}
              className={`p-2.5 rounded-full transition-all ${
                isListening 
                  ? 'text-red-500 bg-red-500/20 animate-pulse' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600'
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Send/Stop Button */}
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGenerating}
                className="p-2.5 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors shadow-lg"
                title="Stop generating"
              >
                <Square className="w-5 h-5 text-white" />
              </button>
            ) : (
              <button
                type="submit"
                className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors shadow-lg"
                disabled={!input.trim() && attachments.length === 0}
                title="Send message"
              >
                <Send className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Task Type Selector for Mobile - Below input */}
        <div className="sm:hidden mt-2 flex justify-center">
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as 'auto' | 'daily' | 'coding')}
            className="bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="auto">Auto-Select</option>
            <option value="daily">Daily Task</option>
            <option value="coding">Coding Task</option>
          </select>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;
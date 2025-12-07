import { FC, FormEvent, useState, useRef, useEffect } from "react";
import { Brain, Mic, Send, Square, Paperclip, XIcon, FileText, AlertCircle } from "lucide-react";

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

// FIXED: File validation constants
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const ChatInput: FC<ChatInputProps> = ({ 
  input, setInput, isLoading, handleSendMessage, handleStopGenerating, 
  toggleContextActive, isContextActive, attachments, setAttachments 
}) => {
  const [isListening, setIsListening] = useState(false);
  const [taskType, setTaskType] = useState<'auto' | 'daily' | 'coding'>('auto');
  const [validationError, setValidationError] = useState<string>("");
  
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

  // Clear validation error after 5 seconds
  useEffect(() => {
    if (validationError) {
      const timer = setTimeout(() => setValidationError(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [validationError]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    
    // Clear any validation errors
    setValidationError("");
    
    handleSendMessage(e, taskType);
  };

  // FIXED: Enhanced file validation
  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds 25MB limit (${formatFileSize(file.size)})`;
    }

    // Check file type
    const isAllowedType = ALLOWED_FILE_TYPES.includes(file.type) || 
                          file.type.startsWith('image/') ||
                          file.type.startsWith('text/');
    
    if (!isAllowedType) {
      return `File type "${file.type}" is not supported`;
    }

    // Check total size
    const currentTotalSize = attachments.reduce((sum, f) => sum + f.size, 0);
    if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
      return `Total file size would exceed 50MB limit`;
    }

    return null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      
      // Validate each file
      for (const file of newFiles) {
        const error = validateFile(file);
        if (error) {
          setValidationError(error);
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return;
        }
      }
      
      // All files valid, add them
      setAttachments([...attachments, ...newFiles]);
      setValidationError("");
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  const handleRemoveAttachment = (index: number) => {
    const newAttachments = [...attachments];
    newAttachments.splice(index, 1);
    setAttachments(newAttachments);
  };

  const handleMicClick = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setValidationError('Speech recognition not supported in this browser');
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
      setValidationError(`Speech recognition error: ${event.error}`);
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

  // Calculate total size of attachments
  const totalSize = attachments.reduce((sum, file) => sum + file.size, 0);
  const sizePercentage = (totalSize / MAX_TOTAL_SIZE) * 100;

  return (
    <div className="w-full px-3 py-3 md:px-4 md:py-4">
      <form onSubmit={handleSubmit} className="relative">
        {/* Validation Error Banner */}
        {validationError && (
          <div className="mb-2 p-3 bg-red-900/50 border border-red-700/50 rounded-xl flex items-center gap-2 text-sm text-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{validationError}</span>
            <button
              type="button"
              onClick={() => setValidationError("")}
              className="ml-auto p-1 hover:bg-red-800/50 rounded"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Attachments Display */}
        {attachments.length > 0 && (
          <div className="mb-2 p-2 bg-gray-800/50 border border-gray-700/50 rounded-xl">
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((file, index) => (
                <div 
                  key={index} 
                  className="bg-gray-700/80 text-white text-sm rounded-lg pl-2 pr-1 py-1.5 flex items-center gap-2 max-w-full"
                >
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate max-w-[180px] md:max-w-[250px]">{file.name}</span>
                    <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                  </div>
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
            
            {/* Size indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    sizePercentage > 80 ? 'bg-red-500' : 
                    sizePercentage > 60 ? 'bg-yellow-500' : 
                    'bg-blue-500'
                  }`}
                  style={{ width: `${sizePercentage}%` }}
                />
              </div>
              <span className={sizePercentage > 80 ? 'text-red-400' : ''}>
                {formatFileSize(totalSize)} / {formatFileSize(MAX_TOTAL_SIZE)}
              </span>
            </div>
          </div>
        )}
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange}
          multiple 
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.pptx,.xlsx"
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
              disabled={attachments.length >= 5} // Limit to 5 files
              className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
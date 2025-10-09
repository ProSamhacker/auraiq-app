// src/components/ContextPanel.tsx

import { FC, useRef } from "react";
import { XIcon } from "./Icons";
import { UploadCloud, Trash2, FileText } from "lucide-react";

// We'll define a type for the context files
export interface ContextFile {
  id: string;
  name: string;
  url: string;
}

interface ContextPanelProps {
  context: string;
  setContext: (context: string) => void;
  contextFiles: ContextFile[];
  onFileUpload: (file: File) => void;
  onFileDelete: (fileId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ContextPanel: FC<ContextPanelProps> = ({ 
  context, 
  setContext, 
  contextFiles,
  onFileUpload,
  onFileDelete,
  isOpen, 
  onClose 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
      // Reset the input so the same file can be uploaded again if needed
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
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
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-700 lg:hidden">
              <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* --- MODIFICATION: New Section for File Context --- */}
        <div className="p-4 border-b border-gray-700">
            <h3 className="text-base font-medium text-gray-400 mb-2">Context Files</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {contextFiles.map(file => (
                    <div key={file.id} className="bg-gray-700/50 rounded-lg p-2 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0"/>
                            <span className="truncate" title={file.name}>{file.name}</span>
                        </div>
                        <button onClick={() => onFileDelete(file.id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 className="w-4 h-4"/>
                        </button>
                    </div>
                ))}
            </div>
          <input 
              type="file" 
               ref={fileInputRef} 
               onChange={handleFileChange}
               className="hidden"
/>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600/50 hover:bg-blue-600 text-white/90 px-3 py-2 rounded-lg text-sm transition-colors"
            >
                <UploadCloud className="w-5 h-5"/>
                Upload File
            </button>
        </div>
        {/* --- End of New Section --- */}
        
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

      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 bg-black/50 z-30 lg:hidden"></div>
      )}
    </>
  );
};

export default ContextPanel;
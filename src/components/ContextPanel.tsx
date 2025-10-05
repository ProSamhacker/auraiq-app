// src/components/ContextPanel.tsx

import { FC } from "react";

interface ContextPanelProps {
  context: string;
  setContext: (context: string) => void;
}

const ContextPanel: FC<ContextPanelProps> = ({ context, setContext }) => {
  return (
    // Hidden by default, shown on large screens
    <div className="hidden lg:flex lg:w-1/4 bg-gray-800 flex-col border-l border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-gray-300">Context & Memory</h2>
        <p className="text-sm text-gray-500">Provide persistent context for the AI.</p>
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
  );
};

export default ContextPanel;
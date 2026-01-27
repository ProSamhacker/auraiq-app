// src/components/ModelSelector.tsx
"use client";

import { FC, useState } from 'react';
import { Brain, Zap, Sparkles, Settings, ChevronDown, Check } from 'lucide-react';

export type AIModel =
  | 'gemini-flash'    // Fast, daily tasks
  | 'gemini-pro'      // Complex, coding tasks
  | 'iq1-base'        // Your custom model
  | 'auto';           // Auto-select based on task

interface ModelInfo {
  id: AIModel;
  name: string;
  description: string;
  icon: React.ReactNode;
  speed: 'fast' | 'medium' | 'slow';
  capabilities: string[];
  color: string;
}

const MODELS: ModelInfo[] = [
  {
    id: 'auto',
    name: 'Auto Select',
    description: 'Automatically choose the best model for your task',
    icon: <Sparkles className="w-5 h-5" />,
    speed: 'fast',
    capabilities: ['Smart routing', 'Cost optimized', 'Best performance'],
    color: 'bg-gradient-to-r from-purple-500 to-pink-500',
  },
  {
    id: 'iq1-base',
    name: 'Daily Chat',
    description: 'Llama 3.1 8B - Fast & free via Groq',
    icon: <Brain className="w-5 h-5" />,
    speed: 'fast',
    capabilities: ['Lightning fast', 'General knowledge', 'Free unlimited'],
    color: 'bg-gradient-to-r from-blue-500 to-cyan-500',
  },
  {
    id: 'gemini-flash',
    name: 'Daily Model',
    description: 'Llama 3.1 8B Instant - Groq powered',
    icon: <Zap className="w-5 h-5" />,
    speed: 'fast',
    capabilities: ['Instant responses', '131K context', 'Free'],
    color: 'bg-gradient-to-r from-yellow-500 to-orange-500',
  },
  {
    id: 'gemini-pro',
    name: 'Pro Coder',
    description: 'Llama 3.3 70B - Advanced coding & reasoning',
    icon: <Settings className="w-5 h-5" />,
    speed: 'medium',
    capabilities: ['Best for coding', 'Deep reasoning', '131K context'],
    color: 'bg-gradient-to-r from-green-500 to-emerald-500',
  },
];

interface ModelSelectorProps {
  selectedModel: AIModel;
  onModelChange: (model: AIModel) => void;
  className?: string;
}

const ModelSelector: FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all group"
      >
        <div className={`p-1.5 rounded-md ${currentModel.color} text-white`}>
          {currentModel.icon}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-white">
            {currentModel.name}
          </span>
          <span className="text-xs text-gray-400">
            {currentModel.speed === 'fast' ? '⚡ Fast' :
              currentModel.speed === 'medium' ? '⚖️ Balanced' :
                '🧠 Advanced'}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''
            }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute top-full mt-2 left-0 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-white mb-1">
                Select AI Model
              </h3>
              <p className="text-xs text-gray-400">
                Choose the best model for your task
              </p>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange(model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full p-4 text-left hover:bg-gray-700/50 transition-all border-b border-gray-700/50 last:border-b-0 ${selectedModel === model.id ? 'bg-gray-700/30' : ''
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${model.color} text-white flex-shrink-0`}>
                      {model.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-semibold text-white">
                          {model.name}
                        </h4>
                        {selectedModel === model.id && (
                          <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-gray-400 mb-2">
                        {model.description}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {model.capabilities.map((cap, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 bg-gray-900/50 text-gray-300 rounded-full"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>

                      {/* Speed indicator */}
                      <div className="mt-2 flex items-center gap-1">
                        <div className="flex gap-0.5">
                          {[...Array(3)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-3 rounded-full ${(model.speed === 'fast' && i < 3) ||
                                (model.speed === 'medium' && i < 2) ||
                                (model.speed === 'slow' && i < 1)
                                ? 'bg-blue-400'
                                : 'bg-gray-700'
                                }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-gray-500 ml-1">
                          Speed
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-3 bg-gray-900/50 border-t border-gray-700">
              <p className="text-xs text-gray-500 text-center">
                💡 Auto mode intelligently switches between models
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;

// Hook for model selection logic
export function useModelSelection() {
  const [selectedModel, setSelectedModel] = useState<AIModel>('auto');

  const determineModel = (input: string, taskType?: 'daily' | 'coding'): AIModel => {
    if (selectedModel !== 'auto') {
      return selectedModel;
    }

    // Auto-selection logic
    const codingKeywords = ['code', 'function', 'debug', 'error', 'implement', 'algorithm'];
    const hasCodingKeyword = codingKeywords.some(kw =>
      input.toLowerCase().includes(kw)
    );

    if (taskType === 'coding' || hasCodingKeyword) {
      return 'gemini-pro';
    }

    // Check input length
    if (input.length > 500) {
      return 'gemini-pro';
    }

    // Default to fast model
    return 'gemini-flash';
  };

  return {
    selectedModel,
    setSelectedModel,
    determineModel,
  };
}
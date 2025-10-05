// src/lib/types.ts

export type Message = {
  id: string;
  text: string;
  sender: "user" | "ai";
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
};
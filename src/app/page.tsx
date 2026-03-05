"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ShaderAnimation } from "@/components/ui/shader-lines";
import { Starfield } from "@/components/ui/starfield";
import { Github, Mic, Send, Square } from "lucide-react";
import { speakElevenLabs, type AudioReactiveHandle } from "@/lib/elevenlabs";
import { chat } from "@/lib/llm";

/* ── Types ──────────────────────────────────────────────────────── */

interface Message {
  role: "user" | "assistant";
  text: string;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [intensity, setIntensity] = useState(1.0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioHandleRef = useRef<AudioReactiveHandle | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Audio-reactive loop: reads real amplitude from ElevenLabs ─ */

  const startAmplitudeLoop = useCallback(() => {
    if (animFrameRef.current) return;

    let smoothed = 1.0;

    const loop = () => {
      const handle = audioHandleRef.current;
      if (handle) {
        const amp = handle.getAmplitude(); // 0..~0.5
        // More dramatic: higher multiplier, faster response
        const target = 1.0 + amp * 12.0; // map to 1.0 .. ~7.0
        smoothed += (target - smoothed) * 0.35; // faster interpolation
      } else {
        smoothed += (1.0 - smoothed) * 0.08;
      }

      setIntensity(smoothed);

      if (audioHandleRef.current || Math.abs(smoothed - 1.0) > 0.02) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        animFrameRef.current = null;
        setIntensity(1.0);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  /* ── Speak with ElevenLabs ───────────────────────────────────── */

  const speak = useCallback(
    async (text: string) => {
      audioHandleRef.current?.stop();
      audioHandleRef.current = null;

      const handle = await speakElevenLabs(
        text,
        () => {
          setSpeaking(true);
          startAmplitudeLoop();
        },
        () => {
          setSpeaking(false);
          audioHandleRef.current = null;
        }
      );
      audioHandleRef.current = handle;
    },
    [startAmplitudeLoop]
  );

  /* ── Handle sending a message ────────────────────────────────── */

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg) return;

      if (!chatOpen) setChatOpen(true);

      const newMessages: Message[] = [...messages, { role: "user", text: msg }];
      setMessages(newMessages);
      setInput("");

      // "Thinking" pulse
      setThinking(true);
      setIntensity(1.6);

      // Call Llama via OpenRouter
      const response = await chat(newMessages);

      setThinking(false);
      setMessages((prev) => [...prev, { role: "assistant", text: response }]);
      speak(response);
    },
    [input, chatOpen, messages, speak]
  );

  /* ── Speech Recognition (STT) ───────────────────────────────── */

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported — try Chrome.");
      return;
    }

    // Stop any ongoing TTS
    audioHandleRef.current?.stop();
    audioHandleRef.current = null;
    setSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);

      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        setListening(false);
        recognitionRef.current = null;
        if (transcript.trim()) handleSend(transcript.trim());
      }
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    if (!chatOpen) setChatOpen(true);

    // Gentle listening pulse
    setIntensity(1.4);
  }, [chatOpen, handleSend]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setIntensity(1.0);
  }, []);

  const toggleMic = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#030712] flex flex-col items-center justify-center select-none">
      <Starfield />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Sphere */}
        <div className="relative w-[340px] h-[340px] sm:w-[420px] sm:h-[420px]">
          <ShaderAnimation
            speed={0.05}
            intensity={intensity}
            className="w-full h-full absolute inset-0"
          />
          <div
            className="absolute inset-0 rounded-full bg-sky-400/5 blur-3xl pointer-events-none"
            style={{
              transform: `scale(${1.15 + (intensity - 1) * 0.2})`,
              transition: "transform 0.15s ease-out",
            }}
          />
        </div>

        {/* Branding */}
        <div className="text-center -mt-2">
          <h1 className="text-5xl sm:text-6xl font-display tracking-wider text-white/90" style={{ fontWeight: 300 }}>
            AEON
          </h1>
          <p className="mt-2 text-sm sm:text-base tracking-[0.25em] uppercase text-slate-400" style={{ fontWeight: 300 }}>
            The room that thinks
          </p>
        </div>

        {/* Chat */}
        <div className="w-full max-w-md px-4 mt-4">
          {chatOpen && messages.length > 0 && (
            <div className="mb-3 max-h-48 overflow-y-auto space-y-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${
                    m.role === "user"
                      ? "ml-auto bg-sky-500/15 text-sky-100"
                      : "mr-auto bg-slate-800/50 text-slate-200"
                  }`}
                  style={{ fontWeight: 300 }}
                >
                  {m.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input bar */}
          <div className="flex items-center gap-2 bg-slate-900/50 backdrop-blur-md border border-slate-700/40 rounded-2xl px-4 py-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!chatOpen) setChatOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Talk to Aeon..."
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
              style={{ fontWeight: 300 }}
            />

            <button
              onClick={toggleMic}
              className={`p-2 rounded-full transition-colors ${
                listening
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : "hover:bg-slate-700/50 text-slate-400 hover:text-slate-200"
              }`}
              title={listening ? "Stop" : "Speak"}
            >
              {listening ? <Square size={16} /> : <Mic size={16} />}
            </button>

            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || thinking}
              className="p-2 rounded-full hover:bg-sky-500/20 text-slate-400 hover:text-sky-300 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Send size={16} />
            </button>
          </div>

          {(listening || speaking || thinking) && (
            <p className="text-center text-xs text-slate-500 mt-2 animate-pulse" style={{ fontWeight: 300 }}>
              {listening ? "Listening..." : thinking ? "Thinking..." : "Speaking..."}
            </p>
          )}
        </div>
      </div>

      {/* GitHub */}
      <a
        href="https://github.com/ansschh/cortex"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-20 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        <Github size={18} />
        <span className="hidden sm:inline" style={{ fontWeight: 300 }}>GitHub</span>
      </a>

      <p className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 text-[11px] text-slate-600 tracking-wide" style={{ fontWeight: 300 }}>
        Built at Caltech
      </p>
    </main>
  );
}

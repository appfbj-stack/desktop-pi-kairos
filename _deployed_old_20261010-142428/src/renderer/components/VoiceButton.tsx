/**
 * VoiceButton — push-to-talk via Web Speech API (Chromium).
 *
 * Click inicia reconhecimento (lang=pt-BR, interimResults=true).
 * Transcript atualiza draft em tempo real.
 * Click de novo para e dispara onSend automaticamente.
 *
 * Requer permissão de microfone. Em Electron 33 pode precisar de
 * `--enable-speech-dispatcher` ou `setMicrophonePermission` no main.
 */

import { useEffect, useRef, useState } from "react";

// Tipos locais (Chromium expõe webkitSpeechRecognition)
type AnyRecognition = any;

interface VoiceButtonProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onAutoSend: (text: string) => void;
  disabled?: boolean;
  /** Override no botao interno (estilo herdado do pai). */
  className?: string;
  /** Classes adicionais no wrapper de erro. */
  errorClassName?: string;
}

export function VoiceButton({ onTranscript, onAutoSend, disabled, className, errorClassName }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<AnyRecognition | null>(null);
  const baseTextRef = useRef<string>("");
  const transcriptRef = useRef<string>("");

  useEffect(() => {
    return () => {
      try { recRef.current?.stop?.(); } catch {}
      recRef.current = null;
    };
  }, []);

  function getRecognition(): AnyRecognition | null {
    if (typeof window === "undefined") return null;
    const C: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!C) {
      setError("Reconhecimento de voz não suportado neste Electron. Use Chrome mais recente ou habilite --enable-speech-dispatcher.");
      return null;
    }
    return new C();
  }

  async function start() {
    setError(null);
    // Pede permissão de microfone explicitamente (alguns builds exigem)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // só pra liberar permissão
    } catch (err) {
      setError(`Sem permissão de microfone: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const text = (baseTextRef.current + final + interim).trim();
      transcriptRef.current = text;
      onTranscript(text, final.length > 0);
      // Quando terminar uma frase final, dispara envio automático se tinha interim já estável
      // Aqui só atualiza o texto — auto-send no onend
    };
    rec.onerror = (e: any) => {
      setError(`Erro de voz: ${e.error || "desconhecido"}`);
      stop();
    };
    rec.onend = () => {
      // Auto-envia se capturou algo
      const final = transcriptRef.current.trim();
      if (final) {
        onAutoSend(final);
      }
      setListening(false);
      baseTextRef.current = "";
      transcriptRef.current = "";
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      setError(`Falha ao iniciar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function stop() {
    try {
      recRef.current?.stop?.();
    } catch {}
    recRef.current = null;
  }

  function toggle() {
    if (disabled) return;
    if (listening) stop();
    else void start();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`flex items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
          className ?? "h-10 w-10 border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
        } ${
          listening
            ? "bg-red-500/20 text-red-300 animate-pulse"
            : "text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        }`}
        title={listening ? "Parar e enviar" : "Falar (pt-BR)"}
        aria-label={listening ? "Parar gravacao" : "Gravar audio"}
      >
        {listening ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="13" rx="3" />
            <path d="M19 10a7 7 0 0 1-14 0" />
            <line x1="12" y1="17" x2="12" y2="22" />
          </svg>
        )}
      </button>
      {error && (
        <div className={`absolute bottom-full right-0 mb-2 w-64 rounded-md border border-red-800 bg-red-950/95 px-3 py-2 text-[10px] text-red-200 shadow-lg z-50 ${errorClassName ?? ""}`}>
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

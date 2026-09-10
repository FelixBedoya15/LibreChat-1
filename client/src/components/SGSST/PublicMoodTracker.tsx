import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Smile, Meh, Frown, Send, CheckCircle, MessageSquare, Loader2, Building2, ChevronRight, AlertCircle, Heart } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

interface Message {
  sender: 'user' | 'agent';
  text: string;
}

const getDeviceId = (): string => {
  try {
    let devId = localStorage.getItem('wappy_mood_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      localStorage.setItem('wappy_mood_device_id', devId);
    }
    return devId;
  } catch {
    return 'dev_default';
  }
};

const getTodayDateStr = (): string => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function PublicMoodTracker() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<any>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [step, setStep] = useState<number>(1); // 1: Welcome/Mood, 2: Stressors/Option, 3: Chat, 4: Success
  const [alreadyReportedToday, setAlreadyReportedToday] = useState(false);

  // Form State
  const [department, setDepartment] = useState('');
  const [selectedMood, setSelectedMood] = useState<'happy' | 'neutral' | 'sad' | null>(null);
  const [telemetryId, setTelemetryId] = useState<string | null>(null);
  const [submittingMood, setSubmittingMood] = useState(false);

  // Stressors State
  const [selectedStressors, setSelectedStressors] = useState<string[]>([]);
  const stressorsList = [
    { id: 'sobrecarga', label: 'Sobrecarga de trabajo' },
    { id: 'liderazgo', label: 'Clima laboral / Relaciones' },
    { id: 'entorno', label: 'Entorno físico / Herramientas' },
    { id: 'personal', label: 'Asuntos personales / familiares' },
    { id: 'funciones', label: 'Falta de claridad en funciones' },
    { id: 'fatiga', label: 'Fatiga física o mental' },
  ];

  // Chat State
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>('Terapeuta en Salud Mental');
  const [agentModel, setAgentModel] = useState<string | undefined>(undefined);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [parentMessageId, setParentMessageId] = useState<string>('00000000-0000-0000-0000-000000000000');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const res = await axios.get(`/api/public-sgsst/company/${companyId}`);
        setCompany(res.data);

        // Verificar si ya se reportó hoy desde este dispositivo
        const targetId = res.data?._id || companyId;
        const lastReportDate = localStorage.getItem(`wappy_mood_last_date_${targetId}`);
        if (lastReportDate === getTodayDateStr()) {
          setAlreadyReportedToday(true);
        }
      } catch (error) {
        console.error('Error fetching company info:', error);
      } finally {
        setLoadingCompany(false);
      }
    };
    if (companyId) {
      fetchCompany();
    }
  }, [companyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleMoodSelect = async (mood: 'happy' | 'neutral' | 'sad') => {
    setSelectedMood(mood);
    setSubmittingMood(true);

    try {
      const targetCompanyId = company?._id || companyId;
      const deviceId = getDeviceId();
      const res = await axios.post(`/api/public-sgsst/mood/${targetCompanyId}`, {
        mood,
        department,
        deviceId,
      });

      if (res.data.success) {
        setTelemetryId(res.data.telemetryId);
        // Guardar fecha en almacenamiento local para prevenir duplicados hoy
        try {
          localStorage.setItem(`wappy_mood_last_date_${targetCompanyId}`, getTodayDateStr());
        } catch (e) {
          console.warn('Could not save to localStorage', e);
        }

        if (mood === 'happy') {
          // Happy bypasses stressors and chat, goes straight to success
          setStep(4);
        } else {
          setStep(2);
        }
      }
    } catch (error: any) {
      console.error('Error registering mood:', error);
      if (error.response?.data?.alreadyReportedToday || error.response?.status === 429) {
        const targetCompanyId = company?._id || companyId;
        try {
          localStorage.setItem(`wappy_mood_last_date_${targetCompanyId}`, getTodayDateStr());
        } catch (e) {}
        setAlreadyReportedToday(true);
      } else {
        alert(error.response?.data?.error || 'Hubo un error al registrar tu estado de ánimo. Por favor, intenta de nuevo.');
      }
    } finally {
      setSubmittingMood(false);
    }
  };

  const toggleStressor = (id: string) => {
    setSelectedStressors((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSkipChat = async () => {
    if (!telemetryId) return;

    try {
      await axios.post(`/api/public-sgsst/mood/update/${telemetryId}`, {
        stressors: selectedStressors,
        details: 'El trabajador prefirió no iniciar el chat interactivo.',
      });
      setStep(4);
    } catch (error) {
      console.error('Error updating telemetry:', error);
      setStep(4); // Non-blocking
    }
  };

  const handleStartChat = async () => {
    if (!companyId || !telemetryId) return;
    setStartingChat(true);
    setChatError(null);

    try {
      const targetCompanyId = company?._id || companyId;
      const res = await axios.post(`/api/public-sgsst/mood/chat/${targetCompanyId}`);
      if (res.data.success) {
        setChatToken(res.data.token);
        setAgentId(res.data.agentId);
        if (res.data.agentName) setAgentName(res.data.agentName);
        if (res.data.agentModel) setAgentModel(res.data.agentModel);
        setConversationId(res.data.conversationId);

        // Prepopulate first message from Specialist Agent
        setMessages([
          {
            sender: 'agent',
            text: 'Hola. Lamento escuchar que hoy te sientes estresado o cansado. Estoy aquí como tu Terapeuta Ocupacional y de Salud Mental para escucharte en un espacio 100% privado y anónimo. ¿Te gustaría contarme qué te preocupa o cómo te has sentido en el trabajo últimamente?',
          },
        ]);
        setStep(3);
      }
    } catch (error: any) {
      console.error('Error initializing chat:', error);
      const errMsg =
        error.response?.data?.error ||
        'No se pudo conectar con el Terapeuta. Por favor, intenta de nuevo o comunícate con el área de SST.';
      setChatError(errMsg);
    } finally {
      setStartingChat(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !chatToken || !agentId || !conversationId) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setIsTyping(true);

    // Generate a temporary response placeholder for streaming
    let agentMessageId = '';
    setMessages((prev) => [...prev, { sender: 'agent', text: '' }]);

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chatToken}`,
        },
        body: JSON.stringify({
          text: userText,
          conversationId,
          parentMessageId,
          endpoint: 'agents',
          agent_id: agentId,
          endpointOption: {
            endpoint: 'agents',
            agent: agentId,
            model: agentModel || 'gemini-3.7-flash',
          },
          isPublicChat: true,
        }),
      });

      if (!response.ok) {
        let errMessage = 'Error al comunicarse con el Terapeuta';
        try {
          const errData = await response.json();
          errMessage = errData.error || errData.message || errMessage;
        } catch (e) {}
        throw new Error(errMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(dataStr);

              // ── Error event ──────────────────────────────────────────────
              if (parsed.error && parsed.text) {
                let userFriendlyError = parsed.text;
                try {
                  const parsedErr = JSON.parse(parsed.text);
                  if (parsedErr.type === 'input_length') {
                    userFriendlyError = 'El mensaje es demasiado largo para ser procesado.';
                  } else if (parsedErr.type === 'google_error') {
                    userFriendlyError =
                      'El proveedor de IA (Google Gemini) está experimentando problemas o límites de cuota. Por favor, intenta de nuevo en unos minutos.';
                  }
                } catch {
                  // not JSON
                }
                accumulatedText = 'Lo siento, ha ocurrido un inconveniente: ' + userFriendlyError;
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0)
                    updated[updated.length - 1] = { sender: 'agent', text: accumulatedText };
                  return updated;
                });
                continue;
              }

              // ── Final message (LibreChat sends { final: true, responseMessage: {...} }) ──
              if (parsed.final) {
                const finalMsgId = parsed.responseMessage?.messageId;
                if (finalMsgId) setParentMessageId(finalMsgId);
                // Fallback: use responseMessage.text if no streaming text was received
                if (!accumulatedText && parsed.responseMessage?.text) {
                  accumulatedText = parsed.responseMessage.text;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated.length > 0)
                      updated[updated.length - 1] = { sender: 'agent', text: accumulatedText };
                    return updated;
                  });
                }
                continue;
              }

              // ── Determine the event type ─────────────────────────────────
              // LibreChat encodes the event name INSIDE the JSON as `parsed.event`,
              // not as a separate SSE `event:` header line.
              const eventType: string = parsed.event ?? '';

              if (eventType === 'on_message_delta') {
                // Nested under data.delta or directly under delta
                const content = parsed.data?.delta?.content ?? parsed.delta?.content;
                const textChunk = Array.isArray(content) ? content[0]?.text : content?.text;
                if (textChunk) {
                  accumulatedText += textChunk;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated.length > 0)
                      updated[updated.length - 1] = { sender: 'agent', text: accumulatedText };
                    return updated;
                  });
                }
              } else if (eventType === 'clear_step_maps') {
                accumulatedText = '';
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0)
                    updated[updated.length - 1] = { sender: 'agent', text: '' };
                  return updated;
                });
              } else if (eventType === 'finalMessage' || eventType === 'message') {
                // Some configurations deliver the full text here
                const finalText = parsed.text ?? parsed.data?.text;
                if (finalText && !accumulatedText) {
                  accumulatedText = finalText;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated.length > 0)
                      updated[updated.length - 1] = { sender: 'agent', text: accumulatedText };
                    return updated;
                  });
                }
                const msgId = parsed.messageId ?? parsed.data?.messageId;
                if (msgId) setParentMessageId(msgId);
              }
            } catch (e) {
              // Ignore parsing errors of incomplete/non-JSON lines
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in chat stream:', error);
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].text === '') {
          updated[updated.length - 1] = {
            sender: 'agent',
            text: 'Lo siento, he experimentado una interrupción en mi conexión. ¿Podrías volver a escribirme?',
          };
        }
        return updated;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleFinishChat = async () => {
    if (!telemetryId) return;

    try {
      // Calculate a brief context summary of the chat
      const chatDetails = messages
        .map((m) => `${m.sender === 'user' ? 'Trabajador' : 'Psicólogo'}: ${m.text}`)
        .join('\n')
        .slice(0, 1000); // Truncate to avoid large payloads

      await axios.post(`/api/public-sgsst/mood/update/${telemetryId}`, {
        stressors: selectedStressors,
        details: `Conversación anónima entablada. Resumen chat:\n${chatDetails}`,
      });
    } catch (error) {
      console.error('Error saving final chat summary:', error);
    } finally {
      setStep(4);
    }
  };

  if (loadingCompany) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center text-slate-800">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4 shadow-sm animate-pulse">
          <Shield className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold font-sans tracking-tight text-slate-900">Cargando Termómetro Psicosocial...</h2>
        <p className="text-slate-500 mt-2 text-xs">Conectando con el portal seguro y confidencial de tu empresa</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center text-slate-800">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle className="w-8 h-8 text-rose-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Enlace No Válido</h2>
        <p className="text-slate-500 mt-2 text-xs max-w-xs leading-relaxed">El código QR o enlace escaneado no corresponde a ninguna empresa activa en el sistema.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/20 to-slate-100 font-sans text-slate-800 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md p-3.5 shadow-xs">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company.logo ? (
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
                <img src={company.logo} alt={company.companyName} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-xs">
                <Shield className="h-5 w-5" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-xs">{company.companyName}</h1>
              <p className="text-[11px] text-emerald-600 font-semibold tracking-wide uppercase">Termómetro Psicosocial</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-3 py-1 flex items-center gap-1.5 shrink-0 shadow-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[10px] font-bold tracking-wide uppercase">100% Anónimo</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-5 max-w-md mx-auto w-full z-10 my-auto">
        
        {/* SCREEN: ALREADY REPORTED TODAY */}
        {alreadyReportedToday ? (
          <div className="w-full bg-white rounded-3xl border border-slate-200/80 p-7 text-center space-y-5 shadow-sm shadow-slate-200/50 animate-fadeIn">
            <div className="inline-flex p-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 shadow-xs">
              <CheckCircle className="w-12 h-12" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">¡Ya registraste tu reporte hoy!</h2>
              <p className="text-xs text-slate-500">Tu estado de ánimo fue recibido correctamente</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 leading-relaxed text-left space-y-3">
              <p>
                Para garantizar la objetividad y transparencia de las estadísticas de bienestar laboral de la empresa, solo se permite registrar un reporte al día desde este equipo.
              </p>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <span>✨</span>
                <span>¡Gracias por participar y cuidar tu salud mental! Podrás volver a registrarte mañana.</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* STEP 1: WELCOME & MOOD SELECT */}
            {step === 1 && (
              <div className="w-full bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-sm shadow-slate-200/50 space-y-6 animate-fadeIn">
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mb-1 shadow-xs">
                    <Heart className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-900">¿Cómo te sientes hoy?</h2>
                  <p className="text-xs text-slate-500 leading-relaxed px-2">
                    Queremos saber cómo estás. Tu respuesta es estrictamente anónima y ayuda a mejorar el clima laboral de tu organización.
                  </p>
                </div>

                {/* Department input */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    Área o Departamento (Opcional)
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Ej: Operaciones, Administración, Ventas..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium"
                  />
                </div>

                {/* Mood selector cards */}
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => handleMoodSelect('happy')}
                    disabled={submittingMood}
                    className="group relative flex items-center justify-between p-4 bg-emerald-50/50 hover:bg-emerald-50/90 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl text-left transition-all duration-200 shadow-xs hover:shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform">
                        <Smile className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-emerald-950">Feliz / Motivado</h3>
                        <p className="text-[11px] text-emerald-700 mt-0.5">Me siento valorado y con energía hoy.</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    onClick={() => handleMoodSelect('neutral')}
                    disabled={submittingMood}
                    className="group relative flex items-center justify-between p-4 bg-amber-50/50 hover:bg-amber-50/90 border-2 border-amber-200 hover:border-amber-400 rounded-2xl text-left transition-all duration-200 shadow-xs hover:shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform">
                        <Meh className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-amber-950">Tranquilo / Estable</h3>
                        <p className="text-[11px] text-amber-700 mt-0.5">Mi día transcurre con normalidad.</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    onClick={() => handleMoodSelect('sad')}
                    disabled={submittingMood}
                    className="group relative flex items-center justify-between p-4 bg-rose-50/50 hover:bg-rose-50/90 border-2 border-rose-200 hover:border-rose-400 rounded-2xl text-left transition-all duration-200 shadow-xs hover:shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-rose-500 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform">
                        <Frown className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-rose-950">Estresado / Agotado</h3>
                        <p className="text-[11px] text-rose-700 mt-0.5">Siento sobrecarga, cansancio o malestar.</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-rose-500 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>

                {submittingMood && (
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium pt-1">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    Registrando respuesta...
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: STRESSORS & CHAT OPTION */}
            {step === 2 && (
              <div className="w-full bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-sm shadow-slate-200/50 space-y-6 animate-fadeIn">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">¿Qué factores influyen hoy?</h2>
                  <p className="text-xs text-slate-500">
                    Selecciona las razones principales de tu estado de ánimo (opcional):
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {stressorsList.map((stressor) => {
                    const isSelected = selectedStressors.includes(stressor.id);
                    return (
                      <button
                        key={stressor.id}
                        onClick={() => toggleStressor(stressor.id)}
                        className={`p-3 text-left rounded-xl border text-xs font-semibold transition-all duration-200 ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {stressor.label}
                      </button>
                    );
                  })}
                </div>

                {/* Special Therapist Invitation Box */}
                <div className="p-5 bg-gradient-to-br from-emerald-50 via-teal-50/30 to-slate-50 border border-emerald-200/90 rounded-2xl space-y-4 shadow-xs">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Heart className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Terapeuta en Riesgo Psicosocial</h3>
                      <p className="text-xs text-slate-600 leading-relaxed mt-1">
                        ¿Quieres recibir pautas prácticas y desahogarte? Puedes chatear en privado con nuestro Terapeuta Especialista en Salud Mental y Riesgo Psicosocial. Nadie sabrá quién eres.
                      </p>
                    </div>
                  </div>

                  {chatError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800 animate-fadeIn shadow-xs">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold">{chatError}</p>
                        <p className="text-[11px] text-rose-600 mt-0.5">Puedes intentar conectarte de nuevo o continuar solo enviando tu reporte.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSkipChat}
                      disabled={startingChat}
                      className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition-all disabled:opacity-60"
                    >
                      Solo enviar reporte
                    </button>
                    <button
                      onClick={handleStartChat}
                      disabled={startingChat}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      {startingChat ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        <>
                          Hablar con un Terapeuta
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: PRIVATE CHAT */}
            {step === 3 && (
              <div className="w-full h-[78vh] flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-md animate-fadeIn">
                {/* Chat Header */}
                <div className="p-3.5 bg-emerald-700 text-white flex justify-between items-center shrink-0 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center font-bold text-sm text-white">
                      🧠
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white leading-tight">{agentName}</h3>
                      <p className="text-[10px] text-emerald-100 font-medium">Canal Confidencial y 100% Anónimo</p>
                    </div>
                  </div>
                  <button
                    onClick={handleFinishChat}
                    className="bg-white/15 hover:bg-white/25 border border-white/30 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    Terminar
                  </button>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50 scrollbar-thin">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                    >
                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          msg.sender === 'user'
                            ? 'bg-emerald-600 text-white rounded-tr-xs'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                        }`}
                      >
                        {msg.sender === 'user' ? (
                          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                        ) : (
                          msg.text ? (
                            <ReactMarkdown className="prose prose-slate text-xs max-w-none break-words prose-p:leading-relaxed prose-p:my-1 prose-headings:text-slate-900 prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0.5 whitespace-pre-wrap">
                              {msg.text}
                            </ReactMarkdown>
                          ) : (
                            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                              Escribiendo...
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                  {isTyping && messages[messages.length - 1]?.text !== '' && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-xs flex items-center gap-2 shadow-xs">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Escribe tu mensaje aquí..."
                    disabled={isTyping}
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white disabled:opacity-50 transition-all font-medium"
                  />
                  <button
                    type="submit"
                    disabled={isTyping || !inputText.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-xl disabled:opacity-50 transition-all flex items-center justify-center shrink-0 shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 4 && (
              <div className="w-full bg-white rounded-3xl border border-slate-200/80 p-7 text-center space-y-5 shadow-sm shadow-slate-200/50 animate-fadeIn">
                <div className="inline-flex p-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 mb-1 shadow-xs">
                  <CheckCircle className="w-12 h-12" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">¡Gracias por participar!</h2>
                  <p className="text-xs text-slate-500">Tu respuesta fue registrada con éxito</p>
                </div>
                
                <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-2xl p-5 text-xs text-slate-700 leading-relaxed max-w-sm mx-auto space-y-2">
                  {selectedMood === 'happy' ? (
                    <p>
                      Nos alegra mucho que te sientas feliz y motivado en el trabajo. Tu actitud positiva contribuye enormemente a construir un gran equipo. ¡Que tengas un excelente resto de jornada laboral!
                    </p>
                  ) : (
                    <p>
                      Tu reporte y tus comentarios han sido registrados con éxito de forma 100% confidencial. Esto nos sirve para proponer mejoras en la carga y el ambiente laboral de la organización. ¡Cuídate y recuerda que tu salud mental es lo primero!
                    </p>
                  )}
                </div>

                <div className="pt-1">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 font-semibold shadow-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Reporte diario completado. Podrás registrarte de nuevo mañana.</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-slate-200 bg-white text-center text-[10px] text-slate-400 shrink-0">
        En cumplimiento con la ética de Batería de Riesgo Psicosocial.
        <br />
        Desarrollado de forma segura por <span className="text-slate-600 font-semibold">WAPPY IA</span>
      </footer>
    </div>
  );
}

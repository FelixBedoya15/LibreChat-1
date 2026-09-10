import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Sparkles, MessageCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface AmbassadorPublicData {
  name: string;
  slug: string;
  phone?: string;
  phoneClean?: string;
  email?: string;
}

export default function AmbassadorLandingBanner() {
  const location = useLocation();
  const [ambassador, setAmbassador] = useState<AmbassadorPublicData | null>(null);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(location.search);
      let activeRef = (searchParams.get('ref') || searchParams.get('referral') || '').trim();

      if (!activeRef) {
        try {
          activeRef = (localStorage.getItem('wappy_ref') || '').trim();
        } catch (e) {}
      }

      if (!activeRef) {
        setAmbassador(null);
        return;
      }

      try {
        localStorage.setItem('wappy_ref', activeRef);
      } catch (e) {}

      const formatSlugName = (slugStr: string) => {
        return slugStr
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      };

      axios
        .get(`/api/referrals/public/ambassador-info/${encodeURIComponent(activeRef)}`)
        .then((res) => {
          if (res.data && res.data.name) {
            setAmbassador(res.data);
          } else {
            setAmbassador({
              name: formatSlugName(activeRef),
              slug: activeRef,
            });
          }
        })
        .catch(() => {
          setAmbassador({
            name: formatSlugName(activeRef),
            slug: activeRef,
          });
        });
    } catch (e) {
      console.warn('Error fetching ambassador public banner:', e);
    }
  }, [location.search]);

  if (!ambassador) return null;

  const isRegisterPage = location.pathname.includes('/register');

  const waUrl = ambassador.phoneClean
    ? `https://api.whatsapp.com/send?phone=${ambassador.phoneClean}&text=${encodeURIComponent(
        `Hola ${ambassador.name} 👋 Estoy conociendo WAPPY IA a través de tu enlace y me gustaría hacerte unas preguntas.`,
      )}`
    : null;

  return (
    <div className="mb-5 w-full max-w-md mx-auto animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-text-primary shadow-sm backdrop-blur-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:p-4.5">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-500/10 blur-xl dark:bg-emerald-500/20" />

        {/* Header Tag */}
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-emerald-500/15 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Invitación Especial Wappy IA</span>
          </div>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
            15 Días Gratis
          </span>
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <div className="text-xs text-text-secondary">
            Estás navegando por invitación de tu asesor comercial:
          </div>
          <div className="flex items-center gap-1.5 text-base font-bold text-text-primary">
            <span>{ambassador.name}</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          <div className="flex items-start gap-1.5 pt-1 text-xs text-text-secondary">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isRegisterPage
                ? 'Tu registro activará de inmediato los 15 días de prueba PRO con acceso total a Agentes y Herramientas.'
                : 'Crea tu cuenta gratuita hoy y recibe 15 días de prueba PRO con acompañamiento directo.'}
            </span>
          </div>
        </div>

        {/* WhatsApp Chat Button (Only if phone is available) */}
        {waUrl && (
          <div className="mt-3 border-t border-emerald-500/15 pt-2.5">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Chatear con mi Asesor</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export interface InspectionPhase {
    id: number;
    name: string;
    shortName: string;
    desc: string;
    focus: string;
}

export interface InspectionProtocol {
    id: 'biomecanico' | 'quimico' | 'pesv' | 'emergencias_electrico' | 'auditoria_gtc45';
    title: string;
    badgeText: string;
    methodLabel: string;
    normRef: string;
    themeColor: string;
    accentColor: string;
    phases: InspectionPhase[];
    perspectiveGuidance: {
        self: string;
        assisted: string;
    };
}

export const INSPECTION_PROTOCOLS: Record<string, InspectionProtocol> = {
    biomecanico: {
        id: 'biomecanico',
        title: 'Evaluación Biomecánica y Ergonómica',
        badgeText: 'Visión IA Biomecánica',
        methodLabel: 'RULA / REBA / OWAS',
        normRef: 'GTC 45 / Criterios Prevencionar',
        themeColor: 'cyan',
        accentColor: '#06b6d4',
        phases: [
            { id: 1, name: 'Fase 1: Postura Habitual', shortName: 'Fase 1: Habitual', desc: 'Línea base en ciclo continuo de trabajo', focus: 'Postura neutra y repetitiva' },
            { id: 2, name: 'Fase 2: Alcance Crítico', shortName: 'Fase 2: Alcance Máximo', desc: 'Punto más distante, flexión o torsión pico', focus: 'Máxima exigencia angular' },
            { id: 3, name: 'Fase 3: Postura Fatigada', shortName: 'Fase 3: Fatiga / Dinámica', desc: 'Colapso postural sostenido o manipulación', focus: 'Pérdida de curvatura o sobreesfuerzo' },
        ],
        perspectiveGuidance: {
            self: 'Ubica tu portátil a 45° en diagonal o retrocede tu silla para encuadrar cabeza, cuello, tronco y codos.',
            assisted: 'Ubícate en plano sagital estricto (perfil a 90°) a la altura de la cadera a 1.5 m de distancia.'
        }
    },
    quimico: {
        id: 'quimico',
        title: 'Inspección de Seguridad Química y SGA',
        badgeText: 'Inspección Química & SGA',
        methodLabel: 'SGA / Libro Púrpura / ONU',
        normRef: 'Dec. 1496/2018 / NTC 4435',
        themeColor: 'amber',
        accentColor: '#f59e0b',
        phases: [
            { id: 1, name: 'Fase 1: Rotulado y Pictogramas SGA', shortName: 'Fase 1: Rotulado SGA', desc: 'Etiqueta frontal, pictogramas de peligro y ONU', focus: 'Clasificación de peligros y FDS' },
            { id: 2, name: 'Fase 2: Contención y Diques Antiderrames', shortName: 'Fase 2: Contención / Diques', desc: 'Bandejas de retención y estado del envase', focus: 'Prevención de fugas y corrosión' },
            { id: 3, name: 'Fase 3: Compatibilidad y Emergencias', shortName: 'Fase 3: Compatibilidad / Kit', desc: 'Reactivos vecinos, ducha lavaojos y kit', focus: 'Almacenamiento y respuesta rápida' },
        ],
        perspectiveGuidance: {
            self: 'Apoya el portátil en mesa segura y acerca el envase a la cámara enfocando etiqueta y tapa.',
            assisted: 'Recorre con el celular la estantería manteniendo encuadre nítido de etiquetas y bandejas de derrame.'
        }
    },
    pesv: {
        id: 'pesv',
        title: 'Inspección Preoperacional Vehicular PESV',
        badgeText: 'Preoperacional PESV Vial',
        methodLabel: 'Paso 13 PESV',
        normRef: 'Res. 20223040040595 / Ley 769',
        themeColor: 'emerald',
        accentColor: '#10b981',
        phases: [
            { id: 1, name: 'Fase 1: Cabina, Mandos y Visibilidad', shortName: 'Fase 1: Cabina / Luces', desc: 'Testigos en tablero, cinturón, espejos y plumillas', focus: 'Puesto de conducción seguro' },
            { id: 2, name: 'Fase 2: Tren de Rodaje y Neumáticos', shortName: 'Fase 2: Neumáticos / Rines', desc: 'Profundidad de labrado, rines y luces exteriores', focus: 'Adherencia e integridad estructural' },
            { id: 3, name: 'Fase 3: Kit de Carretera y Fluidos', shortName: 'Fase 3: Kit / Fluidos', desc: 'Extintor vigente, conos, botiquín y niveles', focus: 'Elementos reglamentarios y motor' },
        ],
        perspectiveGuidance: {
            self: 'Monta el celular en el soporte de cabina para verificar testigos, espejos y mandos interiores.',
            assisted: 'Realiza el recorrido 360° exterior con el teléfono enfocando llantas, luces y equipo de carretera.'
        }
    },
    emergencias_electrico: {
        id: 'emergencias_electrico',
        title: 'Inspección de Equipos Críticos y Emergencias',
        badgeText: 'Inspección Equipos Críticos',
        methodLabel: 'NFPA 10 / RETIE / NTC',
        normRef: 'NFPA 10 / RETIE / Res. 2400',
        themeColor: 'rose',
        accentColor: '#f43f5e',
        phases: [
            { id: 1, name: 'Fase 1: Ubicación, Señalización y Acceso', shortName: 'Fase 1: Acceso / Despeje', desc: 'Despeje a 1 metro, altura y señalización', focus: 'Accesibilidad inmediata sin obstáculos' },
            { id: 2, name: 'Fase 2: Integridad Técnica y Componentes', shortName: 'Fase 2: Estado / Manómetro', desc: 'Manómetro en verde, precinto, pasador y puesta a tierra', focus: 'Presión y funcionalidad operativa' },
            { id: 3, name: 'Fase 3: Tarjeta y Vigencia de Mantenimiento', shortName: 'Fase 3: Tarjeta / Vigencia', desc: 'Fecha de última recarga y prueba hidrostática', focus: 'Cumplimiento normativo periódico' },
        ],
        perspectiveGuidance: {
            self: 'Ubica la cámara fija a 2 metros mostrando el equipo y su zona de demarcación perimetral.',
            assisted: 'Acerca el smartphone al manómetro y pasador de seguridad para verificar sellos y aguja.'
        }
    },
    auditoria_gtc45: {
        id: 'auditoria_gtc45',
        title: 'Auditoría de Seguridad y Condiciones Locativas',
        badgeText: 'Auditoría SST / GTC 45',
        methodLabel: 'GTC 45 / ISO 45001 / 5S',
        normRef: 'Dec. 1072/2015 / Res. 0312',
        themeColor: 'blue',
        accentColor: '#3b82f6',
        phases: [
            { id: 1, name: 'Fase 1: Panorama General y 5S Locativo', shortName: 'Fase 1: Orden / 5S', desc: 'Pasillos despejados, delimitación y orden general', focus: 'Condiciones de base del entorno' },
            { id: 2, name: 'Fase 2: Fuentes de Peligro y Actos Inseguros', shortName: 'Fase 2: Puntos Críticos', desc: 'Pisos resbalosos, cables expuestos o maquinaria', focus: 'Peligros inminentes de accidente' },
            { id: 3, name: 'Fase 3: Protecciones Colectivas y Uso de EPP', shortName: 'Fase 3: EPP / Guardas', desc: 'Uso de EPP requerido y guardas de seguridad', focus: 'Barreras de control y protección' },
        ],
        perspectiveGuidance: {
            self: 'Muestra tu puesto completo desde una posición abierta para revisar espacio y cableado.',
            assisted: 'Transita el área de trabajo paneando pasillos, frentes de máquina y puestos del personal.'
        }
    }
};

/**
 * Resolve the inspection protocol family based on agent name or specialty string
 */
export function resolveInspectionProtocol(agentNameOrSpecialty?: string | null): InspectionProtocol {
    if (!agentNameOrSpecialty) {
        return INSPECTION_PROTOCOLS.biomecanico;
    }

    const name = agentNameOrSpecialty.toLowerCase();

    // 1. Biomechanics family
    if (
        name.includes('fisioterapeuta') ||
        name.includes('biomec') ||
        name.includes('ergon') ||
        name.includes('rosa') ||
        name.includes('puesto de trabajo (ipt)')
    ) {
        return INSPECTION_PROTOCOLS.biomecanico;
    }

    // 2. Chemical family
    if (
        name.includes('químic') ||
        name.includes('quimic') ||
        name.includes('sga') ||
        name.includes('sustancias') ||
        name.includes('reactivos') ||
        name.includes('ambiental')
    ) {
        return INSPECTION_PROTOCOLS.quimico;
    }

    // 3. Road safety / PESV family
    if (
        name.includes('vial') ||
        name.includes('pesv') ||
        name.includes('vehicular') ||
        name.includes('tránsito') ||
        name.includes('transito') ||
        name.includes('conductor')
    ) {
        return INSPECTION_PROTOCOLS.pesv;
    }

    // 4. Emergencies, Electrical, High Risk, Heights
    if (
        name.includes('emergencia') ||
        name.includes('extintor') ||
        name.includes('eléctric') ||
        name.includes('electric') ||
        name.includes('retie') ||
        name.includes('alto riesgo') ||
        name.includes('altura') ||
        name.includes('tsa') ||
        name.includes('primeros auxilios') ||
        name.includes('minería') ||
        name.includes('mineria')
    ) {
        return INSPECTION_PROTOCOLS.emergencias_electrico;
    }

    // 5. Default: General Safety Audit GTC 45 / 5S
    return INSPECTION_PROTOCOLS.auditoria_gtc45;
}

// Backward compatibility export
export const ERGONOMIC_PHASES = INSPECTION_PROTOCOLS.biomecanico.phases;

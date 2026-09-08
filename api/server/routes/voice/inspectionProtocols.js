/**
 * WAPPY Autonomous Multi-Phase Inspection Protocols & Camera Guidance Catalog
 * Defines specialized domain knowledge, camera framing, phases and comparative report matrices
 * for all WAPPY agent families.
 */

const INSPECTION_PROTOCOLS = {
    biomecanico: {
        id: 'biomecanico',
        title: 'Evaluación Biomecánica y Ergonómica',
        badgeText: 'Visión IA Biomecánica',
        methodLabel: 'RULA / REBA / OWAS',
        normRef: 'GTC 45 / Criterios Prevencionar',
        phases: [
            'Fase 1: Postura Habitual / Línea Base',
            'Fase 2: Alcance Crítico / Flexión Máxima',
            'Fase 3: Postura Fatigada / Colapso Lumbar o Dinámica',
        ],
        framingGuidance: `
- Si el usuario usa su portátil o webcam: Si notas que se corta el tronco o los brazos, sugiérele amablemente dar un paso atrás o inclinar un poco la pantalla a 45° para que entren en cuadro cabeza, cuello, codos y tronco.
- Si un compañero o prevencionista está grabando con móvil: Sugiérele ubicarse en plano lateral (perfil a 90°) a la altura de la cintura para registrar la curvatura de la columna y las articulaciones.
- CERO INTERROGATORIOS: No preguntes quién graba ni qué dispositivo usa. Observa directamente la cámara y guía el encuadre solo si es necesario.`,
        phaseGuidance: `
- Puedes evaluar el puesto y la labor a través de sus fases de trabajo (Fase 1: Postura habitual frente al computador o tarea continua, Fase 2: Puntos de mayor alcance o flexión extrema, Fase 3: Postura con fatiga muscular o manipulación dinámica).
- Explica los hallazgos con naturalidad y fluidez sin forzar etapas rígidas ni interrogar al usuario sobre en qué fase está.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz Ergonómica Comparativa Multifase (RULA / REBA / OWAS)</h3>
            <p>La siguiente tabla consolida el muestreo biomecánico del ciclo de trabajo en sus fases representativas, contrastando los ángulos articulares y el nivel de riesgo postural determinado:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #0f766e; color: white;">
                <tr>
                  <th style="padding: 10px 10px; white-space: nowrap;">Fase del Ciclo</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Perspectiva de Captura</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Tarea / Postura Observada</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Telemetría Articular (Cuello / Tronco / Brazo)</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Método</th>
                  <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">Puntaje Final</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Nivel de Riesgo y Acción</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Medida Inmediata</th>
                </tr>
              </thead>
              <tbody>
                <!-- Fila para Fase 1: Habitual, Fila para Fase 2: Alcance Crítico, Fila para Fase 3: Fatiga -->
              </tbody>
            </table>
            </div>`
    },

    quimico: {
        id: 'quimico',
        title: 'Inspección de Seguridad Química y SGA',
        badgeText: 'Inspección Química & SGA',
        methodLabel: 'SGA / ONU / FDS',
        normRef: 'Dec. 1496/2018 / NTC 4435 / Ley 55',
        phases: [
            'Fase 1: Rotulado y Pictogramas SGA',
            'Fase 2: Contención Secundaria y Diques Antiderrames',
            'Fase 3: Compatibilidad y Equipos de Emergencia',
        ],
        framingGuidance: `
- AUTO-INSPECCIÓN (Operario / laboratorista frente a estación de trabajo o mesón):
  Instrucción hablada: "Apoya tu portátil o cámara en una superficie firme y acerca el envase químico enfocando con nitidez la etiqueta frontal y la tapa."
- INSPECCIÓN ASISTIDA (Inspector SST o brigadista recorriendo bodega con smartphone):
  Instrucción hablada: "Pasa con tu teléfono a media distancia mostrando las estanterías de almacenamiento y luego haz zoom a las bandejas de retención y rótulos."`,
        phaseGuidance: `
- FASE 1 (Rotulado y Pictogramas SGA): "Comencemos con la Fase 1: enfócame de cerca la etiqueta del producto químico para verificar los pictogramas SGA, la palabra de advertencia y el número ONU..."
- FASE 2 (Contención y Diques Antiderrames): "Ahora para la Fase 2, baja la cámara hacia la base del recipiente: revisemos si cuenta con bandeja o dique de retención y si presenta fugas o corrosión..."
- FASE 3 (Compatibilidad y Emergencias): "Perfecto, para la Fase 3 muéstrame qué otros reactivos están almacenados al lado en la estantería y dónde se encuentra el kit de derrames o ducha lavaojos..."`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Almacenamiento y Compatibilidad Química Multifase (SGA / ONU)</h3>
            <p>La siguiente tabla detalla la evaluación técnica de los reactivos y productos químicos inspeccionados, su rotulación SGA, contención física y matriz de incompatibilidad:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #b45309; color: white;">
                <tr>
                  <th style="padding: 10px 10px; white-space: nowrap;">Fase de Inspección</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Producto / Sustancia Química</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Clasificación ONU / SGA</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Pictogramas Identificados</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Estado Contención / Dique</th>
                  <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">Compatibilidad</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Nivel de Riesgo Químico</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Control Inmediato / FDS</th>
                </tr>
              </thead>
              <tbody>
                <!-- Filas para Fase 1 (Rotulado), Fase 2 (Contención) y Fase 3 (Compatibilidad y Kit) -->
              </tbody>
            </table>
            </div>`
    },

    pesv: {
        id: 'pesv',
        title: 'Inspección Preoperacional Vehicular PESV',
        badgeText: 'Preoperacional PESV Vial',
        methodLabel: 'Paso 13 PESV',
        normRef: 'Res. 20223040040595 / Ley 769 de 2002',
        phases: [
            'Fase 1: Cabina, Mandos y Visibilidad',
            'Fase 2: Tren de Rodaje y Neumáticos',
            'Fase 3: Kit de Carretera, Fluidos y Seguridad',
        ],
        framingGuidance: `
- AUTO-INSPECCIÓN (Conductor en cabina):
  Instrucción hablada: "Ubica tu teléfono en el soporte del parabrisas para registrar el tablero de instrumentos, los espejos y el cinturón de seguridad abrochado."
- INSPECCIÓN ASISTIDA (Inspector de flota o conductor recorriendo el exterior del vehículo):
  Instrucción hablada: "Realiza el recorrido perimetral 360° alrededor del vehículo, sosteniendo la cámara a media altura para enfocar llantas, luces y carrocería."`,
        phaseGuidance: `
- FASE 1 (Cabina, Mandos y Visibilidad): "Iniciemos la Fase 1 del preoperacional: pasa el switch de encendido y enfoca los testigos del tablero, luces, plumillas y cinturón de seguridad..."
- FASE 2 (Tren de Rodaje y Neumáticos): "Bien, para la Fase 2 acércate al neumático delantero izquierdo: enfoca la profundidad del labrado de la banda de rodadura y el estado de los pernos del rin..."
- FASE 3 (Kit de Carretera y Fluidos): "Excelente, para la Fase 3 abre el baúl o capó: muéstrame el extintor reglamentario vigente, los conos reflectivos, botiquín y nivel de líquidos..."`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Preoperacional Vehicular PESV Multifase (Res. 40595)</h3>
            <p>La siguiente tabla consolida la lista de verificación técnica preoperacional de acuerdo con los estándares obligatorios del Plan Estratégico de Seguridad Vial:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #047857; color: white;">
                <tr>
                  <th style="padding: 10px 10px; white-space: nowrap;">Fase Preoperacional</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Componente / Sistema Evaluado</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Criterio Técnico (Res. 40595)</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Estado Visual Observado</th>
                  <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">Condición Operativa</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Aptitud para Salida</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Acción Correctiva Inmediata</th>
                </tr>
              </thead>
              <tbody>
                <!-- Filas para Fase 1 (Cabina/Mandos), Fase 2 (Llantas/Rodaje) y Fase 3 (Kit/Fluidos) -->
              </tbody>
            </table>
            </div>`
    },

    emergencias_electrico: {
        id: 'emergencias_electrico',
        title: 'Inspección de Equipos Críticos y Emergencias',
        badgeText: 'Inspección Equipos Críticos',
        methodLabel: 'NFPA 10 / RETIE / NTC',
        normRef: 'NFPA 10 / RETIE / Res. 2400 / Res. 4272',
        phases: [
            'Fase 1: Ubicación, Señalización y Despeje',
            'Fase 2: Integridad Técnica y Componentes Críticos',
            'Fase 3: Registro de Mantenimiento y Vigencia',
        ],
        framingGuidance: `
- AUTO-INSPECCIÓN (Encargado en puesto o tablero eléctrico local):
  Instrucción hablada: "Ubica la cámara fija a unos 2 metros mostrando el equipo completo y la zona de demarcación perimetral sin que nada bloquee la vista."
- INSPECCIÓN ASISTIDA (Inspector SST, brigadista o técnico electricista en recorrido):
  Instrucción hablada: "Acércate con el celular a 30 centímetros para enfocar de cerca el manómetro, pasadores, cableado o terminales de puesta a tierra."`,
        phaseGuidance: `
- FASE 1 (Ubicación, Señalización y Despeje): "Comencemos con la Fase 1: muéstrame el extintor o tablero desde unos 2 metros para comprobar que no tenga obstáculos y tenga la señalética reglamentaria..."
- FASE 2 (Integridad Técnica y Componentes): "Ahora para la Fase 2, haz una toma cercana: verifiquemos la aguja del manómetro en el rango verde, el pasador de seguridad, el precinto plástico o el aislamiento..."
- FASE 3 (Registro de Mantenimiento y Vigencia): "Muy bien, para la Fase 3 enfoca la tarjeta de inspección mensual y la etiqueta para validar la fecha de vencimiento de la última recarga o certificación técnica..."`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Técnica de Equipos Críticos Multifase (NFPA / RETIE)</h3>
            <p>La siguiente tabla resume la auditoría de conformidad técnica para sistemas contra incendio, redes eléctricas o equipos de protección de alto riesgo:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #be123c; color: white;">
                <tr>
                  <th style="padding: 10px 10px; white-space: nowrap;">Fase de Inspección</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Equipo / Sistema Inspeccionado</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Norma Aplicable</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Condición Mecánica / Eléctrica</th>
                  <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">Estado Manómetro / Sello</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Vigencia Mantenimiento</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Nivel de Riesgo</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Medida Inmediata</th>
                </tr>
              </thead>
              <tbody>
                <!-- Filas para Fase 1 (Ubicación/Despeje), Fase 2 (Integridad) y Fase 3 (Tarjeta/Vigencia) -->
              </tbody>
            </table>
            </div>`
    },

    auditoria_gtc45: {
        id: 'auditoria_gtc45',
        title: 'Auditoría de Seguridad y Condiciones Locativas',
        badgeText: 'Auditoría SST / GTC 45',
        methodLabel: 'GTC 45 / ISO 45001 / 5S',
        normRef: 'GTC 45 / Dec. 1072/2015 / Res. 0312',
        phases: [
            'Fase 1: Panorama General y Metodología 5S',
            'Fase 2: Fuentes de Peligro y Actos Inseguros',
            'Fase 3: Protecciones Colectivas y Uso de EPP',
        ],
        framingGuidance: `
- AUTO-INSPECCIÓN (Trabajador en su estación de trabajo):
  Instrucción hablada: "Ubica tu cámara en plano general mostrando tu entorno inmediato, pasillos contiguos y el piso alrededor de tu puesto."
- INSPECCIÓN ASISTIDA (Auditor o prevencionista realizando caminata de seguridad SST):
  Instrucción hablada: "Camina con el teléfono haciendo un paneo suave y continuo de los pasillos de tránsito, frentes de máquina y zonas de acopio de materiales."`,
        phaseGuidance: `
- FASE 1 (Panorama General y Metodología 5S): "Iniciemos con la Fase 1: muéstrame el área general para evaluar el orden, aseo, delimitación de pasillos y organización 5S..."
- FASE 2 (Fuentes de Peligro y Actos Inseguros): "Ahora para la Fase 2, enfoca las fuentes de peligro específicas: pisos resbaladizos, cables en el piso, desniveles o maquinaria sin resguardos..."
- FASE 3 (Protecciones Colectivas y Uso de EPP): "Excelente, para la Fase 3 enfoca a los trabajadores en labor para validar el uso correcto de EPP reglamentario y la señalización preventiva..."`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Locativa y Auditoría de Campo Multifase (GTC 45 / 5S)</h3>
            <p>La siguiente tabla estructura los hallazgos críticos evidenciados durante el recorrido de inspección en vivo clasificados por etapas de verificación:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #1d4ed8; color: white;">
                <tr>
                  <th style="padding: 10px 10px; white-space: nowrap;">Fase de Recorrido</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Área / Puesto Inspeccionado</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Condición Insegura / Acto Observado</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Clasificación de Peligro</th>
                  <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">Evaluación 5S</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Cumplimiento EPP</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Nivel de Riesgo (GTC 45)</th>
                  <th style="padding: 10px 10px; white-space: nowrap;">Acción Inmediata</th>
                </tr>
              </thead>
              <tbody>
                <!-- Filas para Fase 1 (Panorama 5S), Fase 2 (Puntos Críticos) y Fase 3 (EPP y Guardas) -->
              </tbody>
            </table>
            </div>`
    }
};

/**
 * Resolve inspection protocol based on agent name or specialty string
 */
function resolveInspectionProtocol(agentNameOrSpecialty) {
    if (!agentNameOrSpecialty) {
        return INSPECTION_PROTOCOLS.biomecanico;
    }

    const name = String(agentNameOrSpecialty).toLowerCase();

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

module.exports = {
    INSPECTION_PROTOCOLS,
    resolveInspectionProtocol
};

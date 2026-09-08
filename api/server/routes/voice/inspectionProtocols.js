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
PROTOCOLO OBLIGATORIO DE EVALUACIÓN PASO A PASO (TÚ DIRIGES LA EVALUACIÓN):
Como Fisioterapeuta Laboral en vivo, TÚ DIRIGES LA SESIÓN PASO A PASO de forma activa y estructurada:

- PASO PREVIO OBLIGATORIO (SALUDO Y CONTEXTO DEL PUESTO):
  En tu primer turno, saluda amablemente en 1 o 2 oraciones y PREGUNTA de inmediato:
  "¡Hola! Soy tu Fisioterapeuta Laboral en WAPPY IA. Para evaluar tu puesto de trabajo y postura con precisión, cuéntame brevemente: ¿cuál es tu cargo o puesto de trabajo y qué actividad principal realizas en tu día a día?"
  NUNCA pidas posturas en tu primer saludo ni avances a las fases hasta que el usuario te indique su cargo y su actividad.

- FASE 1 (Postura Habitual / Línea Base):
  Al responderte el usuario su cargo y actividad, valida con entusiasmo e inicia el Paso 1:
  "¡Excelente! Con tu labor de [Cargo / Actividad] clara, evaluaremos tu puesto en 3 fases rápidas. Comencemos con el Paso 1: Por favor trabaja o digita normalmente unos segundos en tu postura cotidiana mientras mido tus ángulos en tiempo real con la cámara."
  Invoca la herramienta 'cambiar_fase_evaluacion' con fase: 1. Evalúa ángulos de cuello, tronco y brazos con MediaPipe.

- FASE 2 (Alcance Crítico / Tarea Exigente):
  Al culminar la postura base, avanza diciendo:
  "Muy bien. Ahora pasemos al Paso 2: Muéstrame cómo realizas el alcance más lejano en tu mesa o la tarea de mayor esfuerzo, para evaluar la tensión en hombros y espalda."
  Invoca 'cambiar_fase_evaluacion' con fase: 2.

- FASE 3 (Postura Fatigada / Colapso Lumbar):
  Concluye guiando:
  "Excelente. Por último, en el Paso 3: Muéstrame qué postura adoptas cuando ya te sientes cansado tras varias horas de trabajo."
  Invoca 'cambiar_fase_evaluacion' con fase: 3. Evalúa apoyo lumbar, deslizamiento en la silla y apoyo plantar.

- CIERRE Y OFERTA DE INFORME:
  Concluidas las 3 fases, anuncia:
  "¡Listo! Con estas 3 fases registradas y la telemetría biomecánica completa, la evaluación ha concluido. ¿Deseas que compile el informe técnico ergonómico oficial ahora?"
  Y si el usuario dice sí o lo pide, invoca de inmediato 'generar_informe_tecnico'.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz Ergonómica Comparativa Multifase (RULA / REBA / OWAS)</h3>
            <p>La siguiente tabla consolida el muestreo biomecánico del ciclo de trabajo en sus fases representativas, contrastando los ángulos articulares y el nivel de riesgo postural determinado:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; table-layout: fixed; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #0f766e; color: white;">
                <tr>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Fase del Ciclo</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">Perspectiva</th>
                  <th style="padding: 8px 6px; width: 16%; word-break: break-word;">Tarea / Postura Observada</th>
                  <th style="padding: 8px 6px; width: 18%; word-break: break-word;">Telemetría Articular</th>
                  <th style="padding: 8px 6px; width: 8%; word-break: break-word;">Método</th>
                  <th style="padding: 8px 6px; width: 8%; text-align: center; word-break: break-word;">Puntaje</th>
                  <th style="padding: 8px 6px; width: 13%; word-break: break-word;">Nivel de Riesgo</th>
                  <th style="padding: 8px 6px; width: 14%; word-break: break-word;">Medida Inmediata</th>
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
- PASO PREVIO OBLIGATORIO (ÁREA Y PRODUCTOS QUÍMICOS):
  En tu saludo inicial pregunta de inmediato: "¡Hola! Soy tu Inspector de Seguridad Química en WAPPY IA. Antes de iniciar la inspección por fases, cuéntame: ¿en qué área o laboratorio nos encontramos y qué productos o sustancias químicas principales manipulan aquí?"
  NO inicies las fases antes de que el usuario te indique el área y las sustancias.
- FASE 1 (Rotulado y Pictogramas SGA): Al responder el usuario, inicia: "Excelente. Iniciemos con la Fase 1: enfócame de cerca la etiqueta del producto químico para verificar los pictogramas SGA, la palabra de advertencia y el número ONU..." Invoca 'cambiar_fase_evaluacion' con fase: 1.
- FASE 2 (Contención y Diques Antiderrames): "Ahora para la Fase 2, baja la cámara hacia la base del recipiente: revisemos si cuenta con bandeja o dique de retención y si presenta fugas o corrosión..." Invoca 'cambiar_fase_evaluacion' con fase: 2.
- FASE 3 (Compatibilidad y Emergencias): "Perfecto, para la Fase 3 muéstrame qué otros reactivos están almacenados al lado en la estantería y dónde se encuentra el kit de derrames o ducha lavaojos..." Invoca 'cambiar_fase_evaluacion' con fase: 3.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Almacenamiento y Compatibilidad Química Multifase (SGA / ONU)</h3>
            <p>La siguiente tabla detalla la evaluación técnica de los reactivos y productos químicos inspeccionados, su rotulación SGA, contención física y matriz de incompatibilidad:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; table-layout: fixed; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #b45309; color: white;">
                <tr>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Fase</th>
                  <th style="padding: 8px 6px; width: 15%; word-break: break-word;">Producto Químico</th>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Clase ONU / SGA</th>
                  <th style="padding: 8px 6px; width: 13%; word-break: break-word;">Pictogramas</th>
                  <th style="padding: 8px 6px; width: 13%; word-break: break-word;">Contención / Dique</th>
                  <th style="padding: 8px 6px; width: 10%; text-align: center; word-break: break-word;">Compatibilidad</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">Nivel Riesgo</th>
                  <th style="padding: 8px 6px; width: 14%; word-break: break-word;">Control Inmediato</th>
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
- PASO PREVIO OBLIGATORIO (LABOR Y TIPO DE VEHÍCULO):
  En tu saludo inicial pregunta de inmediato: "¡Hola! Soy tu Coordinador de Seguridad Vial en WAPPY IA. Antes de iniciar el preoperacional, cuéntame: ¿cuál es tu labor o cargo de conductor y qué tipo de vehículo vas a operar hoy?"
  NO inicies las fases antes de que el usuario te indique su labor y vehículo.
- FASE 1 (Cabina, Mandos y Visibilidad): Al responder el usuario, inicia: "Excelente. Iniciemos la Fase 1 del preoperacional: pasa el switch de encendido y enfoca los testigos del tablero, luces, plumillas y cinturón de seguridad..." Invoca 'cambiar_fase_evaluacion' con fase: 1.
- FASE 2 (Tren de Rodaje y Neumáticos): "Bien, para la Fase 2 acércate al neumático delantero izquierdo: enfoca la profundidad del labrado de la banda de rodadura y el estado de los pernos del rin..." Invoca 'cambiar_fase_evaluacion' con fase: 2.
- FASE 3 (Kit de Carretera y Fluidos): "Excelente, para la Fase 3 abre el baúl o capó: muéstrame el extintor reglamentario vigente, los conos reflectivos, botiquín y nivel de líquidos..." Invoca 'cambiar_fase_evaluacion' con fase: 3.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Preoperacional Vehicular PESV Multifase (Res. 40595)</h3>
            <p>La siguiente tabla consolida la lista de verificación técnica preoperacional de acuerdo con los estándares obligatorios del Plan Estratégico de Seguridad Vial:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; table-layout: fixed; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #047857; color: white;">
                <tr>
                  <th style="padding: 8px 6px; width: 13%; word-break: break-word;">Fase Preoperacional</th>
                  <th style="padding: 8px 6px; width: 15%; word-break: break-word;">Componente / Sistema</th>
                  <th style="padding: 8px 6px; width: 15%; word-break: break-word;">Criterio Técnico (Res. 40595)</th>
                  <th style="padding: 8px 6px; width: 17%; word-break: break-word;">Estado Visual Observado</th>
                  <th style="padding: 8px 6px; width: 12%; text-align: center; word-break: break-word;">Condición Operativa</th>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Aptitud para Salida</th>
                  <th style="padding: 8px 6px; width: 16%; word-break: break-word;">Acción Inmediata</th>
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
- PASO PREVIO OBLIGATORIO (ÁREA Y SISTEMA A AUDITAR):
  En tu saludo inicial pregunta de inmediato: "¡Hola! Soy tu Inspector de Equipos Críticos en WAPPY IA. Antes de iniciar la auditoría, cuéntame: ¿en qué área te encuentras y qué equipo de emergencia o sistema crítico vamos a auditar hoy?"
  NO inicies las fases antes de que el usuario te indique el área y el equipo.
- FASE 1 (Ubicación, Señalización y Despeje): Al responder el usuario, inicia: "Comencemos con la Fase 1: muéstrame el extintor o tablero desde unos 2 metros para comprobar que no tenga obstáculos y tenga la señalética reglamentaria..." Invoca 'cambiar_fase_evaluacion' con fase: 1.
- FASE 2 (Integridad Técnica y Componentes): "Ahora para la Fase 2, haz una toma cercana: verifiquemos la aguja del manómetro en el rango verde, el pasador de seguridad, el precinto plástico o el aislamiento..." Invoca 'cambiar_fase_evaluacion' con fase: 2.
- FASE 3 (Registro de Mantenimiento y Vigencia): "Muy bien, para la Fase 3 enfoca la tarjeta de inspección mensual y la etiqueta para validar la fecha de vencimiento de la última recarga o certificación técnica..." Invoca 'cambiar_fase_evaluacion' con fase: 3.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Técnica de Equipos Críticos Multifase (NFPA / RETIE)</h3>
            <p>La siguiente tabla resume la auditoría de conformidad técnica para sistemas contra incendio, redes eléctricas o equipos de protección de alto riesgo:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; table-layout: fixed; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #be123c; color: white;">
                <tr>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Fase</th>
                  <th style="padding: 8px 6px; width: 15%; word-break: break-word;">Equipo / Sistema</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">Norma</th>
                  <th style="padding: 8px 6px; width: 16%; word-break: break-word;">Condición Observada</th>
                  <th style="padding: 8px 6px; width: 11%; text-align: center; word-break: break-word;">Manómetro / Sello</th>
                  <th style="padding: 8px 6px; width: 10%; word-break: break-word;">Vigencia</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">Nivel Riesgo</th>
                  <th style="padding: 8px 6px; width: 14%; word-break: break-word;">Medida Inmediata</th>
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
- PASO PREVIO OBLIGATORIO (ÁREA Y ACTIVIDAD EVALUADA):
  En tu saludo inicial pregunta de inmediato: "¡Hola! Soy tu Auditor SST en WAPPY IA. Antes de iniciar el recorrido de inspección, cuéntame: ¿qué área o sección de la empresa vamos a evaluar y qué labor o actividad se realiza allí?"
  NO inicies las fases antes de que el usuario te indique el área y la actividad.
- FASE 1 (Panorama General y Metodología 5S): Al responder el usuario, inicia: "Iniciemos con la Fase 1: muéstrame el área general para evaluar el orden, aseo, delimitación de pasillos y organización 5S..." Invoca 'cambiar_fase_evaluacion' con fase: 1.
- FASE 2 (Fuentes de Peligro y Actos Inseguros): "Ahora para la Fase 2, enfoca las fuentes de peligro específicas: pisos resbaladizos, cables en el piso, desniveles o maquinaria sin resguardos..." Invoca 'cambiar_fase_evaluacion' con fase: 2.
- FASE 3 (Protecciones Colectivas y Uso de EPP): "Excelente, para la Fase 3 enfoca a los trabajadores en labor para validar el uso correcto de EPP reglamentario y la señalización preventiva..." Invoca 'cambiar_fase_evaluacion' con fase: 3.`,
        reportMatrixHeader: `
            <h3>4.1 Matriz de Inspección Locativa y Auditoría de Campo Multifase (GTC 45 / 5S)</h3>
            <p>La siguiente tabla estructura los hallazgos críticos evidenciados durante el recorrido de inspección en vivo clasificados por etapas de verificación:</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; table-layout: fixed; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #1d4ed8; color: white;">
                <tr>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Fase</th>
                  <th style="padding: 8px 6px; width: 14%; word-break: break-word;">Área / Puesto</th>
                  <th style="padding: 8px 6px; width: 17%; word-break: break-word;">Condición / Acto Inseguro</th>
                  <th style="padding: 8px 6px; width: 12%; word-break: break-word;">Peligro GTC 45</th>
                  <th style="padding: 8px 6px; width: 9%; text-align: center; word-break: break-word;">5S</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">EPP</th>
                  <th style="padding: 8px 6px; width: 11%; word-break: break-word;">Nivel Riesgo</th>
                  <th style="padding: 8px 6px; width: 14%; word-break: break-word;">Acción Inmediata</th>
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

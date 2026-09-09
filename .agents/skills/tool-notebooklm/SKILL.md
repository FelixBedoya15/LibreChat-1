---
name: tool-notebooklm
description: >-
  Guía integral para conectar y consultar Google NotebookLM / Gemini Notebook vía MCP (Model Context Protocol). Permite a los agentes de WAPPY consultar cuadernos con citas exactas, indexar normatividad SST/PESV sin consumir tokens de contexto, y generar podcasts, quizzes y mapas conceptuales para el LMS.
---

# Skill: Conexión y Uso de Google NotebookLM / Gemini Notebook (`tool-notebooklm`)

Esta habilidad capacita a los agentes de WAPPY para interactuar con **Google NotebookLM (Gemini Notebook)** mediante el servidor **Model Context Protocol (MCP)** integrado en LibreChat-WAPPY.

---

## 1. ¿Por qué usar NotebookLM en WAPPY?

1. **Grounded RAG (Citas Exactas):** NotebookLM utiliza Gemini para analizar documentos extensos (PDFs de normativas, leyes, guías técnicas, manuales) y responde basándose estrictamente en las fuentes, incluyendo citas verificables.
2. **Zero-Token Synthesis:** En lugar de inyectar manuales de 300 páginas dentro de la ventana de contexto de LibreChat (lo que satura tokens y encarece la inferencia), el agente delega la lectura a NotebookLM y solo recibe la respuesta sintetizada.
3. **Generación Multimedia para LMS:** Permite generar Podcasts explicativos en audio (`studio_generate(type="audio")`), cuestionarios para exámenes de cursos (`studio_generate(type="quiz")`), tarjetas de estudio (`flashcards`) y esquemas conceptuales (`mind map`).

---

## 2. Herramientas MCP Clave de NotebookLM

El servidor MCP expone un catálogo de herramientas estandarizadas:

### A. Gestión de Cuadernos y Fuentes
* **`notebook_list`**: Lista todos los cuadernos existentes del usuario con sus títulos e identificadores (`notebook_id`).
* **`notebook_create(title="...")`**: Crea un nuevo cuaderno especializado (ej: *"Matriz SST - Empresa XYZ"*).
* **`source_list(notebook="...")`**: Lista los documentos y fuentes cargadas en un cuaderno.
* **`source_add(notebook="...", source_type="...", ...)`**: Añade una fuente. Soporta:
  - `source_type="url"`: Enlace web o artículo.
  - `source_type="text"`: Texto plano o Markdown.
  - `source_type="file"`: Archivo local (o `bytes_base64` para archivos en memoria).

### B. Consultas Fundamentadas (Q&A con Citas)
* **`chat_ask(notebook="...", query="...")`**: La herramienta principal. Realiza una pregunta directa sobre el contenido del cuaderno. Devuelve la respuesta fundamentada con citas directas `[1]`, `[2]`.

### C. Estudio y Generación de Contenido (Studio)
* **`studio_generate(notebook="...", artifact_type="...")`**: Genera artefactos de estudio a partir de las fuentes:
  - `audio`: Podcast explicativo a dos voces (Audio Overview).
  - `quiz`: Cuestionario con preguntas y opciones múltiples.
  - `flashcards`: Tarjetas de memorización / repaso.
  - `mind_map`: Mapa conceptual / estructura jerárquica en JSON.
  - `report`: Informe estructurado o resumen ejecutivo.
* **`studio_status(task_id="...")`**: Consulta el progreso de una generación larga.
* **`studio_download(artifact_id="...")`**: Obtiene el enlace de descarga para el audio MP3, reporte o contenido generado.

### D. Investigación Profunda (Deep Research)
* **`research_start(notebook="...", query="...", mode="deep")`**: Inicia una búsqueda profunda en la web o Drive sobre un tema normativo o técnico.
* **`research_import(task_id="...")`**: Incorpora los hallazgos directamente como nuevas fuentes del cuaderno.

---

## 3. Protocolos de Uso por Escuadrón WAPPY

### Escuadrón Somos SST
* **Agente Normatividad & Matriz SST / Auditor:**
  1. Al recibir una consulta sobre normatividad extensa (ej. Decreto 1072 de 2015, Resolución 0312 de 2019, GTC 45):
  2. Ejecuta `notebook_list` para ubicar el cuaderno de normatividad correspondiente.
  3. Ejecuta `chat_ask(notebook="Normatividad Colombia SST", query="¿Cuáles son los estándares mínimos para empresas de menos de 10 trabajadores clase de riesgo I?")`.
  4. Redacta la recomendación técnica citando los artículos y fuentes devueltos por NotebookLM.

### Escuadrón Cursos & LMS
* **Instructional Designer & Quiz Generator:**
  1. Para crear un nuevo módulo o lección, consulta el cuaderno temático.
  2. Ejecuta `studio_generate(notebook="Curso Alturas Res 4272", artifact_type="quiz")` para obtener preguntas de evaluación validadas contra el contenido real.
  3. Ejecuta `studio_generate(notebook="Curso Alturas Res 4272", artifact_type="audio")` para crear el audio explicativo complementario de la lección.

### Escuadrón Blog & Marketing
* **SEO & AEO Long-Form Writer:**
  1. Utiliza `chat_ask` para extraer estadísticas, datos técnicos y citas de autoridad de los estudios cargados en el cuaderno.
  2. Garantiza un artículo con E-E-A-T superior citando fuentes primarias.

---

## 4. Buenas Prácticas y Reglas de Seguridad

1. **Nunca borres cuadernos sin confirmación explícita:** Las herramientas destructivas (`notebook_delete`, `source_delete`) requieren el parámetro `confirm=true`. Si el usuario no lo ha pedido explícitamente, no las ejecutes.
2. **Usa nombres o IDs exactos:** Al referenciar un cuaderno, si el título es ambiguo o existen duplicados, usa el `notebook_id` canónico devuelto por `notebook_list`.
3. **Manejo de Errores de Sesión:** Si la herramienta devuelve un error con código `AUTH`, indícale amablemente al usuario que sus cookies de Google han expirado y que puede actualizarlas rápidamente ejecutando en su terminal:
   ```bash
   npm run notebooklm:auth
   ```

---

## 5. Guía de Conexión para Usuarios Finales (Multi-Usuario)

Cuando un usuario pregunte cómo conectar su propio NotebookLM o pregunte por qué el agente no ve sus cuadernos personales, explícale las dos alternativas disponibles:

* **Método 1: Compartir por Google (Recomendado y más fácil):**
  1. Entra a [notebooklm.google.com](https://notebooklm.google.com).
  2. Abre tu cuaderno y haz clic en el botón azul **"Compartir"**.
  3. Agrega el correo de WAPPY (`agentes@grupowappy.com`) como **Lector**.
  4. Vuelve al chat y dile al agente el título o enlace de tu cuaderno. ¡Listo, sin necesidad de contraseñas!

* **Método 2: Sesión Privada Exclusiva (Opcional):**
  1. En LibreChat, ve a los ajustes del chat o la tuerca de configuración del agente.
  2. En el campo **"Sesión Privada de NotebookLM"**, pega tus cookies o JSON exportado de Google.
  3. Tus consultas se enrutarán exclusivamente a través de tu cuenta privada de forma 100% aislada.


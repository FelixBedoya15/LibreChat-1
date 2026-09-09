require('events').EventEmitter.defaultMaxListeners = 100;
const { logger } = require('@librechat/data-schemas');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { getBufferString, HumanMessage } = require('@langchain/core/messages');
const {
  createRun,
  Tokenizer,
  checkAccess,
  logAxiosError,
  sanitizeTitle,
  resolveHeaders,
  getBalanceConfig,
  getTransactionsConfig,
  createMemoryProcessor,
  createRecallMemoryTool,
} = require('@librechat/api');
const {
  Callback,
  Providers,
  TitleMethod,
  formatMessage,
  formatAgentMessages,
  getTokenCountForMessage,
  createMetadataAggregator,
} = require('@librechat/agents');
const {
  Constants,
  Permissions,
  VisionModes,
  ContentTypes,
  EModelEndpoint,
  PermissionTypes,
  isAgentsEndpoint,
  AgentCapabilities,
  bedrockInputSchema,
  removeNullishValues,
} = require('librechat-data-provider');
const { initializeAgent } = require('~/server/services/Endpoints/agents/agent');
const { getUserKey } = require('~/server/services/UserService');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { getFormattedMemories, deleteMemory, setMemory } = require('~/models');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { getProviderConfig } = require('~/server/services/Endpoints');
const { createContextHandlers } = require('~/app/clients/prompts');
const { checkCapability } = require('~/server/services/Config');
const BaseClient = require('~/app/clients/BaseClient');
const { getRoleByName } = require('~/models/Role');
const { loadAgent } = require('~/models/Agent');
const { getMCPManager } = require('~/config');
const { getActiveSkillInstructions } = require('~/server/services/skillRouter');

const omitTitleOptions = new Set([
  'stream',
  'thinking',
  'streaming',
  'clientOptions',
  'thinkingConfig',
  'thinkingBudget',
  'includeThoughts',
  'maxOutputTokens',
  'additionalModelRequestFields',
]);

/**
 * @param {ServerRequest} req
 * @param {Agent} agent
 * @param {string} endpoint
 */
const payloadParser = ({ req, agent, endpoint }) => {
  if (isAgentsEndpoint(endpoint)) {
    return { model: undefined };
  } else if (endpoint === EModelEndpoint.bedrock) {
    const parsedValues = bedrockInputSchema.parse(agent.model_parameters);
    if (parsedValues.thinking == null) {
      parsedValues.thinking = false;
    }
    return parsedValues;
  }
  return req.body.endpointOption.model_parameters;
};

function createTokenCounter(encoding) {
  return function (message) {
    const countTokens = (text) => Tokenizer.getTokenCount(text, encoding);
    return getTokenCountForMessage(message, countTokens);
  };
}

function logToolError(graph, error, toolId) {
  logAxiosError({
    error,
    message: `[api/server/controllers/agents/client.js #chatCompletion] Tool Error "${toolId}"`,
  });
}

class AgentClient extends BaseClient {
  constructor(options = {}) {
    super(null, options);
    /** The current client class
     * @type {string} */
    this.clientName = EModelEndpoint.agents;

    /** @type {'discard' | 'summarize'} */
    this.contextStrategy = 'discard';

    /** @deprecated @type {true} - Is a Chat Completion Request */
    this.isChatCompletion = true;

    /** @type {AgentRun} */
    this.run;

    const {
      agentConfigs,
      contentParts,
      collectedUsage,
      artifactPromises,
      maxContextTokens,
      ...clientOptions
    } = options;

    this.agentConfigs = agentConfigs;
    this.maxContextTokens = maxContextTokens;
    /** @type {MessageContentComplex[]} */
    this.contentParts = contentParts;
    /** @type {Array<UsageMetadata>} */
    this.collectedUsage = collectedUsage;
    /** @type {ArtifactPromises} */
    this.artifactPromises = artifactPromises;
    /** @type {AgentClientOptions} */
    this.options = Object.assign({ endpoint: options.endpoint }, clientOptions);
    /** @type {string} */
    this.model = this.options.agent.model_parameters.model;
    /** The key for the usage object's input tokens
     * @type {string} */
    this.inputTokensKey = 'input_tokens';
    /** The key for the usage object's output tokens
     * @type {string} */
    this.outputTokensKey = 'output_tokens';
    /** @type {UsageMetadata} */
    this.usage;
    /** @type {Record<string, number>} */
    this.indexTokenCountMap = {};
    /** @type {(messages: BaseMessage[]) => Promise<void>} */
    this.processMemory;
  }

  /**
   * Returns the aggregated content parts for the current run.
   * @returns {MessageContentComplex[]} */
  getContentParts() {
    return this.contentParts;
  }

  setOptions(options) {
    logger.info('[api/server/controllers/agents/client.js] setOptions', options);
  }

  /**
   * `AgentClient` is not opinionated about vision requests, so we don't do anything here
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest() { }

  getSaveOptions() {
    // TODO:
    // would need to be override settings; otherwise, model needs to be undefined
    // model: this.override.model,
    // instructions: this.override.instructions,
    // additional_instructions: this.override.additional_instructions,
    let runOptions = {};
    try {
      runOptions = payloadParser(this.options);
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #getSaveOptions] Error parsing options',
        error,
      );
    }

    return removeNullishValues(
      Object.assign(
        {
          endpoint: this.options.endpoint,
          agent_id: this.options.agent.id,
          modelLabel: this.options.modelLabel,
          maxContextTokens: this.options.maxContextTokens,
          resendFiles: this.options.resendFiles,
          imageDetail: this.options.imageDetail,
          spec: this.options.spec,
          iconURL: this.options.iconURL,
        },
        // TODO: PARSE OPTIONS BY PROVIDER, MAY CONTAIN SENSITIVE DATA
        runOptions,
      ),
    );
  }

  getBuildMessagesOptions() {
    return {
      instructions: this.options.agent.instructions,
      additional_instructions: this.options.agent.additional_instructions,
    };
  }

  /**
   *
   * @param {TMessage} message
   * @param {Array<MongoFile>} attachments
   * @returns {Promise<Array<Partial<MongoFile>>>}
   */
  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.agent.provider,
      VisionModes.agents,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  async buildMessages(
    messages,
    parentMessageId,
    { instructions = null, additional_instructions = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });

    const lastUserMessage = orderedMessages[orderedMessages.length - 1];
    const currentIncomingMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;
    let lastUserText = '';
    if (currentIncomingMessage) {
      if (typeof currentIncomingMessage.text === 'string' && currentIncomingMessage.text) {
        lastUserText = currentIncomingMessage.text;
      } else if (typeof currentIncomingMessage.content === 'string' && currentIncomingMessage.content) {
        lastUserText = currentIncomingMessage.content;
      } else if (Array.isArray(currentIncomingMessage.content)) {
        const textObj = currentIncomingMessage.content.find((p) => p && (p.type === 'text' || p.text));
        lastUserText = textObj ? (textObj.text || textObj[ContentTypes.TEXT] || '') : '';
      }
    }
    if (!lastUserText && lastUserMessage) {
      lastUserText = typeof lastUserMessage.text === 'string' ? lastUserMessage.text : '';
    }
    const skillInstructions = getActiveSkillInstructions(lastUserText, this.options.agent?.skills);

    let payload;
    /** @type {number | undefined} */
    let promptTokens;

    /** @type {string} */
    let systemContent = [
      instructions ?? '',
      additional_instructions ?? '',
      skillInstructions,
      'IMPORTANT: Do not narrate your actions. Do not say "I will search...". If you need to use a tool, use it IMMEDIATELY without preamble. If you need to use multiple tools (e.g. file_search and web_search), use them BOTH in the SAME turn (parallel tool calls). Do not wait for one to finish before calling the other.',
      '\nCRITICAL AGENTIC INSTRUCTIONS (Google Prompting Best Practices):',
      'You are a strong reasoner and planner. Before taking any action (either tool calls or responding to the user), you must plan and reason about:',
      '1. Logical dependencies: Reorder operations if needed to successfully complete the task.',
      '2. Risk assessment: Call tools with available info rather than asking the user unless strictly necessary.',
      '3. Persistence and adaptability: On transient errors, retry the call. On other errors, change your strategy or arguments rather than repeating the same call. Do not give up easily.',
      '4. Precision and Grounding: Ensure your reasoning is highly precise and based only on facts. If referencing a document or policy, quote the exact applicable text.'
    ]
      .filter(Boolean)
      .join('\n')
      .trim();

    // ✅ FIX: Set up memory as an on-demand tool (recall_memory) instead of unconditionally
    // injecting all user memories into the system prompt on every message.
    // This prevents the agent from using historical memories about other clients/companies
    // when the user asks an unrelated question (e.g. "what are these documents about?").
    const agentId = this.options.agent?.id ?? 'global';
    await this.useMemory();

    // ✅ FIX #2 — SST AGENTS: Inject empresa_sgsst directly into system prompt.
    // SST agents need company context for EVERY technical question (risk level, workers,
    // ARL, etc.). Relying on recall_memory (on-demand) is unreliable because the LLM
    // often doesn't infer it needs personalized context for normative SST queries.
    // Solution: Always inject empresa_sgsst (agentId='global') at the top of the system prompt
    // for any SST-domain agent.
    const agentName = this.options.agent?.name ?? '';
    const agentInstructions = this.options.agent?.instructions ?? '';
    const SST_KEYWORDS = ['SG-SST', 'SST', 'IPEVAR', 'GTC-45', 'Salud en el Trabajo', 'Seguridad y Salud', 'PESV', 'ARL', 'Riesgo Laboral', 'Emergencias', 'Ergon'];
    const isSSTagent = SST_KEYWORDS.some((kw) =>
      agentName.includes(kw) || agentInstructions.slice(0, 500).includes(kw)
    );

    if (isSSTagent) {
      try {
        const { withoutKeys: companyContext } = await getFormattedMemories({
          userId: this.options.req.user.id + '',
          agentId: 'global',
        });
        if (companyContext) {
          systemContent = `## CONTEXTO DE LA EMPRESA ACTIVA (DATOS REALES - NO VOLVER A PREGUNTAR):\n${companyContext}\n\n---\n\n` + systemContent;
          logger.debug(`[buildMessages] Injected empresa_sgsst into SST agent "${agentName}" system prompt`);
        }
      } catch (memErr) {
        logger.warn('[buildMessages] Could not inject empresa_sgsst into SST agent:', memErr.message);
      }
    }

    // Register the recall_memory tool so the agent can retrieve memories on-demand
    const recallTool = createRecallMemoryTool({
      userId: this.options.req.user.id + '',
      agentId,
      getFormattedMemories,
    });
    if (!this.options.agent.tools) {
      this.options.agent.tools = [];
    }
    // Only add if not already registered
    if (!this.options.agent.tools.some((t) => t && (t.name === 'recall_memory' || t === 'recall_memory'))) {
      this.options.agent.tools.push(recallTool);
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    if (this.options.attachments) {
      const attachments = await this.options.attachments;
      const latestMessage = orderedMessages[orderedMessages.length - 1];

      if (this.message_file_map) {
        this.message_file_map[latestMessage.messageId] = attachments;
      } else {
        this.message_file_map = {
          [latestMessage.messageId]: attachments,
        };
      }

      await this.addFileContextToMessage(latestMessage, attachments);
      const files = await this.processAttachments(latestMessage, attachments);

      this.options.attachments = files;
    }

    /** Note: Bedrock uses legacy RAG API handling */
    if (this.message_file_map && !isAgentsEndpoint(this.options.endpoint)) {
      this.contextHandlers = createContextHandlers(
        this.options.req,
        orderedMessages[orderedMessages.length - 1].text,
      );
    }

    const formattedMessages = orderedMessages.map((message, i) => {
      if (Array.isArray(message.documents)) {
        message.documents = message.documents.filter((d) => (d?.data?.length || d?.file_data?.length || 0) <= 3500000);
      }
      if (Array.isArray(message.image_urls)) {
        message.image_urls = message.image_urls.filter((img) => {
          const str = typeof img === 'string' ? img : (img?.image_url?.url || img?.url || '');
          return str.length <= 3500000;
        });
      }
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.modelLabel,
      });

      if (message.fileContext) {
        if (typeof formattedMessage.content === 'string') {
          formattedMessage.content = message.fileContext + '\n' + formattedMessage.content;
        } else if (Array.isArray(formattedMessage.content)) {
          const textPart = formattedMessage.content.find((part) => part && part.type === 'text');
          textPart
            ? (textPart.text = message.fileContext + '\n' + textPart.text)
            : formattedMessage.content.unshift({ type: 'text', text: message.fileContext });
        }
        if (i === orderedMessages.length - 1) {
          systemContent = [systemContent, message.fileContext].join('\n');
          this.options.agent.instructions = systemContent;
        }
      }

      const needsTokenCount =
        (this.contextStrategy && !orderedMessages[i].tokenCount) || message.fileContext;

      /* If tokens were never counted, or, is a Vision request and the message has files, count again */
      if (needsTokenCount || (this.isVisionModel && (message.image_urls || message.files))) {
        orderedMessages[i].tokenCount = this.getTokenCountForMessage(formattedMessage);
      }

      /* If message has files, calculate image token cost */
      if (this.message_file_map && this.message_file_map[message.messageId]) {
        const attachments = this.message_file_map[message.messageId];
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
          if (file.metadata?.fileIdentifier) {
            continue;
          }
          // orderedMessages[i].tokenCount += this.calculateImageTokenCost({
          //   width: file.width,
          //   height: file.height,
          //   detail: this.options.imageDetail ?? ImageDetail.auto,
          // });
        }
      }

      return formattedMessage;
    });

    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      systemContent = this.augmentedPrompt + systemContent;
    }

    // Inject MCP server instructions if available
    const ephemeralAgent = this.options.req.body.ephemeralAgent;
    let mcpServers = [];

    // Check for ephemeral agent MCP servers
    if (ephemeralAgent && ephemeralAgent.mcp && ephemeralAgent.mcp.length > 0) {
      mcpServers = ephemeralAgent.mcp;
    }
    // Check for regular agent MCP tools
    else if (this.options.agent && this.options.agent.tools) {
      mcpServers = this.options.agent.tools
        .filter(
          (tool) =>
            tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter),
        )
        .map((tool) => tool.name.split(Constants.mcp_delimiter).pop())
        .filter(Boolean);
    }

    if (mcpServers.length > 0) {
      try {
        const mcpInstructions = getMCPManager().formatInstructionsForContext(mcpServers);
        if (mcpInstructions) {
          systemContent = [systemContent, mcpInstructions].filter(Boolean).join('\n\n');
          logger.debug('[AgentClient] Injected MCP instructions for servers:', mcpServers);
        }
      } catch (error) {
        logger.error('[AgentClient] Failed to inject MCP instructions:', error);
      }
    }

    if (systemContent) {
      this.options.agent.instructions = systemContent;
    }

    /** @type {Record<string, number> | undefined} */
    let tokenCountMap;

    ({ payload, promptTokens, tokenCountMap, messages } = await this.handleContextStrategy({
      orderedMessages,
      formattedMessages,
    }));
    // }
    //
    // if (systemContent) {
    //   this.options.agent.instructions = systemContent;
    // }

    for (let i = 0; i < messages.length; i++) {
      this.indexTokenCountMap[i] = messages[i].tokenCount;
    }

    const result = {
      tokenCountMap,
      prompt: payload,
      promptTokens,
      messages,
    };

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }



    return result;
  }

  /**
   * Creates a promise that resolves with the memory promise result or undefined after a timeout
   * @param {Promise<(TAttachment | null)[] | undefined>} memoryPromise - The memory promise to await
   * @param {number} timeoutMs - Timeout in milliseconds (default: 3000)
   * @returns {Promise<(TAttachment | null)[] | undefined>}
   */
  async awaitMemoryWithTimeout(memoryPromise, timeoutMs = 3000) {
    if (!memoryPromise) {
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Memory processing timeout')), timeoutMs),
      );

      const attachments = await Promise.race([memoryPromise, timeoutPromise]);
      return attachments;
    } catch (error) {
      if (error.message === 'Memory processing timeout') {
        logger.warn('[AgentClient] Memory processing timed out after 3 seconds');
      } else {
        logger.error('[AgentClient] Error processing memory:', error);
      }
      return;
    }
  }

  /**
   * @returns {Promise<string | undefined>}
   */
  async useMemory() {
    if (this.options.req.body?.isPublicChat === true) {
      return;
    }
    const user = this.options.req.user;
    if (user.personalization?.memories === false) {
      return;
    }
    const hasAccess = await checkAccess({
      user,
      permissionType: PermissionTypes.MEMORIES,
      permissions: [Permissions.USE],
      getRoleByName,
    });

    if (!hasAccess) {
      logger.debug(
        `[api/server/controllers/agents/client.js #useMemory] User ${user.id} does not have USE permission for memories`,
      );
      return;
    }
    const appConfig = this.options.req.config;
    const memoryConfig = appConfig.memory;
    if (!memoryConfig || memoryConfig.disabled === true) {
      return;
    }

    /** @type {Agent} */
    let prelimAgent;
    const allowedProviders = new Set(
      appConfig?.endpoints?.[EModelEndpoint.agents]?.allowedProviders,
    );
    try {
      if (memoryConfig.agent?.id != null && memoryConfig.agent.id !== this.options.agent.id) {
        prelimAgent = await loadAgent({
          req: this.options.req,
          agent_id: memoryConfig.agent.id,
          endpoint: EModelEndpoint.agents,
        });
      } else if (
        memoryConfig.agent?.id == null &&
        memoryConfig.agent?.model != null &&
        memoryConfig.agent?.provider != null
      ) {
        prelimAgent = { id: Constants.EPHEMERAL_AGENT_ID, ...memoryConfig.agent };
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #useMemory] Error loading agent for memory',
        error,
      );
    }

    // ✅ FIX 3: explicit guard for undefined prelimAgent
    if (!prelimAgent) {
      logger.warn(
        '[api/server/controllers/agents/client.js #useMemory] No memory agent configured or failed to load, skipping memory',
      );
      return;
    }

    const agent = await initializeAgent({
      req: this.options.req,
      res: this.options.res,
      agent: prelimAgent,
      allowedProviders,
      endpointOption: {
        endpoint:
          prelimAgent.id !== Constants.EPHEMERAL_AGENT_ID
            ? EModelEndpoint.agents
            : memoryConfig.agent?.provider,
      },
    });

    if (!agent) {
      logger.warn(
        '[api/server/controllers/agents/client.js #useMemory] No agent found for memory',
        memoryConfig,
      );
      return;
    }

    let apiKey = undefined;
    let isServiceAccount = false;
    let serviceKey = undefined;

    if (agent.provider === 'google') {
      let googleKey = (agent.model_parameters && agent.model_parameters.apiKey) ||
                        process.env.GOOGLE_API_KEY || 
                        process.env.GEMINI_API_KEY || 
                        process.env.GOOGLE_KEY;

      // If system key is 'user_provided', fall back to the active user's saved Google key
      if (!googleKey || googleKey === 'user_provided') {
        try {
          const userGoogleKey = await getUserKey({ userId: this.options.req.user.id, name: EModelEndpoint.google });
          if (userGoogleKey && userGoogleKey !== 'user_provided') {
            googleKey = userGoogleKey;
            logger.debug('[useMemory] Using user\'s own Google API key for Memory Agent');
          }
        } catch (e) {
          logger.debug('[useMemory] Could not load user Google key for Memory Agent:', e.message);
        }
      }

      if (googleKey && googleKey !== 'user_provided') {
        try {
          const parsed = JSON.parse(googleKey);
          if (parsed && parsed.project_id) {
            isServiceAccount = true;
            serviceKey = parsed;
          }
        } catch (e) {
          // Not a JSON — plain API key
        }
      }

      if (!isServiceAccount && googleKey && googleKey !== 'user_provided') {
        apiKey = googleKey;
        if (apiKey && apiKey.includes(',')) {
          apiKey = apiKey.split(',')[0].trim();
        }
      }
    } else if (agent.provider === 'openai') {
      apiKey = (agent.model_parameters && agent.model_parameters.apiKey) || process.env.OPENAI_API_KEY;
      if (apiKey && apiKey.includes(',')) {
        apiKey = apiKey.split(',')[0].trim();
      }
    }

    const llmConfig = Object.assign(
      {
        provider: agent.provider,
        model: agent.model,
      },
      agent.model_parameters,
    );

    if (isServiceAccount) {
      delete llmConfig.apiKey;
    } else if (apiKey) {
      llmConfig.apiKey = apiKey;
    }

    if (agent.provider === 'google') {
      if (isServiceAccount) {
        llmConfig.provider = 'vertexai';
        llmConfig.authOptions = {
          credentials: { ...serviceKey },
          projectId: serviceKey.project_id,
        };
        llmConfig.location = process.env.GOOGLE_LOC || 'us-central1';
      } else if (llmConfig.customHeaders) {
        llmConfig.customHeaders = { ...llmConfig.customHeaders };
        delete llmConfig.customHeaders['Authorization'];
        delete llmConfig.customHeaders['authorization'];
      }
    }



    /** @type {import('@librechat/api').MemoryConfig} */
    const config = {
      validKeys: memoryConfig.validKeys,
      instructions: agent.instructions,
      llmConfig,
      tokenLimit: memoryConfig.tokenLimit,
    };

    const userId = this.options.req.user.id + '';
    const messageId = this.responseMessageId + '';
    const conversationId = this.conversationId + '';
    const agentId = this.options.agent?.id ?? 'global';
    const [, processMemory] = await createMemoryProcessor({
      userId,
      agentId,
      config,
      messageId,
      conversationId,
      memoryMethods: {
        setMemory,
        deleteMemory,
        getFormattedMemories,
      },
      res: this.options.res,
    });

    this.processMemory = processMemory;
    return '';
  }

  /**
   * Filters out image URLs from message content
   * @param {BaseMessage} message - The message to filter
   * @returns {BaseMessage} - A new message with image URLs removed
   */
  filterImageUrls(message) {
    if (!message.content || typeof message.content === 'string') {
      return message;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter(
        (part) => part.type !== ContentTypes.IMAGE_URL,
      );

      if (filteredContent.length === 1 && filteredContent[0].type === ContentTypes.TEXT) {
        const MessageClass = message.constructor;
        return new MessageClass({
          content: filteredContent[0].text,
          additional_kwargs: message.additional_kwargs,
        });
      }

      const MessageClass = message.constructor;
      return new MessageClass({
        content: filteredContent,
        additional_kwargs: message.additional_kwargs,
      });
    }

    return message;
  }

  /**
   * @param {BaseMessage[]} messages
   * @returns {Promise<void | (TAttachment | null)[]>}
   */
  async runMemory(messages) {
    if (this.processMemory == null) {
      return;
    }
    
    // Optimización: Desactivar Fase 2 (Escritura) si el agente usa matriz_ipevar
    // Esto ahorra llamadas a la API durante las transferencias del flujo GTC-45.
    const tools = this.options.agent?.tools || [];
    const hasIpevarTool = tools.some(t => 
      typeof t === 'string' ? t === 'matriz_ipevar' : t?.pluginKey === 'matriz_ipevar' || t?.name === 'matriz_ipevar'
    );
    if (hasIpevarTool) {
      return;
    }

    try {
      const appConfig = this.options.req.config;
      const memoryConfig = appConfig.memory;
      const messageWindowSize = memoryConfig?.messageWindowSize ?? 5;

      let messagesToProcess = [...messages];
      if (messages.length > messageWindowSize) {
        for (let i = messages.length - messageWindowSize; i >= 0; i--) {
          const potentialWindow = messages.slice(i, i + messageWindowSize);
          if (potentialWindow[0]?.role === 'user') {
            messagesToProcess = [...potentialWindow];
            break;
          }
        }
        if (messagesToProcess.length === messages.length) {
          messagesToProcess = [...messages.slice(-messageWindowSize)];
        }
      }

      // ─── Strip file/document content before building memory buffer ─────────
      // Messages with attachments have their content as an array where:
      //   content[0] = the text the user typed (what we WANT)
      //   content[1..n] = extracted file/document text (what we DON'T WANT)
      // We only keep the first text block of each message so memory never
      // stores document content — only actual conversation text.
      const textOnlyMessages = messagesToProcess.map((msg) => {
        if (!Array.isArray(msg.content)) {
          // Already a plain string — nothing to strip
          return msg;
        }
        // Find the first text-type block (what was manually typed)
        const firstText = msg.content.find(
          (part) => part.type === ContentTypes.TEXT || part.type === 'text',
        );
        const plainText = firstText
          ? (firstText[ContentTypes.TEXT] ?? firstText.text ?? '')
          : '';

        const MessageClass = msg.constructor;
        return new MessageClass({
          content: plainText,
          additional_kwargs: msg.additional_kwargs ?? {},
        });
      });

      const filteredMessages = textOnlyMessages.map((msg) => this.filterImageUrls(msg));
      const bufferString = getBufferString(filteredMessages);

      // Skip if there's nothing meaningful to memorize
      if (!bufferString.trim()) {
        return;
      }

      const bufferMessage = new HumanMessage(`# Current Chat:\n\n${bufferString}`);

      // ─── Dual-axis rotation for Memory Agent (same as main agent) ───────────
      // Read keys from memory agent's apiKey (comma-separated like main agent)
      const rawApiKey = this.options.req.config?.memory?.agent?.model_parameters?.apiKey
        ?? this.options.agent?.model_parameters?.apiKey
        ?? null;
      let memKeys = rawApiKey && typeof rawApiKey === 'string' && rawApiKey.includes(',')
        ? rawApiKey.split(',').map((k) => k.trim()).filter(Boolean)
        : [rawApiKey];
      if (!memKeys.length) memKeys = [null];

      // Model fallback list from GOOGLE_MODELS env (same exclusions as main agent)
      const primaryMemModel = this.options.req.config?.memory?.agent?.model
        ?? this.options.req.config?.memory?.agent?.model_parameters?.model
        ?? '';
      const envMemModels = (process.env.GOOGLE_MODELS || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
        .filter((m) => !m.includes('native-audio') && !m.includes('-live-'));
      const memModelFallbacks = [
        primaryMemModel,
        ...envMemModels.filter((m) => m !== primaryMemModel),
      ].filter(Boolean);
      if (!memModelFallbacks.length) {
        // No model configured — skip rotation, attempt once directly
        return await this.processMemory([bufferMessage]);
      }

      let success = false;
      let lastErr = null;

      for (let mi = 0; mi < memModelFallbacks.length && !success; mi++) {
        const currentMemModel = memModelFallbacks[mi];
        if (mi > 0) {
          logger.warn(
            `[MemoryAgent] Modelo agotado — rotando a "${currentMemModel}" (fallback ${mi}/${memModelFallbacks.length - 1})`,
          );
        }

        let rotateToNextModel = false;
        for (let ki = 0; ki < memKeys.length; ki++) {
          try {
            // Inject current key + model into memory agent config before each attempt
            if (memKeys[ki] && appConfig?.memory?.agent) {
              if (!appConfig.memory.agent.model_parameters) {
                appConfig.memory.agent.model_parameters = {};
              }
              appConfig.memory.agent.model_parameters.apiKey = memKeys[ki];
              appConfig.memory.agent.model_parameters.model = currentMemModel;
            }
            // Re-create the processor with the updated key & model
            await this.useMemory();
            const result = await this.processMemory([bufferMessage]);
            success = true;
            return result;
          } catch (err) {
            lastErr = err;
            const isQuota = err?.status === 429 || err?.message?.includes('429');
            const isGenericQuota = err?.status === 403 || err?.message?.includes('403');
            const isInvalidKey = err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid');
            const isServiceUnavailable = err?.status === 503 || err?.message?.includes('503') ||
              err?.message?.includes('overloaded') || err?.message?.includes('UNAVAILABLE');

            if ((isQuota || isGenericQuota || isInvalidKey || isServiceUnavailable) && ki < memKeys.length - 1) {
               logger.warn(
                 `[MemoryAgent] Error (${isInvalidKey ? 'Clave inválida' : isServiceUnavailable ? 'Modelo sobrecargado (503)' : 'Rate limit'}). Rotando a clave ${ki + 2}...`,
               );
               continue; // Next key, same model
            } else if (isQuota || isGenericQuota || isInvalidKey || isServiceUnavailable) {
               logger.warn(
                 `[MemoryAgent] Todas las claves agotadas o modelo no disponible para "${currentMemModel}". Rotando al siguiente modelo...`,
               );
               rotateToNextModel = true;
               break;
            } else {
               // Non-recoverable — log and exit quietly (memory is non-critical)
               logger.error('[MemoryAgent] Error no recuperable al procesar memoria:', err?.message);
               return;
            }
          }
        }
        if (rotateToNextModel && !success) continue;
      }

      if (!success && lastErr) {
        logger.error('[MemoryAgent] Todos los modelos y claves agotados. Omitiendo memoria.', lastErr?.message);
      }
    } catch (error) {
      logger.error('Memory Agent failed to process memory', error);
    }
  }


  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    await this.chatCompletion({
      payload,
      onProgress: opts.onProgress,
      userMCPAuthMap: opts.userMCPAuthMap,
      abortController: opts.abortController,
    });
    return this.contentParts;
  }

  /**
   * @param {Object} params
   * @param {string} [params.model]
   * @param {string} [params.context='message']
   * @param {AppConfig['balance']} [params.balance]
   * @param {AppConfig['transactions']} [params.transactions]
   * @param {UsageMetadata[]} [params.collectedUsage=this.collectedUsage]
   */
  async recordCollectedUsage({
    model,
    balance,
    transactions,
    context = 'message',
    collectedUsage = this.collectedUsage,
  }) {
    if (!collectedUsage || !collectedUsage.length) {
      return;
    }
    const input_tokens =
      (collectedUsage[0]?.input_tokens || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_creation) || 0) +
      (Number(collectedUsage[0]?.input_token_details?.cache_read) || 0);

    let output_tokens = 0;
    let previousTokens = input_tokens; // Start with original input
    for (let i = 0; i < collectedUsage.length; i++) {
      const usage = collectedUsage[i];
      if (!usage) {
        continue;
      }

      const cache_creation = Number(usage.input_token_details?.cache_creation) || 0;
      const cache_read = Number(usage.input_token_details?.cache_read) || 0;

      const txMetadata = {
        context,
        balance,
        transactions,
        conversationId: this.conversationId,
        user: this.user ?? this.options.req.user?.id,
        endpointTokenConfig: this.options.endpointTokenConfig,
        model: usage.model ?? model ?? this.model ?? this.options.agent.model_parameters.model,
      };

      if (i > 0) {
        // Count new tokens generated (input_tokens minus previous accumulated tokens)
        output_tokens +=
          (Number(usage.input_tokens) || 0) + cache_creation + cache_read - previousTokens;
      }

      // Add this message's output tokens
      output_tokens += Number(usage.output_tokens) || 0;

      // Update previousTokens to include this message's output
      previousTokens += Number(usage.output_tokens) || 0;

      if (cache_creation > 0 || cache_read > 0) {
        spendStructuredTokens(txMetadata, {
          promptTokens: {
            input: usage.input_tokens,
            write: cache_creation,
            read: cache_read,
          },
          completionTokens: usage.output_tokens,
        }).catch((err) => {
          logger.error(
            '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending structured tokens',
            err,
          );
        });
        continue;
      }
      spendTokens(txMetadata, {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #recordCollectedUsage] Error spending tokens',
          err,
        );
      });
    }

    this.usage = {
      input_tokens,
      output_tokens,
    };
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {UsageMetadata} The stream usage object.
   */
  getStreamUsage() {
    return this.usage;
  }

  /**
   * @param {TMessage} responseMessage
   * @returns {number}
   */
  getTokenCountForResponse({ content }) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content,
    });
  }

  /**
   * Calculates the correct token count for the current user message based on the token count map and API usage.
   * Edge case: If the calculation results in a negative value, it returns the original estimate.
   * If revisiting a conversation with a chat history entirely composed of token estimates,
   * the cumulative token count going forward should become more accurate as the conversation progresses.
   * @param {Object} params - The parameters for the calculation.
   * @param {Record<string, number>} params.tokenCountMap - A map of message IDs to their token counts.
   * @param {string} params.currentMessageId - The ID of the current message to calculate.
   * @param {OpenAIUsageMetadata} params.usage - The usage object returned by the API.
   * @returns {number} The correct token count for the current user message.
   */
  calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage }) {
    const originalEstimate = tokenCountMap[currentMessageId] || 0;

    if (!usage || typeof usage[this.inputTokensKey] !== 'number') {
      return originalEstimate;
    }

    tokenCountMap[currentMessageId] = 0;
    const totalTokensFromMap = Object.values(tokenCountMap).reduce((sum, count) => {
      const numCount = Number(count);
      return sum + (isNaN(numCount) ? 0 : numCount);
    }, 0);
    const totalInputTokens = usage[this.inputTokensKey] ?? 0;

    const currentMessageTokens = totalInputTokens - totalTokensFromMap;
    return currentMessageTokens > 0 ? currentMessageTokens : originalEstimate;
  }

  /**
   * @param {object} params
   * @param {string | ChatCompletionMessageParam[]} params.payload
   * @param {Record<string, Record<string, string>>} [params.userMCPAuthMap]
   * @param {AbortController} [params.abortController]
   */
  async chatCompletion({ payload, userMCPAuthMap, abortController = null }) {
    /** @type {Partial<GraphRunnableConfig>} */
    let config;
    /** @type {ReturnType<createRun>} */
    let run;
    /** @type {Promise<(TAttachment | null)[] | undefined>} */
    let memoryPromise;

    // ✅ FIX 4: Prevent double processing of memory
    let memoryProcessed = false;
    const handleMemory = async () => {
      if (memoryProcessed) {
        return;
      }
      memoryProcessed = true;
      const attachments = await this.awaitMemoryWithTimeout(memoryPromise);
      if (attachments && attachments.length > 0) {
        this.artifactPromises.push(...attachments);
      }
    };
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      const appConfig = this.options.req.config;
      /** @type {AppConfig['endpoints']['agents']} */
      const agentsEConfig = appConfig.endpoints?.[EModelEndpoint.agents];

      config = {
        runName: 'AgentRun',
        metadata: {
          // CRITICAL FIX: callbacks.js reads hide_sequential_outputs from metadata (NOT configurable).
          // In LangGraph, configurable and metadata are DIFFERENT objects on RunnableConfig.
          // Without this, specialist agent text responses are silently suppressed even though
          // the tool (matriz_ipevar) executes correctly. Setting false ensures all agent tokens reach the client.
          hide_sequential_outputs: false,
        },
        configurable: {
          thread_id: this.conversationId,
          last_agent_index: this.agentConfigs?.size ?? 0,
          user_id: this.user ?? this.options.req.user?.id,
          hide_sequential_outputs: false,
          requestBody: {
            messageId: this.responseMessageId,
            conversationId: this.conversationId,
            parentMessageId: this.parentMessageId,
          },
          user: this.options.req.user,
        },
        recursionLimit: agentsEConfig?.recursionLimit ?? 25,
        signal: abortController.signal,
        streamMode: 'values',
        version: 'v2',
      };

      const toolSet = new Set((this.options.agent.tools ?? []).map((tool) => tool && tool.name));
      let { messages: initialMessages, indexTokenCountMap } = formatAgentMessages(
        payload,
        this.indexTokenCountMap,
        toolSet,
      );

      /**
       * @param {BaseMessage[]} messages
       */
      const runAgents = async (messages) => {
        const agents = [this.options.agent];
        if (
          this.agentConfigs &&
          this.agentConfigs.size > 0 &&
          ((this.options.agent.edges?.length ?? 0) > 0 ||
            (await checkCapability(this.options.req, AgentCapabilities.chain)))
        ) {
          agents.push(...this.agentConfigs.values());
        }

        if (agents[0].recursion_limit && typeof agents[0].recursion_limit === 'number') {
          config.recursionLimit = agents[0].recursion_limit;
        }

        if (
          agentsEConfig?.maxRecursionLimit &&
          config.recursionLimit > agentsEConfig?.maxRecursionLimit
        ) {
          config.recursionLimit = agentsEConfig?.maxRecursionLimit;
        }

        // TODO: needs to be added as part of AgentContext initialization
        // const noSystemModelRegex = [/\b(o1-preview|o1-mini|amazon\.titan-text)\b/gi];
        // const noSystemMessages = noSystemModelRegex.some((regex) =>
        //   agent.model_parameters.model.match(regex),
        // );
        // if (noSystemMessages === true && systemContent?.length) {
        //   const latestMessageContent = _messages.pop().content;
        //   if (typeof latestMessageContent !== 'string') {
        //     latestMessageContent[0].text = [systemContent, latestMessageContent[0].text].join('\n');
        //     _messages.push(new HumanMessage({ content: latestMessageContent }));
        //   } else {
        //     const text = [systemContent, latestMessageContent].join('\n');
        //     _messages.push(new HumanMessage(text));
        //   }
        // }
        // let messages = _messages;
        // if (agent.useLegacyContent === true) {
        //   messages = formatContentStrings(messages);
        // }
        // if (
        //   agent.model_parameters?.clientOptions?.defaultHeaders?.['anthropic-beta']?.includes(
        //     'prompt-caching',
        //   )
        // ) {
        //   messages = addCacheControl(messages);
        // }

        // memoryPromise generation is extracted out of runAgents to prevent duplicate memory evaluations on key retry

        // Copy tools arrays to prevent mutation by MultiAgentGraph.createHandoffTools() across retries
        const agentsForRun = agents.map((agent) => ({
          ...agent,
          tools: agent.tools ? [...agent.tools] : agent.tools,
        }));

        // Build agentId → name map for transfer tracking (safe: only used after execution)
        const agentIdNameMap = {};
        for (const ag of agents) {
          if (ag.id) agentIdNameMap[ag.id] = ag.name || ag.id;
        }
        const mainAgentName = agents[0]?.name || agents[0]?.id || 'Principal';



        run = await createRun({
          agents: agentsForRun,
          indexTokenCountMap,
          runId: this.responseMessageId,
          signal: abortController.signal,
          customHandlers: this.options.eventHandlers,
          requestBody: config.configurable.requestBody,
          tokenCounter: createTokenCounter(this.getEncoding()),
        });

        if (!run) {
          throw new Error('Failed to create run');
        }

        this.run = run;
        if (userMCPAuthMap != null) {
          config.configurable.userMCPAuthMap = userMCPAuthMap;
        }

        /** @deprecated Agent Chain */
        config.configurable.last_agent_id = agents[agents.length - 1].id;
        await run.processStream({ messages }, config, {
          callbacks: {
            [Callback.TOOL_ERROR]: logToolError,
          },
        });



        config.signal = null;
      };

      memoryPromise = this.runMemory(initialMessages);

      // Dual-axis rotation: outer = model fallbacks (503), inner = API keys (429/403)
      let initialKeys = [this.options.agent?.model_parameters?.apiKey];
      if (typeof initialKeys[0] === 'string' && initialKeys[0].includes(',')) {
        initialKeys = initialKeys[0].split(',').map((k) => k.trim()).filter(Boolean);
      }
      initialKeys = initialKeys.filter(Boolean);

      // CRITICAL FALLBACK: Merge environment keys (GOOGLE_KEY, GEMINI_API_KEY) so that
      // when a single user/agent key hits daily quota (429 limit: 20), rotation can try other available keys!
      const envKeys = [process.env.GOOGLE_KEY, process.env.GEMINI_API_KEY]
        .filter(Boolean)
        .flatMap((k) => k.split(','))
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k !== 'user_provided');

      let keys = [...initialKeys];
      for (const ek of envKeys) {
        if (!keys.includes(ek)) {
          keys.push(ek);
        }
      }
      if (!keys.length) {
        keys = [null];
      }

      // Build model fallback list from GOOGLE_MODELS env for 503 rotation
      // Exclude audio/live-only models: they return 404 for streamGenerateContent
      const primaryAgentModel = this.options.agent?.model_parameters?.model || '';
      const envAgentModels = (process.env.GOOGLE_MODELS || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
        .filter((m) => !m.includes('native-audio') && !m.includes('-live-'));
      const agentModelFallbacks = [primaryAgentModel, ...envAgentModels.filter((m) => m !== primaryAgentModel)];

      let attemptErrors = [];
      let success = false;
      let lastErr = null;
      const initialContentPartsLength = this.contentParts.length;

      for (let mi = 0; mi < agentModelFallbacks.length && !success; mi++) {
        const currentModel = agentModelFallbacks[mi];
        if (mi > 0) {
          // Apply the fallback model before retrying
          logger.warn(`[AgentClient] 503 / overloaded — rotating agent model to "${currentModel}" (fallback ${mi}/${agentModelFallbacks.length - 1})`);
          this.options.agent.model_parameters.model = currentModel;
          if (config?.configurable?.endpointOption?.model_parameters) {
            config.configurable.endpointOption.model_parameters.model = currentModel;
          }

          // Apply fallback model to all secondary agents that match primaryAgentModel
          if (this.agentConfigs && this.agentConfigs.size > 0) {
            for (const secondaryAg of this.agentConfigs.values()) {
              if (secondaryAg.model_parameters && secondaryAg.model_parameters.model === primaryAgentModel) {
                secondaryAg.model_parameters.model = currentModel;
              }
            }
          }
          // Reset attempt errors for new model
          attemptErrors = [];
        }

        let rotateToNextModel = false;
        for (let i = 0; i < keys.length; i++) {
          try {
            if (keys[i]) {
              // Inject rotated key into the primary agent
              this.options.agent.model_parameters.apiKey = keys[i];
              if (config?.configurable?.endpointOption?.model_parameters) {
                config.configurable.endpointOption.model_parameters.apiKey = keys[i];
              }
              
              // CRITICAL BUGFIX: Also inject the rotated key into ALL secondary agents
              // participating in the Multi-Agent Handoff Graph! Otherwise the specialists
              // will get stuck infinitely using a broken/leaked key causing the 9-key exhaust bug.
              if (this.agentConfigs && this.agentConfigs.size > 0) {
                for (const secondaryAg of this.agentConfigs.values()) {
                  if (!secondaryAg.model_parameters) {
                    secondaryAg.model_parameters = {};
                  }
                  secondaryAg.model_parameters.apiKey = keys[i];
                }
              }
            }
            /**
             * Re-build the messages array from the raw payload on every retry
             * to prevent LangGraph's in-place mutations from bleeding partial
             * generations into the next API key's context history.
             */
            const { messages: pristineMessages } = formatAgentMessages(
              payload,
              this.indexTokenCountMap,
              toolSet,
            );
            await runAgents(pristineMessages);
            success = true;
            break; // Exit key loop on success
          } catch (err) {
            const safeMsg = (err?.message || '').substring(0, 1000);
            const safeStack = (err?.stack || '').substring(0, 2000);
            logger.error(`[AgentClient ERROR DUMP] [Key ${i}] Name: ${err?.name}, Status: ${err?.status}, Message: ${safeMsg}\nSTACK: ${safeStack}`);
            if (err?.response) {
              try {
                let dump = '';
                if (err.response.data) {
                  const dataStr = typeof err.response.data === 'string'
                    ? err.response.data
                    : JSON.stringify(err.response.data);
                  dump = dataStr.length > 2000 ? dataStr.substring(0, 2000) + '... [truncated]' : dataStr;
                } else {
                  dump = '[No response data]';
                }
                logger.error(`[AgentClient RESPONSE DUMP]: status=${err.response.status} data=${dump}`);
              } catch (logErr) {
                logger.error(`[AgentClient RESPONSE DUMP]: status=${err?.response?.status || 'unknown'} (unserializable response: ${logErr.message})`);
              }
            }

            lastErr = err;
            const isDailyQuotaExceeded = err?.message?.includes('GenerateRequestsPerDay') || err?.message?.includes('limit: 20');
            const isQuotaEvent = err?.status === 429 || err?.message?.includes('429');
            const isGenericQuota = err?.status === 403 || err?.message?.includes('403');
            const isInvalidKey = err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid');
            const isServiceUnavailable = err?.status === 503 || err?.message?.includes('503') ||
              err?.message?.includes('overloaded') || err?.message?.includes('Service Unavailable') ||
              err?.message?.includes('UNAVAILABLE') || err?.message?.includes('Failed to parse stream') ||
              err?.message?.includes('parse stream') || err?.message?.includes('Failed to parse');
            const isNetworkError = err?.message?.includes('fetch failed') ||
              err?.message?.includes('ECONNRESET') ||
              err?.message?.includes('ETIMEDOUT') ||
              err?.message?.includes('ENOTFOUND') ||
              err?.message?.includes('socket hang up') ||
              err?.message?.includes('undici');

            const isRetryable = isDailyQuotaExceeded || isQuotaEvent || isGenericQuota || isInvalidKey || isServiceUnavailable || isNetworkError;

            attemptErrors.push(`[Key ${i + 1}]: ` + (err?.message || 'Error'));

            // Clean up partial output from failed run
            this.contentParts.splice(initialContentPartsLength);

            try {
              const { sendEvent } = require('@librechat/api');
              sendEvent(this.options.res, {
                event: 'clear_step_maps',
                data: { messageId: this.responseMessageId },
              });
            } catch (e) {
              logger.error('Failed to send clear_step_maps event', e);
            }

            if (isDailyQuotaExceeded && i < keys.length - 1) {
              logger.warn(`[AgentClient] Daily quota exhausted for model "${currentModel}" on Key ${i + 1}. Retrying with next API key ${i + 2}...`);
              continue; // Try next key, same model
            } else if (isDailyQuotaExceeded) {
              logger.warn(`[AgentClient] Daily quota exhausted for model "${currentModel}" on all ${keys.length} keys. Rotating immediately to next model...`);
              rotateToNextModel = true;
              break;
            } else if (isRetryable && i < keys.length - 1) {
              logger.warn(`[AgentClient] Error (${isInvalidKey ? 'Invalid key' : isNetworkError ? 'Network / Fetch failed' : isServiceUnavailable ? 'Model unavailable/overloaded (503)' : 'Rate limit / Quota'}). Retrying with next API key ${i + 2}...`);
              continue; // Try next key, same model
            } else if (isRetryable) {
              // Last key also failed or model unavailable → rotate to next model
              logger.warn(`[AgentClient] All ${keys.length} API keys exhausted, network error, or model unavailable for "${currentModel}". Rotating to next model...`);
              rotateToNextModel = true;
              break; // Break key loop → outer loop advances to next model
            } else {
              break; // Non-recoverable error, stop all retries
            }
          }
        }
        if (rotateToNextModel && !success) {
          attemptErrors = [];
          continue; // Advance outer loop to next model
        }
        if (!rotateToNextModel && !success) {
          break; // Stop outer model rotation loop on non-recoverable errors
        }
      }

      if (!success && lastErr) {
        if (attemptErrors.length > 1) {
          throw new Error(`All available API keys failed.\n` + attemptErrors.join('\n'));
        }
        throw lastErr;
      }

      /** @deprecated Agent Chain */
      if (config.configurable.hide_sequential_outputs) {
        this.contentParts = this.contentParts.filter((part, index) => {
          // Include parts that are either:
          // 1. At or after the finalContentStart index
          // 2. Of type tool_call
          // 3. Have tool_call_ids property
          // 4. ✅ FIX 2: Explicitly include tool_result and check for tool_call_id
          return (
            index >= this.contentParts.length - 1 ||
            part.type === ContentTypes.TOOL_CALL ||
            part.type === ContentTypes.TOOL_RESULT ||
            part.tool_call_ids != null ||
            part.tool_call_id != null
          );
        });
      }

      try {
        await handleMemory();

        const balanceConfig = getBalanceConfig(appConfig);
        const transactionsConfig = getTransactionsConfig(appConfig);
        await this.recordCollectedUsage({
          context: 'message',
          balance: balanceConfig,
          transactions: transactionsConfig,
        });
      } catch (err) {
        logger.error(
          '[api/server/controllers/agents/client.js #chatCompletion] Error recording collected usage',
          err,
        );
      }
    } catch (err) {
      await handleMemory();
      logger.error(
        '[api/server/controllers/agents/client.js #sendCompletion] Operation aborted',
        err,
      );
      if (!abortController.signal.aborted) {
        logger.error(
          '[api/server/controllers/agents/client.js #sendCompletion] Unhandled error type',
          err,
        );
        this.contentParts.push({
          type: ContentTypes.ERROR,
          [ContentTypes.ERROR]: `An error occurred while processing the request${err?.message ? `: ${err.message}` : ''}`,
        });
      }
    }
  }

  /**
   *
   * @param {Object} params
   * @param {string} params.text
   * @param {string} params.conversationId
   */
  async titleConvo({ text, abortController }) {
    if (!this.run) {
      throw new Error('Run not initialized');
    }
    const { handleLLMEnd, collected: collectedMetadata } = createMetadataAggregator();
    const { req, res, agent } = this.options;
    const appConfig = req.config;
    let endpoint = agent.endpoint;

    /** @type {import('@librechat/agents').ClientOptions} */
    let clientOptions = {
      model: agent.model || agent.model_parameters.model,
    };

    let titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });

    /** @type {TEndpoint | undefined} */
    const endpointConfig =
      appConfig.endpoints?.all ??
      appConfig.endpoints?.[endpoint] ??
      titleProviderConfig.customEndpointConfig;
    if (!endpointConfig) {
      logger.debug(
        `[api/server/controllers/agents/client.js #titleConvo] No endpoint config for "${endpoint}"`,
      );
    }

    if (endpointConfig?.titleConvo === false) {
      logger.debug(
        `[api/server/controllers/agents/client.js #titleConvo] Title generation disabled for endpoint "${endpoint}"`,
      );
      return;
    }

    if (endpointConfig?.titleEndpoint && endpointConfig.titleEndpoint !== endpoint) {
      try {
        titleProviderConfig = getProviderConfig({
          provider: endpointConfig.titleEndpoint,
          appConfig,
        });
        endpoint = endpointConfig.titleEndpoint;
      } catch (error) {
        logger.warn(
          `[api/server/controllers/agents/client.js #titleConvo] Error getting title endpoint config for "${endpointConfig.titleEndpoint}", falling back to default`,
          error,
        );
        // Fall back to original provider config
        endpoint = agent.endpoint;
        titleProviderConfig = getProviderConfig({ provider: endpoint, appConfig });
      }
    }

    if (
      endpointConfig &&
      endpointConfig.titleModel &&
      endpointConfig.titleModel !== Constants.CURRENT_MODEL
    ) {
      clientOptions.model = endpointConfig.titleModel;
    }

    const options = await titleProviderConfig.getOptions({
      req,
      res,
      optionsOnly: true,
      overrideEndpoint: endpoint,
      overrideModel: clientOptions.model,
      endpointOption: { model_parameters: clientOptions },
    });

    let provider = options.provider ?? titleProviderConfig.overrideProvider ?? agent.provider;
    if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName == null
    ) {
      provider = Providers.OPENAI;
    } else if (
      endpoint === EModelEndpoint.azureOpenAI &&
      options.llmConfig?.azureOpenAIApiInstanceName != null &&
      provider !== Providers.AZURE
    ) {
      provider = Providers.AZURE;
    }

    /** @type {import('@librechat/agents').ClientOptions} */
    clientOptions = { ...options.llmConfig };
    if (options.configOptions) {
      clientOptions.configuration = options.configOptions;
    }

    if (clientOptions.maxTokens != null) {
      delete clientOptions.maxTokens;
    }
    if (clientOptions?.modelKwargs?.max_completion_tokens != null) {
      delete clientOptions.modelKwargs.max_completion_tokens;
    }
    if (clientOptions?.modelKwargs?.max_output_tokens != null) {
      delete clientOptions.modelKwargs.max_output_tokens;
    }

    clientOptions = Object.assign(
      Object.fromEntries(
        Object.entries(clientOptions).filter(([key]) => !omitTitleOptions.has(key)),
      ),
    );

    if (
      provider === Providers.GOOGLE &&
      (endpointConfig?.titleMethod === TitleMethod.FUNCTIONS ||
        endpointConfig?.titleMethod === TitleMethod.STRUCTURED)
    ) {
      clientOptions.json = true;
    }

    /** Resolve request-based headers for Custom Endpoints. Note: if this is added to
     *  non-custom endpoints, needs consideration of varying provider header configs.
     */
    if (clientOptions?.configuration?.defaultHeaders != null) {
      clientOptions.configuration.defaultHeaders = resolveHeaders({
        headers: clientOptions.configuration.defaultHeaders,
        body: {
          messageId: this.responseMessageId,
          conversationId: this.conversationId,
          parentMessageId: this.parentMessageId,
        },
      });
    }

    // Native Key Rotation for Title Generation
    let keys = [clientOptions.apiKey];
    if (typeof keys[0] === 'string' && keys[0].includes(',')) {
      keys = keys[0].split(',').map((k) => k.trim()).filter(Boolean);
    }
    if (!keys.length) {
      keys = [null];
    }

    let attemptErrors = [];
    let success = false;
    let lastErr = null;
    let titleResult;

    for (let i = 0; i < keys.length; i++) {
      try {
        if (keys[i]) {
          clientOptions.apiKey = keys[i];
        }
        titleResult = await this.run.generateTitle({
          provider,
          clientOptions,
          inputText: text,
          contentParts: this.contentParts,
          titleMethod: endpointConfig?.titleMethod,
          titlePrompt: endpointConfig?.titlePrompt,
          titlePromptTemplate: endpointConfig?.titlePromptTemplate,
          chainOptions: {
            signal: abortController.signal,
            callbacks: [
              {
                handleLLMEnd,
              },
            ],
            configurable: {
              thread_id: this.conversationId,
              user_id: this.user ?? this.options.req.user?.id,
            },
          },
        });
        success = true;
        break; // Exit loop on success
      } catch (err) {
        lastErr = err;
        const isQuotaEvent = err?.status === 429 || err?.message?.includes('429');
        const isGenericQuota = err?.status === 403 || err?.message?.includes('403');
        const isInvalidKey = err?.status === 400 || err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid');

        attemptErrors.push(`[Key ${i + 1}]: ` + (err?.message || 'Error'));

        if ((isQuotaEvent || isGenericQuota || isInvalidKey) && i < keys.length - 1) {
          logger.warn(`[AgentClient] titleConvo Error (${isInvalidKey ? 'Invalid key' : 'Rate limit / Quota'}). Retrying with next API key ${i + 1}...`);
          continue;
        } else {
          break;
        }
      }
    }

    if (!success && lastErr) {
      if (attemptErrors.length > 1) {
        logger.error('[api/server/controllers/agents/client.js #titleConvo] Error: All available API keys failed.\n' + attemptErrors.join('\n'));
      } else {
        logger.error('[api/server/controllers/agents/client.js #titleConvo] Error', lastErr);
      }
      return;
    }

    try {
      const collectedUsage = collectedMetadata.map((item) => {
        let input_tokens, output_tokens;

        if (item.usage) {
          input_tokens =
            item.usage.prompt_tokens || item.usage.input_tokens || item.usage.inputTokens;
          output_tokens =
            item.usage.completion_tokens || item.usage.output_tokens || item.usage.outputTokens;
        } else if (item.tokenUsage) {
          input_tokens = item.tokenUsage.promptTokens;
          output_tokens = item.tokenUsage.completionTokens;
        }

        return {
          input_tokens: input_tokens,
          output_tokens: output_tokens,
        };
      });

      const balanceConfig = getBalanceConfig(appConfig);
      const transactionsConfig = getTransactionsConfig(appConfig);
      await this.recordCollectedUsage({
        collectedUsage,
        context: 'title',
        model: clientOptions.model,
        balance: balanceConfig,
        transactions: transactionsConfig,
      }).catch((err) => {
        logger.error(
          '[api/server/controllers/agents/client.js #titleConvo] Error recording collected usage',
          err,
        );
      });

      return sanitizeTitle(titleResult.title);
    } catch (err) {
      logger.error('[api/server/controllers/agents/client.js #titleConvo] Error after generating title', err);
      return;
    }
  }

  /**
   * @param {object} params
   * @param {number} params.promptTokens
   * @param {number} params.completionTokens
   * @param {string} [params.model]
   * @param {OpenAIUsageMetadata} [params.usage]
   * @param {AppConfig['balance']} [params.balance]
   * @param {string} [params.context='message']
   * @returns {Promise<void>}
   */
  async recordTokenUsage({
    model,
    usage,
    balance,
    promptTokens,
    completionTokens,
    context = 'message',
  }) {
    try {
      await spendTokens(
        {
          model,
          context,
          balance,
          conversationId: this.conversationId,
          user: this.user ?? this.options.req.user?.id,
          endpointTokenConfig: this.options.endpointTokenConfig,
        },
        { promptTokens, completionTokens },
      );

      if (
        usage &&
        typeof usage === 'object' &&
        'reasoning_tokens' in usage &&
        typeof usage.reasoning_tokens === 'number'
      ) {
        await spendTokens(
          {
            model,
            balance,
            context: 'reasoning',
            conversationId: this.conversationId,
            user: this.user ?? this.options.req.user?.id,
            endpointTokenConfig: this.options.endpointTokenConfig,
          },
          { completionTokens: usage.reasoning_tokens },
        );
      }
    } catch (error) {
      logger.error(
        '[api/server/controllers/agents/client.js #recordTokenUsage] Error recording token usage',
        error,
      );
    }
  }

  getEncoding() {
    return 'o200k_base';
  }

  /**
   * Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
   * @param {string} text - The text to get the token count for.
   * @returns {number} The token count of the given text.
   */
  getTokenCount(text) {
    const encoding = this.getEncoding();
    return Tokenizer.getTokenCount(text, encoding);
  }
}

module.exports = AgentClient;

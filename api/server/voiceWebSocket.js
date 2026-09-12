const WebSocket = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
const { createSession } = require('./routes/voice/voiceSession');
const logger = require('~/config/winston');

/**
 * Setup WebSocket server for voice conversations
 * @param {http.Server} server - HTTP server instance
 */
function setupVoiceWebSocket(server) {
    const wss = new WebSocket.Server({ noServer: true });

    // Handle WebSocket upgrade requests
    server.on('upgrade', (request, socket, head) => {
        const pathname = url.parse(request.url).pathname;

        // Only handle /ws/voice path
        if (pathname === '/ws/voice') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
        // Do not destroy socket here if path doesn't match, allow other handlers
    });

    // Handle WebSocket connections
    wss.on('connection', async (ws, request) => {
        logger.info('[WebSocket] New voice connection attempt');

        try {
            // Extract token from query or headers
            const params = url.parse(request.url, true).query;
            const token = params.token || request.headers['sec-websocket-protocol'];
            const conversationId = params.conversationId;
            const initialVoice = params.initialVoice;
            const model = params.model;
            const endpoint = params.endpoint;
            const mode = params.mode;
            const agentId = params.agentId;

            if (!token) {
                logger.warn('[WebSocket] No token provided');
                ws.close(1008, 'Authentication required');
                return;
            }

            // Verify token
            // Try JWT_SECRET first (Access Token)
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (err) {
                // Try JWT_REFRESH_SECRET (Refresh Token) as fallback
                try {
                    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
                } catch (err2) {
                    logger.error('[WebSocket] Token verification failed:', err2.message);
                    ws.close(1008, 'Authentication failed');
                    return;
                }
            }

            if (!decoded) {
                logger.error('[WebSocket] Token verification failed: Unable to decode');
                ws.close(1008, 'Authentication failed');
                return;
            }

            const userId = decoded.id;
            
            // Fetch full user to get personalization settings
            const { getUserById } = require('~/models');
            const fullUser = await getUserById(userId);
            
            let user = { id: userId }; 
            if (fullUser) {
                user = { ...fullUser, id: userId }; // Ensure id property is preserved
            }

            logger.info('[WebSocket] Token verified for user:', user.id);

            if (!user || !user.id) {
                logger.warn('[WebSocket] Invalid user from token');
                ws.close(1008, 'Invalid user');
                return;
            }

            logger.info(`[WebSocket] User authenticated: ${user.id}`);

            // Create voice session
            // Pass config object containing voice, model/endpoint and personalization settings
            const config = {
                userSettings: user.personalization?.geminiModels || {}
            };
            if (initialVoice) config.voice = initialVoice;
            if (model) config.model = model;
            if (endpoint) config.endpoint = endpoint;
            if (mode) config.mode = mode;
            if (agentId) config.agentId = agentId;

            const result = await createSession(ws, user.id, conversationId, config);

            if (!result.success) {
                logger.error(`[WebSocket] Failed to create session: ${result.error}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    data: { message: result.error },
                }));
                ws.close(1011, result.error);
                return;
            }

            logger.info(`[WebSocket] Voice session created for user: ${user.id}`);

            // Send listening status now that the session is active and ready
            ws.send(JSON.stringify({
                type: 'status',
                data: { status: 'listening' },
            }));

        } catch (error) {
            logger.error('[WebSocket] Connection error:', error);
            ws.close(1011, 'Internal server error');
        }
    });

    logger.info('[WebSocket] Voice WebSocket server initialized');
    return wss;
}

module.exports = setupVoiceWebSocket;


import express from 'express';
import cors from 'cors';
import { MCPClient, createMCPAssistant } from './client.js';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SessionConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  anthropicApiKey: string;
  model?: string;
  maxTokens?: number;
}

interface ChatRequest {
  message: string;
  sessionId?: string;
  config?: Partial<SessionConfig>;
}

interface ChatResponse {
  response: string;
  sessionId: string;
  toolsUsed?: string[];
  conversationLength: number;
}

interface SessionInfo {
  client: MCPClient;
  config: SessionConfig;
  createdAt: Date;
  lastUsed: Date;
}

class MCPRestAPI {
  private app: express.Application;
  private sessions: Map<string, SessionInfo> = new Map();
  private defaultConfig: SessionConfig;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes

  constructor(defaultConfig: SessionConfig, port: number = 5000) {
    this.app = express();
    this.defaultConfig = defaultConfig;
    this.setupMiddleware();
    this.setupRoutes();
    this.startCleanupTask();
    
    this.app.listen(port, () => {
      console.log(`MCP REST API server running on port ${port}`);
    });
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Chat endpoint
    this.app.post('/chat', this.handleChat.bind(this));

    // Session management
    this.app.get('/sessions', this.listSessions.bind(this));
    this.app.delete('/sessions/:sessionId', this.deleteSession.bind(this));
    this.app.post('/sessions/:sessionId/clear', this.clearSession.bind(this));

    // Tools information
    this.app.get('/sessions/:sessionId/tools', this.getSessionTools.bind(this));
    this.app.get('/sessions/:sessionId/history', this.getSessionHistory.bind(this));

    // Default MCP server configuration
    this.app.get('/config', (req, res) => {
      const { anthropicApiKey, ...safeConfig } = this.defaultConfig;
      res.json({ ...safeConfig, anthropicApiKey: '***' });
    });

    // Error handler
    this.app.use(this.errorHandler.bind(this));
  }

  private async handleChat(req: any, res: any) {
    try {
      const { message, sessionId, config } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required and must be a string' });
        return;
      }

      const finalSessionId = sessionId || uuidv4();
      let session = this.sessions.get(finalSessionId);

      // Create new session if doesn't exist
      if (!session) {
        const sessionConfig = { ...this.defaultConfig, ...config };
        
        try {
          const client = await createMCPAssistant(sessionConfig);
          session = {
            client,
            config: sessionConfig,
            createdAt: new Date(),
            lastUsed: new Date()
          };
          this.sessions.set(finalSessionId, session);
          console.log(`Created new session: ${finalSessionId}`);
        } catch (error) {
          console.error('Failed to create MCP client:', error);
          res.status(500).json({ 
            error: 'Failed to initialize MCP client',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
          return;
        }
      }

      // Update last used time
      session.lastUsed = new Date();

      // Process the message
      const startTime = Date.now();
      const toolsBefore = session.client.tools.length;
      
      const response = await session.client.ask(message);
      
      const processingTime = Date.now() - startTime;
      const conversationLength = session.client.getHistory().length;

      console.log(`Session ${finalSessionId}: Processed in ${processingTime}ms, conversation length: ${conversationLength}`);

      const chatResponse = {
        response,
        sessionId: finalSessionId,
        conversationLength,
        toolsUsed: session.client.tools.map((t:any) => t.name)
      };

      res.json(chatResponse);

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ 
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async listSessions(req: any, res: any) {
    const sessions = Array.from(this.sessions.entries()).map(([id, info]) => ({
      sessionId: id,
      createdAt: info.createdAt.toISOString(),
      lastUsed: info.lastUsed.toISOString(),
      conversationLength: info.client.getHistory().length,
      toolsCount: info.client.tools.length,
      connected: info.client.connected
    }));

    res.json({ sessions, count: sessions.length });
  }

  private async deleteSession(req: any, res: any) {
    const { sessionId } = req.params;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await session.client.disconnect();
      this.sessions.delete(sessionId);
      console.log(`Deleted session: ${sessionId}`);
      res.json({ message: 'Session deleted successfully' });
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  }

  private async clearSession(req: any, res: any) {
    const { sessionId } = req.params;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    session.client.clearHistory();
    session.lastUsed = new Date();
    
    res.json({ 
      message: 'Session history cleared',
      sessionId,
      conversationLength: 0
    });
  }

  private async getSessionTools(req: any, res:any) {
    const { sessionId } = req.params;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      sessionId,
      tools: session.client.tools,
      count: session.client.tools.length
    });
  }

  private async getSessionHistory(req: any, res: any) {
    const { sessionId } = req.params;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const history = session.client.getHistory();
    res.json({
      sessionId,
      history,
      length: history.length
    });
  }

  private errorHandler(error: any, req: any, res: any, next: any) {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  private startCleanupTask(): void {
    // Clean up inactive sessions every 5 minutes
    setInterval(() => {
      const now = new Date();
      const sessionsToDelete: string[] = [];

      for (const [sessionId, session] of this.sessions.entries()) {
        const timeSinceLastUse = now.getTime() - session.lastUsed.getTime();
        if (timeSinceLastUse > this.sessionTimeout) {
          sessionsToDelete.push(sessionId);
        }
      }

      // Clean up expired sessions
      sessionsToDelete.forEach(async (sessionId) => {
        const session = this.sessions.get(sessionId);
        if (session) {
          try {
            await session.client.disconnect();
            this.sessions.delete(sessionId);
            console.log(`Cleaned up expired session: ${sessionId}`);
          } catch (error) {
            console.error(`Failed to cleanup session ${sessionId}:`, error);
          }
        }
      });

      if (sessionsToDelete.length > 0) {
        console.log(`Cleaned up ${sessionsToDelete.length} expired sessions`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    console.log('Shutting down MCP REST API...');
    
    // Close all sessions
    const promises = Array.from(this.sessions.values()).map(session => 
      session.client.disconnect().catch(console.error)
    );
    
    await Promise.all(promises);
    this.sessions.clear();
    console.log('All MCP sessions closed');
  }
}

async function startServer() {
  const config = {
    command: process.env.MCP_COMMAND || 'node',
    args: process.env.MCP_ARGS ? process.env.MCP_ARGS.split(',') : ['../mcp/dist/index.js'],
    env: process.env.MCP_ENV ? JSON.parse(process.env.MCP_ENV) : {},
    anthropicApiKey: 'sk-an',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(process.env.MAX_TOKENS || '4000')
  };

  if (!config.anthropicApiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const server = new MCPRestAPI(config, 5000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.shutdown();
    process.exit(0);
  });
}

// Export for use as module
export { MCPRestAPI };

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

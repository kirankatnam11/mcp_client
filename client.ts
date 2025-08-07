
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

interface MCPClientOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  anthropicApiKey: string;
  model?: string;
  maxTokens?: number;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    content?: string;
    is_error?: boolean;
    tool_use_id?: string;
  }>;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;
  private options: MCPClientOptions;
  private availableTools: any[] = [];
  private conversationHistory: AnthropicMessage[] = [];
  private isConnected = false;

  constructor(options: MCPClientOptions) {
    this.options = {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      ...options
    };

    // Create transport
    this.transport = new StdioClientTransport({
      command: this.options.command,
      args: this.options.args || []
    });

    // Create client
    this.client = new Client(
      {
        name: "anthropic-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Client is already connected');
    }

    try {
      // Connect to the MCP server
      await this.client.connect(this.transport);
      this.isConnected = true;

      // Load available tools
      await this.loadTools();

      console.log('MCP Client connected successfully');
    } catch (error) {
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      console.log('MCP Client disconnected');
    }
  }

  private async loadTools(): Promise<void> {
    try {
      const result = await this.client.listTools();
      this.availableTools = result.tools || [];
      console.log(`Loaded ${this.availableTools.length} tools:`, 
        this.availableTools.map(t => t.name));
    } catch (error) {
      console.warn('Failed to load tools:', error);
      this.availableTools = [];
    }
  }

  private convertMCPToolsToAnthropic(): AnthropicTool[] {
    return this.availableTools.map(tool => ({
      name: tool.name,
      description: tool.description || `Execute ${tool.name}`,
      input_schema: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }));
  }

  private async callAnthropic(messages: AnthropicMessage[], tools?: AnthropicTool[]): Promise<any> {
    const requestBody: any = {
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      messages: messages
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.options.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: arguments_
      });
      return result;
    } catch (error) {
      throw new Error(`Tool call failed: ${error}`);
    }
  }

  async listResources(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      return await this.client.listResources();
    } catch (error) {
      throw new Error(`Failed to list resources: ${error}`);
    }
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      return await this.client.readResource({ uri });
    } catch (error) {
      throw new Error(`Failed to read resource: ${error}`);
    }
  }

  async listPrompts(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      return await this.client.listPrompts();
    } catch (error) {
      throw new Error(`Failed to list prompts: ${error}`);
    }
  }

  async getPrompt(name: string, arguments_?: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      return await this.client.getPrompt({
        name,
        arguments: arguments_
      });
    } catch (error) {
      throw new Error(`Failed to get prompt: ${error}`);
    }
  }

  async ask(question: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

    try {
      // Add user question to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: question
      });

      const anthropicTools = this.convertMCPToolsToAnthropic();
      let response = await this.callAnthropic(this.conversationHistory, anthropicTools);

      // Handle tool calls in a loop
      while (response.stop_reason === 'tool_use') {
        // Add assistant response to history
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content
        });

        // Execute all tool calls and collect results
        const toolResults: any[] = [];
        for (const contentBlock of response.content) {
          if (contentBlock.type === 'tool_use') {
            try {
              console.log(`Calling tool: ${contentBlock.name} with input:`, contentBlock.input);
              const toolResult = await this.callTool(contentBlock.name, contentBlock.input);
              
              // Handle the MCP tool result format
              let resultContent = '';
              if (toolResult.content) {
                if (Array.isArray(toolResult.content)) {
                  resultContent = toolResult.content
                    .map((item: any) => item.type === 'text' ? item.text : JSON.stringify(item))
                    .join('\n');
                } else {
                  resultContent = typeof toolResult.content === 'string' 
                    ? toolResult.content 
                    : JSON.stringify(toolResult.content);
                }
              } else {
                resultContent = JSON.stringify(toolResult);
              }
              
              toolResults.push({
                type: 'tool_result',
                tool_use_id: contentBlock.id,
                content: resultContent
              });
            } catch (error: any) {
              console.error(`Tool call failed for ${contentBlock.name}:`, error);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: contentBlock.id,
                content: `Error: ${error.message}`,
                is_error: true
              });
            }
          }
        }

        // Add tool results to conversation
        if (toolResults.length > 0) {
          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

          // Get next response from Anthropic
          response = await this.callAnthropic(this.conversationHistory, anthropicTools);
        } else {
          break;
        }
      }

      // Add final assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content
      });

      // Extract text content from response
      let finalResponse = '';
      for (const contentBlock of response.content) {
        if (contentBlock.type === 'text') {
          finalResponse += contentBlock.text;
        }
      }

      return finalResponse;

    } catch (error) {
      console.error('Error in ask method:', error);
      throw error;
    }
  }

  // Utility methods
  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): AnthropicMessage[] {
    return [...this.conversationHistory];
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get tools(): any[] {
    return [...this.availableTools];
  }

  // Additional MCP methods using the SDK
  async ping(): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }
    
    try {
      return await this.client.ping();
    } catch (error) {
      throw new Error(`Ping failed: ${error}`);
    }
  }

  async setLoggingLevel(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Client is not connected');
    }

  }
}

// Factory function to create and initialize MCP client
export async function createMCPAssistant(options: MCPClientOptions): Promise<MCPClient> {
  const client = new MCPClient(options);
  
  // Set up error handling for transport
  client['transport'].onclose = () => {
    console.log('MCP transport closed');
  };

  client['transport'].onerror = (error) => {
    console.error('MCP transport error:', error);
  };

  // Connect and initialize
  await client.connect();
  
  return client;
}

// Example usage with different MCP servers
export const MCPServerConfigs = {
  // File system server
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/directory']
  },
  
  // Git server
  git: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git', '--repository', '/path/to/repo']
  },
  
  // Brave search server
  braveSearch: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: 'your-brave-api-key' }
  },

  // PostgreSQL server
  postgres: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { 
      POSTGRES_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/dbname'
    }
  },

  // Custom Python server
  customPython: {
    command: 'python',
    args: ['-m', 'your_custom_mcp_server']
  }
};

/*
// Example usage:
async function example() {
  // Using a pre-configured server
  const assistant = await createMCPAssistant({
    ...MCPServerConfigs.filesystem,
    anthropicApiKey: 'your-anthropic-api-key'
  });

  try {
    const response = await assistant.ask("List the files in the current directory");
    console.log('Assistant:', response);

    // Check what tools are available
    console.log('Available tools:', assistant.tools.map(t => t.name));

    // Use resources if available
    const resources = await assistant.listResources();
    console.log('Available resources:', resources);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await assistant.disconnect();
  }
}

// Multiple server example
async function multiServerExample() {
  const clients = await Promise.all([
    createMCPAssistant({
      ...MCPServerConfigs.filesystem,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!
    }),
    createMCPAssistant({
      ...MCPServerConfigs.braveSearch,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!
    })
  ]);

  try {
    // Use filesystem client
    const fileResponse = await clients[0].ask("What files are in the current directory?");
    console.log('Files:', fileResponse);

    // Use search client
    const searchResponse = await clients[1].ask("Search for recent news about AI");
    console.log('Search results:', searchResponse);

  } finally {
    await Promise.all(clients.map(client => client.disconnect()));
  }
}
*/
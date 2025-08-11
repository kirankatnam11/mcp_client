import { Client } from “@modelcontextprotocol/sdk/client/index.js”;
import { StdioClientTransport } from “@modelcontextprotocol/sdk/client/stdio.js”;
import { CallToolResultSchema, ListToolsResultSchema } from “@modelcontextprotocol/sdk/types.js”;

interface OpenAIMessage {
role: ‘user’ | ‘assistant’ | ‘system’ | ‘tool’;
content: string | null;
tool_calls?: Array<{
id: string;
type: ‘function’;
function: {
name: string;
arguments: string;
};
}>;
tool_call_id?: string;
}

interface OpenAITool {
type: ‘function’;
function: {
name: string;
description: string;
parameters: {
type: ‘object’;
properties: Record<string, any>;
required?: string[];
};
};
}

export class MCPClient {
private client: Client;
private transport: StdioClientTransport;
private openaiApiKey: string;
private model: string;
private maxTokens: number;
private baseUrl: string;
private availableTools: any[] = [];
private conversationHistory: OpenAIMessage[] = [];
private isConnected = false;

constructor(openaiApiKey: string, model: string = ‘gpt-4’) {
this.openaiApiKey = openaiApiKey;
this.model = model;
this.maxTokens = 4000;
this.baseUrl = ‘https://api.openai.com/v1’;

```
// Hardcoded MCP server configuration - points to your simple MCP server
this.transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp-server.js'] // Assumes your MCP server file is in the same directory
});

// Create client
this.client = new Client(
  {
    name: "openai-mcp-client",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
```

}

async connect(): Promise<void> {
if (this.isConnected) {
throw new Error(‘Client is already connected’);
}

```
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
```

}

async disconnect(): Promise<void> {
if (this.isConnected) {
await this.client.close();
this.isConnected = false;
console.log(‘MCP Client disconnected’);
}
}

private async loadTools(): Promise<void> {
try {
const result = await this.client.listTools();
this.availableTools = result.tools || [];
console.log(`Loaded ${this.availableTools.length} tools:`,
this.availableTools.map(t => t.name));
} catch (error) {
console.warn(‘Failed to load tools:’, error);
this.availableTools = [];
}
}

private convertMCPToolsToOpenAI(): OpenAITool[] {
return this.availableTools.map(tool => ({
type: ‘function’,
function: {
name: tool.name,
description: tool.description || `Execute ${tool.name}`,
parameters: tool.inputSchema || {
type: ‘object’,
properties: {},
required: []
}
}
}));
}

private async callOpenAI(messages: OpenAIMessage[], tools?: OpenAITool[]): Promise<any> {
const requestBody: any = {
model: this.model,
max_tokens: this.maxTokens,
messages: messages
};

```
if (tools && tools.length > 0) {
  requestBody.tools = tools;
  requestBody.tool_choice = 'auto';
}

const response = await fetch(`${this.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.openaiApiKey}`
  },
  body: JSON.stringify(requestBody)
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(`OpenAI API error: ${response.status} ${error}`);
}

const result = await response.json();
return result.choices[0].message;
```

}

async callTool(name: string, arguments_: any): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  const result = await this.client.callTool({
    name,
    arguments: arguments_
  });
  return result;
} catch (error) {
  throw new Error(`Tool call failed: ${error}`);
}
```

}

async listResources(): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  return await this.client.listResources();
} catch (error) {
  throw new Error(`Failed to list resources: ${error}`);
}
```

}

async readResource(uri: string): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  return await this.client.readResource({ uri });
} catch (error) {
  throw new Error(`Failed to read resource: ${error}`);
}
```

}

async listPrompts(): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  return await this.client.listPrompts();
} catch (error) {
  throw new Error(`Failed to list prompts: ${error}`);
}
```

}

async getPrompt(name: string, arguments_?: any): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  return await this.client.getPrompt({
    name,
    arguments: arguments_
  });
} catch (error) {
  throw new Error(`Failed to get prompt: ${error}`);
}
```

}

async ask(question: string): Promise<string> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  // Add user question to conversation history
  this.conversationHistory.push({
    role: 'user',
    content: question
  });

  const openaiTools = this.convertMCPToolsToOpenAI();
  let response = await this.callOpenAI(this.conversationHistory, openaiTools);

  // Handle tool calls in a loop
  while (response.tool_calls && response.tool_calls.length > 0) {
    // Add assistant response with tool calls to history
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls
    });

    // Execute all tool calls and collect results
    for (const toolCall of response.tool_calls) {
      try {
        console.log(`Calling tool: ${toolCall.function.name} with arguments:`, toolCall.function.arguments);
        
        const args = JSON.parse(toolCall.function.arguments);
        const toolResult = await this.callTool(toolCall.function.name, args);
        
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
        
        // Add tool result to conversation
        this.conversationHistory.push({
          role: 'tool',
          content: resultContent,
          tool_call_id: toolCall.id
        });

      } catch (error: any) {
        console.error(`Tool call failed for ${toolCall.function.name}:`, error);
        
        // Add error result to conversation
        this.conversationHistory.push({
          role: 'tool',
          content: `Error: ${error.message}`,
          tool_call_id: toolCall.id
        });
      }
    }

    // Get next response from OpenAI
    response = await this.callOpenAI(this.conversationHistory, openaiTools);
  }

  // Add final assistant response to history
  this.conversationHistory.push({
    role: 'assistant',
    content: response.content
  });

  return response.content || '';

} catch (error) {
  console.error('Error in ask method:', error);
  throw error;
}
```

}

// Utility methods
clearHistory(): void {
this.conversationHistory = [];
}

getHistory(): OpenAIMessage[] {
return […this.conversationHistory];
}

get connected(): boolean {
return this.isConnected;
}

get tools(): any[] {
return […this.availableTools];
}

// Get tools in OpenAI format (for external use)
getOpenAITools(): OpenAITool[] {
return this.convertMCPToolsToOpenAI();
}

// Additional MCP methods using the SDK
async ping(): Promise<any> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}

```
try {
  return await this.client.ping();
} catch (error) {
  throw new Error(`Ping failed: ${error}`);
}
```

}

async setLoggingLevel(level: ‘debug’ | ‘info’ | ‘notice’ | ‘warning’ | ‘error’ | ‘critical’ | ‘alert’ | ‘emergency’): Promise<void> {
if (!this.isConnected) {
throw new Error(‘Client is not connected’);
}
// Implementation depends on MCP SDK capabilities
}
}

// Factory function to create and initialize MCP client
export async function createMCPAssistant(openaiApiKey: string, model: string = ‘gpt-4’): Promise<MCPClient> {
const client = new MCPClient(openaiApiKey, model);

// Set up error handling for transport
client[‘transport’].onclose = () => {
console.log(‘MCP transport closed’);
};

client[‘transport’].onerror = (error) => {
console.error(‘MCP transport error:’, error);
};

// Connect and initialize
await client.connect();

return client;
}

/*
// Example usage - now much simpler!
async function example() {
// Just pass your OpenAI API key
const assistant = await createMCPAssistant(‘your-openai-api-key’);

try {
const response = await assistant.ask(“What’s the weather like in New York?”);
console.log(‘Assistant:’, response);

```
// Check what tools are available
console.log('Available tools:', assistant.tools.map(t => t.name));

// Direct tool usage
const weatherResult = await assistant.callTool('get_weather', {
  location: 'San Francisco, CA',
  unit: 'celsius'
});
console.log('Direct tool result:', weatherResult);
```

} catch (error) {
console.error(‘Error:’, error);
} finally {
await assistant.disconnect();
}
}

// Using with specific model
async function exampleWithModel() {
const assistant = await createMCPAssistant(‘your-openai-api-key’, ‘gpt-4-turbo’);

try {
const response = await assistant.ask(“Calculate 15 * 25 and tell me the weather in Tokyo”);
console.log(‘Assistant:’, response);
} finally {
await assistant.disconnect();
}
}

// Using with external OpenAI client
import OpenAI from ‘openai’;

async function externalOpenAIExample() {
const mcpClient = await createMCPAssistant(‘your-openai-api-key’);
const openai = new OpenAI({ apiKey: ‘your-openai-api-key’ });

try {
// Get tools in OpenAI format
const tools = mcpClient.getOpenAITools();

```
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Calculate 15 * 25' }],
  tools: tools,
  tool_choice: 'auto'
});

// Handle tool calls
if (completion.choices[0].message.tool_calls) {
  for (const toolCall of completion.choices[0].message.tool_calls) {
    const args = JSON.parse(toolCall.function.arguments);
    const result = await mcpClient.callTool(toolCall.function.name, args);
    console.log(`Tool ${toolCall.function.name} result:`, result);
  }
}
```

} finally {
await mcpClient.disconnect();
}
}
*/
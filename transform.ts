// MCP Client with OpenAI Tool Transformation
class MCPClientTransformer {
constructor(mcpClient) {
this.mcpClient = mcpClient;
}

// Transform MCP tools to OpenAI format
async getOpenAITools() {
try {
// Get tools from MCP server in MCP format
const mcpResponse = await this.mcpClient.request({
method: ‘tools/list’,
});

```
  // Transform to OpenAI format
  const openaiTools = mcpResponse.tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));

  return openaiTools;
} catch (error) {
  console.error('Failed to get and transform tools:', error);
  throw error;
}
```

}

// Call MCP tool and return result
async callTool(toolName, args) {
try {
const response = await this.mcpClient.request({
method: ‘tools/call’,
params: {
name: toolName,
arguments: args,
},
});

```
  return response;
} catch (error) {
  console.error(`Failed to call tool ${toolName}:`, error);
  throw error;
}
```

}
}

// Example usage with your OpenAI client
async function setupOpenAIWithMCP(mcpClient, openaiClient) {
const transformer = new MCPClientTransformer(mcpClient);

try {
// Get tools in OpenAI format
const tools = await transformer.getOpenAITools();
console.log(‘Transformed tools for OpenAI:’, JSON.stringify(tools, null, 2));

```
// Use with OpenAI client
const completion = await openaiClient.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { 
      role: 'user', 
      content: 'What is the weather like in New York?' 
    }
  ],
  tools: tools, // Use the transformed tools here
  tool_choice: 'auto',
});

// Handle tool calls
if (completion.choices[0].message.tool_calls) {
  for (const toolCall of completion.choices[0].message.tool_calls) {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args);
    
    // Call the MCP tool
    const result = await transformer.callTool(name, parsedArgs);
    console.log(`Tool ${name} result:`, result);
  }
}

return completion;
```

} catch (error) {
console.error(‘Setup failed:’, error);
throw error;
}
}

// Alternative: Direct transformation function if you prefer
function transformMCPToolsToOpenAI(mcpTools) {
return mcpTools.map(tool => ({
type: ‘function’,
function: {
name: tool.name,
description: tool.description,
parameters: tool.inputSchema,
},
}));
}

// Example of manual transformation
const exampleMCPTools = [
{
name: ‘get_weather’,
description: ‘Get current weather for a location’,
inputSchema: {
type: ‘object’,
properties: {
location: {
type: ‘string’,
description: ‘The city and country, e.g. “San Francisco, CA”’,
},
unit: {
type: ‘string’,
enum: [‘celsius’, ‘fahrenheit’],
description: ‘Temperature unit’,
},
},
required: [‘location’],
},
}
];

const openaiFormattedTools = transformMCPToolsToOpenAI(exampleMCPTools);
console.log(‘Example transformation:’, JSON.stringify(openaiFormattedTools, null, 2));

module.exports = {
MCPClientTransformer,
transformMCPToolsToOpenAI,
setupOpenAIWithMCP,
};
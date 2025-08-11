#!/usr/bin/env node

const { Server } = require(’@modelcontextprotocol/sdk/server/index.js’);
const { StdioServerTransport } = require(’@modelcontextprotocol/sdk/server/stdio.js’);
const {
CallToolRequestSchema,
ErrorCode,
ListToolsRequestSchema,
McpError,
} = require(’@modelcontextprotocol/sdk/types.js’);

class SimpleMCPServer {
constructor() {
this.server = new Server(
{
name: ‘simple-mcp-server’,
version: ‘0.1.0’,
},
{
capabilities: {
tools: {},
},
}
);

```
this.setupToolHandlers();
```

}

setupToolHandlers() {
// List available tools - ensuring OpenAI compatibility
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
return {
tools: [
{
name: ‘get_weather’,
description: ‘Get current weather for a location’,
type: ‘function’, // Required for OpenAI
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
default: ‘celsius’,
},
},
required: [‘location’],
},
},
{
name: ‘calculate’,
description: ‘Perform basic mathematical calculations’,
type: ‘function’, // Required for OpenAI
inputSchema: {
type: ‘object’,
properties: {
expression: {
type: ‘string’,
description: ‘Mathematical expression to evaluate (e.g., “2 + 2”, “10 * 5”)’,
},
},
required: [‘expression’],
},
},
{
name: ‘get_time’,
description: ‘Get current time in specified timezone’,
type: ‘function’, // Required for OpenAI
inputSchema: {
type: ‘object’,
properties: {
timezone: {
type: ‘string’,
description: ‘Timezone (e.g., “America/New_York”, “Europe/London”)’,
default: ‘UTC’,
},
},
required: [],
},
},
],
};
});

```
// Handle tool calls
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_weather':
        return await this.handleGetWeather(args);
      
      case 'calculate':
        return await this.handleCalculate(args);
      
      case 'get_time':
        return await this.handleGetTime(args);
      
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`
    );
  }
});
```

}

async handleGetWeather(args) {
const { location, unit = ‘celsius’ } = args;

```
// Mock weather data - replace with actual API call
const mockWeather = {
  location,
  temperature: unit === 'celsius' ? 22 : 72,
  condition: 'Partly cloudy',
  humidity: 65,
  windSpeed: 8,
  unit: unit === 'celsius' ? '°C' : '°F'
};

return {
  content: [
    {
      type: 'text',
      text: `Weather in ${location}:
```

Temperature: ${mockWeather.temperature}${mockWeather.unit}
Condition: ${mockWeather.condition}
Humidity: ${mockWeather.humidity}%
Wind Speed: ${mockWeather.windSpeed} ${unit === ‘celsius’ ? ‘km/h’ : ‘mph’}`,
},
],
};
}

async handleCalculate(args) {
const { expression } = args;

```
try {
  // Simple expression evaluation (be careful with eval in production!)
  // This is a simplified example - use a proper math parser in production
  const sanitizedExpression = expression.replace(/[^0-9+\-*/.() ]/g, '');
  
  if (sanitizedExpression !== expression) {
    throw new Error('Invalid characters in expression');
  }
  
  const result = eval(sanitizedExpression);
  
  return {
    content: [
      {
        type: 'text',
        text: `${expression} = ${result}`,
      },
    ],
  };
} catch (error) {
  throw new McpError(
    ErrorCode.InvalidParams,
    `Invalid mathematical expression: ${error.message}`
  );
}
```

}

async handleGetTime(args) {
const { timezone = ‘UTC’ } = args;

```
try {
  const now = new Date();
  const timeString = now.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  return {
    content: [
      {
        type: 'text',
        text: `Current time in ${timezone}: ${timeString}`,
      },
    ],
  };
} catch (error) {
  throw new McpError(
    ErrorCode.InvalidParams,
    `Invalid timezone: ${timezone}`
  );
}
```

}

async run() {
const transport = new StdioServerTransport();
await this.server.connect(transport);
console.error(‘Simple MCP Server running on stdio’);
}
}

// Start the server
if (require.main === module) {
const server = new SimpleMCPServer();
server.run().catch(console.error);
}

module.exports = SimpleMCPServer;
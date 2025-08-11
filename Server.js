#!/usr/bin/env node

// simple-mcp-server.js - A basic MCP server with one calculator tool
import { Server } from “@modelcontextprotocol/sdk/server/index.js”;
import { StdioServerTransport } from “@modelcontextprotocol/sdk/server/stdio.js”;
import {
CallToolRequestSchema,
ListToolsRequestSchema,
} from “@modelcontextprotocol/sdk/types.js”;

// Create the MCP server
const server = new Server(
{
name: “simple-calculator-server”,
version: “1.0.0”,
},
{
capabilities: {
tools: {},
},
}
);

// Define our calculator tool
const calculatorTool = {
name: “calculator”,
description: “Perform basic mathematical calculations (addition, subtraction, multiplication, division)”,
inputSchema: {
type: “object”,
properties: {
operation: {
type: “string”,
enum: [“add”, “subtract”, “multiply”, “divide”],
description: “The mathematical operation to perform”
},
a: {
type: “number”,
description: “First number”
},
b: {
type: “number”,
description: “Second number”
}
},
required: [“operation”, “a”, “b”]
}
};

// Calculator function
function calculate(operation, a, b) {
switch (operation) {
case “add”:
return a + b;
case “subtract”:
return a - b;
case “multiply”:
return a * b;
case “divide”:
if (b === 0) {
throw new Error(“Cannot divide by zero”);
}
return a / b;
default:
throw new Error(`Unknown operation: ${operation}`);
}
}

// Handle list tools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
console.error(“📋 Client requested tool list”);
return {
tools: [calculatorTool]
};
});

// Handle tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
console.error(`🔧 Tool call: ${request.params.name}`);

if (request.params.name !== “calculator”) {
throw new Error(`Unknown tool: ${request.params.name}`);
}

const { operation, a, b } = request.params.arguments;

// Validate inputs
if (!operation || typeof a !== ‘number’ || typeof b !== ‘number’) {
throw new Error(“Invalid arguments. Required: operation (string), a (number), b (number)”);
}

try {
const result = calculate(operation, a, b);
console.error(`📊 Calculation: ${a} ${operation} ${b} = ${result}`);

```
return {
  content: [
    {
      type: "text",
      text: `Result: ${a} ${operation === 'add' ? '+' : operation === 'subtract' ? '-' : operation === 'multiply' ? '×' : '÷'} ${b} = ${result}`
    }
  ]
};
```

} catch (error) {
console.error(`❌ Calculation error: ${error.message}`);

```
return {
  content: [
    {
      type: "text", 
      text: `Error: ${error.message}`
    }
  ],
  isError: true
};
```

}
});

// Start the server
async function main() {
console.error(“🚀 Starting Simple Calculator MCP Server…”);
console.error(“📱 Available tool: calculator (add, subtract, multiply, divide)”);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(“✅ MCP Server ready and listening on stdio”);
}

// Handle graceful shutdown
process.on(‘SIGINT’, async () => {
console.error(”\n🛑 Shutting down MCP Server…”);
await server.close();
process.exit(0);
});

process.on(‘SIGTERM’, async () => {
console.error(”\n🛑 Received SIGTERM, shutting down…”);
await server.close();
process.exit(0);
});

// Start the server
main().catch((error) => {
console.error(“❌ Server error:”, error);
process.exit(1);
});

// ===========================================
// Package.json for the MCP server
// ===========================================

/*
{
“name”: “simple-mcp-calculator-server”,
“version”: “1.0.0”,
“description”: “A simple MCP server with a calculator tool”,
“main”: “simple-mcp-server.js”,
“type”: “module”,
“scripts”: {
“start”: “node simple-mcp-server.js”,
“dev”: “node simple-mcp-server.js”
},
“dependencies”: {
“@modelcontextprotocol/sdk”: “^0.5.0”
},
“bin”: {
“simple-calculator-mcp”: “./simple-mcp-server.js”
},
“keywords”: [“mcp”, “calculator”, “tool”, “server”],
“author”: “Your Name”,
“license”: “MIT”
}
*/

// ===========================================
// Alternative: File Operations Tool
// ===========================================

export class FileMCPServer {
constructor() {
this.server = new Server(
{
name: “simple-file-server”,
version: “1.0.0”,
},
{
capabilities: {
tools: {},
},
}
);

```
this.setupHandlers();
```

}

setupHandlers() {
// List tools
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
return {
tools: [{
name: “read_file”,
description: “Read the contents of a text file”,
inputSchema: {
type: “object”,
properties: {
filepath: {
type: “string”,
description: “Path to the file to read”
}
},
required: [“filepath”]
}
}]
};
});

```
// Handle tool calls
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "read_file") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { filepath } = request.params.arguments;
  
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filepath, 'utf-8');
    
    return {
      content: [
        {
          type: "text",
          text: `File content of ${filepath}:\n\n${content}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error reading file: ${error.message}`
        }
      ],
      isError: true
    };
  }
});
```

}

async start() {
const transport = new StdioServerTransport();
await this.server.connect(transport);
console.error(“✅ File MCP Server ready”);
}
}

// ===========================================
// Alternative: Weather Tool (Mock)
// ===========================================

export class WeatherMCPServer {
constructor() {
this.server = new Server(
{
name: “simple-weather-server”,
version: “1.0.0”,
},
{
capabilities: {
tools: {},
},
}
);

```
this.setupHandlers();
```

}

setupHandlers() {
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
return {
tools: [{
name: “get_weather”,
description: “Get current weather for a city (mock data)”,
inputSchema: {
type: “object”,
properties: {
city: {
type: “string”,
description: “Name of the city”
},
units: {
type: “string”,
enum: [“celsius”, “fahrenheit”],
description: “Temperature units”,
default: “celsius”
}
},
required: [“city”]
}
}]
};
});

```
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_weather") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { city, units = "celsius" } = request.params.arguments;
  
  // Mock weather data
  const mockTemp = Math.floor(Math.random() * 30) + 10; // 10-40°C
  const conditions = ["sunny", "cloudy", "rainy", "snowy"][Math.floor(Math.random() * 4)];
  const humidity = Math.floor(Math.random() * 50) + 30; // 30-80%
  
  const tempInUnits = units === "fahrenheit" ? Math.round(mockTemp * 9/5 + 32) : mockTemp;
  const unitSymbol = units === "fahrenheit" ? "°F" : "°C";
  
  return {
    content: [
      {
        type: "text",
        text: `Weather in ${city}:\n` +
              `Temperature: ${tempInUnits}${unitSymbol}\n` +
              `Conditions: ${conditions}\n` +
              `Humidity: ${humidity}%\n` +
              `(Note: This is mock data for demonstration)`
      }
    ]
  };
});
```

}

async start() {
const transport = new StdioServerTransport();
await this.server.connect(transport);
console.error(“✅ Weather MCP Server ready”);
}
}

// ===========================================
// Test the server standalone
// ===========================================

/*
// To test this server directly:

// 1. Save as simple-mcp-server.js
// 2. Install dependencies: npm install @modelcontextprotocol/sdk
// 3. Run: node simple-mcp-server.js
// 4. Send JSON-RPC messages via stdin:

// List tools:
{“jsonrpc”: “2.0”, “id”: 1, “method”: “tools/list”, “params”: {}}

// Call calculator:
{“jsonrpc”: “2.0”, “id”: 2, “method”: “tools/call”, “params”: {“name”: “calculator”, “arguments”: {“operation”: “add”, “a”: 5, “b”: 3}}}

// The server will respond with JSON-RPC responses via stdout
*/

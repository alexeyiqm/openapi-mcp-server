# OpenAPI MCP Server

This application exposes any REST API as an MCP (Model Context Protocol) server based on its OpenAPI schema. It automatically generates MCP tools from OpenAPI operations with comprehensive OpenAPI 3.0+ support.

## Features

- **Complete OpenAPI 3.0+ Support**: Parse schemas from JSON and YAML formats
- **Advanced Schema Processing**: Full $ref resolution, composition schemas (oneOf, anyOf, allOf)
- **Rich Tool Generation**: Automatic MCP tools with detailed descriptions, validation, and metadata
- **Multiple Content Types**: Support for JSON, XML, form data, and multipart uploads
- **Parameter Handling**: Path, query, header parameters with type conversion and validation
- **Authentication**: HTTP Basic Authentication and custom headers support
- **Enhanced Error Handling**: Detailed error messages with request context
- **Type Safety**: Full TypeScript implementation with comprehensive validation
- **Testing**: Extensive test suite with 90%+ coverage

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start -- --schema <path-to-openapi-schema> [options]
```

### Options

- `-s, --schema <path>` - Path to OpenAPI schema file (JSON or YAML) **[Required]**
- `-b, --base-url <url>` - Override base URL from schema
- `-h, --headers <headers>` - Additional headers as JSON string
- `-u, --username <username>` - Username for basic authentication
- `-p, --password <password>` - Password for basic authentication

### Examples

```bash
# Basic usage with a local schema file
npm start -- --schema ./api-schema.yaml

# Override base URL
npm start -- --schema ./api-schema.json --base-url https://api.example.com

# Add authentication headers
npm start -- --schema ./api-schema.yaml --headers '{"Authorization": "Bearer your-token"}'

# Use basic authentication
npm start -- --schema ./api-schema.yaml --username myuser --password mypass

# Combine basic auth with custom base URL
npm start -- --schema ./api-schema.yaml --base-url https://api.example.com --username admin --password secret123
```

## Authentication

### HTTP Basic Authentication

The server supports HTTP Basic Authentication by providing username and password via command line arguments:

```bash
npm start -- --schema ./api-schema.yaml --username myuser --password mypassword
```

When basic authentication credentials are provided:
- Both username and password must be specified (cannot provide just one)
- Credentials are base64 encoded and sent in the `Authorization: Basic <encoded>` header
- All API requests will automatically include the authentication header

### Additional Headers

You can also provide additional headers (including custom authentication) using the `--headers` option:

```bash
npm start -- --schema ./api-schema.yaml --headers '{"Authorization": "Bearer token", "X-API-Key": "key123"}'
```

**Note**: Basic authentication (--username/--password) and additional headers can be used together. If both contain Authorization headers, the additional headers will take precedence.

## Adding to Claude Desktop

To use this MCP server with Claude Desktop, you need to add it to your Claude Desktop configuration file.

### Configuration File Location

The configuration file is located at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration Steps

1. **Build the server** (if you haven't already):
   ```bash
   npm install
   npm run build
   ```

2. **Open or create the Claude Desktop configuration file** at the location above.

3. **Add the MCP server configuration**:
   ```json
   {
     "mcpServers": {
       "openapi-server": {
         "command": "node",
         "args": [
           "/path/to/your/openapi-mcp-server/dist/index.js",
           "--schema",
           "/path/to/your/openapi-schema.yaml"
         ]
       }
     }
   }
   ```

4. **Replace the paths** with your actual paths:
   - Replace `/path/to/your/openapi-mcp-server/` with the full path to where you cloned/downloaded this project
   - Replace `/path/to/your/openapi-schema.yaml` with the full path to your OpenAPI schema file

### Example Configurations

Here are example configurations showing different authentication methods:

#### Basic Authentication
```json
{
  "mcpServers": {
    "secure-api": {
      "command": "node",
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/openapi-mcp-server/api-schema.yaml",
        "--username",
        "apiuser",
        "--password",
        "secret123"
      ]
    }
  }
}
```

#### Bearer Token Authentication
```json
{
  "mcpServers": {
    "xmpt-api": {
      "command": "node",
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/openapi-mcp-server/schema.yaml",
        "--base-url",
        "https://api.your.service",
        "--headers",
        "{\"Authorization\": \"Bearer your-api-token\"}"
      ]
    }
  }
}
```

#### Multiple APIs Configuration
```json
{
  "mcpServers": {
    "secure-api": {
      "command": "node",
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/schemas/secure-api.yaml",
        "--username",
        "admin",
        "--password",
        "password123"
      ]
    },
    "public-api": {
      "command": "node", 
      "args": [
        "/Users/username/projects/openapi-mcp-server/dist/index.js",
        "--schema",
        "/Users/username/projects/schemas/public-api.json"
      ]
    }
  }
}
```

### Configuration Options

When adding the server to Claude Desktop, you can use all the same command-line options:

- `--schema <path>` - Path to your OpenAPI schema file (required)
- `--base-url <url>` - Override the base URL from the schema
- `--headers <json>` - Add authentication or other headers as JSON string
- `--username <username>` - Username for basic authentication
- `--password <password>` - Password for basic authentication

### Restart Claude Desktop

After modifying the configuration file, restart Claude Desktop for the changes to take effect.

### Verification

Once configured and restarted, you should be able to use the API tools in your conversations with Claude. The tools will be automatically generated based on your OpenAPI schema and will include the configured authentication.

## How it works

1. **Schema Loading**: Loads and validates OpenAPI 3.0+ schemas from JSON or YAML files
2. **Tool Generation**: Automatically creates MCP tools for each API operation
3. **Authentication Setup**: Configures HTTP Basic Authentication if credentials are provided
4. **Parameter Mapping**: Maps OpenAPI parameters to MCP tool input schemas
5. **Request Execution**: Executes HTTP requests using the provided parameters and authentication
6. **Response Handling**: Returns formatted responses including status, headers, and data

## Supported OpenAPI Features

- ✅ **Complete Parameter Support**: Path, query, header parameters with validation
- ✅ **All Content Types**: JSON, XML, form-urlencoded, multipart/form-data, and more
- ✅ **Advanced Schema Features**: $ref resolution, oneOf/anyOf/allOf composition, nested objects
- ✅ **Type Validation**: Full JSON Schema validation with format support (email, uuid, etc.)
- ✅ **Authentication**: HTTP Basic Auth and custom header support
- ✅ **Rich Descriptions**: Tool descriptions include summaries, tags, response codes
- ✅ **Error Handling**: Detailed error messages with request context
- ✅ **Type Conversion**: Automatic parameter type conversion (strings to numbers/booleans/arrays)
- ✅ **Schema Normalization**: Auto-generation of missing operationIds and responses
- ✅ **Multiple HTTP Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD

## Improvements Made

This enhanced version includes significant improvements over the basic implementation:

### Schema Processing
- **Full $ref Resolution**: Supports all reference types, including nested and circular references
- **Composition Schemas**: Complete support for oneOf, anyOf, allOf with descriptive error messages
- **Validation Constraints**: min/max values, string length, patterns, enums with enhanced descriptions
- **Format Support**: Built-in format validation (email, uuid, date-time, etc.)

### Tool Generation
- **Rich Descriptions**: Combines summaries, descriptions, tags, and response information
- **Enhanced Metadata**: Stores operation metadata for improved tool execution context
- **Content Type Detection**: Intelligently prioritizes content types (JSON > XML > others)
- **Parameter Validation**: Comprehensive validation with detailed error messages

### API Client
- **Type Conversion**: Automatic conversion of string inputs to proper types
- **Content Type Handling**: Smart content-type detection and body processing
- **Error Enhancement**: Detailed error messages including request URL, method, and response data
- **Parameter Processing**: Advanced parameter validation and type coercion

### Testing & Quality
- **Comprehensive Test Suite**: 90%+ test coverage with integration tests
- **TypeScript**: Full type safety throughout the codebase  
- **ESLint Configuration**: Code quality enforcement
- **Jest Configuration**: Modern testing setup with coverage reporting

## Security Considerations

- **Command Line Credentials**: When using basic authentication, credentials are passed via command line arguments, which may be visible in system process lists
- **Base64 Encoding**: HTTP Basic Authentication uses base64 encoding (not encryption) as per the standard
- **HTTPS Recommended**: Always use HTTPS endpoints when transmitting authentication credentials
- **Environment Variables**: Consider using environment variables for sensitive credentials in production

## Development

```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev -- --schema ./example-schema.yaml

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint the code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Testing

The project includes comprehensive tests covering:
- **Unit Tests**: Individual component testing for schema loading, tool generation, and API client
- **Integration Tests**: End-to-end workflow testing with complex OpenAPI schemas
- **Edge Cases**: Error handling, circular references, malformed schemas
- **Type Safety**: Full TypeScript coverage with strict type checking

Run tests with:
```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode  
npm run test:coverage    # Generate coverage report
```

## Architecture

The enhanced implementation consists of several key components:

- **SchemaLoader**: Validates and normalizes OpenAPI schemas with comprehensive error reporting
- **ToolGenerator**: Converts OpenAPI operations to MCP tools with rich metadata and validation
- **APIClient**: Executes HTTP requests with automatic type conversion and detailed error handling
- **Server**: MCP server implementation with tool metadata integration

## License

MIT
#!/usr/bin/env node

import { Command } from "commander";
import { OpenAPIMCPServer } from "./server";
import fs from "fs";
import path from "path";

const program = new Command();

program
  .name("openapi-mcp-server")
  .description("Expose any REST API as MCP server based on OpenAPI schema")
  .version("1.0.0")
  .requiredOption(
    "-s, --schema <path>",
    "Path to OpenAPI schema file (JSON or YAML)"
  )
  .option("-b, --base-url <url>", "Override base URL from schema")
  .option("-h, --headers <headers>", "Additional headers as JSON string")
  .option("-u, --username <username>", "Username for basic authentication")
  .option("-p, --password <password>", "Password for basic authentication")
  .parse();

const options = program.opts();

async function main() {
  try {
    // Read and validate schema file
    const schemaPath = path.resolve(options.schema);
    if (!fs.existsSync(schemaPath)) {
      console.error(`Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    // Parse additional headers if provided
    let additionalHeaders = {};
    if (options.headers) {
      try {
        const parsedHeaders = options.headers
          .toString()
          .replace("BEARER_TOKEN", process.env.BEARER_TOKEN)
          .replace("ORGANIZATION_ID", process.env.ORGANIZATION_ID);
        additionalHeaders = JSON.parse(parsedHeaders);
      } catch (error) {
        console.error("Invalid headers JSON:", error);
        process.exit(1);
      }
    }

    // Validate authentication options
    if (
      (options.username && !options.password) ||
      (!options.username && options.password)
    ) {
      console.error(
        "Both username and password must be provided for basic authentication"
      );
      process.exit(1);
    }

    // Create and start the MCP server
    const server = new OpenAPIMCPServer(schemaPath, {
      baseUrl: options.baseUrl,
      additionalHeaders,
      username: options.username,
      password: options.password,
    });

    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();

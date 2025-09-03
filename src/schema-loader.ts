import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { OpenAPIV3 } from 'openapi-types';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class OpenAPISchemaLoader {
  async loadSchema(schemaPath: string): Promise<OpenAPIV3.Document> {
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const content = fs.readFileSync(schemaPath, 'utf-8');
    const ext = path.extname(schemaPath).toLowerCase();
    
    let schema: any;
    
    try {
      if (ext === '.yaml' || ext === '.yml') {
        schema = yaml.parse(content);
      } else if (ext === '.json') {
        schema = JSON.parse(content);
      } else {
        throw new Error(`Unsupported schema file format: ${ext}. Only JSON and YAML are supported.`);
      }
    } catch (parseError) {
      throw new Error(`Failed to parse schema file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Comprehensive validation
    const validation = this.validateSchema(schema);
    
    if (!validation.valid) {
      throw new Error(`Invalid OpenAPI schema:\n${validation.errors.join('\n')}`);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('Schema validation warnings:');
      validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    // Convert Swagger 2.0 to OpenAPI 3.0 format if needed
    if (schema.swagger && schema.swagger.startsWith('2.')) {
      throw new Error('Swagger 2.0 is not supported. Please convert to OpenAPI 3.0+ using tools like swagger2openapi');
    }

    // Normalize the schema
    return this.normalizeSchema(schema as OpenAPIV3.Document);
  }

  private validateSchema(schema: any): SchemaValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required root fields
    if (!schema.openapi && !schema.swagger) {
      errors.push('Missing required field: openapi or swagger version');
    }

    if (!schema.info) {
      errors.push('Missing required field: info');
    } else {
      if (!schema.info.title) {
        errors.push('Missing required field: info.title');
      }
      if (!schema.info.version) {
        errors.push('Missing required field: info.version');
      }
    }

    if (!schema.paths) {
      errors.push('Missing required field: paths');
    } else if (typeof schema.paths !== 'object') {
      errors.push('Invalid paths field: must be an object');
    } else if (Object.keys(schema.paths).length === 0) {
      warnings.push('No paths defined in schema');
    }

    // Validate OpenAPI version
    if (schema.openapi) {
      const version = schema.openapi;
      if (!version.startsWith('3.')) {
        errors.push(`Unsupported OpenAPI version: ${version}. Only OpenAPI 3.x is supported`);
      }
    }

    // Validate server information
    if (schema.servers) {
      if (!Array.isArray(schema.servers)) {
        errors.push('Invalid servers field: must be an array');
      } else if (schema.servers.length === 0) {
        warnings.push('Empty servers array - no base URL will be available');
      } else {
        schema.servers.forEach((server: any, index: number) => {
          if (!server.url) {
            errors.push(`Missing server URL at index ${index}`);
          }
        });
      }
    } else {
      warnings.push('No servers defined - you must provide a base URL');
    }

    // Validate components if present
    if (schema.components) {
      if (schema.components.schemas) {
        const schemaNames = Object.keys(schema.components.schemas);
        if (schemaNames.length > 0) {
          console.log(`Found ${schemaNames.length} schema definitions: ${schemaNames.slice(0, 5).join(', ')}${schemaNames.length > 5 ? '...' : ''}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private normalizeSchema(schema: OpenAPIV3.Document): OpenAPIV3.Document {
    // Ensure paths is not null
    if (!schema.paths) {
      schema.paths = {};
    }

    // Ensure components exists
    if (!schema.components) {
      schema.components = {};
    }

    // Normalize all path operations
    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
      
      for (const method of methods) {
        // Handle null/undefined operations (from incomplete YAML/JSON)
        if (method in pathItem && (pathItem[method] === null || pathItem[method] === undefined)) {
          (pathItem as any)[method] = {
            operationId: `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`,
            responses: {
              '200': {
                description: 'Success'
              }
            }
          };
        } else {
          // Handle existing operations
          const operation = pathItem[method] as OpenAPIV3.OperationObject;
          if (!operation) continue;

          if (!operation.operationId) {
            operation.operationId = `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
          }

          // Ensure responses exist
          if (!operation.responses) {
            operation.responses = {
              '200': {
                description: 'Success'
              }
            };
          }
        }
      }
    }

    return schema;
  }

  async validateSchemaFile(schemaPath: string): Promise<SchemaValidationResult> {
    try {
      await this.loadSchema(schemaPath);
      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      return { 
        valid: false, 
        errors: [error instanceof Error ? error.message : String(error)], 
        warnings: [] 
      };
    }
  }
}
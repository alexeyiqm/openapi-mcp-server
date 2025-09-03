import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIV3 } from 'openapi-types';

interface ResolvedSchema {
  type?: string;
  properties?: Record<string, ResolvedSchema>;
  items?: ResolvedSchema;
  required?: string[];
  enum?: any[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  example?: any;
  default?: any;
  nullable?: boolean;
  additionalProperties?: boolean | ResolvedSchema;
  oneOf?: ResolvedSchema[];
  anyOf?: ResolvedSchema[];
  allOf?: ResolvedSchema[];
}

export interface ToolMetadata {
  operationId: string;
  method: string;
  path: string;
  tags?: string[];
  security?: OpenAPIV3.SecurityRequirementObject[];
  responses?: Record<string, OpenAPIV3.ResponseObject>;
}

export class ToolGenerator {
  private schema!: OpenAPIV3.Document;
  private referenceCache = new Map<string, ResolvedSchema>();
  private toolMetadata = new Map<string, ToolMetadata>();
  private resolutionStack = new Set<string>();

  generateTools(schema: OpenAPIV3.Document): Tool[] {
    this.schema = schema;
    this.referenceCache.clear();
    this.toolMetadata.clear();
    this.resolutionStack.clear();
    const tools: Tool[] = [];

    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

      for (const method of methods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject;
        if (!operation) continue;

        const operationId = operation.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Store metadata for later use
        this.toolMetadata.set(operationId, {
          operationId,
          method: method.toUpperCase(),
          path: pathKey,
          tags: operation.tags,
          security: operation.security,
          responses: operation.responses as Record<string, OpenAPIV3.ResponseObject>
        });

        const tool = this.createToolFromOperation(
          operationId,
          method,
          pathKey,
          operation,
          pathItem.parameters as OpenAPIV3.ParameterObject[] || []
        );

        tools.push(tool);
      }
    }

    return tools;
  }

  getToolMetadata(operationId: string): ToolMetadata | undefined {
    return this.toolMetadata.get(operationId);
  }

  private createToolFromOperation(
    operationId: string,
    method: string,
    path: string,
    operation: OpenAPIV3.OperationObject,
    pathParameters: OpenAPIV3.ParameterObject[]
  ): Tool {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // Collect all parameters
    const allParameters = [
      ...pathParameters,
      ...(operation.parameters as OpenAPIV3.ParameterObject[] || [])
    ];

    // Process parameters with enhanced type mapping
    for (const param of allParameters) {
      if (param.in === 'cookie') continue; // Skip cookie parameters for now

      const paramSchema = this.resolveParameterSchema(param);
      properties[param.name] = {
        ...paramSchema,
        description: param.description || this.generateParameterDescription(param),
      };

      if (param.required) {
        required.push(param.name);
      }
    }

    // Process request body with support for multiple content types
    const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
    if (requestBody && requestBody.content) {
      const supportedContentTypes = this.getSupportedContentTypes(requestBody.content);
      
      if (supportedContentTypes.length > 0) {
        const primaryContentType = supportedContentTypes[0];
        const contentSchema = requestBody.content[primaryContentType];
        
        if (contentSchema && contentSchema.schema) {
          const bodySchema = this.resolveSchema(contentSchema.schema);
          
          const baseDescription = this.createRequestBodyDescription(requestBody, primaryContentType, supportedContentTypes);
          const fullDescription = bodySchema.description 
            ? `${baseDescription}\n\n${bodySchema.description}`
            : baseDescription;
            
          properties.body = {
            ...bodySchema,
            description: fullDescription,
          };

          if (requestBody.required !== false) {
            required.push('body');
          }
        }
      }
    }

    const description = this.createToolDescription(operation, method, path);

    return {
      name: operationId,
      description,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false,
      },
    };
  }

  private resolveParameterSchema(param: OpenAPIV3.ParameterObject): ResolvedSchema {
    if (param.schema) {
      return this.resolveSchema(param.schema);
    }
    
    // Fallback for parameters without explicit schema
    return {
      type: 'string',
      description: `${param.in} parameter`
    };
  }

  private generateParameterDescription(param: OpenAPIV3.ParameterObject): string {
    const location = param.in.charAt(0).toUpperCase() + param.in.slice(1);
    const baseDesc = `${location} parameter`;
    
    if (param.required) {
      return `${baseDesc} (required)`;
    }
    
    return baseDesc;
  }

  private getSupportedContentTypes(content: Record<string, OpenAPIV3.MediaTypeObject>): string[] {
    const contentTypes = Object.keys(content);
    
    // Prioritize JSON, then other structured formats, then anything else
    const priorities = [
      'application/json',
      'application/xml',
      'text/xml',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];
    
    const sorted = contentTypes.sort((a, b) => {
      const aIndex = priorities.indexOf(a);
      const bIndex = priorities.indexOf(b);
      
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });
    
    return sorted;
  }

  private createRequestBodyDescription(requestBody: OpenAPIV3.RequestBodyObject, primaryContentType: string, allContentTypes: string[]): string {
    let description = requestBody.description || 'Request body';
    
    if (allContentTypes.length > 1) {
      description += ` (supports: ${allContentTypes.join(', ')})`;
    } else {
      description += ` (${primaryContentType})`;
    }
    
    return description;
  }

  private createToolDescription(operation: OpenAPIV3.OperationObject, method: string, path: string): string {
    const summary = operation.summary?.toString().trim();
    const descriptionText = operation.description?.toString().trim();
    const tags = operation.tags && operation.tags.length > 0 ? operation.tags.join(', ') : null;
    
    let description = '';
    
    if (summary) {
      description = summary;
      
      if (descriptionText && descriptionText !== summary) {
        description += `\n\n${descriptionText}`;
      }
    } else if (descriptionText) {
      description = descriptionText;
    } else {
      description = `${method.toUpperCase()} ${path}`;
    }
    
    if (tags) {
      description += `\n\nTags: ${tags}`;
    }
    
    // Add response information if available
    const responses = operation.responses;
    if (responses) {
      const successResponses = Object.keys(responses).filter(code => code.startsWith('2'));
      if (successResponses.length > 0) {
        description += `\n\nReturns: ${successResponses.join(', ')}`;
      }
    }
    
    return description;
  }

  private resolveReference(ref: string): OpenAPIV3.SchemaObject | undefined {
    // Check cache first
    if (this.referenceCache.has(ref)) {
      return this.referenceCache.get(ref) as OpenAPIV3.SchemaObject;
    }

    const refParts = ref.split('/');
    
    // Handle different reference types
    if (refParts[0] === '#') {
      let current: any = this.schema;
      
      for (let i = 1; i < refParts.length; i++) {
        if (!current || typeof current !== 'object') {
          console.warn(`Failed to resolve reference ${ref} at part: ${refParts[i]}`);
          return undefined;
        }
        current = current[refParts[i]];
      }
      
      if (current) {
        // Cache the resolved reference
        this.referenceCache.set(ref, current);
        return current as OpenAPIV3.SchemaObject;
      }
    }
    
    console.warn(`Unsupported or invalid reference: ${ref}`);
    return undefined;
  }

  private resolveSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): ResolvedSchema {
    if ('$ref' in schema) {
      const ref = schema.$ref;
      
      // Check for circular references
      if (this.resolutionStack.has(ref)) {
        return { 
          type: 'object', 
          description: `Circular reference detected: ${ref}`,
          additionalProperties: true
        };
      }
      
      const resolvedSchema = this.resolveReference(ref);
      if (resolvedSchema) {
        this.resolutionStack.add(ref);
        const result = this.resolveSchema(resolvedSchema);
        this.resolutionStack.delete(ref);
        return result;
      } else {
        return { 
          type: 'object', 
          description: `Referenced schema: ${ref}`,
          additionalProperties: true
        };
      }
    }

    const resolved: ResolvedSchema = {};

    // Basic type information
    resolved.type = schema.type || (schema.properties ? 'object' : 'string');

    // Documentation
    if (schema.description) resolved.description = schema.description;
    if (schema.example !== undefined) resolved.example = schema.example;
    if (schema.default !== undefined) resolved.default = schema.default;

    // Validation constraints
    if (schema.minimum !== undefined) resolved.minimum = schema.minimum;
    if (schema.maximum !== undefined) resolved.maximum = schema.maximum;
    if (schema.minLength !== undefined) resolved.minLength = schema.minLength;
    if (schema.maxLength !== undefined) resolved.maxLength = schema.maxLength;
    if (schema.pattern) resolved.pattern = schema.pattern;
    if (schema.format) resolved.format = schema.format;
    if (schema.nullable) resolved.nullable = schema.nullable;

    // Enum values
    if (schema.enum) {
      resolved.enum = schema.enum;
      resolved.description = this.enhanceEnumDescription(resolved.description, schema.enum);
    }

    // Object properties
    if (schema.properties) {
      resolved.properties = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        resolved.properties[key] = this.resolveSchema(prop);
      }
    }

    // Additional properties
    if (schema.additionalProperties !== undefined) {
      if (typeof schema.additionalProperties === 'boolean') {
        resolved.additionalProperties = schema.additionalProperties;
      } else {
        resolved.additionalProperties = this.resolveSchema(schema.additionalProperties);
      }
    }

    // Array items
    if (resolved.type === 'array' && 'items' in schema && schema.items) {
      resolved.items = this.resolveSchema(schema.items);
    }

    // Required fields
    if (schema.required && Array.isArray(schema.required)) {
      resolved.required = schema.required;
    }

    // Composition schemas (oneOf, anyOf, allOf)
    if ('oneOf' in schema && schema.oneOf) {
      resolved.oneOf = schema.oneOf.map(s => this.resolveSchema(s));
      resolved.description = this.enhanceCompositionDescription(resolved.description, 'one of');
      // If no type specified, assume object for composition schemas
      if (!resolved.type) {
        resolved.type = 'object';
      }
    }
    
    if ('anyOf' in schema && schema.anyOf) {
      resolved.anyOf = schema.anyOf.map(s => this.resolveSchema(s));
      resolved.description = this.enhanceCompositionDescription(resolved.description, 'any of');
      if (!resolved.type) {
        resolved.type = 'object';
      }
    }
    
    if ('allOf' in schema && schema.allOf) {
      resolved.allOf = schema.allOf.map(s => this.resolveSchema(s));
      resolved.description = this.enhanceCompositionDescription(resolved.description, 'all of');
      if (!resolved.type) {
        resolved.type = 'object';
      }
    }

    return resolved;
  }

  private enhanceEnumDescription(description: string | undefined, enumValues: any[]): string {
    const enumDesc = `Allowed values: ${enumValues.map(v => `'${v}'`).join(', ')}`;
    return description ? `${description}\n\n${enumDesc}` : enumDesc;
  }

  private enhanceCompositionDescription(description: string | undefined, type: string): string {
    const compositionDesc = `Schema supports ${type} the following options`;
    return description ? `${description}\n\n${compositionDesc}` : compositionDesc;
  }
}
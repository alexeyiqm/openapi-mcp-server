import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { OpenAPIV3 } from 'openapi-types';
import { ServerOptions } from './server';

export interface OperationInfo {
  method: string;
  path: string;
  operation: OpenAPIV3.OperationObject;
  parameters: OpenAPIV3.ParameterObject[];
  requestBody?: OpenAPIV3.RequestBodyObject;
}

export class APIClient {
  private client: AxiosInstance;
  private schema?: OpenAPIV3.Document;
  private operations: Map<string, OperationInfo> = new Map();
  private baseUrl?: string;

  constructor(private options: ServerOptions) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.additionalHeaders,
    };

    // Add basic authentication header if credentials are provided
    if (options.username && options.password) {
      const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    this.client = axios.create({
      timeout: options.timeout || 30000,
      headers,
    });
  }

  async initialize(schema: OpenAPIV3.Document): Promise<void> {
    this.schema = schema;
    this.baseUrl = this.options.baseUrl || this.getBaseUrl(schema);
    this.parseOperations(schema);
  }

  private getBaseUrl(schema: OpenAPIV3.Document): string {
    if (schema.servers && schema.servers.length > 0) {
      return schema.servers[0].url;
    }
    throw new Error('No server URL found in OpenAPI schema and no base URL provided');
  }

  private parseOperations(schema: OpenAPIV3.Document): void {
    for (const [pathKey, pathItem] of Object.entries(schema.paths)) {
      if (!pathItem) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

      for (const method of methods) {
        const operation = pathItem[method] as OpenAPIV3.OperationObject;
        if (!operation) continue;

        const operationId = operation.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Collect parameters from path and operation
        const parameters: OpenAPIV3.ParameterObject[] = [];

        if (pathItem.parameters) {
          parameters.push(...(pathItem.parameters as OpenAPIV3.ParameterObject[]));
        }

        if (operation.parameters) {
          parameters.push(...(operation.parameters as OpenAPIV3.ParameterObject[]));
        }

        this.operations.set(operationId, {
          method: method.toUpperCase(),
          path: pathKey,
          operation,
          parameters,
          requestBody: operation.requestBody as OpenAPIV3.RequestBodyObject | undefined,
        });
      }
    }
  }

  async executeOperation(operationId: string, args: Record<string, any>): Promise<any> {
    const operationInfo = this.operations.get(operationId);
    if (!operationInfo) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const { method, path, parameters, requestBody } = operationInfo;

    // Build URL with path parameters
    let url = this.baseUrl + path;
    const queryParams: Record<string, any> = {};
    const headers: Record<string, string> = {};
    let body: any = undefined;

    // Validate and process parameters
    const missingRequiredParams: string[] = [];
    
    for (const param of parameters) {
      const value = args[param.name];
      
      if (value === undefined || value === null) {
        if (param.required) {
          missingRequiredParams.push(`${param.name} (${param.in})`);
        }
        continue;
      }

      // Type validation and conversion
      const processedValue = this.processParameterValue(param, value);

      switch (param.in) {
        case 'path':
          url = url.replace(`{${param.name}}`, encodeURIComponent(String(processedValue)));
          break;
        case 'query':
          queryParams[param.name] = processedValue;
          break;
        case 'header':
          headers[param.name] = String(processedValue);
          break;
      }
    }

    if (missingRequiredParams.length > 0) {
      throw new Error(`Missing required parameters: ${missingRequiredParams.join(', ')}`);
    }

    // Process request body with content type detection
    if (requestBody && args.body !== undefined) {
      const contentType = this.determineContentType(requestBody, headers);
      body = this.processRequestBody(args.body, contentType);
      
      if (contentType && !headers['Content-Type']) {
        headers['Content-Type'] = contentType;
      }
    }

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      params: queryParams,
      headers: { ...(this.client.defaults.headers.common || {}), ...headers },
      data: body,
    };

    try {
      const response = await this.client.request(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: response.config.url,
        method: response.config.method?.toUpperCase(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorDetails = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
        };
        
        throw new Error(`HTTP ${errorDetails.status}: ${errorDetails.statusText || errorDetails.message} - ${JSON.stringify(errorDetails.data || {})}`);
      }
      throw error;
    }
  }

  private processParameterValue(param: OpenAPIV3.ParameterObject, value: any): any {
    if (!param.schema) return value;
    
    const schema = param.schema as OpenAPIV3.SchemaObject;
    
    // Type conversion based on schema
    switch (schema.type) {
      case 'integer':
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Parameter ${param.name} must be a valid number, got: ${value}`);
        }
        return num;
      }
      
      case 'boolean': {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true') return true;
          if (value.toLowerCase() === 'false') return false;
        }
        throw new Error(`Parameter ${param.name} must be a boolean, got: ${value}`);
      }
      
      case 'array':
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          // Try to parse as JSON array or comma-separated values
          try {
            return JSON.parse(value);
          } catch {
            return value.split(',').map(v => v.trim());
          }
        }
        throw new Error(`Parameter ${param.name} must be an array, got: ${value}`);
      
      default:
        return String(value);
    }
  }

  private determineContentType(requestBody: OpenAPIV3.RequestBodyObject, headers: Record<string, string>): string | undefined {
    // Check if Content-Type is already set
    const existingContentType = headers['Content-Type'] || headers['content-type'];
    if (existingContentType) return existingContentType;
    
    // Determine from request body content types
    const contentTypes = Object.keys(requestBody.content || {});
    
    // Prefer JSON, then others
    if (contentTypes.includes('application/json')) return 'application/json';
    if (contentTypes.includes('application/xml')) return 'application/xml';
    if (contentTypes.includes('text/xml')) return 'text/xml';
    if (contentTypes.includes('application/x-www-form-urlencoded')) return 'application/x-www-form-urlencoded';
    if (contentTypes.includes('multipart/form-data')) return 'multipart/form-data';
    
    return contentTypes[0];
  }

  private processRequestBody(body: any, contentType?: string): any {
    if (!contentType) return body;
    
    switch (contentType) {
      case 'application/json':
        return typeof body === 'string' ? JSON.parse(body) : body;
      
      case 'application/x-www-form-urlencoded':
        if (typeof body === 'object' && body !== null) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(body)) {
            params.append(key, String(value));
          }
          return params.toString();
        }
        return body;
      
      default:
        return body;
    }
  }

  getOperations(): Map<string, OperationInfo> {
    return this.operations;
  }
}
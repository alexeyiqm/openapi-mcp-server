import { APIClient } from '../api-client';
import { OpenAPIV3 } from 'openapi-types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('APIClient', () => {
  let apiClient: APIClient;
  
  const mockAxiosInstance = {
    request: jest.fn(),
    defaults: {
      headers: {
        common: {
          'X-Custom': 'test'
        }
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    
    apiClient = new APIClient({
      baseUrl: 'https://api.example.com',
      additionalHeaders: {
        'X-Custom': 'test'
      }
    });
  });

  describe('initialization', () => {
    it('should create axios instance with correct configuration', () => {
      new APIClient({
        baseUrl: 'https://api.example.com',
        username: 'user',
        password: 'pass',
        additionalHeaders: { 'X-Custom': 'test' },
        timeout: 5000
      });

      expect(mockedAxios.create).toHaveBeenCalledWith({
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Custom': 'test',
          'Authorization': 'Basic dXNlcjpwYXNz' // base64 encoded 'user:pass'
        }
      });
    });

    it('should use default timeout when not specified', () => {
      new APIClient({});

      expect(mockedAxios.create).toHaveBeenCalledWith({
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  describe('initialize', () => {
    it('should parse operations from schema', async () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUserById',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { description: 'Success' }
              }
            },
            post: {
              operationId: 'updateUser',
              responses: {
                '200': { description: 'Updated' }
              }
            }
          }
        }
      };

      await apiClient.initialize(schema);

      const operations = apiClient.getOperations();
      expect(operations.size).toBe(2);
      expect(operations.has('getUserById')).toBe(true);
      expect(operations.has('updateUser')).toBe(true);
    });

    it('should use base URL from schema servers when not provided', async () => {
      const clientWithoutBaseUrl = new APIClient({});
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://schema-api.example.com' }],
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      await clientWithoutBaseUrl.initialize(schema);

      // This should not throw an error about missing base URL
      expect(true).toBe(true);
    });

    it('should throw error when no base URL is available', async () => {
      const clientWithoutBaseUrl = new APIClient({});
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      await expect(clientWithoutBaseUrl.initialize(schema))
        .rejects
        .toThrow('No server URL found in OpenAPI schema and no base URL provided');
    });
  });

  describe('executeOperation', () => {
    beforeEach(async () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUserById',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'integer' },
                  description: 'User ID'
                },
                {
                  name: 'include',
                  in: 'query',
                  required: false,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': { description: 'Success' }
              }
            },
            post: {
              operationId: 'updateUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'integer' }
                }
              ],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Updated' }
              }
            }
          },
          '/upload': {
            post: {
              operationId: 'uploadFile',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' }
                      }
                    }
                  }
                }
              },
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      await apiClient.initialize(schema);
    });

    it('should execute GET request with path and query parameters', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { id: 123, name: 'John Doe' },
        config: { url: 'https://api.example.com/users/123', method: 'get' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await apiClient.executeOperation('getUserById', {
        id: 123,
        include: 'profile'
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/users/123',
        params: { include: 'profile' },
        headers: { 'X-Custom': 'test' },
        data: undefined
      });

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { id: 123, name: 'John Doe' },
        url: 'https://api.example.com/users/123',
        method: 'GET'
      });
    });

    it('should execute POST request with JSON body', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { success: true },
        config: { url: 'https://api.example.com/users/123', method: 'post' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('updateUser', {
        id: 123,
        body: {
          name: 'Jane Doe',
          email: 'jane@example.com'
        }
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.example.com/users/123',
        params: {},
        headers: {
          'X-Custom': 'test',
          'Content-Type': 'application/json'
        },
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com'
        }
      });
    });

    it('should handle form data content type', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { success: true },
        config: { url: 'https://api.example.com/upload', method: 'post' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('uploadFile', {
        body: { file: 'binary data' }
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.example.com/upload',
        params: {},
        headers: {
          'X-Custom': 'test',
          'Content-Type': 'multipart/form-data'
        },
        data: { file: 'binary data' }
      });
    });

    it('should validate required parameters', async () => {
      await expect(apiClient.executeOperation('getUserById', {}))
        .rejects
        .toThrow('Missing required parameters: id (path)');
    });

    it('should convert parameter types', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/users/123', method: 'get' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('getUserById', {
        id: '123' // String that should be converted to integer
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/users/123'
        })
      );
    });

    it('should throw error for invalid parameter types', async () => {
      await expect(apiClient.executeOperation('getUserById', {
        id: 'not-a-number'
      }))
        .rejects
        .toThrow('Parameter id must be a valid number');
    });

    it('should handle axios errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'User not found' }
        },
        message: 'Request failed',
        config: {
          url: 'https://api.example.com/users/123',
          method: 'get'
        }
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockAxiosInstance.request.mockRejectedValue(axiosError);

      await expect(apiClient.executeOperation('getUserById', { id: 123 }))
        .rejects
        .toThrow('HTTP 404: Not Found - {"error":"User not found"}');
    });

    it('should handle non-axios errors', async () => {
      const networkError = new Error('Network error');
      mockAxiosInstance.request.mockRejectedValue(networkError);

      await expect(apiClient.executeOperation('getUserById', { id: 123 }))
        .rejects
        .toThrow('Network error');
    });

    it('should throw error for unknown operation', async () => {
      await expect(apiClient.executeOperation('unknownOperation', {}))
        .rejects
        .toThrow('Operation unknownOperation not found');
    });
  });

  describe('processParameterValue', () => {
    beforeEach(async () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            get: {
              operationId: 'testTypes',
              parameters: [
                {
                  name: 'boolParam',
                  in: 'query',
                  schema: { type: 'boolean' }
                },
                {
                  name: 'arrayParam',
                  in: 'query',
                  schema: { type: 'array', items: { type: 'string' } }
                }
              ],
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      await apiClient.initialize(schema);
    });

    it('should convert boolean parameters', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test', method: 'get' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('testTypes', {
        boolParam: 'true'
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { boolParam: true }
        })
      );
    });

    it('should convert array parameters from JSON', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test', method: 'get' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('testTypes', {
        arrayParam: '["item1", "item2"]'
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { arrayParam: ['item1', 'item2'] }
        })
      );
    });

    it('should convert array parameters from comma-separated string', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test', method: 'get' }
      };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await apiClient.executeOperation('testTypes', {
        arrayParam: 'item1,item2,item3'
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { arrayParam: ['item1', 'item2', 'item3'] }
        })
      );
    });
  });
});
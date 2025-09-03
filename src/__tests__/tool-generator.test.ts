import { ToolGenerator } from '../tool-generator';
import { OpenAPIV3 } from 'openapi-types';

describe('ToolGenerator', () => {
  let toolGenerator: ToolGenerator;

  beforeEach(() => {
    toolGenerator = new ToolGenerator();
  });

  describe('generateTools', () => {
    it('should generate tools for simple GET operation', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              summary: 'Get all users',
              description: 'Retrieve a list of all users',
              tags: ['Users'],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' }
              }
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('getUsers');
      expect(tools[0].description).toContain('Get all users');
      expect(tools[0].description).toContain('Retrieve a list of all users');
      expect(tools[0].description).toContain('Tags: Users');
      expect(tools[0].description).toContain('Returns: 200');
      expect(tools[0].inputSchema.type).toBe('object');
      expect(tools[0].inputSchema.additionalProperties).toBe(false);
    });

    it('should generate tools for POST operation with request body', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { 
                          type: 'string',
                          minLength: 1,
                          maxLength: 100,
                          description: 'User name'
                        },
                        email: { 
                          type: 'string',
                          format: 'email',
                          description: 'User email address'
                        },
                        age: {
                          type: 'integer',
                          minimum: 18,
                          maximum: 120
                        },
                        role: {
                          type: 'string',
                          enum: ['admin', 'user', 'guest'],
                          description: 'User role'
                        }
                      },
                      required: ['name', 'email']
                    }
                  }
                }
              },
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      expect(tool.name).toBe('createUser');
      expect(tool.inputSchema.required).toEqual(['body']);
      expect(tool.inputSchema.properties?.body).toBeDefined();
      
      const bodySchema = tool.inputSchema.properties?.body as any;
      expect(bodySchema.type).toBe('object');
      expect(bodySchema.properties?.name).toBeDefined();
      expect(bodySchema.properties?.name.type).toBe('string');
      expect(bodySchema.properties?.name.minLength).toBe(1);
      expect(bodySchema.properties?.name.maxLength).toBe(100);
      expect(bodySchema.properties?.email.format).toBe('email');
      expect(bodySchema.properties?.age.minimum).toBe(18);
      expect(bodySchema.properties?.role.enum).toEqual(['admin', 'user', 'guest']);
      expect(bodySchema.properties?.role.description).toContain('Allowed values:');
      expect(bodySchema.required).toEqual(['name', 'email']);
    });

    it('should handle path and query parameters', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
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
                  schema: { 
                    type: 'array',
                    items: { type: 'string' }
                  },
                  description: 'Fields to include'
                },
                {
                  name: 'format',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['json', 'xml'],
                    default: 'json'
                  }
                }
              ],
              responses: {
                '200': { description: 'Success' },
                '404': { description: 'Not found' }
              }
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      expect(tool.inputSchema.required).toEqual(['id']);
      expect(tool.inputSchema.properties?.id).toBeDefined();
      expect((tool.inputSchema.properties?.id as any)?.type).toBe('integer');
      expect(tool.inputSchema.properties?.include).toBeDefined();
      expect((tool.inputSchema.properties?.include as any)?.type).toBe('array');
      expect(tool.inputSchema.properties?.format).toBeDefined();
      expect((tool.inputSchema.properties?.format as any)?.enum).toEqual(['json', 'xml']);
      expect((tool.inputSchema.properties?.format as any)?.default).toBe('json');
    });

    it('should resolve $ref references', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateUserRequest' }
                  }
                }
              },
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        },
        components: {
          schemas: {
            CreateUserRequest: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                metadata: {
                  type: 'object',
                  additionalProperties: { type: 'string' }
                }
              },
              required: ['user']
            },
            User: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' }
              },
              required: ['name']
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      const bodySchema = tool.inputSchema.properties?.body as any;
      expect(bodySchema.properties?.user).toBeDefined();
      expect(bodySchema.properties?.user.type).toBe('object');
      expect(bodySchema.properties?.user.properties?.name).toBeDefined();
      expect(bodySchema.properties?.user.properties?.email).toBeDefined();
      expect(bodySchema.properties?.user.required).toEqual(['name']);
      expect(bodySchema.properties?.metadata?.additionalProperties?.type).toBe('string');
      expect(bodySchema.required).toEqual(['user']);
    });

    it('should handle composition schemas (oneOf, anyOf, allOf)', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/entities': {
            post: {
              operationId: 'createEntity',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        { $ref: '#/components/schemas/User' },
                        { $ref: '#/components/schemas/Organization' }
                      ]
                    }
                  }
                }
              },
              responses: {
                '201': { description: 'Created' }
              }
            }
          }
        },
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['user'] },
                name: { type: 'string' }
              }
            },
            Organization: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['org'] },
                companyName: { type: 'string' }
              }
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      const bodySchema = tool.inputSchema.properties?.body as any;
      expect(bodySchema.oneOf).toBeDefined();
      expect(bodySchema.oneOf).toHaveLength(2);
      expect(bodySchema.description).toContain('one of');
    });

    it('should generate operation IDs when missing', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/api/v1/complex-path/{id}': {
            get: {
              summary: 'Get resource',
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get__api_v1_complex_path__id_');
    });

    it('should support multiple content types', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/upload': {
            post: {
              operationId: 'uploadFile',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' },
                        metadata: { type: 'string' }
                      }
                    }
                  },
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        url: { type: 'string' },
                        metadata: { type: 'string' }
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

      const tools = toolGenerator.generateTools(schema);

      expect(tools).toHaveLength(1);
      const tool = tools[0];
      
      const bodySchema = tool.inputSchema.properties?.body as any;
      expect(bodySchema.description).toContain('application/json, multipart/form-data');
    });
  });

  describe('getToolMetadata', () => {
    it('should return metadata for generated tools', () => {
      const schema: OpenAPIV3.Document = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              tags: ['Users', 'Public'],
              security: [{ apiKey: [] }],
              responses: {
                '200': { description: 'Success' }
              }
            }
          }
        }
      };

      toolGenerator.generateTools(schema);
      const metadata = toolGenerator.getToolMetadata('getUsers');

      expect(metadata).toBeDefined();
      expect(metadata?.operationId).toBe('getUsers');
      expect(metadata?.method).toBe('GET');
      expect(metadata?.path).toBe('/users');
      expect(metadata?.tags).toEqual(['Users', 'Public']);
      expect(metadata?.security).toEqual([{ apiKey: [] }]);
    });
  });
});
import fs from 'fs';
import path from 'path';
import { OpenAPISchemaLoader } from '../schema-loader';

describe('OpenAPISchemaLoader', () => {
  let schemaLoader: OpenAPISchemaLoader;
  let tempDir: string;

  beforeEach(() => {
    schemaLoader = new OpenAPISchemaLoader();
    tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createTempFile = (filename: string, content: string): string => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  describe('loadSchema', () => {
    it('should load valid YAML schema', async () => {
      const yamlContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      summary: Test endpoint
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('schema.yaml', yamlContent);
      
      const schema = await schemaLoader.loadSchema(filePath);
      
      expect(schema.openapi).toBe('3.0.0');
      expect(schema.info.title).toBe('Test API');
      expect(schema.paths['/test']).toBeDefined();
    });

    it('should load valid JSON schema', async () => {
      const jsonContent = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0'
        },
        paths: {
          '/test': {
            get: {
              summary: 'Test endpoint',
              responses: {
                '200': {
                  description: 'Success'
                }
              }
            }
          }
        }
      };
      const filePath = createTempFile('schema.json', JSON.stringify(jsonContent, null, 2));
      
      const schema = await schemaLoader.loadSchema(filePath);
      
      expect(schema.openapi).toBe('3.0.0');
      expect(schema.info.title).toBe('Test API');
      expect(schema.paths['/test']).toBeDefined();
    });

    it('should throw error for non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.yaml');
      
      await expect(schemaLoader.loadSchema(nonExistentPath))
        .rejects
        .toThrow('Schema file not found');
    });

    it('should throw error for unsupported file format', async () => {
      const filePath = createTempFile('schema.txt', 'not a schema');
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Unsupported schema file format');
    });

    it('should throw error for invalid YAML', async () => {
      const invalidYaml = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        - this is invalid yaml
      - more invalid yaml
        200:
          description: [unclosed
`;
      const filePath = createTempFile('invalid.yaml', invalidYaml);
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Failed to parse schema file');
    });

    it('should throw error for invalid JSON', async () => {
      const invalidJson = '{ "openapi": "3.0.0", "info": { "title": "Test API" } invalid json }';
      const filePath = createTempFile('invalid.json', invalidJson);
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Failed to parse schema file');
    });

    it('should validate required fields', async () => {
      const invalidSchema = `
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('invalid.yaml', invalidSchema);
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Invalid OpenAPI schema');
    });

    it('should reject Swagger 2.0', async () => {
      const swagger2Schema = `
swagger: '2.0'
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('swagger2.yaml', swagger2Schema);
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Swagger 2.0 is not supported');
    });

    it('should normalize schema by adding missing operationIds', async () => {
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      summary: Get user
      responses:
        '200':
          description: Success
    post:
      operationId: createUser
      summary: Create user
      responses:
        '201':
          description: Created
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      const schema = await schemaLoader.loadSchema(filePath);
      
      expect(schema.paths['/users/{id}']?.get?.operationId).toBe('get__users__id_');
      expect(schema.paths['/users/{id}']?.post?.operationId).toBe('createUser');
    });

    it('should add default responses when missing', async () => {
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      summary: Test endpoint
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      const schema = await schemaLoader.loadSchema(filePath);
      
      expect(schema.paths['/test']?.get?.responses).toBeDefined();
      expect(schema.paths['/test']?.get?.responses['200']).toBeDefined();
    });

    it('should validate server URLs', async () => {
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
servers:
  - description: Test server
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      await expect(schemaLoader.loadSchema(filePath))
        .rejects
        .toThrow('Missing server URL');
    });

    it('should warn about missing servers', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      await schemaLoader.loadSchema(filePath);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('Schema validation warnings:');
      expect(consoleWarnSpy).toHaveBeenCalledWith('  - No servers defined - you must provide a base URL');
      
      consoleWarnSpy.mockRestore();
    });

    it('should log schema definitions count', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        '200':
          description: Success
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
    Organization:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      await schemaLoader.loadSchema(filePath);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Found 2 schema definitions: User, Organization');
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('validateSchemaFile', () => {
    it('should return validation result for valid schema', async () => {
      const schemaContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('schema.yaml', schemaContent);
      
      const result = await schemaLoader.validateSchemaFile(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid schema', async () => {
      const invalidSchema = `
info:
  title: Test API
paths:
  /test:
    get:
      responses:
        '200':
          description: Success
`;
      const filePath = createTempFile('invalid.yaml', invalidSchema);
      
      const result = await schemaLoader.validateSchemaFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
import fs from 'fs';
import path from 'path';
import { OpenAPISchemaLoader } from '../schema-loader';
import { ToolGenerator } from '../tool-generator';
import { APIClient } from '../api-client';

describe('Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createTempSchema = (content: string): string => {
    const filePath = path.join(tempDir, 'schema.yaml');
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  it('should handle complete workflow from schema to executable tools', async () => {
    const schemaContent = `
openapi: 3.0.0
info:
  title: User Management API
  version: 1.0.0
  description: API for managing users and organizations
servers:
  - url: https://api.example.com/v1
    description: Production server
paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      description: Retrieve a paginated list of all users
      tags:
        - Users
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
            default: 1
          description: Page number
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
          description: Number of items per page
        - name: search
          in: query
          schema:
            type: string
            minLength: 3
          description: Search term for filtering users
        - name: role
          in: query
          schema:
            type: string
            enum: [admin, user, guest]
          description: Filter by user role
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
        '400':
          description: Bad request
    post:
      operationId: createUser
      summary: Create new user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Invalid input
        '409':
          description: User already exists
  /users/{userId}:
    parameters:
      - name: userId
        in: path
        required: true
        schema:
          type: string
          format: uuid
        description: Unique user identifier
    get:
      operationId: getUserById
      summary: Get user by ID
      tags:
        - Users
      responses:
        '200':
          description: User details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: User not found
    put:
      operationId: updateUser
      summary: Update user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: User not found
    delete:
      operationId: deleteUser
      summary: Delete user
      tags:
        - Users
      responses:
        '204':
          description: User deleted successfully
        '404':
          description: User not found
  /organizations:
    get:
      operationId: listOrganizations
      summary: List organizations
      tags:
        - Organizations
      responses:
        '200':
          description: List of organizations
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
          description: Unique user identifier
        username:
          type: string
          minLength: 3
          maxLength: 50
          pattern: '^[a-zA-Z0-9_-]+$'
          description: Username (alphanumeric, underscore, hyphen only)
        email:
          type: string
          format: email
          description: User email address
        firstName:
          type: string
          maxLength: 100
        lastName:
          type: string
          maxLength: 100
        role:
          type: string
          enum: [admin, user, guest]
          description: User role in the system
        isActive:
          type: boolean
          default: true
          description: Whether the user account is active
        createdAt:
          type: string
          format: date-time
          description: Account creation timestamp
        profile:
          $ref: '#/components/schemas/UserProfile'
      required:
        - id
        - username
        - email
        - role
    
    UserProfile:
      type: object
      properties:
        bio:
          type: string
          maxLength: 500
          nullable: true
        avatar:
          type: string
          format: uri
          nullable: true
        preferences:
          type: object
          additionalProperties:
            oneOf:
              - type: string
              - type: number
              - type: boolean
      
    CreateUserRequest:
      type: object
      properties:
        username:
          type: string
          minLength: 3
          maxLength: 50
          pattern: '^[a-zA-Z0-9_-]+$'
        email:
          type: string
          format: email
        firstName:
          type: string
          maxLength: 100
        lastName:
          type: string
          maxLength: 100
        role:
          type: string
          enum: [admin, user, guest]
          default: user
        profile:
          $ref: '#/components/schemas/UserProfile'
      required:
        - username
        - email
    
    UpdateUserRequest:
      type: object
      properties:
        firstName:
          type: string
          maxLength: 100
        lastName:
          type: string
          maxLength: 100
        role:
          type: string
          enum: [admin, user, guest]
        isActive:
          type: boolean
        profile:
          $ref: '#/components/schemas/UserProfile'
    
    UserList:
      type: object
      properties:
        users:
          type: array
          items:
            $ref: '#/components/schemas/User'
        pagination:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
            totalPages:
              type: integer
          required:
            - page
            - limit
            - total
            - totalPages
      required:
        - users
        - pagination
`;

    const schemaPath = createTempSchema(schemaContent);
    
    // Test schema loading
    const schemaLoader = new OpenAPISchemaLoader();
    const schema = await schemaLoader.loadSchema(schemaPath);
    
    expect(schema.openapi).toBe('3.0.0');
    expect(schema.info.title).toBe('User Management API');
    expect(Object.keys(schema.paths)).toHaveLength(3);
    expect(schema.components?.schemas).toBeDefined();
    expect(Object.keys(schema.components?.schemas || {})).toHaveLength(5);

    // Test tool generation
    const toolGenerator = new ToolGenerator();
    const tools = toolGenerator.generateTools(schema);
    
    expect(tools).toHaveLength(6); // 6 operations total
    
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('listUsers');
    expect(toolNames).toContain('createUser');
    expect(toolNames).toContain('getUserById');
    expect(toolNames).toContain('updateUser');
    expect(toolNames).toContain('deleteUser');
    expect(toolNames).toContain('listOrganizations');

    // Test specific tool properties
    const listUsersTool = tools.find(t => t.name === 'listUsers')!;
    expect(listUsersTool.description).toContain('List all users');
    expect(listUsersTool.description).toContain('Tags: Users');
    expect(listUsersTool.description).toContain('Returns: 200');
    expect(listUsersTool.inputSchema.properties?.page).toBeDefined();
    expect((listUsersTool.inputSchema.properties?.page as any)?.type).toBe('integer');
    expect((listUsersTool.inputSchema.properties?.page as any)?.minimum).toBe(1);
    expect((listUsersTool.inputSchema.properties?.page as any)?.default).toBe(1);
    expect((listUsersTool.inputSchema.properties?.role as any)?.enum).toEqual(['admin', 'user', 'guest']);

    const createUserTool = tools.find(t => t.name === 'createUser')!;
    expect(createUserTool.inputSchema.required).toContain('body');
    const createUserBody = createUserTool.inputSchema.properties?.body as any;
    expect(createUserBody.type).toBe('object');
    expect(createUserBody.properties?.username).toBeDefined();
    expect(createUserBody.properties?.username.minLength).toBe(3);
    expect(createUserBody.properties?.username.maxLength).toBe(50);
    expect(createUserBody.properties?.username.pattern).toBeDefined();
    expect(createUserBody.properties?.email.format).toBe('email');
    expect(createUserBody.required).toEqual(['username', 'email']);
    
    // Test nested schema resolution
    expect(createUserBody.properties?.profile).toBeDefined();
    expect(createUserBody.properties?.profile.type).toBe('object');
    expect(createUserBody.properties?.profile.properties?.bio).toBeDefined();
    expect(createUserBody.properties?.profile.properties?.preferences.additionalProperties.oneOf).toBeDefined();

    const getUserByIdTool = tools.find(t => t.name === 'getUserById')!;
    expect(getUserByIdTool.inputSchema.required).toContain('userId');
    expect((getUserByIdTool.inputSchema.properties?.userId as any)?.type).toBe('string');
    expect((getUserByIdTool.inputSchema.properties?.userId as any)?.format).toBe('uuid');

    // Test tool metadata
    const listUsersMetadata = toolGenerator.getToolMetadata('listUsers');
    expect(listUsersMetadata).toBeDefined();
    expect(listUsersMetadata?.method).toBe('GET');
    expect(listUsersMetadata?.path).toBe('/users');
    expect(listUsersMetadata?.tags).toEqual(['Users']);

    // Test API client initialization
    const apiClient = new APIClient({
      baseUrl: 'https://api.example.com/v1',
      additionalHeaders: { 'X-API-Key': 'test-key' }
    });
    
    await apiClient.initialize(schema);
    const operations = apiClient.getOperations();
    expect(operations.size).toBe(6);
    expect(operations.has('listUsers')).toBe(true);
    expect(operations.has('createUser')).toBe(true);

    // Verify operation info
    const listUsersOp = operations.get('listUsers')!;
    expect(listUsersOp.method).toBe('GET');
    expect(listUsersOp.path).toBe('/users');
    expect(listUsersOp.parameters).toHaveLength(4); // page, limit, search, role
    expect(listUsersOp.parameters.some(p => p.name === 'page' && p.in === 'query')).toBe(true);

    const createUserOp = operations.get('createUser')!;
    expect(createUserOp.method).toBe('POST');
    expect(createUserOp.requestBody).toBeDefined();

    const getUserByIdOp = operations.get('getUserById')!;
    expect(getUserByIdOp.method).toBe('GET');
    expect(getUserByIdOp.path).toBe('/users/{userId}');
    expect(getUserByIdOp.parameters).toHaveLength(1); // userId from path
    expect(getUserByIdOp.parameters[0].name).toBe('userId');
    expect(getUserByIdOp.parameters[0].in).toBe('path');
    expect(getUserByIdOp.parameters[0].required).toBe(true);
  });

  it('should handle schemas with complex references and circular dependencies', async () => {
    const complexSchemaContent = `
openapi: 3.0.0
info:
  title: Complex API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /entities:
    post:
      operationId: createEntity
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Entity'
      responses:
        '200':
          description: Success
components:
  schemas:
    Entity:
      type: object
      properties:
        id:
          type: string
        parent:
          $ref: '#/components/schemas/Entity'
        children:
          type: array
          items:
            $ref: '#/components/schemas/Entity'
        metadata:
          $ref: '#/components/schemas/Metadata'
      required:
        - id
    
    Metadata:
      type: object
      properties:
        tags:
          type: array
          items:
            type: string
        entity:
          $ref: '#/components/schemas/Entity'
`;

    const schemaPath = createTempSchema(complexSchemaContent);
    
    const schemaLoader = new OpenAPISchemaLoader();
    const schema = await schemaLoader.loadSchema(schemaPath);
    
    const toolGenerator = new ToolGenerator();
    const tools = toolGenerator.generateTools(schema);
    
    expect(tools).toHaveLength(1);
    
    const tool = tools[0];
    expect(tool.name).toBe('createEntity');
    expect(tool.inputSchema.properties?.body).toBeDefined();
    
    // Should handle circular references without infinite loops
    const bodySchema = tool.inputSchema.properties?.body as any;
    expect(bodySchema.type).toBe('object');
    expect(bodySchema.properties?.id).toBeDefined();
    expect(bodySchema.properties?.parent).toBeDefined();
    expect(bodySchema.properties?.children).toBeDefined();
    expect(bodySchema.properties?.metadata).toBeDefined();
  });

  it('should validate and normalize incomplete schemas', async () => {
    const incompleteSchemaContent = `
openapi: 3.0.0
info:
  title: Incomplete API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /test:
    get:
      summary: Test endpoint
      # Missing operationId and responses
  /another:
    post:
      # Missing everything
`;

    const schemaPath = createTempSchema(incompleteSchemaContent);
    
    const schemaLoader = new OpenAPISchemaLoader();
    const schema = await schemaLoader.loadSchema(schemaPath);
    
    // Should have been normalized with missing fields filled in
    expect(schema.paths['/test']?.get?.operationId).toBe('get__test');
    expect(schema.paths['/test']?.get?.responses).toBeDefined();
    expect(schema.paths['/test']?.get?.responses['200']).toBeDefined();
    
    expect(schema.paths['/another']?.post?.operationId).toBe('post__another');
    expect(schema.paths['/another']?.post?.responses).toBeDefined();
    
    const toolGenerator = new ToolGenerator();
    const tools = toolGenerator.generateTools(schema);
    
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('get__test');
    expect(tools[1].name).toBe('post__another');
  });
});
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TidewaysClient } from './lib/tideways-client.js';
import { logger } from './lib/logger.js';
import { loadConfig, ServerConfig } from './config/index.js';
import { ErrorHandler, TidewaysAPIError } from './lib/errors.js';
import { getToolDefinitions } from './tools/definitions.js';
import { executeTool } from './tools/registry.js';


export class TidewaysMCPServer {
  private server: Server;
  private tidewaysClient: TidewaysClient;
  private config: ServerConfig;

  constructor() {
    this.config = loadConfig();
    this.tidewaysClient = new TidewaysClient(this.config);
    this.server = new Server(
      {
        name: 'tideways-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: getToolDefinitions(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      logger.info('Tool called', { toolName: name, arguments: args });

      try {
        const result = await executeTool(name, args, this.tidewaysClient);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
          } catch (error) {
      logger.error('Tool execution failed', error as Error, { toolName: name, arguments: args });

      const tidewaysError: TidewaysAPIError = error instanceof TidewaysAPIError
        ? error 
        : ErrorHandler.handleApiError(error);

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${ErrorHandler.formatErrorForUser(tidewaysError)}`,
          },
        ],
      };
      }
    });
  }

  async start(): Promise<void> {
    logger.info('Starting Tideways MCP Server', {
      version: '0.1.0',
      organization: this.config.organization,
      project: this.config.project,
    });

    try {
      const health = await this.tidewaysClient.healthCheck();
      if (health.status === 'healthy') {
        logger.info('Tideways API connection verified');
      } else {
        logger.warn('Tideways API health check failed, but starting server anyway', health);
      }
    } catch (error) {
      logger.warn('Tideways API health check failed, but starting server anyway', {
        error: (error as Error).message,
      });
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Tideways MCP Server started successfully');

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down Tideways MCP Server');
    process.exit(0);
  }

}

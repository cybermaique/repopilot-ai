import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CONFIG, LOCAL_WORKSPACE, type AppConfig } from '../config.js';
import { Database } from '../db/database.js';
import { RepositoryService } from '../repositories/repository.service.js';
import { RunsService } from '../runs/runs.service.js';
import { SearchRepository } from '../search/search.repository.js';
import {
  CreateRunDto,
  RegisterRepositoryDto,
  RepositoryDto,
  RepositoryDetailDto,
  RunDto,
  SourceDto,
  EventDto,
  HealthDto,
  ErrorDto,
} from './contracts.js';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get('live') @ApiOkResponse({ type: HealthDto }) live() {
    return { status: 'ok' };
  }
  @Get('ready')
  @ApiOkResponse({ type: HealthDto })
  @ApiResponse({ status: 503, type: ErrorDto })
  async ready() {
    try {
      await this.db.pool.query(
        "SELECT (SELECT count(*) FROM jobs) AS jobs, (SELECT extname FROM pg_extension WHERE extname='vector') AS extension",
      );
      const {
        rows: [row],
      } = await this.db.pool.query<{ ready: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS ready",
      );
      if (!row?.ready) throw new Error('Extension not available');
      return { status: 'ok', database: 'ready', provider: 'demo' };
    } catch {
      throw new ServiceUnavailableException(
        'Database/migrations/pgvector are not ready.',
      );
    }
  }
}

@Controller('repositories')
@ApiTags('repositories')
export class RepositoriesController {
  constructor(
    private readonly repositories: RepositoryService,
    private readonly runs: RunsService,
  ) {}
  @Post()
  @ApiBody({ type: RegisterRepositoryDto })
  @ApiCreatedResponse({ type: RepositoryDto })
  register(@Body() _body: RegisterRepositoryDto) {
    return this.repositories.register(LOCAL_WORKSPACE);
  }
  @Get() @ApiOkResponse({ type: [RepositoryDto] }) list() {
    return this.repositories.list(LOCAL_WORKSPACE);
  }
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RepositoryDetailDto })
  detail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.repositories.detail(LOCAL_WORKSPACE, id);
  }
  @Post(':id/index')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: RunDto })
  index(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.runs.create(LOCAL_WORKSPACE, id, 'index');
  }
}

@Controller('runs')
@ApiTags('runs')
@ApiExtraModels(EventDto)
export class RunsController {
  private readonly streams = new Set<Response>();
  constructor(
    private readonly runs: RunsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  @Post()
  @ApiBody({ type: CreateRunDto })
  @ApiCreatedResponse({ type: RunDto })
  create(@Body() body: CreateRunDto) {
    return this.runs.create(
      LOCAL_WORKSPACE,
      body.repositoryId,
      'question',
      body.question,
    );
  }
  @Get()
  @ApiQuery({ name: 'repositoryId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: [RunDto] })
  history(@Query('repositoryId') repositoryId?: string) {
    if (
      repositoryId &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        repositoryId,
      )
    )
      throw new BadRequestException('Invalid repositoryId.');
    return this.runs.history(LOCAL_WORKSPACE, repositoryId);
  }
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RunDto })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.runs.get(LOCAL_WORKSPACE, id);
  }
  @Post(':id/cancel')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RunDto })
  cancel(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.runs.cancel(LOCAL_WORKSPACE, id);
  }
  @Get(':id/events')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'after', required: false, type: Number })
  @ApiOkResponse({ type: [EventDto] })
  events(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('after') after = '0',
  ) {
    return this.runs.events(LOCAL_WORKSPACE, id, this.cursor(after));
  }
  private cursor(value: string) {
    const parsed = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 0)
      throw new BadRequestException('Invalid event cursor.');
    return parsed;
  }
  @Get(':id/stream')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'after', required: false, type: Number })
  @ApiProduces('text/event-stream')
  @ApiOperation({
    description:
      'Persisted EventDto events named run, SSE id=sequence. Replay using Last-Event-ID or after. Terminal event closes stream. Browser disconnect does not cancel the run.',
  })
  @ApiOkResponse({
    description: 'SSE stream of JSON EventDto',
    schema: { type: 'string' },
  })
  async stream(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query('after') after = '0',
  ) {
    let cursor = this.cursor(
      request.headers['last-event-id']?.toString() ?? after,
    );
    await this.runs.get(LOCAL_WORKSPACE, id);
    if (this.streams.size >= 32)
      throw new ServiceUnavailableException('Local stream limit reached.');
    this.streams.add(response);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write('retry: 1000\n\n');
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let iterations = 0;
    const cleanup = () => {
      closed = true;
      if (timer) clearTimeout(timer);
      this.streams.delete(response);
    };
    response.on('close', cleanup);
    const poll = async () => {
      try {
        if (closed) return;
        const events = await this.runs.events(LOCAL_WORKSPACE, id, cursor);
        for (const event of events) {
          if (closed) break;
          cursor = event.sequence;
          if (
            !response.write(
              `id: ${event.sequence}\nevent: run\ndata: ${JSON.stringify(event)}\n\n`,
            )
          ) {
            // Drop slow connections rather than accumulating unbounded buffers. Cursor replay recovers.
            response.end();
            cleanup();
            return;
          }
        }
        const run = await this.runs.get(LOCAL_WORKSPACE, id);
        if (
          ['completed', 'failed', 'cancelled'].includes(run.status) &&
          events.length < 100
        ) {
          response.end();
          cleanup();
          return;
        }
        if (++iterations % 30 === 0) response.write(': heartbeat\n\n');
        if (!closed)
          timer = setTimeout(
            () => {
              void poll();
            },
            Math.min(this.config.WORKER_POLL_MS, 500),
          );
      } catch {
        response.end();
        cleanup();
      }
    };
    void poll();
  }
  onModuleDestroy() {
    for (const response of this.streams) response.end();
    this.streams.clear();
  }
}

@Controller('sources')
@ApiTags('sources')
export class SourcesController {
  constructor(private readonly search: SearchRepository) {}
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SourceDto })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.search.source(LOCAL_WORKSPACE, id);
  }
}

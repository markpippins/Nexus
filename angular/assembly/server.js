import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ASSEMBLY_MODE, ASSEMBLY_PORT, IS_MOCK_MODE } from './runtime-config.js';
import { allEntityCollections, newId, nowIso, state } from './mock-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const API_ONLY = process.env.ASSEMBLY_API_ONLY === 'true';
const PORT = API_ONLY ? Number.parseInt(process.env.MOCK_API_PORT || '33107', 10) : ASSEMBLY_PORT;
const API_TARGET = process.env.API_TARGET || 'http://localhost:3107';
const NEBULA_TARGET = process.env.NEBULA_TARGET || 'http://localhost:3101';
const DIST_DIR = path.join(__dirname, 'dist/assembly');

if (!API_ONLY && !fs.existsSync(DIST_DIR)) {
  console.error(`Error: Build output not found at ${DIST_DIR}. Run "npm run build" first.`);
  process.exit(1);
}

app.use(express.json());

function pageFromRequest(req) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
  return { page, pageSize };
}

function paged(items, req) {
  const { page, pageSize } = pageFromRequest(req);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

function findEntity(collection, id) {
  return collection.find(item => item.id === id) || null;
}

function mockApi() {
  app.get('/api/counts', (_req, res) => {
    res.json({
      forums: state.forums.length,
      posts: state.feed.length,
      threads: state.threads.length,
      comments: state.comments.length,
      workRequests: state.workRequests.length,
      requirements: state.requirements.length,
      agendas: state.agendas.length,
      candidates: state.candidates.length,
      harvests: state.harvests.length,
      openQuestions: state.openQuestions.filter(item => item.status !== 'resolved').length,
      intents: state.intents.length,
      assessments: state.assessments.length,
      observations: state.observations.length,
      agentRecords: state.records.length,
      specifications: state.specifications.length,
      plans: state.plans.length,
    });
  });

  app.get('/api/forums', (_req, res) => res.json(state.forums));
  app.get('/api/forums/threads/:id', (req, res) => {
    const thread = findEntity(state.threads, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    return res.json({ thread, comments: state.comments.filter(comment => comment.threadId === thread.id) });
  });
  app.get('/api/forums/:slug/threads', (req, res) => {
    const forum = state.forums.find(item => item.slug === req.params.slug);
    res.json(forum ? state.threads.filter(item => item.forum.slug === forum.slug) : []);
  });
  app.post('/api/forums/:slug/threads', (req, res) => {
    const forum = state.forums.find(item => item.slug === req.params.slug) || state.forums[0];
    const thread = {
      id: newId('thread'),
      title: req.body.title || 'Untitled mock thread',
      body: req.body.body || '',
      createdAt: nowIso(),
      author: state.users[0],
      forum: { id: forum.id, slug: forum.slug, name: forum.name },
      replyCount: 0,
      viewCount: 0,
      lastReplyAt: null,
      lastReplyAuthor: null,
    };
    state.threads.unshift(thread);
    state.feed.unshift({ id: newId('feed'), title: thread.title, content: thread.body, createdAt: thread.createdAt, comments: 0, author: thread.author, forum: thread.forum });
    forum.threadCount += 1;
    forum.postCount += 1;
    res.status(201).json({ id: thread.id, title: thread.title });
  });
  app.post('/api/forums/threads/:id/comments', (req, res) => {
    const thread = findEntity(state.threads, req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const comment = { id: newId('comment'), body: req.body.body || '', createdAt: nowIso(), parentId: req.body.parentId || null, author: state.users[0] };
    state.comments.push(comment);
    thread.replyCount += 1;
    thread.lastReplyAt = comment.createdAt;
    thread.lastReplyAuthor = comment.author.name;
    res.status(201).json({ id: comment.id });
  });

  app.get('/api/feed', (_req, res) => res.json(state.feed));
  app.post('/api/feed', (req, res) => {
    const post = { id: newId('feed'), title: 'Mock feed post', content: req.body.text || '', createdAt: nowIso(), comments: 0, author: state.users[0], forum: null };
    state.feed.unshift(post);
    res.status(201).json({ id: post.id });
  });
  app.delete('/api/feed/:id', (req, res) => {
    const index = state.feed.findIndex(item => item.id === req.params.id);
    if (index >= 0) state.feed.splice(index, 1);
    res.json({ id: req.params.id });
  });

  const collections = allEntityCollections();
  // Open questions have filtering semantics, so register their route before
  // the generic collection handlers below.
  app.get('/api/open-questions', (req, res) => {
    let questions = state.openQuestions;
    if (req.query.resolved === 'true') questions = questions.filter(item => item.status === 'resolved');
    if (req.query.requirementId) questions = questions.filter(item => item.requirementId === req.query.requirementId);
    if (req.query.entityType && req.query.entityId) questions = questions.filter(item => item.entityType === req.query.entityType && item.entityId === req.query.entityId);
    res.json(paged(questions, req));
  });
  app.get('/api/open-questions/:id', (req, res) => {
    const question = findEntity(state.openQuestions, req.params.id);
    return question ? res.json(question) : res.status(404).json({ error: 'open-questions item not found' });
  });
  app.post('/api/open-questions', (req, res) => {
    const question = {
      id: newId('question'),
      requirementId: null,
      candidateId: null,
      title: req.body.title || 'Mock open question',
      description: req.body.description || null,
      category: req.body.category || 'MISSING_INFO',
      status: 'open',
      blocking: Boolean(req.body.blocking),
      createdBy: req.body.createdBy || state.users[0].name,
      createdAt: nowIso(),
      entityType: req.body.entityType || null,
      entityId: req.body.entityId || null,
      entityTitle: null,
      answerCount: 0,
      roleCount: 0,
      answeredBy: null,
      answeredAt: null,
    };
    state.openQuestions.unshift(question);
    res.status(201).json({ id: question.id });
  });
  app.get('/api/open-questions/:id/answers', (_req, res) => res.json({ answers: [], count: 0 }));
  app.post('/api/open-questions/:id/answers', (req, res) => res.status(201).json({ id: newId('answer'), questionId: req.params.id, role: req.body.role || 'engineer', answer: req.body.answer || '', confidence: req.body.confidence || 'medium', reasoning: req.body.reasoning || null, answeredAt: nowIso() }));
  app.patch('/api/harvests/:id', (req, res) => {
    const harvest = findEntity(state.harvests, req.params.id);
    if (!harvest) return res.status(404).json({ error: 'Harvest not found' });
    if (typeof req.body.sourceText === 'string') harvest.sourceText = req.body.sourceText;
    harvest.updatedAt = nowIso();
    return res.json({ id: harvest.id });
  });
  app.get('/api/open-questions/:id/timeline', (_req, res) => res.json([]));
  app.get('/api/agendas/:id/items', (_req, res) => res.json([]));

  for (const [route, collection] of Object.entries(collections)) {
    if (route === 'open-questions') continue;
    app.get(`/api/${route}`, (req, res) => res.json(paged(collection, req)));
    app.get(`/api/${route}/:id`, (req, res) => {
      const item = findEntity(collection, req.params.id);
      return item ? res.json(item) : res.status(404).json({ error: `${route} item not found` });
    });
  }

  app.get('/api/users', (_req, res) => res.json(state.users));
  app.get('/api/users/:id', (req, res) => {
    const user = findEntity(state.users, req.params.id);
    return user ? res.json(user) : res.status(404).json({ error: 'User not found' });
  });
  app.get('/api/search', (req, res) => {
    const query = String(req.query.q || '').toLowerCase();
    const results = Object.entries(collections).flatMap(([type, collection]) => collection.filter(item => `${item.title || ''} ${item.description || ''}`.toLowerCase().includes(query)).slice(0, 10).map(item => ({ type, id: item.id, title: item.title, description: item.description || '', href: `/${type}/${item.id}`, status: item.status || null, role: item.role || null, recordType: item.recordType || null })));
    res.json({ query, results, total: results.length });
  });

  // Forum management endpoints used by Settings.
  app.post('/api/forums', (req, res) => {
    const forum = { id: newId('forum'), slug: req.body.slug, name: req.body.name, description: req.body.description || '', sortOrder: state.forums.length + 1, threadCount: 0, postCount: 0 };
    state.forums.push(forum);
    res.status(201).json(forum);
  });
  app.put('/api/forums/:id', (req, res) => {
    const forum = findEntity(state.forums, req.params.id);
    if (!forum) return res.status(404).json({ error: 'Forum not found' });
    Object.assign(forum, req.body);
    return res.json(forum);
  });
  app.delete('/api/forums/:id', (req, res) => {
    const index = state.forums.findIndex(item => item.id === req.params.id);
    if (index >= 0) state.forums.splice(index, 1);
    res.json({ id: req.params.id });
  });
  app.put('/api/forums/reorder', (req, res) => {
    const ordered = req.body.orderedIds || [];
    state.forums.sort((a, b) => ordered.indexOf(a.id) - ordered.indexOf(b.id));
    state.forums.forEach((forum, index) => forum.sortOrder = index + 1);
    res.json({ reordered: true });
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'healthy', service: 'assembly-mock', mode: 'mock', materializedView: { schema: 'mock', name: 'assembly_stats', populated: true, rowCount: state.feed.length } }));
  app.post('/api/refresh-stats', (_req, res) => res.json({ refreshed: true, mode: 'mock', timestamp: nowIso() }));
  app.post('/tts', (_req, res) => res.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Mock TTS request accepted.' }] } }));
  app.get('/nebula/conversations', (req, res) => res.json(paged(state.conversations, req)));
  app.get('/nebula/specs', (req, res) => res.json(paged(state.specs, req)));
  app.get('/nebula/specs/:id', (req, res) => {
    const item = findEntity(state.specs, req.params.id);
    return item ? res.json(item) : res.status(404).json({ error: 'Spec item not found' });
  });
  app.get('/nebula/conversations/by-snapshot/:id', (req, res) => {
    const item = findEntity(state.conversations, req.params.id);
    return item ? res.json(item) : res.status(404).json({ error: 'Conversation not found' });
  });
  app.get('/nebula/conversations/by-snapshot/:id/blocks', (_req, res) => res.json({ blocks: [{ id: 'mock-block-1', conversationId: 'mock-conversation-001', snapshotId: 'mock-conversation-001', blockIndex: 0, parentTurnId: null, parentBlockId: null, blockType: 'message', contentMd: 'This is a representative mock conversation block.', contentHash: 'mock-block-hash', role: 'assistant', domPath: null, domFingerprint: null, firstLineNo: 1, lastLineNo: 1, createdAt: nowIso() }], segments: [], overrides: [] }));
}

if (IS_MOCK_MODE) {
  mockApi();
} else {
  app.use(createProxyMiddleware({
    pathFilter: '/api',
    target: API_TARGET,
    changeOrigin: true,
    logger: process.env.DEBUG_PROXY ? console : { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    on: {
      proxyReq: (proxyReq, req) => console.log('[proxy]', req.method, req.url, '->', proxyReq.path),
    },
  }));
  app.use(createProxyMiddleware({
    pathFilter: '/nebula',
    target: NEBULA_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/nebula': '/api' },
    logger: process.env.DEBUG_PROXY ? console : { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
}

if (!API_ONLY) {
  app.use(express.static(DIST_DIR));
  app.use((req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/nebula') || req.path === '/tts') {
      res.status(404).send('Not found');
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  if (API_ONLY) {
    console.log(`Assembly mock API running on http://localhost:${PORT}`);
  } else {
    console.log(`Assembly UI server running on http://localhost:${PORT} [${ASSEMBLY_MODE.toUpperCase()}]`);
    if (IS_MOCK_MODE) console.log('Serving in-memory Assembly API fixtures; no backend services required.');
    else console.log(`Proxying /api to ${API_TARGET} and /nebula to ${NEBULA_TARGET}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use.`);
  else console.error('Server error:', err.message);
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Priority Board API — Express server
 * Serves REST API + static frontend + Swagger docs
 */

import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data', 'board.json');
const FRONTEND_DIR = join(__dirname, '..');
const PORT = process.env.PORT || 3099;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Data persistence ────────────────────────────────────────────

function ensureDataDir() {
  const dir = dirname(DATA_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDataDir();
  if (!existsSync(DATA_FILE)) {
    const defaultData = {
      projects: [
        {
          id: crypto.randomUUID(),
          name: 'Backend API v3',
          priority: 'high',
          description: 'RESTful API rewrite with Laravel 11',
          columns: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
          tasks: [
            { id: crypto.randomUUID(), title: 'Auth middleware refactor', description: 'Replace current JWT with Laravel Sanctum', priority: 'critical', assignee: '', column: 'To Do', order: 0, createdAt: Date.now() - 86400000 },
            { id: crypto.randomUUID(), title: 'Rate limiting middleware', description: '100 req/min per user', priority: 'high', assignee: 'Warren', column: 'In Progress', order: 0, createdAt: Date.now() - 43200000 },
            { id: crypto.randomUUID(), title: 'Swagger/OpenAPI docs', description: 'Auto-generate from route annotations', priority: '', assignee: '', column: 'Backlog', order: 0, createdAt: Date.now() },
          ],
          createdAt: Date.now() - 172800000,
        },
        {
          id: crypto.randomUUID(),
          name: 'Portfolio Chat',
          priority: 'medium',
          description: 'AI chat widget on portfolio site',
          columns: ['Backlog', 'To Do', 'In Progress', 'Done'],
          tasks: [
            { id: crypto.randomUUID(), title: 'Add typing indicators', description: 'Show "AI is typing..." while generating', priority: 'medium', assignee: '', column: 'To Do', order: 0, createdAt: Date.now() - 3600000 },
            { id: crypto.randomUUID(), title: 'Session persistence', description: 'Keep conversation across page reloads', priority: '', assignee: '', column: 'Done', order: 0, createdAt: Date.now() - 7200000 },
          ],
          createdAt: Date.now() - 86400000,
        },
      ],
    };
    writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  ensureDataDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Helpers ─────────────────────────────────────────────────────

function findProjectOr404(data, projectId) {
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  return project;
}

function findTaskOr404(project, taskId) {
  const task = project.tasks.find(t => t.id === taskId);
  if (!task) return null;
  return task;
}

function getNextOrder(tasks, column) {
  const colTasks = tasks.filter(t => t.column === column);
  return colTasks.length > 0 ? Math.max(...colTasks.map(t => t.order)) + 1 : 0;
}

// ─── Swagger / OpenAPI ──────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Priority Board API',
      version: '1.0.0',
      description: `REST API for the Priority Board — a Trello/Jira-like project & task manager with priority levels.

**Base URL:** \`/api\`

**Data model:**
- **Projects** have a name, priority (critical/high/medium/low), custom columns, and tasks
- **Tasks** have a title, priority (can be empty to inherit from project), status column, and assignee

All endpoints are under \`/api\` and return JSON.`,
      contact: { name: 'Warrbot' },
    },
    servers: [
      { url: '/api', description: 'API base path' },
    ],
    tags: [
      { name: 'Data', description: 'Bulk data operations (load/save full board)' },
      { name: 'Projects', description: 'Project CRUD' },
      { name: 'Tasks', description: 'Task CRUD and reordering' },
    ],
    components: {
      schemas: {
        Priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Priority level',
        },
        Project: {
          type: 'object',
          required: ['id', 'name', 'priority', 'columns', 'tasks', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique project ID' },
            name: { type: 'string', description: 'Project name' },
            priority: { $ref: '#/components/schemas/Priority' },
            description: { type: 'string', description: 'Project description' },
            columns: { type: 'array', items: { type: 'string' }, description: 'Column names in order (e.g. ["Backlog","To Do","In Progress","Done"])' },
            tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' }, description: 'Tasks in this project' },
            createdAt: { type: 'integer', description: 'Unix timestamp' },
          },
        },
        Task: {
          type: 'object',
          required: ['id', 'title', 'column', 'order', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique task ID' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            priority: { type: 'string', nullable: true, description: 'Task priority override (null/empty = inherit from project)' },
            assignee: { type: 'string', description: 'Assigned person' },
            column: { type: 'string', description: 'Which column this task belongs to' },
            order: { type: 'integer', description: 'Sort order within column' },
            createdAt: { type: 'integer', description: 'Unix timestamp' },
          },
        },
        BoardData: {
          type: 'object',
          required: ['projects'],
          properties: {
            projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
          },
        },
      },
    },
  },
  apis: [join(__dirname, 'index.js')], // Parse JSDoc annotations from routes
});

// ─── API Routes ─────────────────────────────────────────────────

/**
 * @openapi
 * /data:
 *   get:
 *     tags: [Data]
 *     summary: Get full board data
 *     description: Returns all projects with their tasks and columns. This is the primary endpoint for the frontend to load the entire board.
 *     responses:
 *       200:
 *         description: Full board data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BoardData'
 */
app.get('/api/data', (req, res) => {
  const data = loadData();
  res.json(data);
});

/**
 * @openapi
 * /data:
 *   put:
 *     tags: [Data]
 *     summary: Replace full board data
 *     description: Replaces the entire board state. The body must contain a `projects` array.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BoardData'
 *     responses:
 *       200:
 *         description: Data saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 count: { type: integer, description: 'Number of projects saved' }
 *       400:
 *         description: Invalid data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.put('/api/data', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.projects)) {
    return res.status(400).json({ error: 'Body must contain a "projects" array' });
  }
  saveData(body);
  res.json({ ok: true, count: body.projects.length });
});

// ── Projects ─────────────────────────────────────────────────────

/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List all projects
 *     description: Returns an array of all projects with their tasks included.
 *     responses:
 *       200:
 *         description: Array of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
app.get('/api/projects', (req, res) => {
  const data = loadData();
  res.json(data.projects);
});

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get a single project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/projects/:id', (req, res) => {
  const data = loadData();
  const project = findProjectOr404(data, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     description: Creates a project with default columns (Backlog, To Do, In Progress, Done).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: 'Project name' }
 *               priority: { $ref: '#/components/schemas/Priority', description: 'Defaults to high' }
 *               description: { type: string }
 *               columns: { type: array, items: { type: string }, description: 'Custom columns (optional, uses defaults if omitted)' }
 *     responses:
 *       201:
 *         description: Created project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Name is required
 */
app.post('/api/projects', (req, res) => {
  const data = loadData();
  const { name, priority = 'high', description = '', columns } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const project = {
    id: crypto.randomUUID(),
    name: name.trim(),
    priority: priority || 'high',
    description,
    columns: columns && columns.length > 0 ? columns : ['Backlog', 'To Do', 'In Progress', 'Done'],
    tasks: [],
    createdAt: Date.now(),
  };
  data.projects.push(project);
  saveData(data);
  res.status(201).json(project);
});

/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     tags: [Projects]
 *     summary: Update a project
 *     description: Updates project name, priority, description, and/or columns.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               priority: { $ref: '#/components/schemas/Priority' }
 *               description: { type: string }
 *               columns: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Updated project
 *       404:
 *         description: Project not found
 */
app.put('/api/projects/:id', (req, res) => {
  const data = loadData();
  const project = findProjectOr404(data, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, priority, description, columns } = req.body;
  if (name !== undefined) project.name = name.trim();
  if (priority !== undefined) project.priority = priority;
  if (description !== undefined) project.description = description;
  if (columns !== undefined && Array.isArray(columns) && columns.length > 0) {
    // Migrate tasks to renamed/deleted columns
    project.columns = columns;
    project.tasks.forEach(t => {
      if (!columns.includes(t.column)) {
        t.column = columns[0]; // Move orphaned tasks to first column
      }
    });
  }
  saveData(data);
  res.json(project);
});

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete a project and all its tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project deleted
 *       404:
 *         description: Project not found
 */
app.delete('/api/projects/:id', (req, res) => {
  const data = loadData();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  data.projects.splice(idx, 1);
  saveData(data);
  res.json({ ok: true });
});

// ── Tasks ────────────────────────────────────────────────────────

/**
 * @openapi
 * /projects/{projectId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task in a project
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, column]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, nullable: true, description: 'Empty string or null = inherit from project' }
 *               assignee: { type: string }
 *               column: { type: string, description: 'Must be one of the project columns' }
 *     responses:
 *       201:
 *         description: Created task
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid column or missing title
 *       404:
 *         description: Project not found
 */
app.post('/api/projects/:projectId/tasks', (req, res) => {
  const data = loadData();
  const project = findProjectOr404(data, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, description = '', priority = '', assignee = '', column } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  const targetCol = column || project.columns[0];
  if (!project.columns.includes(targetCol)) {
    return res.status(400).json({ error: `Invalid column "${targetCol}". Valid columns: ${project.columns.join(', ')}` });
  }

  const task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description,
    priority: priority || '',
    assignee,
    column: targetCol,
    order: getNextOrder(project.tasks, targetCol),
    createdAt: Date.now(),
  };
  project.tasks.push(task);
  saveData(data);
  res.status(201).json(task);
});

/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, nullable: true }
 *               assignee: { type: string }
 *               column: { type: string }
 *     responses:
 *       200:
 *         description: Updated task
 *       404:
 *         description: Task not found
 */
app.put('/api/tasks/:id', (req, res) => {
  const data = loadData();

  // Find task across all projects
  for (const project of data.projects) {
    const task = findTaskOr404(project, req.params.id);
    if (task) {
      const { title, description, priority, assignee, column } = req.body;
      if (title !== undefined) task.title = title.trim();
      if (description !== undefined) task.description = description;
      if (priority !== undefined) task.priority = priority;
      if (assignee !== undefined) task.assignee = assignee;

      if (column !== undefined) {
        if (!project.columns.includes(column)) {
          return res.status(400).json({ error: `Invalid column "${column}"` });
        }
        task.column = column;
      }

      saveData(data);
      return res.json(task);
    }
  }
  res.status(404).json({ error: 'Task not found' });
});

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Task deleted
 *       404:
 *         description: Task not found
 */
app.delete('/api/tasks/:id', (req, res) => {
  const data = loadData();
  for (const project of data.projects) {
    const idx = project.tasks.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
      project.tasks.splice(idx, 1);
      saveData(data);
      return res.json({ ok: true });
    }
  }
  res.status(404).json({ error: 'Task not found' });
});

/**
 * @openapi
 * /tasks/reorder:
 *   patch:
 *     tags: [Tasks]
 *     summary: Reorder tasks (batch update)
 *     description: Batch-update task columns and orders after drag-and-drop. Accepts an array of { id, column, order } updates.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tasks]
 *             properties:
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, column, order]
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     column: { type: string }
 *                     order: { type: integer }
 *     responses:
 *       200:
 *         description: Tasks reordered
 *       400:
 *         description: Invalid request
 */
app.patch('/api/tasks/reorder', (req, res) => {
  const data = loadData();
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: '"tasks" array is required' });
  }

  for (const update of tasks) {
    for (const project of data.projects) {
      const task = findTaskOr404(project, update.id);
      if (task) {
        if (update.column !== undefined && project.columns.includes(update.column)) {
          task.column = update.column;
        }
        if (update.order !== undefined) {
          task.order = update.order;
        }
        break;
      }
    }
  }

  saveData(data);
  res.json({ ok: true, updated: tasks.length });
});

// ─── Swagger UI ─────────────────────────────────────────────────

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none } .swagger-ui { background: #0f1117 }',
  customSiteTitle: 'Priority Board API Docs',
}));

// Serve raw OpenAPI JSON
app.get('/api/openapi.json', (req, res) => {
  res.json(swaggerSpec);
});

// ─── Static frontend ────────────────────────────────────────────

app.use(express.static(FRONTEND_DIR, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    }
  },
}));

// ─── Start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Priority Board API running on http://localhost:${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api/docs`);
  console.log(`Frontend: http://localhost:${PORT}`);
});

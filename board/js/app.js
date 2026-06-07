/**
 * Priority Board — Application logic
 * Trello/Jira-like project & task manager with priority levels.
 */

/* ── State ── */
let data = null;
let currentProjectId = null;
let _loading = true;

/* ── Priority helpers ── */
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const PRIORITY_NAMES = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_ICONS = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

function getTaskPriority(task, project) {
  return task.priority || project.priority;
}

/* ── Toast notifications ── */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ── Modals ── */
function closeModals(e) {
  if (e && e.target !== e.currentTarget) return;
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

function showConfirm(msg, onConfirm) {
  document.getElementById('confirm-body').textContent = msg;
  const btn = document.getElementById('confirm-yes');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => { closeModals(); onConfirm(); });
  document.getElementById('confirm-modal').style.display = 'flex';
}

/* ── Data helpers ── */
function getProject(id) {
  return data?.projects.find(p => p.id === id);
}

/* ── Project CRUD ── */
function showProjectModal(editId) {
  document.getElementById('project-edit-id').value = editId || '';
  if (editId) {
    const p = getProject(editId);
    if (!p) return;
    document.getElementById('project-modal-title').innerHTML = '<i class="fas fa-pen"></i> Edit Project';
    document.getElementById('project-save-btn').textContent = 'Save';
    document.getElementById('project-name').value = p.name;
    document.getElementById('project-priority').value = p.priority;
    document.getElementById('project-desc').value = p.description || '';
  } else {
    document.getElementById('project-modal-title').innerHTML = '<i class="fas fa-folder"></i> New Project';
    document.getElementById('project-save-btn').textContent = 'Create';
    document.getElementById('project-name').value = '';
    document.getElementById('project-priority').value = 'high';
    document.getElementById('project-desc').value = '';
  }
  document.getElementById('project-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('project-name').focus(), 100);
}

async function saveProject() {
  const name = document.getElementById('project-name').value.trim();
  const priority = document.getElementById('project-priority').value;
  const desc = document.getElementById('project-desc').value.trim();
  const editId = document.getElementById('project-edit-id').value;

  if (!name) { toast('Project name is required'); return; }

  if (editId) {
    const p = getProject(editId);
    if (!p) return;
    p.name = name;
    p.priority = priority;
    p.description = desc;
    await Store.saveProject(p);
    toast('Project updated ✓');
  } else {
    const newProject = await Store.createProject(name, priority, desc);
    if (newProject) {
      data.projects.push(newProject);
      currentProjectId = newProject.id;
      toast('Project created ✓');
    } else {
      // Fallback: create locally
      const fallback = {
        id: crypto.randomUUID(),
        name, priority, description: desc,
        columns: ['Backlog', 'To Do', 'In Progress', 'Done'],
        tasks: [],
        createdAt: Date.now(),
      };
      data.projects.push(fallback);
      currentProjectId = fallback.id;
      Store.save(data);
      toast('Project created (offline)');
    }
  }

  closeModals();
  renderAll();
}

function deleteProject(id) {
  showConfirm('Delete this project and all its tasks? This cannot be undone.', async () => {
    await Store.deleteProject(id);
    data.projects = data.projects.filter(p => p.id !== id);
    if (currentProjectId === id) {
      currentProjectId = data.projects.length > 0 ? data.projects[0].id : null;
    }
    renderAll();
    toast('Project deleted');
  });
}

/* ── Column management ── */
function showColumnModal() {
  const project = getProject(currentProjectId);
  if (!project) { toast('Select a project first'); return; }
  renderColumnList(project);
  document.getElementById('column-modal').style.display = 'flex';
}

function renderColumnList(project) {
  const container = document.getElementById('column-list');
  container.innerHTML = '';
  project.columns.forEach((col, i) => {
    const div = document.createElement('div');
    div.className = 'column-edit-item';
    div.innerHTML = `
      <span class="drag-handle"><i class="fas fa-grip-lines"></i></span>
      <input type="text" value="${escapeHtml(col)}" data-index="${i}" class="col-name-input">
      <button class="btn btn-ghost btn-sm" onclick="removeColumn(${i})" title="Remove column (empty only)"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
  });

  new Sortable(container, {
    handle: '.drag-handle',
    animation: 150,
    onEnd: saveColumnOrder,
  });

  container.querySelectorAll('.col-name-input').forEach(inp => {
    inp.addEventListener('blur', saveColumnOrder);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  function saveColumnOrder() {
    const inputs = container.querySelectorAll('.col-name-input');
    project.columns = Array.from(inputs).map(i => i.value.trim() || 'Untitled');
    Store.saveProject(project);
    renderBoard();
  }
}

async function addColumn() {
  const project = getProject(currentProjectId);
  if (!project) return;
  const name = document.getElementById('new-column-name').value.trim();
  if (!name) { toast('Enter a column name'); return; }
  project.columns.push(name);
  document.getElementById('new-column-name').value = '';
  await Store.saveProject(project);
  renderColumnList(project);
  renderBoard();
  toast(`Column "${name}" added`);
}

function removeColumn(index) {
  const project = getProject(currentProjectId);
  if (!project) return;
  const colName = project.columns[index];
  const tasksInCol = project.tasks.filter(t => t.column === colName);
  if (tasksInCol.length > 0) {
    toast('Remove or move all tasks from this column first');
    return;
  }
  project.columns.splice(index, 1);
  Store.saveProject(project);
  renderColumnList(project);
  renderBoard();
  toast(`Column "${colName}" removed`);
}

/* ── Task CRUD ── */
function showTaskModal(editId, colName) {
  const project = getProject(currentProjectId);
  if (!project) { toast('Select a project first'); return; }

  document.getElementById('task-edit-id').value = editId || '';
  document.getElementById('task-column').value = colName || project.columns[0] || '';

  if (editId) {
    const task = project.tasks.find(t => t.id === editId);
    if (!task) return;
    document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-pen"></i> Edit Task';
    document.getElementById('task-save-btn').textContent = 'Save';
    document.getElementById('task-delete-btn').style.display = 'inline-flex';
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-assignee').value = task.assignee || '';
  } else {
    document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-card"></i> New Task';
    document.getElementById('task-save-btn').textContent = 'Add';
    document.getElementById('task-delete-btn').style.display = 'none';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-priority').value = '';
    document.getElementById('task-assignee').value = '';
  }
  document.getElementById('task-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('task-title').focus(), 100);
}

async function saveTask() {
  const project = getProject(currentProjectId);
  if (!project) return;

  const title = document.getElementById('task-title').value.trim();
  const desc = document.getElementById('task-desc').value.trim();
  const priority = document.getElementById('task-priority').value;
  const assignee = document.getElementById('task-assignee').value.trim();
  const editId = document.getElementById('task-edit-id').value;
  const colName = document.getElementById('task-column').value || project.columns[0];

  if (!title) { toast('Task title is required'); return; }

  if (editId) {
    const task = project.tasks.find(t => t.id === editId);
    if (!task) return;
    task.title = title;
    task.description = desc;
    task.priority = priority;
    task.assignee = assignee;
    await Store.updateTask(editId, { title, description, priority, assignee });
    toast('Task updated ✓');
  } else {
    const newTask = await Store.createTask(project.id, { title, description, priority, assignee, column: colName });
    if (newTask) {
      project.tasks.push(newTask);
    } else {
      // Fallback
      const maxOrder = project.tasks
        .filter(t => t.column === colName)
        .reduce((max, t) => Math.max(max, t.order || 0), -1);
      project.tasks.push({
        id: crypto.randomUUID(), title, description, priority, assignee,
        column: colName, order: maxOrder + 1, createdAt: Date.now(),
      });
    }
    toast('Task added ✓');
  }

  closeModals();
  renderBoard();
}

function deleteTask() {
  const project = getProject(currentProjectId);
  if (!project) return;
  const editId = document.getElementById('task-edit-id').value;
  if (!editId) return;
  showConfirm('Delete this task?', async () => {
    await Store.deleteTask(editId);
    project.tasks = project.tasks.filter(t => t.id !== editId);
    closeModals();
    renderBoard();
    toast('Task deleted');
  });
}

/* ── Rendering ── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  if (_loading) return;
  renderProjectList();
  renderTabs();
  renderBoard();
}

function renderProjectList() {
  const container = document.getElementById('project-list');
  container.innerHTML = '';

  data.projects.forEach(p => {
    const taskCount = p.tasks.length;
    const lastCol = p.columns[p.columns.length - 1];
    const doneCount = p.tasks.filter(t => t.column === lastCol).length;
    const div = document.createElement('div');
    div.className = `project-item${p.id === currentProjectId ? ' active' : ''}`;
    div.innerHTML = `
      <div class="project-icon prio-${p.priority}"><i class="fas fa-folder"></i></div>
      <div class="project-info" onclick="selectProject('${p.id}')">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-meta">
          <span class="badge badge-${p.priority}">${PRIORITY_NAMES[p.priority]}</span>
          <span>${taskCount - doneCount} open</span>
        </div>
      </div>
      <div class="project-actions">
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); showProjectModal('${p.id}')" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;
    container.appendChild(div);
  });

  if (data.projects.length > 0) {
    new Sortable(container, {
      animation: 150,
      onEnd: () => {
        const items = container.querySelectorAll('.project-item');
        const newOrder = Array.from(items).map(item => {
          const nameEl = item.querySelector('.project-name');
          return data.projects.find(p => p.name === nameEl.textContent);
        }).filter(Boolean);
        data.projects = newOrder;
        Store.save(data);
      }
    });
  }
}

function renderTabs() {
  const container = document.getElementById('project-tabs');
  container.innerHTML = '';
  data.projects.forEach(p => {
    const btn = document.createElement('button');
    btn.className = `tab-btn${p.id === currentProjectId ? ' active' : ''}`;
    btn.innerHTML = `${PRIORITY_ICONS[p.priority]} ${escapeHtml(p.name)}`;
    btn.onclick = () => selectProject(p.id);
    container.appendChild(btn);
  });
}

function selectProject(id) {
  currentProjectId = id;
  renderAll();
}

function renderBoard() {
  const board = document.getElementById('board');
  const project = getProject(currentProjectId);
  const emptyMsg = document.getElementById('board-empty');
  const titleSpan = document.getElementById('project-name-display');
  const actions = document.querySelector('.board-actions');

  if (!project) {
    board.innerHTML = '';
    emptyMsg.style.display = 'flex';
    titleSpan.textContent = 'Select a project';
    actions.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  titleSpan.textContent = `${PRIORITY_ICONS[project.priority]} ${project.name}`;
  actions.style.display = 'flex';

  board.innerHTML = '';

  project.columns.forEach(colName => {
    const tasks = project.tasks
      .filter(t => t.column === colName)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.column = colName;

    col.innerHTML = `
      <div class="column-header">
        <div class="column-title">
          <span>${escapeHtml(colName)}</span>
          <span class="column-count">${tasks.length}</span>
        </div>
      </div>
      <div class="column-body" data-column="${escapeHtml(colName)}"></div>
      <div class="column-footer">
        <button class="btn" onclick="showTaskModal(null, '${escapeHtml(colName)}')"><i class="fas fa-plus"></i> Add task</button>
      </div>
    `;

    const body = col.querySelector('.column-body');
    tasks.forEach(task => body.appendChild(createCard(task, project)));
    board.appendChild(col);

    new Sortable(body, {
      group: 'board',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: async (evt) => {
        const taskId = evt.item.dataset.taskId;
        const task = project.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newCol = evt.to.dataset.column;
        task.column = newCol;

        const updates = [];
        const colsToIndex = [...new Set([evt.from.dataset.column, newCol])];
        colsToIndex.forEach(colToIndex => {
          const items = [...board.querySelectorAll(`.column-body[data-column="${colToIndex}"] .card`)];
          items.forEach((card, i) => {
            const t = project.tasks.find(t2 => t2.id === card.dataset.taskId);
            if (t) {
              t.order = i;
              updates.push({ id: t.id, column: t.column, order: i });
            }
          });
        });

        await Store.reorderTasks(updates);
        renderBoard(); // Refresh counts
      }
    });
  });
}

function createCard(task, project) {
  const effectivePrio = getTaskPriority(task, project);
  const isInherited = !task.priority;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.taskId = task.id;

  card.innerHTML = `
    <div class="card-priority card-prio-${effectivePrio}"></div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(task.title)}</div>
      <div class="card-meta">
        ${isInherited
          ? `<span class="badge badge-inherit">${PRIORITY_NAMES[effectivePrio]} (proj)</span>`
          : `<span class="badge badge-${effectivePrio}">${PRIORITY_NAMES[effectivePrio]}</span>`
        }
        ${task.assignee ? `<span class="card-assignee"><i class="fas fa-user"></i> ${escapeHtml(task.assignee)}</span>` : ''}
      </div>
    </div>
  `;

  card.addEventListener('dblclick', () => showTaskModal(task.id));
  return card;
}

/* ── Export / Import ── */
function exportData() {
  Store.exportJSON(data);
  toast('Data exported ✓');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  Store.importJSON(file).then(async (newData) => {
    showConfirm(`Replace current data with ${newData.projects.length} project(s)?`, async () => {
      data = newData;
      await Store.save(data);
      currentProjectId = data.projects.length > 0 ? data.projects[0].id : null;
      renderAll();
      toast('Data imported ✓');
    });
  }).catch(err => toast('Import failed: ' + err.message));
  event.target.value = '';
}

/* ── Init ── */
async function boot() {
  data = await Store.load();
  _loading = false;
  if (data.projects.length > 0) currentProjectId = data.projects[0].id;
  renderAll();
}

document.addEventListener('DOMContentLoaded', boot);

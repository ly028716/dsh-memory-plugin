const { redactSensitiveData } = require('./privacy');

const DEFAULT_MAX_CHARACTERS = 4000;
const MAX_ITEMS_PER_FIELD = 10;

function isPresent(value) {
  return value !== undefined && value !== null && value !== '';
}

function isSafeScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatEntry(entry) {
  return isSafeScalar(entry) ? String(entry) : null;
}

function formatStructuredEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const projectedEntry = [];
  for (const key of ['content', 'name', 'path']) {
    if (isSafeScalar(entry[key]) && entry[key] !== '') {
      projectedEntry.push(`${key}: ${String(entry[key])}`);
    }
  }
  if (projectedEntry.length === 0) return null;
  if (isSafeScalar(entry.content) && entry.content !== '') return String(entry.content);
  return projectedEntry.join(', ');
}

function addSection(sections, title, value, entryMode = 'structured') {
  if (Array.isArray(value)) {
    const entries = value
      .filter(isPresent)
      .slice(0, MAX_ITEMS_PER_FIELD)
      .map(entryMode === 'scalar' ? formatEntry : formatStructuredEntry)
      .filter(Boolean);
    if (entries.length > 0) sections.push(`${title}:\n${entries.map((entry) => `- ${entry}`).join('\n')}`);
    return;
  }

  const entry = formatEntry(value);
  if (entry !== null && entry !== '') sections.push(`${title}: ${entry}`);
}

function buildMemoryContext(memory, options = {}) {
  const maxCharacters = Number.isSafeInteger(options?.maxCharacters) && options.maxCharacters > 0
    ? options.maxCharacters
    : DEFAULT_MAX_CHARACTERS;
  const redactedMemory = redactSensitiveData(memory || {});
  const sections = [];

  addSection(sections, 'defaultModel', redactedMemory.userPreferences?.defaultModel);
  addSection(sections, 'Active projects', redactedMemory.projectContext?.activeProjects, 'structured');
  addSection(sections, 'Recent topics', redactedMemory.sessionHistory?.recentTopics, 'structured');
  addSection(sections, 'Frequent tasks', redactedMemory.sessionHistory?.frequentTasks, 'structured');
  addSection(sections, 'Preferred tools', redactedMemory.inputHabits?.preferredTools, 'scalar');

  if (sections.length === 0) return '';
  return `Memory context (user-controlled local memory):\n${sections.join('\n')}`.slice(0, maxCharacters);
}

module.exports = { buildMemoryContext };

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
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const projectedEntry = [];
    for (const key of ['content', 'name', 'path']) {
      if (isSafeScalar(entry[key])) projectedEntry.push(`${key}: ${String(entry[key])}`);
    }
    if (projectedEntry.length === 0) return null;
    if (isSafeScalar(entry.content)) return String(entry.content);
    return projectedEntry.join(', ');
  }
  return String(entry);
}

function addSection(sections, title, value) {
  if (Array.isArray(value)) {
    const entries = value
      .filter(isPresent)
      .slice(0, MAX_ITEMS_PER_FIELD)
      .map(formatEntry)
      .filter(Boolean);
    if (entries.length > 0) sections.push(`${title}:\n${entries.map((entry) => `- ${entry}`).join('\n')}`);
    return;
  }

  if (isPresent(value)) sections.push(`${title}: ${formatEntry(value)}`);
}

function buildMemoryContext(memory, options = {}) {
  const maxCharacters = Number.isSafeInteger(options?.maxCharacters) && options.maxCharacters > 0
    ? options.maxCharacters
    : DEFAULT_MAX_CHARACTERS;
  const redactedMemory = redactSensitiveData(memory || {});
  const sections = [];

  addSection(sections, 'defaultModel', redactedMemory.userPreferences?.defaultModel);
  addSection(sections, 'Active projects', redactedMemory.projectContext?.activeProjects);
  addSection(sections, 'Recent topics', redactedMemory.sessionHistory?.recentTopics);
  addSection(sections, 'Frequent tasks', redactedMemory.sessionHistory?.frequentTasks);
  addSection(sections, 'Preferred tools', redactedMemory.inputHabits?.preferredTools);

  if (sections.length === 0) return '';
  return `Memory context (user-controlled local memory):\n${sections.join('\n')}`.slice(0, maxCharacters);
}

module.exports = { buildMemoryContext };

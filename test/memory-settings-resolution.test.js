const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const { loadOptionalSchema } = require('../memory-settings');

test('loads schemastery from the DSH profile resolution anchor for linked plugins', async () => {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-profile-anchor-'));
  const schemaDir = path.join(profileDir, 'node_modules', '@deepseek-ai', 'schemastery');
  await fs.mkdir(schemaDir, { recursive: true });
  await fs.writeFile(path.join(profileDir, 'package.json'), '{}');
  await fs.writeFile(path.join(schemaDir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/schemastery',
    main: 'index.js'
  }));
  await fs.writeFile(path.join(schemaDir, 'index.js'), `module.exports = {
    object: fields => ({ marker: 'profile-anchor', type: 'object', fields }),
    boolean: () => ({ type: 'boolean' })
  };`);

  try {
    const schema = loadOptionalSchema(undefined, path.join(profileDir, 'package.json'));
    expect(schema).toEqual(expect.objectContaining({ marker: 'profile-anchor' }));
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});

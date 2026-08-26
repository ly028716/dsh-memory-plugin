const fs = require('fs').promises;
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  execFile: jest.fn((command, args, callback) => callback(null, '', ''))
}));

const { execFile } = require('child_process');
const { MemoryStorage } = require('../storage');

describe('Windows private memory file mode', () => {
  let testDir;
  let testFile;
  let platformDescriptor;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-private-mode-'));
    testFile = path.join(testDir, 'memory.json');
    await fs.writeFile(testFile, '{}', 'utf8');
    execFile.mockClear();
    platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });

  afterEach(async () => {
    Object.defineProperty(process, 'platform', platformDescriptor);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('removes inherited ACLs and grants the current user and recovery principals with icacls', async () => {
    const storage = new MemoryStorage(testFile);

    await storage.setPrivateFileMode(testFile);

    expect(execFile).toHaveBeenCalledWith('icacls', expect.arrayContaining([
      testFile,
      '/inheritance:r',
      '/grant:r',
      expect.stringMatching(/:\(F\)$/),
      '*S-1-5-18:(F)',
      '*S-1-5-32-544:(F)'
    ]), expect.any(Function));
  });
});

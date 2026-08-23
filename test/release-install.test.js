const fs = require('fs');
const path = require('path');

const verifierPath = path.join(__dirname, '..', 'test-release-install.js');
const { createVerificationEnvironment, redactSecrets } = require(verifierPath);

const sentinelEnvironment = {
  PATH: 'path-sentinel',
  SystemRoot: 'systemroot-sentinel',
  NODE_AUTH_TOKEN: 'node-auth-sentinel',
  NPM_TOKEN: 'npm-token-sentinel',
  GH_TOKEN: 'github-token-sentinel',
  GITHUB_TOKEN: 'github-actions-token-sentinel',
  NPM_CONFIG__AUTH: 'npm-auth-sentinel',
  CI_JOB_JWT: 'ci-jwt-sentinel',
  AWS_ACCESS_KEY_ID: 'aws-access-key-sentinel'
};

const sensitiveEnvironmentNames = [
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'NPM_CONFIG__AUTH',
  'CI_JOB_JWT',
  'AWS_ACCESS_KEY_ID'
];

describe('release install smoke isolation', () => {
  test('allows only runtime variables into downloaded package verification', () => {
    const verificationEnvironment = createVerificationEnvironment(sentinelEnvironment);

    expect(verificationEnvironment).toMatchObject({
      PATH: 'path-sentinel',
      SystemRoot: 'systemroot-sentinel'
    });
    for (const name of sensitiveEnvironmentNames) {
      expect(verificationEnvironment).not.toHaveProperty(name);
    }
  });

  test('redacts every non-allowlisted environment value and URL credentials', () => {
    const secretValues = sensitiveEnvironmentNames.map((name) => sentinelEnvironment[name]);
    const text = `${secretValues.join(' ')} https://user:password@example.test/`;
    const redacted = redactSecrets(text, sentinelEnvironment);

    for (const secretValue of secretValues) {
      expect(redacted).not.toContain(secretValue);
    }
    expect(redacted).not.toContain('user:password@');
    expect(redacted).toContain('[REDACTED]');
  });

  test('uses a main guard so importing helpers does not execute the CLI', () => {
    expect(fs.readFileSync(verifierPath, 'utf8')).toContain('if (require.main === module)');
  });
});

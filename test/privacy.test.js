const { redactSensitiveData, redactProjectPath } = require('../privacy');

describe('privacy redaction', () => {
  test('redacts CLI secrets and preserves command shape', () => {
    expect(redactSensitiveData('deploy --api-key=abc123 --region cn')).toBe(
      'deploy --api-key=[REDACTED] --region cn'
    );
  });

  test('redacts quoted CLI secrets without leaving part of the value', () => {
    expect(redactSensitiveData('deploy --password "pass phrase"')).toBe(
      'deploy --password "[REDACTED]"'
    );
  });

  test('redacts environment assignments and bearer tokens', () => {
    const value = redactSensitiveData(
      'OPENAI_API_KEY=sk-test Authorization: Bearer eyJsecret'
    );

    expect(value).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(value).toContain('Authorization: Bearer [REDACTED]');
    expect(value).not.toContain('sk-test');
    expect(value).not.toContain('eyJsecret');
  });

  test('redacts sensitive object fields recursively', () => {
    expect(redactSensitiveData({ token: 'secret', nested: { password: 'pw' } })).toEqual({
      token: '[REDACTED]',
      nested: { password: '[REDACTED]' }
    });
  });

  test('does not redact ordinary fields containing auth-like substrings', () => {
    expect(redactSensitiveData({
      author: 'Alice',
      oauthProvider: 'github',
      auth: 'secret',
      authToken: 'token',
      authorization: 'bearer-token',
      AWS_SECRET_ACCESS_KEY: 'aws-secret'
    })).toEqual({
      author: 'Alice',
      oauthProvider: 'github',
      auth: '[REDACTED]',
      authToken: '[REDACTED]',
      authorization: '[REDACTED]',
      AWS_SECRET_ACCESS_KEY: '[REDACTED]'
    });
  });

  test('redacts URL query values and PEM blocks', () => {
    const value = redactSensitiveData(
      'https://example.test?api_key=url-secret -----BEGIN PRIVATE KEY----- private -----END PRIVATE KEY-----'
    );

    expect(value).not.toContain('url-secret');
    expect(value).not.toContain('private');
    expect(value).toContain('[REDACTED]');
  });

  test('redacts credentials embedded in URL user information', () => {
    const value = redactSensitiveData('git clone https://user:url-secret@example.test/repo.git');

    expect(value).toBe('git clone https://user:[REDACTED]@example.test/repo.git');
    expect(value).not.toContain('url-secret');
  });

  test('redacts common authentication command variants', () => {
    const value = redactSensitiveData(
      'curl -u user:basic-secret npm config set //registry.example/:_authToken npm-secret'
    );

    expect(value).not.toContain('basic-secret');
    expect(value).not.toContain('npm-secret');
    expect(value).toContain('[REDACTED]');
  });

  test('redacts access key environment variants', () => {
    const value = redactSensitiveData('AWS_ACCESS_KEY_ID=aws-secret AWS_SECRET_ACCESS_KEY=secret-key');

    expect(value).not.toContain('aws-secret');
    expect(value).not.toContain('secret-key');
  });

  test('redacts standalone provider credential formats', () => {
    const credentials = [
      'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      'ghp_1234567890abcdefghijklmnopqrstuv',
      'glpat-1234567890abcdefghijklmnop',
      ['xoxb', '123456789012', '123456789012', 'abcdefghijklmnopqrstuv'].join('-'),
      'npm_1234567890abcdefghijklmnopqrstuv',
      'AKIA1234567890ABCDEF',
      'AIzaSyAbcdefghijklmnopqrstuvwxyz123456',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature-value'
    ];
    const value = redactSensitiveData(`credentials: ${credentials.join(' ')}`);

    for (const credential of credentials) expect(value).not.toContain(credential);
    expect(value.match(/\[REDACTED\]/g)).toHaveLength(credentials.length);
  });

  test('masks usernames in common absolute user paths', () => {
    expect(redactProjectPath('C:\\Users\\Alice\\repo')).toBe('C:\\Users\\[USER]\\repo');
    expect(redactProjectPath('/home/alice/repo')).toBe('/home/[USER]/repo');
  });
});

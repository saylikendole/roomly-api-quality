import { test, expect, SEEDED } from '../fixtures';
import { unique } from '../support/roomly-client';
import { slot } from '../support/time';

/**
 * OWASP-style sanity checks. This is not a penetration test; it's the set of
 * cheap, automatable checks that catch common API security regressions early.
 */
test.describe('Security sanity checks', () => {
  test('responses carry hardening headers and do not reveal the server stack @security', async ({ request }) => {
    const res = await request.get('/health');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('malformed JSON gets a clean 400 with no stack trace @security', async ({ request }) => {
    const res = await request.post('/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"email": "ben@roomly.test", ',
    });
    await expect(res).toFailWith(400, 'MALFORMED_JSON');
    const text = await res.text();
    expect(text).not.toMatch(/at\s+\S+\s+\(|node_modules|SyntaxError/);
  });

  test('bodies over 10kb are rejected with 413 @security', async ({ member, room }) => {
    const res = await member.createBooking({ roomId: room.id, title: 'x', attendees: 1, ...slot(), padding: 'x'.repeat(11_000) });
    await expect(res).toFailWith(413, 'PAYLOAD_TOO_LARGE');
  });

  test('script-like input is stored as plain text and served as JSON, never HTML @security', async ({ member, room }) => {
    const title = '<script>alert("xss")</script>';
    const res = await member.createBooking({ roomId: room.id, title, attendees: 1, ...slot() });

    expect(res.status()).toBe(201);
    expect(res.headers()['content-type']).toContain('application/json');
    expect((await res.json()).title).toBe(title);
  });

  for (const probe of ["' OR '1'='1", '../../etc/passwd', '%00', '${7*7}']) {
    test(`injection-style id "${probe}" → 404, not a server error @security`, async ({ member }) => {
      await expect(await member.getBooking(probe)).toFailWith(404, 'NOT_FOUND');
      await expect(await member.getRoom(probe)).toFailWith(404, 'NOT_FOUND');
    });
  }

  test('a member cannot create users, including admins (no privilege escalation) @security', async ({ member }) => {
    const res = await member.createUser({ name: 'Mallory', email: unique.email(), password: 'Str0ng#Pass', role: 'admin' });
    await expect(res).toFailWith(403, 'FORBIDDEN');
  });

  test('user responses never include the password @security', async ({ admin, anon }) => {
    const created = await admin.createUser({ name: 'New Person', email: unique.email(), password: 'Str0ng#Pass' });
    expect(await created.text()).not.toContain('Str0ng#Pass');

    const login = await anon.login(SEEDED.member);
    expect(await login.text()).not.toContain(SEEDED.member.password);
  });

  test('duplicate emails are rejected regardless of case @regression', async ({ admin }) => {
    const res = await admin.createUser({ name: 'Copy', email: SEEDED.member.email.toUpperCase(), password: 'Str0ng#Pass' });
    await expect(res).toFailWith(409, 'EMAIL_TAKEN');
  });

  test('unknown routes return a JSON 404, not an HTML error page @regression', async ({ request }) => {
    const res = await request.get('/admin/secret');
    await expect(res).toFailWith(404, 'NOT_FOUND');
  });
});
